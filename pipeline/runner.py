import json
import cv2
import numpy as np
from collections import Counter
from pathlib import Path
from typing import Optional

from .loader import TiffLoader
from .segmentation import SegmentationModel
from .damage import DamageClassifier, DAMAGE_CLASSES
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

        # -- Asama 1: Segmentasyon (pre-disaster uzerinde) --
        print(f"[1/3] Segmentasyon basliyor... ({h}x{w} px)")
        mask_tiles = []
        for tile, window in self.loader.tiles(pre_path):
            mask = self.seg_model.predict_tile(tile)
            mask_tiles.append((mask.astype(np.float32), window))

        full_mask = self.loader.stitch_masks((h, w), mask_tiles)
        binary_mask = (full_mask >= 0.5).astype(np.uint8)
        print(f"    Mask olusturuldu, pozitif px: {binary_mask.sum()}")

        # -- Asama 2: Polygon cikarimi --
        print("[2/3] Bina polygon'lari cikariliyor...")
        polygons = extract_building_polygons(binary_mask, min_area_px=self.min_building_area)
        print(f"    {len(polygons)} bina tespit edildi.")

        # -- Asama 3: Hasar siniflandirmasi --
        if polygons:
            print("[3/3] Hasar siniflandirmasi basliyor...")
            pre_img = self.loader.read_full(pre_path)
            post_img = self.loader.read_full(post_path)

            pre_crops, post_crops = [], []
            for poly in polygons:
                pre_crops.append(crop_building(pre_img, poly, target_size=self.crop_size))
                post_crops.append(crop_building(post_img, poly, target_size=self.crop_size))

            damage_labels = self.dmg_model.classify_batch(pre_crops, post_crops)
        else:
            print("[3/3] Tespit edilen bina yok, siniflandirma atlandi.")
            post_img = self.loader.read_full(post_path)
            damage_labels = []

        self._save_outputs(post_img, polygons, damage_labels, binary_mask, output_dir)

        summary = self._summarize(damage_labels)
        print(f"\nSonuc: {summary}")
        return summary

    def _save_outputs(
        self,
        post_img: np.ndarray,
        polygons: list,
        damage_labels: list,
        mask: np.ndarray,
        output_dir: Path,
    ) -> None:
        vis = post_img[:3].transpose(1, 2, 0)
        max_val = 255.0 if post_img.dtype == np.uint8 else 65535.0
        vis = (vis.astype(np.float32) / max_val * 255).astype(np.uint8)
        overlay = apply_damage_overlay(vis, polygons, damage_labels)
        cv2.imwrite(str(output_dir / "damage_overlay.png"), overlay)

        cv2.imwrite(str(output_dir / "building_mask.png"), mask * 255)

        report = {
            "total_buildings": len(polygons),
            "summary": self._summarize(damage_labels),
            "buildings": [
                {
                    "id": i,
                    "damage_class": damage_labels[i],
                    "damage_label": DAMAGE_CLASSES.get(damage_labels[i], "unknown"),
                    "bbox": list(polygons[i].bounds),
                }
                for i in range(len(polygons))
            ],
        }
        with open(output_dir / "report.json", "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

    def _summarize(self, labels: list) -> dict:
        counts = Counter(labels)
        return {DAMAGE_CLASSES[k]: v for k, v in counts.items()}
