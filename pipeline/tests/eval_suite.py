from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import rasterio.features
from shapely import wkt as shapely_wkt
from shapely.geometry import Polygon

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.loader import TiffLoader
from pipeline.segmentation import SegmentationModel
from pipeline.damage import DamageClassifier, DAMAGE_CLASSES
from pipeline.postprocess import (
    extract_building_polygons,
    crop_building,
    read_tiff_rgb_uint8_hwc,
)


SUBTYPE_TO_CLASS = {
    "no-damage": 0,
    "minor-damage": 1,
    "major-damage": 2,
    "destroyed": 3,
}


@dataclass(frozen=True)
class GTBuilding:
    uid: str
    poly_xy: Polygon
    damage_class: Optional[int]  # None for pre json (no subtype)


def parse_xy_polys(json_path: Path, require_damage: bool) -> List[GTBuilding]:
    obj = json.loads(json_path.read_text(encoding="utf-8"))
    feats = obj.get("features", {})
    xy = feats.get("xy", [])
    out: List[GTBuilding] = []
    for f in xy:
        props = (f or {}).get("properties", {}) or {}
        uid = props.get("uid")
        w = (f or {}).get("wkt")
        if not (uid and w):
            continue
        dmg: Optional[int] = None
        if require_damage:
            subtype = props.get("subtype")
            if subtype not in SUBTYPE_TO_CLASS:
                continue
            dmg = SUBTYPE_TO_CLASS[subtype]
        poly = shapely_wkt.loads(w)
        if not isinstance(poly, Polygon):
            poly = poly.convex_hull
        out.append(GTBuilding(uid=str(uid), poly_xy=poly, damage_class=dmg))
    return out


def polygon_iou(a: Polygon, b: Polygon) -> float:
    if not a.is_valid or not b.is_valid:
        a = a.buffer(0)
        b = b.buffer(0)
    inter = a.intersection(b).area
    if inter <= 0:
        return 0.0
    union = a.union(b).area
    return float(inter / union) if union > 0 else 0.0


def match_polys(
    pred_polys: List[Polygon],
    gt: List[GTBuilding],
    iou_threshold: float,
) -> Tuple[List[Tuple[int, int, float]], int, int]:
    used_gt: set[int] = set()
    matches: List[Tuple[int, int, float]] = []
    for pi, p in enumerate(pred_polys):
        best_gi = -1
        best_iou = 0.0
        for gi, g in enumerate(gt):
            if gi in used_gt:
                continue
            iou = polygon_iou(p, g.poly_xy)
            if iou > best_iou:
                best_iou = iou
                best_gi = gi
        if best_gi >= 0 and best_iou >= iou_threshold:
            used_gt.add(best_gi)
            matches.append((pi, best_gi, best_iou))
    fp = len(pred_polys) - len(matches)
    fn = len(gt) - len(matches)
    return matches, fp, fn


def rasterize_gt_mask(gt_polys: List[GTBuilding], height: int, width: int) -> np.ndarray:
    shapes = [(g.poly_xy, 1) for g in gt_polys if g.poly_xy is not None]
    if not shapes:
        return np.zeros((height, width), dtype=np.uint8)
    return rasterio.features.rasterize(
        shapes=shapes,
        out_shape=(height, width),
        fill=0,
        default_value=1,
        dtype=np.uint8,
        all_touched=False,
    )


def mask_metrics(pred: np.ndarray, gt: np.ndarray) -> Dict[str, float]:
    pred_b = pred.astype(bool)
    gt_b = gt.astype(bool)
    tp = int(np.logical_and(pred_b, gt_b).sum())
    fp = int(np.logical_and(pred_b, ~gt_b).sum())
    fn = int(np.logical_and(~pred_b, gt_b).sum())
    tn = int(np.logical_and(~pred_b, ~gt_b).sum())
    iou = tp / (tp + fp + fn) if (tp + fp + fn) else 1.0
    prec = tp / (tp + fp) if (tp + fp) else 1.0
    rec = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 1.0
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "iou": float(iou), "precision": float(prec), "recall": float(rec), "f1": float(f1)}


def cm4() -> List[List[int]]:
    return [[0, 0, 0, 0] for _ in range(4)]


def add_cm(dst: List[List[int]], src: List[List[int]]) -> None:
    for i in range(4):
        for j in range(4):
            dst[i][j] += src[i][j]


