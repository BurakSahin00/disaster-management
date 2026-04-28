import numpy as np
import cv2
from shapely.geometry import Polygon
from typing import List, Tuple


def extract_building_polygons(
    mask: np.ndarray,
    min_area_px: int = 50,
) -> List[Polygon]:
    """
    Binary mask'ten bina polygon'larini cikarir.
    mask: (H, W) uint8, degerler 0 veya 1
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polygons = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area_px:
            continue
        pts = cnt.squeeze(axis=1)
        if len(pts) < 3:
            continue
        polygons.append(Polygon(pts))
    return polygons


def crop_building(
    image: np.ndarray,
    polygon: Polygon,
    padding: int = 10,
    target_size: Tuple[int, int] = (224, 224),
) -> np.ndarray:
    """
    Polygon bbox'ina gore goruntuden bina crop'u alir.
    image: (C, H, W)
    Doner: (C, target_h, target_w) float32
    """
    minx, miny, maxx, maxy = polygon.bounds
    minx = max(0, int(minx) - padding)
    miny = max(0, int(miny) - padding)
    maxx = min(image.shape[2], int(maxx) + padding)
    maxy = min(image.shape[1], int(maxy) + padding)

    crop = image[:, miny:maxy, minx:maxx]  # (C, h, w)
    crop_hwc = crop.transpose(1, 2, 0).astype(np.float32)
    resized = cv2.resize(crop_hwc, target_size)
    return resized.transpose(2, 0, 1)  # (C, target_h, target_w)


def apply_damage_overlay(
    image: np.ndarray,
    polygons: List[Polygon],
    damage_labels: List[int],
    fill_alpha: float = 0.3,
) -> np.ndarray:
    """
    Hasar sinifina gore renkli overlay olusturur.
    image: (H, W, 3) uint8 -- OpenCV BGR formatinda
    fill_alpha: dolgu saydamligi (0=tam seffaf, 1=tam opak)

    BGR renk eslemeleri:
      0: no-damage -> yesil  (0, 255, 0)
      1: minor     -> sari   (0, 255, 255)
      2: major     -> turuncu(0, 165, 255)
      3: destroyed -> kirmizi(0, 0, 255)
    """
    COLORS = {
        0: (0, 255, 0),
        1: (0, 255, 255),
        2: (0, 165, 255),
        3: (0, 0, 255),
    }

    result = image.copy()
    fill_layer = image.copy()

    for poly, label in zip(polygons, damage_labels):
        pts = np.array(poly.exterior.coords, dtype=np.int32)
        color = COLORS.get(label, (128, 128, 128))
        cv2.fillPoly(fill_layer, [pts], color)
        cv2.polylines(result, [pts], isClosed=True, color=color, thickness=2)

    result = cv2.addWeighted(fill_layer, fill_alpha, result, 1.0 - fill_alpha, 0)
    return result
