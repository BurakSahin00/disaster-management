import numpy as np
import rasterio
from pathlib import Path
from typing import Optional

from .loader import TiffLoader
from .segmentation import SegmentationModel
from .damage import DamageClassifier
from .postprocess import extract_building_polygons, crop_building, apply_damage_overlay


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
    ):
        self.loader = TiffLoader(tile_size=tile_size, overlap=overlap)
        self.seg_model = SegmentationModel(seg_model_path, device=device)
        self.dmg_model = DamageClassifier(dmg_model_path, device=device)
        self.min_building_area = min_building_area
        self.crop_size = crop_size

    def run(self, pre_path: str, post_path: str, output_dir: str = "outputs") -> dict:
        output_dir = Path(output_dir)
        output_dir.mkdir(exist_ok=True)

        meta = self.loader.load_metadata(pre_path)
        h, w = meta["height"], meta["width"]

        # ── Aşama 1: Segmentasyon (pre-disaster üzerinde) ──────────────
        print(f"[1/3] Segmentasyon başlıyor... ({h}x{w} px)")
        mask_tiles = []
        for tile, window in self.loader.tiles(pre_path):
            mask = self.seg_model.predict_tile(tile)
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
        pre_img = self.loader.read_full(pre_path)
        post_img = self.loader.read_full(post_path)

        pre_crops, post_crops = [], []
        for poly in polygons:
            pre_crops.append(crop_building(pre_img, poly, target_size=self.crop_size))
            post_crops.append(crop_building(post_img, poly, target_size=self.crop_size))

        damage_labels = self.dmg_model.classify_batch(pre_crops, post_crops)

        # ── Çıktı ───────────────────────────────────────────────────────
        self._save_outputs(post_img, polygons, damage_labels, binary_mask, output_dir, meta)

        summary = self._summarize(damage_labels)
        print(f"\nSonuç: {summary}")
        return summary

    def _save_outputs(self, post_img, polygons, damage_labels, mask, output_dir, meta):
        import cv2, json

        # Görsel overlay
        vis = post_img[:3].transpose(1, 2, 0)  # İlk 3 bant RGB
        vis = (vis / vis.max() * 255).astype(np.uint8) if vis.max() > 0 else vis.astype(np.uint8)
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
                    "bbox": list(polygons[i].bounds),
                }
                for i in range(len(polygons))
            ],
        }
        with open(output_dir / "report.json", "w") as f:
            import json
            json.dump(report, f, indent=2)

    def _summarize(self, labels: list) -> dict:
        from collections import Counter
        from .damage import DAMAGE_CLASSES
        counts = Counter(labels)
        return {DAMAGE_CLASSES[k]: v for k, v in counts.items()}
