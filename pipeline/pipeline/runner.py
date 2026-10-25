import time
import numpy as np
from pathlib import Path
from typing import Optional

from .loader import TiffLoader
from .segmentation import SegmentationModel
from .damage import DamageClassifier
from .postprocess import (
    crop_building,
    apply_damage_overlay,
    damage_geojson_and_bbox4326,
    extract_building_polygons,
    rasterize_damage_labels,
    read_tiff_rgb_uint8_hwc,
    write_change_map_sidecar,
    write_damage_geotiff,
)
from . import paper_inference as paper


class DamageAnalysisPipeline:
    def __init__(
        self,
        seg_model_path: str,
        dmg_model_path: str,
        tile_size: int = 512,
        overlap: int = 64,
        min_building_area: int = 50,
        crop_size: tuple = (224, 224),
        device: Optional[str] = None,
        mode: str = "paper",
        paper_cfg: Optional[dict] = None,
    ):
        # mode="paper": the pipeline evaluated in the paper (see paper_inference.py).
        # mode="legacy": the earlier platform pipeline (contours, single-pass models).
        self.mode = mode
        self.loader = TiffLoader(tile_size=tile_size, overlap=overlap)
        self.min_building_area = min_building_area
        self.crop_size = crop_size
        self.cfg = dict(paper.PAPER_DEFAULTS)
        if paper_cfg:
            self.cfg.update({k: v for k, v in paper_cfg.items() if v is not None})
        if mode == "paper":
            # Segmentation model type from --seg-model: SegFormer directory or DualHeadUNet best_model.pt
            self.seg_arch = paper.detect_seg_arch(seg_model_path)
            if self.seg_arch == "dualhead":
                self.seg_model = paper.DualHeadSegmenter(seg_model_path, device=device)
            else:
                self.seg_model = SegmentationModel(seg_model_path, device=device)
            self.seg_name = paper.SEG_ARCH_NAMES[self.seg_arch]
            self._apply_cpu_batch(paper_cfg)
            self.dmg_model = paper.TwoHeadDamageClassifier(dmg_model_path, device=device)
            print(f"[paper] segmentation: {self.seg_name}; TwoHead classifier: {self.dmg_model.backbone}, "
                  f"DiffAttention={self.dmg_model.has_diff_attn}, device={self.dmg_model.device}; settings={self.cfg}")
        elif mode == "legacy":
            self.seg_model = SegmentationModel(seg_model_path, device=device)
            self.seg_arch = "segformer" if self.seg_model._is_segformer else "pth"
            self.seg_name = paper.SEG_ARCH_NAMES.get(self.seg_arch, "SMP U-Net")
            self._apply_cpu_batch(paper_cfg)
            self.dmg_model = DamageClassifier(dmg_model_path, device=device)
        else:
            raise ValueError(f"Unknown mode: {mode}")

    def _apply_cpu_batch(self, paper_cfg: Optional[dict]) -> None:
        # Smaller default batches on CPU (outputs do not depend on the batch size); explicit values win.
        if not str(self.seg_model.device).startswith("cuda"):
            for k, v in paper.CPU_BATCH.items():
                if not (paper_cfg and paper_cfg.get(k) is not None):
                    self.cfg[k] = v

    def run(self, pre_path: str, post_path: str, output_dir: str = "outputs") -> dict:
        if self.mode == "paper":
            return self._run_paper(pre_path, post_path, output_dir)
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        meta = self.loader.load_metadata(pre_path)
        h, w = meta["height"], meta["width"]

        # ── Aşama 1: Segmentasyon (pre-disaster üzerinde) ──────────────
        print(f"[1/3] Segmentasyon başlıyor... ({h}x{w} px)")
        mask_tiles = []
        for tile, window in self.loader.tiles(pre_path):
            # Models in this project are trained on RGB (first 3 bands).
            # If the GeoTIFF contains more bands, keep a consistent 3-channel input.
            tile_rgb = tile[:3] if tile.shape[0] >= 3 else tile
            mask = self.seg_model.predict_tile(tile_rgb)
            mask_tiles.append((mask.astype(np.float32), window))

        full_mask = self.loader.stitch_masks((h, w), mask_tiles)
        binary_mask = (full_mask >= 0.5).astype(np.uint8)
        print(f"    Mask oluşturuldu, pozitif px: {binary_mask.sum()}")

        # ── Aşama 2: Polygon çıkarımı ───────────────────────────────────
        print("[2/3] Bina polygon'ları çıkarılıyor...")
        polygons = extract_building_polygons(binary_mask, min_area_px=self.min_building_area)
        print(f"    {len(polygons)} bina tespit edildi.")

        # ── Aşama 3: Hasar sınıflandırması ─────────────────────────────
        print("[3/3] Hasar sınıflandırması başlıyor...")
        # Damage crops must match `DamageClassidication_04_04_2026.ipynb`:
        # - read_tiff_rgb_uint8_hwc (global min-max -> uint8 HWC)
        # - bbox padding=48 (default in crop_building)
        # - resize to 224 via PIL-equivalent cv2 resize in crop_building
        pre_rgb_hwc = read_tiff_rgb_uint8_hwc(pre_path)
        post_rgb_hwc = read_tiff_rgb_uint8_hwc(post_path)

        pre_crops, post_crops = [], []
        for poly in polygons:
            pre_crops.append(crop_building(pre_rgb_hwc, poly, target_size=self.crop_size))
            post_crops.append(crop_building(post_rgb_hwc, poly, target_size=self.crop_size))

        pairs = self.dmg_model.classify_batch_with_confidence(pre_crops, post_crops)
        damage_labels = [p[0] for p in pairs]
        confidences = [p[1] for p in pairs]

        # ── Çıktı ───────────────────────────────────────────────────────
        self._save_outputs(
            post_rgb_hwc,
            polygons,
            damage_labels,
            confidences,
            binary_mask,
            output_dir,
            meta,
            pre_path,
        )

        summary = self._summarize(damage_labels)
        print(f"\nSonuç: {summary}")
        return summary


    # ------------------------------------------------------------------ paper mode
    def _sync(self):
        import torch
        if str(self.seg_model.device).startswith("cuda"):
            torch.cuda.synchronize()

    def _run_paper(self, pre_path: str, post_path: str, output_dir: str = "outputs") -> dict:
        cfg = self.cfg
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        timing = {}
        t_all = time.perf_counter()
        meta = self.loader.load_metadata(pre_path)
        h, w = meta["height"], meta["width"]

        t = time.perf_counter()
        pre = paper.read_rgb_float(pre_path)
        post = paper.read_rgb_float(post_path)
        pre_pct, pre_mm, post_mm = paper.percentile_uint8(pre), paper.minmax_uint8(pre), paper.minmax_uint8(post)
        timing["read_s"] = time.perf_counter() - t

        print(f"[1/3] Segmentasyon ({self.seg_name}, pencere {cfg['tile']}/{cfg['stride']}, TTA={cfg['seg_tta']}) ... ({h}x{w} px)")
        self._sync(); t = time.perf_counter()
        if self.seg_arch == "dualhead":
            prob = paper.dualhead_probability(self.seg_model.model, pre_pct, self.seg_model.device, cfg)
        else:
            prob = paper.segformer_probability(self.seg_model._processor, self.seg_model._hf_model, pre_pct,
                                               self.seg_model.device, cfg)
        self._sync(); timing["seg_s"] = time.perf_counter() - t
        binary_mask = (prob >= cfg["seg_threshold"]).astype(np.uint8)

        print("[2/3] Bina örnekleri (bağlı bileşenler) çıkarılıyor...")
        t = time.perf_counter()
        labeled, n_comp, boxes, ids, small = paper.extract_components(binary_mask, cfg)
        polys_by_id = paper.component_polygons(labeled, cfg["connectivity"])
        timing["extract_s"] = time.perf_counter() - t
        print(f"    {n_comp} bileşen: {len(ids)} sınıflandırılacak, {len(small)} küçük (< {cfg['min_component_px']} px -> no-damage)")

        print(f"[3/3] Hasar sınıflandırması ({cfg['cls_views']} görünüm TTA)...")
        classes, confs, crop_s, cls_s = paper.classify_components(self.dmg_model, pre_mm, post_mm, boxes, cfg)
        timing["crop_s"], timing["cls_s"] = crop_s, cls_s

        # Component order: classified components first, then small ones (label 0, not classified)
        polygons, damage_labels, confidences, classified = [], [], [], []
        for cid, c, cf in zip(ids, classes, confs):
            if cid in polys_by_id:
                polygons.append(polys_by_id[cid]); damage_labels.append(int(c)); confidences.append(float(cf)); classified.append(True)
        for cid in small:
            if cid in polys_by_id:
                polygons.append(polys_by_id[cid]); damage_labels.append(0); confidences.append(None); classified.append(False)

        # Damage raster straight from the component labels (identical to the evaluated pixel maps; 255 = background)
        lut = np.full(n_comp + 1, 255, dtype=np.uint8)
        lut[np.asarray(ids, dtype=np.int64)] = np.asarray(classes, dtype=np.uint8)
        lut[np.asarray(small, dtype=np.int64)] = 0
        damage_raster = lut[labeled]

        t = time.perf_counter()
        self._save_outputs(post_mm, polygons, damage_labels, confidences, binary_mask, output_dir, meta, pre_path,
                           classified=classified, damage_raster=damage_raster)
        timing["outputs_s"] = time.perf_counter() - t
        timing["total_s"] = time.perf_counter() - t_all
        timing.update({"n_components": int(n_comp), "n_classified": int(len(ids)), "n_small": int(len(small)),
                       "height": int(h), "width": int(w), "device": str(self.seg_model.device),
                       "seg_model": self.seg_name, "settings": cfg})
        import json
        rp = output_dir / "report.json"
        report = json.loads(rp.read_text())
        report["timing"] = timing
        report["mode"] = "paper"
        report["models"] = {"segmentation": self.seg_name, "segmentation_arch": self.seg_arch,
                            "damage": f"TwoHead Siamese {self.dmg_model.backbone}"}
        rp.write_text(json.dumps(report, indent=2))
        (output_dir / "timing.json").write_text(json.dumps(timing, indent=2))
        summary = self._summarize(damage_labels)
        print("    süreler (s): " + ", ".join(f"{k}={v:.2f}" for k, v in timing.items() if k.endswith("_s")))
        print(f"\nSonuç: {summary}")
        return summary

    def _save_outputs(
        self,
        post_img_hwc,
        polygons,
        damage_labels,
        confidences,
        mask,
        output_dir,
        meta,
        pre_path: str,
        classified=None,
        damage_raster=None,
    ):
        import cv2, json

        # Görsel overlay
        vis = post_img_hwc.copy()  # (H, W, 3) uint8 RGB (notebook-style)
        overlay = apply_damage_overlay(vis, polygons, damage_labels)
        cv2.imwrite(str(output_dir / "damage_overlay.png"), overlay)

        # Binary mask
        cv2.imwrite(str(output_dir / "building_mask.png"), mask * 255)

        # JSON raporu
        report = {
            "total_buildings": len(polygons),
            "summary": self._summarize(damage_labels),
            "buildings": [
                {
                    "id": i,
                    "damage_class": damage_labels[i],
                    "confidence": confidences[i],
                    "bbox": list(polygons[i].bounds),
                }
                for i in range(len(polygons))
            ],
        }
        with open(output_dir / "report.json", "w") as f:
            json.dump(report, f, indent=2)

        # GeoJSON + damage raster (polygon sırası = hasar modeli; PostGIS ile hizalı)
        try:
            geojson, bbox4326 = damage_geojson_and_bbox4326(
                polygons,
                damage_labels,
                confidences,
                meta.get("transform"),
                meta.get("crs"),
                classified=classified,
            )
            with open(output_dir / "buildings.geojson", "w") as f:
                json.dump(geojson, f)

            h, w = int(meta["height"]), int(meta["width"])
            dam = damage_raster if damage_raster is not None else rasterize_damage_labels(polygons, damage_labels, h, w)
            dm_path = output_dir / "damage_map.tif"
            write_damage_geotiff(str(dm_path), dam, pre_path)
            crs = meta.get("crs")
            crs_wkt = crs.to_wkt() if crs is not None else None
            write_change_map_sidecar(output_dir, crs_wkt, bbox4326)
        except Exception as e:
            print(f"[warn] buildings.geojson / damage_map.tif could not be written: {e}")

    def _summarize(self, labels: list) -> dict:
        from collections import Counter
        from .damage import DAMAGE_CLASSES
        counts = Counter(labels)
        return {DAMAGE_CLASSES[k]: v for k, v in counts.items()}
