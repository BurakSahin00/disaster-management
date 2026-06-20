from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from shapely import wkt as shapely_wkt
from shapely.geometry import Polygon
import cv2

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.loader import TiffLoader
from pipeline.segmentation import SegmentationModel
from pipeline.damage import DamageClassifier, DAMAGE_CLASSES
from pipeline.postprocess import extract_building_polygons, crop_building, read_tiff_rgb_uint8_hwc


SUBTYPE_TO_CLASS = {
    "no-damage": 0,
    "minor-damage": 1,
    "major-damage": 2,
    "destroyed": 3,
}


@dataclass(frozen=True)
class GroundTruthBuilding:
    uid: str
    poly_xy: Polygon
    damage_class: int


def polygon_iou(a: Polygon, b: Polygon) -> float:
    if not a.is_valid or not b.is_valid:
        a = a.buffer(0)
        b = b.buffer(0)
    inter = a.intersection(b).area
    if inter <= 0:
        return 0.0
    union = a.union(b).area
    return float(inter / union) if union > 0 else 0.0


def load_gt_post_json(path: Path) -> List[GroundTruthBuilding]:
    obj = json.loads(path.read_text(encoding="utf-8"))
    feats = obj.get("features", {})
    xy = feats.get("xy", [])
    out: List[GroundTruthBuilding] = []
    for f in xy:
        props = (f or {}).get("properties", {}) or {}
        uid = props.get("uid")
        subtype = props.get("subtype")
        w = (f or {}).get("wkt")
        if not (uid and subtype and w):
            continue
        if subtype not in SUBTYPE_TO_CLASS:
            continue
        poly = shapely_wkt.loads(w)
        if not isinstance(poly, Polygon):
            # Sometimes WKT can be MultiPolygon; take its convex hull for matching.
            poly = poly.convex_hull
        out.append(GroundTruthBuilding(uid=str(uid), poly_xy=poly, damage_class=SUBTYPE_TO_CLASS[subtype]))
    return out


def match_predictions_to_gt(
    pred_polys: List[Polygon],
    gt: List[GroundTruthBuilding],
    iou_threshold: float,
) -> Tuple[Dict[int, int], List[Tuple[int, int, float]], int, int]:
    """
    Returns:
      - gt_used: mapping gt_idx -> pred_idx
      - matches: list of (pred_idx, gt_idx, iou)
      - fp: number of unmatched preds
      - fn: number of unmatched gt
    """
    gt_used: Dict[int, int] = {}
    matches: List[Tuple[int, int, float]] = []

    for pi, p in enumerate(pred_polys):
        best = (-1, 0.0)  # (gt_idx, iou)
        for gi, g in enumerate(gt):
            if gi in gt_used:
                continue
            iou = polygon_iou(p, g.poly_xy)
            if iou > best[1]:
                best = (gi, iou)
        gi, iou = best
        if gi >= 0 and iou >= iou_threshold:
            gt_used[gi] = pi
            matches.append((pi, gi, iou))

    fp = len(pred_polys) - len(matches)
    fn = len(gt) - len(matches)
    return gt_used, matches, fp, fn


def confusion_matrix(num_classes: int) -> List[List[int]]:
    return [[0 for _ in range(num_classes)] for _ in range(num_classes)]