def discover_pairs(test_datas_dir: Path) -> List[Dict[str, Path]]:
    pairs: Dict[str, Dict[str, Path]] = {}
    for root, _dirs, files in os.walk(test_datas_dir):
        for f in files:
            p = Path(root) / f
            name = p.name
            if name.endswith("_pre_disaster.tif"):
                base = name[: -len("_pre_disaster.tif")]
                pairs.setdefault(base, {})["pre_tif"] = p
            elif name.endswith("_post_disaster.tif"):
                base = name[: -len("_post_disaster.tif")]
                pairs.setdefault(base, {})["post_tif"] = p
            elif name.endswith("_pre_disaster.json"):
                base = name[: -len("_pre_disaster.json")]
                pairs.setdefault(base, {})["pre_json"] = p
            elif name.endswith("_post_disaster.json"):
                base = name[: -len("_post_disaster.json")]
                pairs.setdefault(base, {})["post_json"] = p
    out: List[Dict[str, Path]] = []
    for base, d in pairs.items():
        if all(k in d for k in ["pre_tif", "post_tif", "pre_json", "post_json"]):
            d["base"] = Path(base)
            out.append(d)
    out.sort(key=lambda x: str(x["base"]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Evaluate all test_datas pairs (segmentation + damage).")
    ap.add_argument("--test-datas", default=str(ROOT / "test_datas"), help="pipeline/test_datas directory")
    ap.add_argument("--seg-model", required=True)
    ap.add_argument("--dmg-model", required=True)
    ap.add_argument("--tile-size", type=int, default=512)
    ap.add_argument("--overlap", type=int, default=64)
    ap.add_argument("--device", default=None)
    ap.add_argument("--min-building-area", type=int, default=50)
    ap.add_argument("--iou-threshold", type=float, default=0.1, help="polygon IoU for matching damage GT")
    ap.add_argument("--tta-views", type=int, default=1)
    args = ap.parse_args()

    test_dir = Path(args.test_datas)
    pairs = discover_pairs(test_dir)
    if not pairs:
        raise SystemExit(f"No complete pairs found under {test_dir}")

    loader = TiffLoader(tile_size=args.tile_size, overlap=args.overlap)
    seg = SegmentationModel(args.seg_model, device=args.device)
    dmg = DamageClassifier(args.dmg_model, device=args.device)

    seg_agg = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    dmg_cm_total = cm4()
    dmg_match_total = 0
    dmg_fp_total = 0
    dmg_fn_total = 0

    print(f"Found pairs: {len(pairs)}\n")

    for d in pairs:
        base = str(d["base"])
        pre_tif = d["pre_tif"]
        post_tif = d["post_tif"]
        pre_json = d["pre_json"]
        post_json = d["post_json"]

        # --- GT ---
        gt_pre = parse_xy_polys(pre_json, require_damage=False)
        gt_post = parse_xy_polys(post_json, require_damage=True)

        # --- Segmentation prediction (mask) ---
        meta = loader.load_metadata(str(pre_tif))
        h, w = int(meta["height"]), int(meta["width"])
        mask_tiles = []
        for tile, window in loader.tiles(str(pre_tif)):
            tile_rgb = tile[:3] if tile.shape[0] >= 3 else tile
            m = seg.predict_tile(tile_rgb)
            mask_tiles.append((m.astype(np.float32), window))
        full_mask = loader.stitch_masks((h, w), mask_tiles)
        pred_mask = (full_mask >= 0.5).astype(np.uint8)

        gt_mask = rasterize_gt_mask(gt_pre, h, w)
        seg_m = mask_metrics(pred_mask, gt_mask)
        for k in ["tp", "fp", "fn", "tn"]:
            seg_agg[k] += int(seg_m[k])

        # --- Damage prediction ---
        pred_polys = extract_building_polygons(pred_mask, min_area_px=args.min_building_area)
        pre_rgb_hwc = read_tiff_rgb_uint8_hwc(str(pre_tif))
        post_rgb_hwc = read_tiff_rgb_uint8_hwc(str(post_tif))
        pre_crops = [crop_building(pre_rgb_hwc, p) for p in pred_polys]
        post_crops = [crop_building(post_rgb_hwc, p) for p in pred_polys]
        pred_classes = dmg.classify_batch(pre_crops, post_crops, tta_views=args.tta_views)

        matches, fp, fn = match_polys(pred_polys, gt_post, iou_threshold=args.iou_threshold)
        dmg_fp_total += fp
        dmg_fn_total += fn
        dmg_match_total += len(matches)

        cm = cm4()
        for pi, gi, _iou in matches:
            y_pred = int(pred_classes[pi])
            y_true = int(gt_post[gi].damage_class)  # type: ignore[arg-type]
            cm[y_true][y_pred] += 1
        add_cm(dmg_cm_total, cm)

        seg_iou = seg_m["iou"]
        seg_p = seg_m["precision"]
        seg_r = seg_m["recall"]
        dmg_acc = (sum(cm[i][i] for i in range(4)) / len(matches)) if matches else 0.0
        print(
            f"{base}\n"
            f"  SEG  IoU={seg_iou:.3f}  P={seg_p:.3f}  R={seg_r:.3f}  (GT_buildings={len(gt_pre)})\n"
            f"  DMG  matched={len(matches)}  FP={fp}  FN={fn}  matched_acc={dmg_acc:.3f}  (GT_buildings={len(gt_post)})\n"
        )

    # --- Aggregates ---
    seg_total = mask_metrics(
        np.array([1], dtype=np.uint8), np.array([1], dtype=np.uint8)
    )  # dummy init
    # overwrite using aggregated counts
    tp, fp, fn, tn = seg_agg["tp"], seg_agg["fp"], seg_agg["fn"], seg_agg["tn"]
    iou = tp / (tp + fp + fn) if (tp + fp + fn) else 1.0
    prec = tp / (tp + fp) if (tp + fp) else 1.0
    rec = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 1.0

    correct = sum(dmg_cm_total[i][i] for i in range(4))
    total = sum(sum(r) for r in dmg_cm_total)
    dmg_acc = (correct / total) if total else 0.0

    print("=== AGGREGATE ===")
    print(f"SEG  IoU={iou:.3f}  P={prec:.3f}  R={rec:.3f}  F1={f1:.3f}")
    print(f"DMG  matched_pairs={total}  matched_acc={dmg_acc:.3f}  FP={dmg_fp_total}  FN={dmg_fn_total}")
    print("\nDMG confusion (rows=true, cols=pred):")
    for r in range(4):
        print(f"{DAMAGE_CLASSES[r].ljust(12)} {dmg_cm_total[r]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

