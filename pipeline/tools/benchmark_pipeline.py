#!/usr/bin/env python3
"""
Per-scene runtime of the ML pipeline (paper mode) on the machine it is run on (SAUCIS revision, Reviewer 2 – M6).

Runs `DamageAnalysisPipeline` on N pre/post scene pairs, one untimed warm-up first, and reports per-stage
times (read, segmentation, instance extraction, cropping, classification, outputs) plus the processing time
per km^2 derived from the image size and ground sampling distance.

Usage:
  python tools/benchmark_pipeline.py --scenes-dir path/to/images --seg-model path/to/segformer_best \
      --dmg-model path/to/final.pt --n 10 --device cpu --out pipeline_benchmark.json

`--scenes-dir` must contain xBD-style pairs: <scene>_pre_disaster.tif and <scene>_post_disaster.tif.
"""
import argparse
import json
import platform
import statistics
import sys
import tempfile
import time
from pathlib import Path

import rasterio

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import DamageAnalysisPipeline  # noqa: E402


def gsd_m(path: str, default: float) -> float:
    with rasterio.open(path) as src:
        if src.crs is not None and src.crs.is_projected:
            return float(abs(src.transform.a))
    return default


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenes-dir", required=True)
    ap.add_argument("--seg-model", required=True)
    ap.add_argument("--dmg-model", required=True)
    ap.add_argument("--n", type=int, default=10)
    ap.add_argument("--device", default=None)
    ap.add_argument("--gsd", type=float, default=0.5, help="m/px when the GeoTIFF is not in a projected CRS (xBD ≈ 0.5)")
    ap.add_argument("--out", default="pipeline_benchmark.json")
    ap.add_argument("--seg-batch", type=int, default=None, help="SegFormer window batch (default GPU 8, CPU 1)")
    ap.add_argument("--cls-batch", type=int, default=None, help="classifier batch (default GPU 64, CPU 16)")
    args = ap.parse_args()

    pres = sorted(Path(args.scenes_dir).rglob("*_pre_disaster.tif"))
    pairs = [(p, p.with_name(p.name.replace("_pre_disaster", "_post_disaster"))) for p in pres]
    pairs = [(a, b) for a, b in pairs if b.exists()][: args.n + 1]
    if len(pairs) < 2:
        sys.exit("Need at least 2 scene pairs (1 warm-up + 1 measured).")

    t = time.perf_counter()
    pipe = DamageAnalysisPipeline(args.seg_model, args.dmg_model, device=args.device, mode="paper",
                                  paper_cfg={"seg_batch": args.seg_batch, "cls_batch": args.cls_batch})
    load_s = time.perf_counter() - t

    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, (pre, post) in enumerate(pairs):
            out = Path(tmp) / f"s{i}"
            pipe.run(str(pre), str(post), str(out))
            tm = json.loads((out / "timing.json").read_text())
            if i == 0:
                continue  # warm-up
            g = gsd_m(str(pre), args.gsd)
            km2 = tm["height"] * tm["width"] * g * g / 1e6
            rows.append({"scene": pre.name.replace("_pre_disaster.tif", ""), "km2": km2, "device": tm.get("device"),
                         **{k: v for k, v in tm.items() if k.endswith("_s") or k.startswith("n_")}})

    keys = [k for k in rows[0] if k.endswith("_s")]
    summary = {k: {"median": statistics.median(r[k] for r in rows), "mean": statistics.mean(r[k] for r in rows),
                   "stdev": statistics.pstdev(r[k] for r in rows)} for k in keys}
    summary["s_per_km2"] = statistics.median(r["total_s"] / r["km2"] for r in rows)
    summary["buildings_per_scene"] = statistics.mean(r["n_classified"] for r in rows)
    summary["cls_ms_per_building"] = 1000 * sum(r["cls_s"] for r in rows) / max(1, sum(r["n_classified"] for r in rows))
    env = {"cpu": platform.processor() or platform.machine(), "platform": platform.platform(), "python": platform.python_version(),
           "device": rows[0].get("device") if rows else None, "model_load_s": load_s, "n_scenes": len(rows)}
    try:
        import torch
        env["torch"] = torch.__version__
        env["torch_threads"] = torch.get_num_threads()
        if torch.cuda.is_available():
            env["gpu"] = torch.cuda.get_device_name(0)
    except Exception:
        pass
    Path(args.out).write_text(json.dumps({"env": env, "summary": summary, "scenes": rows}, indent=1))
    print(json.dumps(env, indent=1))
    for k in keys:
        print(f"{k:10s} median {summary[k]['median']:.2f} s  (mean {summary[k]['mean']:.2f} ± {summary[k]['stdev']:.2f})")
    print(f"processing time ≈ {summary['s_per_km2']:.1f} s/km²  | {summary['buildings_per_scene']:.0f} buildings/scene | "
          f"{summary['cls_ms_per_building']:.0f} ms/building (classification)")
    print("saved →", args.out)


if __name__ == "__main__":
    main()
