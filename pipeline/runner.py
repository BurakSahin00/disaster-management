import numpy as np
from pathlib import Path
from typing import Optional

from .loader import TiffLoader
from .segmentation import SegmentationModel
from .damage import DamageClassifier
from .postprocess import (
    extract_building_polygons,
    crop_building,
    apply_damage_overlay,
    mask_to_buildings_geojson,
    read_tiff_rgb_uint8_hwc,
)


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

        damage_labels = self.dmg_model.classify_batch(pre_crops, post_crops)

        # ── Çıktı ───────────────────────────────────────────────────────
        self._save_outputs(post_rgb_hwc, polygons, damage_labels, binary_mask, output_dir, meta)

        summary = self._summarize(damage_labels)
        print(f"\nSonuç: {summary}")
        return summary

    def _save_outputs(self, post_img_hwc, polygons, damage_labels, mask, output_dir, meta):
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
                    "bbox": list(polygons[i].bounds),
                }
                for i in range(len(polygons))
            ],
        }
        with open(output_dir / "report.json", "w") as f:
            import json
            json.dump(report, f, indent=2)

        # GeoJSON (georeferenced) - for PostGIS + web map layers
        try:
            geojson = mask_to_buildings_geojson(
                mask=mask,
                transform=meta.get("transform"),
                src_crs=meta.get("crs"),
                damage_labels=damage_labels,
                dst_crs="EPSG:4326",
                min_area_px=self.min_building_area,
            )
            with open(output_dir / "buildings.geojson", "w") as f:
                json.dump(geojson, f)
        except Exception as e:
            print(f"[warn] buildings.geojson could not be written: {e}")

    def _summarize(self, labels: list) -> dict:
        from collections import Counter
        from .damage import DAMAGE_CLASSES
        counts = Counter(labels)
        return {DAMAGE_CLASSES[k]: v for k, v in counts.items()}
