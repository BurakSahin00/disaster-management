import json
import os
from pathlib import Path
import sys

import numpy as np
import rasterio
from rasterio.transform import from_origin
import torch
import torch.nn as nn


class DummySegmentation(nn.Module):
    """
    Produces a deterministic rectangular "building" mask in logit space.
    Output shape: (B, 1, H, W)
    """

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, _c, h, w = x.shape
        logits = torch.full((b, 1, h, w), -8.0, device=x.device, dtype=torch.float32)

        # Rectangle centered-ish; sized so polygon extraction yields at least one building.
        r0, r1 = int(h * 0.25), int(h * 0.75)
        c0, c1 = int(w * 0.25), int(w * 0.75)
        logits[:, :, r0:r1, c0:c1] = 8.0
        return logits


class DummyDamage(nn.Module):
    """
    4-class classifier. Expects 6-channel input (pre+post concatenated).
    Returns logits shaped (B, 4).
    """

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Simple heuristic: mean absolute difference between pre and post channels.
        # pre: first half channels, post: second half
        c = x.shape[1]
        half = c // 2
        pre = x[:, :half]
        post = x[:, half:]
        diff = (pre - post).abs().mean(dim=(1, 2, 3))

        # Map diff to class logits deterministically.
        # Larger diff -> higher damage.
        logits = torch.zeros((x.shape[0], 4), device=x.device, dtype=torch.float32)
        logits[:, 0] = 1.0 - diff
        logits[:, 1] = 0.5 - (diff - 0.25).abs()
        logits[:, 2] = 0.5 - (diff - 0.5).abs()
        logits[:, 3] = diff
        return logits


def write_test_geotiff(path: Path, data: np.ndarray) -> None:
    """
    data: (C, H, W) uint16
    """
    c, h, w = data.shape
    transform = from_origin(35.0, 33.0, 0.00001, 0.00001)  # arbitrary but valid
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=c,
        dtype=data.dtype,
        # NOTE: We intentionally omit CRS here to avoid PROJ database conflicts
        # on some Windows setups (e.g. when PostGIS ships an incompatible proj.db).
        # The pipeline still exercises the full mask→polygon→crop→damage flow.
        transform=transform,
    ) as dst:
        dst.write(data)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    # Allow running from repo root without installing the package.
    sys.path.insert(0, str(root))
    models_dir = root / "models"
    outputs_dir = root / "outputs" / "smoke"
    inputs_dir = outputs_dir / "_inputs"
    models_dir.mkdir(exist_ok=True)
    inputs_dir.mkdir(parents=True, exist_ok=True)
    outputs_dir.mkdir(parents=True, exist_ok=True)

    seg_path = models_dir / "segmentation_dummy.pth"
    dmg_path = models_dir / "damage_dummy.pth"
    torch.save(DummySegmentation(), seg_path)
    torch.save(DummyDamage(), dmg_path)

    h, w = 512, 512
    rng = np.random.default_rng(0)

    # 3-band uint16 images. Create post as slightly perturbed pre.
    pre = (rng.random((3, h, w)) * 2000).astype(np.uint16)
    post = pre.copy()
    post[:, int(h * 0.25): int(h * 0.75), int(w * 0.25): int(w * 0.75)] = (
        (post[:, int(h * 0.25): int(h * 0.75), int(w * 0.25): int(w * 0.75)].astype(np.int32) + 500)
        .clip(0, 65535)
        .astype(np.uint16)
    )

    pre_tif = inputs_dir / "pre.tif"
    post_tif = inputs_dir / "post.tif"
    write_test_geotiff(pre_tif, pre)
    write_test_geotiff(post_tif, post)

    # Run pipeline in-process (same as CLI would).
    from pipeline import DamageAnalysisPipeline  # noqa: E402

    pipe = DamageAnalysisPipeline(
        seg_model_path=str(seg_path),
        dmg_model_path=str(dmg_path),
        tile_size=512,
        overlap=64,
        device="cpu",
    )
    summary = pipe.run(str(pre_tif), str(post_tif), str(outputs_dir))

    expected = [
        "building_mask.png",
        "damage_overlay.png",
        "report.json",
        "damage_map.tif",
        "change_map_meta.json",
    ]
    for f in expected:
        p = outputs_dir / f
        if not p.exists():
            raise RuntimeError(f"Missing expected output: {p}")

    report = json.loads((outputs_dir / "report.json").read_text(encoding="utf-8"))
    if report.get("total_buildings", 0) <= 0:
        raise RuntimeError("Expected at least one detected building in report.json")
    if not isinstance(report.get("summary"), dict) or len(report["summary"]) == 0:
        raise RuntimeError("Expected non-empty summary in report.json")

    b0 = report["buildings"][0]
    if "confidence" not in b0 or not isinstance(b0["confidence"], (int, float)):
        raise RuntimeError("Expected confidence per building in report.json")

    # GeoJSON is best-effort; if CRS/transform exists it should be produced.
    geo = outputs_dir / "buildings.geojson"
    if geo.exists():
        geojson = json.loads(geo.read_text(encoding="utf-8"))
        if geojson.get("type") != "FeatureCollection":
            raise RuntimeError("buildings.geojson is not a FeatureCollection")

    print("SMOKE OK:", summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