def main() -> int:
    ap = argparse.ArgumentParser(description="Evaluate pipeline predictions vs test_datas labels.")
    ap.add_argument("--pre", required=True, help="pre GeoTIFF path")
    ap.add_argument("--post", required=True, help="post GeoTIFF path")
    ap.add_argument("--labels", required=True, help="post_disaster.json path (xView2 format)")
    ap.add_argument("--seg-model", required=True, help="segmentation model .pth")
    ap.add_argument("--dmg-model", required=True, help="damage model .pth")
    ap.add_argument("--tile-size", type=int, default=512)
    ap.add_argument("--overlap", type=int, default=64)
    ap.add_argument("--device", default=None)
    ap.add_argument("--min-building-area", type=int, default=50)
    ap.add_argument("--iou-threshold", type=float, default=0.1)
    ap.add_argument("--tta-views", type=int, default=1, help="damage model TTA views: 1 or 3")
    ap.add_argument(
        "--dump-matches-dir",
        default=None,
        help="If set, saves matched pre/post crops as PNG for inspection.",
    )
    args = ap.parse_args()

    gt = load_gt_post_json(Path(args.labels))
    print(f"GT buildings (xy): {len(gt)}")

    loader = TiffLoader(tile_size=args.tile_size, overlap=args.overlap)
    seg = SegmentationModel(args.seg_model, device=args.device)
    dmg = DamageClassifier(args.dmg_model, device=args.device)

    meta = loader.load_metadata(args.pre)
    h, w = meta["height"], meta["width"]

    mask_tiles = []
    for tile, window in loader.tiles(args.pre):
        tile_rgb = tile[:3] if tile.shape[0] >= 3 else tile
        m = seg.predict_tile(tile_rgb)
        mask_tiles.append((m.astype(np.float32), window))
    full_mask = loader.stitch_masks((h, w), mask_tiles)
    binary_mask = (full_mask >= 0.5).astype(np.uint8)
    print(f"Pred mask positive px: {int(binary_mask.sum())}")

    pred_polys = extract_building_polygons(binary_mask, min_area_px=args.min_building_area)
    print(f"Pred polygons: {len(pred_polys)}")

    pre_rgb_hwc = read_tiff_rgb_uint8_hwc(args.pre)
    post_rgb_hwc = read_tiff_rgb_uint8_hwc(args.post)

    pre_crops = [crop_building(pre_rgb_hwc, p) for p in pred_polys]
    post_crops = [crop_building(post_rgb_hwc, p) for p in pred_polys]
    pred_classes = dmg.classify_batch(pre_crops, post_crops, tta_views=args.tta_views)

    _, matches, fp, fn = match_predictions_to_gt(pred_polys, gt, iou_threshold=args.iou_threshold)
    print(f"Matches: {len(matches)}  FP: {fp}  FN: {fn}  (IoU>={args.iou_threshold})")

    dump_dir = Path(args.dump_matches_dir) if args.dump_matches_dir else None
    if dump_dir:
        dump_dir.mkdir(parents=True, exist_ok=True)
        meta_path = dump_dir / "matches.csv"
        meta_lines = ["pred_idx,gt_idx,iou,gt_uid,y_true,y_pred"]
        for pi, gi, iou in matches:
            y_pred = int(pred_classes[pi])
            y_true = int(gt[gi].damage_class)
            uid = gt[gi].uid
            # crops are (C,H,W) float32; convert to uint8 for viewing
            def to_png(arr_chw: np.ndarray) -> np.ndarray:
                x = arr_chw[:3].transpose(1, 2, 0)
                # percentile clip improves visibility
                lo, hi = np.percentile(x, [2, 98])
                x = np.clip((x - lo) / (hi - lo + 1e-6), 0, 1)
                x = (x * 255).astype(np.uint8)
                return cv2.cvtColor(x, cv2.COLOR_RGB2BGR)

            pre_png = to_png(pre_crops[pi])
            post_png = to_png(post_crops[pi])
            cv2.imwrite(str(dump_dir / f"match_{pi:03d}_pre.png"), pre_png)
            cv2.imwrite(str(dump_dir / f"match_{pi:03d}_post.png"), post_png)
            meta_lines.append(f"{pi},{gi},{iou:.4f},{uid},{y_true},{y_pred}")
        meta_path.write_text("\n".join(meta_lines), encoding="utf-8")

    cm = confusion_matrix(4)
    for pi, gi, iou in matches:
        y_pred = int(pred_classes[pi])
        y_true = int(gt[gi].damage_class)
        cm[y_true][y_pred] += 1

    print("\nConfusion matrix (rows=true, cols=pred):")
    for r in range(4):
        print(DAMAGE_CLASSES[r].ljust(12), cm[r])

    correct = sum(cm[i][i] for i in range(4))
    total = sum(sum(row) for row in cm)
    acc = (correct / total) if total else 0.0
    print(f"\nMatched accuracy: {acc:.4f} ({correct}/{total})")

    # Per-class precision/recall over matched pairs only (report FP/FN separately above).
    for c in range(4):
        tp = cm[c][c]
        fp_c = sum(cm[r][c] for r in range(4) if r != c)
        fn_c = sum(cm[c][k] for k in range(4) if k != c)
        prec = tp / (tp + fp_c) if (tp + fp_c) else 0.0
        rec = tp / (tp + fn_c) if (tp + fn_c) else 0.0
        print(f"{DAMAGE_CLASSES[c]:>12}  precision={prec:.3f}  recall={rec:.3f}  support={sum(cm[c])}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

