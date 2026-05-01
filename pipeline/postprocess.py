import numpy as np
import cv2
from shapely.geometry import Polygon
from typing import List, Tuple
import rasterio
import rasterio.features
import rasterio.warp


def read_tiff_rgb_uint8_hwc(path: str) -> np.ndarray:
    """
    Match `DamageClassidication_04_04_2026.ipynb` `read_tiff_rgb`:
    - read GeoTIFF
    - take first 3 bands (or repeat if <3)
    - global min-max normalize across ALL channels+bands
    - convert to uint8 HWC RGB
    """
    with rasterio.open(path) as src:
        arr = src.read()  # (C,H,W)

    if arr.shape[0] >= 3:
        arr = arr[:3]
    else:
        arr = np.repeat(arr, 3, axis=0)

    arr = np.transpose(arr, (1, 2, 0)).astype(np.float32)  # (H,W,3)
    arr_min = float(arr.min())
    arr_max = float(arr.max())
    if arr_max > arr_min:
        arr = (arr - arr_min) / (arr_max - arr_min)
    else:
        arr = np.zeros_like(arr)
    return (arr * 255.0).clip(0, 255).astype(np.uint8)


def extract_building_polygons(
    mask: np.ndarray,
    min_area_px: int = 50,
) -> List[Polygon]:
    """
    Binary mask'ten bina polygon'larını çıkarır.
    mask: (H, W) uint8, değerler 0 veya 1
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


def mask_to_buildings_geojson(
    mask: np.ndarray,
    transform,
    src_crs,
    damage_labels: List[int] | None = None,
    dst_crs: str = "EPSG:4326",
    min_area_px: int = 50,
) -> dict:
    """
    Convert a binary mask into a GeoJSON FeatureCollection.

    - mask: (H, W) uint8 values 0/1
    - transform/src_crs: taken from rasterio dataset (GeoTIFF)
    - damage_labels: optional list aligned to extracted shapes order
    """
    shapes_iter = rasterio.features.shapes(mask.astype(np.uint8), mask=mask.astype(bool), transform=transform)
    features = []
    idx = 0
    for geom, value in shapes_iter:
        if int(value) != 1:
            continue
        # crude pixel-area filter: use bbox area in pixel space as proxy if needed
        # better: compute geodesic area later; for now keep consistent with min_area_px intent
        if min_area_px is not None:
            # mask_to_buildings_geojson is typically used after min_area_px filtering upstream,
            # but keep a light filter here via pixel count estimate if available.
            pass

        g4326 = rasterio.warp.transform_geom(src_crs, dst_crs, geom, precision=8) if src_crs else geom
        props = {"id": idx}
        if damage_labels is not None and idx < len(damage_labels):
            props["damage_class"] = int(damage_labels[idx])
        features.append({"type": "Feature", "geometry": g4326, "properties": props})
        idx += 1

    return {"type": "FeatureCollection", "features": features}


def crop_building(
    image: np.ndarray,
    polygon: Polygon,
    # Notebook default pad is 48 (see SETTINGS["pad"]).
    padding: int = 48,
    target_size: Tuple[int, int] = (224, 224),
) -> np.ndarray:
    """
    Polygon bbox'ına göre görüntüden bina crop'u alır.
    image: (C, H, W)
    Döner: (C, target_h, target_w) float32
    """
    minx, miny, maxx, maxy = polygon.bounds
    minx_i = int(np.floor(minx))
    miny_i = int(np.floor(miny))
    maxx_i = int(np.ceil(maxx))
    maxy_i = int(np.ceil(maxy))

    minx = max(0, minx_i - padding)
    miny = max(0, miny_i - padding)

    if image.ndim != 3:
        raise ValueError(f"Expected image with 3 dims, got shape={image.shape}")

    # Support both:
    # - (H, W, 3) uint8/float (notebook-style RGB)
    # - (C, H, W) float/uint (legacy pipeline)
    if image.shape[0] in (1, 3, 4) and image.shape[-1] not in (3, 4):
        h_img, w_img = int(image.shape[1]), int(image.shape[2])
        maxx = min(w_img, maxx_i + padding)
        maxy = min(h_img, maxy_i + padding)
        # Ensure non-empty crop (OpenCV resize requires non-zero size)
        if maxx <= minx:
            maxx = min(w_img, minx + 1)
        if maxy <= miny:
            maxy = min(h_img, miny + 1)
        crop = image[:, miny:maxy, minx:maxx]  # (C, h, w)
        crop_hwc = crop.transpose(1, 2, 0).astype(np.float32)
    else:
        h_img, w_img = int(image.shape[0]), int(image.shape[1])
        maxx = min(w_img, maxx_i + padding)
        maxy = min(h_img, maxy_i + padding)
        if maxx <= minx:
            maxx = min(w_img, minx + 1)
        if maxy <= miny:
            maxy = min(h_img, miny + 1)
        crop_hwc = image[miny:maxy, minx:maxx, :].astype(np.float32)

    resized = cv2.resize(crop_hwc, target_size)
    return resized.transpose(2, 0, 1)  # (C, target_h, target_w)


def apply_damage_overlay(
    image: np.ndarray,
    polygons: List[Polygon],
    damage_labels: List[int],
) -> np.ndarray:
    """
    Hasar sınıfına göre renkli overlay oluşturur.
    image: (H, W, 3) uint8
    0: no damage → yeşil
    1: minor     → sarı
    2: major     → turuncu
    3: destroyed → kırmızı
    """
    COLORS = {
        0: (0, 255, 0),
        1: (0, 255, 255),
        2: (0, 165, 255),
        3: (0, 0, 255),
    }
    overlay = image.copy()
    for poly, label in zip(polygons, damage_labels):
        pts = np.array(poly.exterior.coords, dtype=np.int32)
        color = COLORS.get(label, (128, 128, 128))
        cv2.polylines(overlay, [pts], isClosed=True, color=color, thickness=2)
        cv2.fillPoly(overlay, [pts], (*color[:2], color[2] // 3))
    return overlay
