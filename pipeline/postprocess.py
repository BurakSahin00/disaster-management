import json
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import cv2
from shapely.affinity import affine_transform
from shapely.geometry import Polygon, box, mapping
from shapely.ops import transform as shapely_transform
from shapely.ops import unary_union
import rasterio
import rasterio.features
import rasterio.warp

from .proj_env import ensure_proj_data

ensure_proj_data()


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

        if src_crs:
            try:
                g4326 = rasterio.warp.transform_geom(src_crs, dst_crs, geom, precision=8)
            except Exception:
                # If CRS transform fails (common on some Windows PROJ setups),
                # still return geometries in source CRS to avoid breaking persistence entirely.
                g4326 = geom
        else:
            g4326 = geom
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


def rasterize_damage_labels(
    polygons: List[Polygon],
    damage_labels: List[int],
    height: int,
    width: int,
    nodata: int = 255,
) -> np.ndarray:
    """Pre raster grid'i ile aynı (H,W): her poligon içi damage sınıfı 0–3, dışı ve delikler nodata."""
    arr = np.full((height, width), nodata, dtype=np.uint8)
    for poly, lab in zip(polygons, damage_labels):
        ext = np.round(np.array(poly.exterior.coords)).astype(np.int32)
        ext[:, 0] = np.clip(ext[:, 0], 0, width - 1)
        ext[:, 1] = np.clip(ext[:, 1], 0, height - 1)
        cv2.fillPoly(arr, [ext.reshape(-1, 1, 2)], int(lab))
        for inter in poly.interiors:
            hole = np.round(np.array(inter.coords)).astype(np.int32)
            hole[:, 0] = np.clip(hole[:, 0], 0, width - 1)
            hole[:, 1] = np.clip(hole[:, 1], 0, height - 1)
            cv2.fillPoly(arr, [hole.reshape(-1, 1, 2)], int(nodata))
    return arr


def write_damage_geotiff(out_path: str, array_hw: np.ndarray, reference_tif_path: str, nodata: int = 255) -> None:
    """Referans pre GeoTIFF ile aynı transform/CRS/grid; tek bant UInt8 damage katmanı."""
    with rasterio.open(reference_tif_path) as src:
        profile = src.profile.copy()
        profile.update(
            dtype=rasterio.uint8,
            count=1,
            compress="lzw",
            nodata=nodata,
        )
        profile.pop("photometric", None)
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(np.expand_dims(array_hw.astype(np.uint8), axis=0))


def damage_geojson_and_bbox4326(
    polygons: List[Polygon],
    damage_classes: List[int],
    confidences: List[float],
    transform,
    src_crs,
    dst_crs: str = "EPSG:4326",
) -> Tuple[dict, Optional[dict]]:
    """
    Segmentasyon polygon sırası ile aynı indeks: hasar + confidence + PostGIS ingest GeoJSON.
    src_crs yoksa geometriler affine dünya koordinatlarında kalır; bbox4326 dönmez (null).
    """
    if transform is None:
        raise ValueError("transform is required for georeferenced building outputs")

    a, b, c, d, e, f = transform.a, transform.b, transform.c, transform.d, transform.e, transform.f
    world_polys: List[Polygon] = []
    for poly in polygons:
        wp = affine_transform(poly, [a, b, d, e, c, f])
        if not wp.is_valid:
            wp = wp.buffer(0)
        world_polys.append(wp)

    geoms = []
    if src_crs is not None:
        import pyproj

        trans = pyproj.Transformer.from_crs(src_crs, dst_crs, always_xy=True)

        def _to_dst(x: float, y: float) -> Tuple[float, float]:
            return trans.transform(x, y)

        geoms = [shapely_transform(_to_dst, wp) for wp in world_polys]
    else:
        geoms = world_polys

    features: List[dict] = []
    for i, (geom, dc, cf) in enumerate(zip(geoms, damage_classes, confidences)):
        gj = mapping(geom)
        if gj.get("coordinates") is None:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": gj,
                "properties": {
                    "id": i,
                    "damage_class": int(dc),
                    "confidence": float(cf),
                    "bbox_px": [float(x) for x in polygons[i].bounds],
                },
            }
        )

    bbox4326: Optional[dict] = None
    if src_crs is not None and geoms:
        u = unary_union(geoms)
        if not u.is_empty:
            minx, miny, maxx, maxy = u.bounds
            bbox4326 = mapping(box(minx, miny, maxx, maxy))

    return {"type": "FeatureCollection", "features": features}, bbox4326


def write_change_map_sidecar(
    output_dir: Path,
    crs_wkt: Optional[str],
    bbox4326_geojson: Optional[dict],
) -> None:
    """Backend'in change_maps satırı için metadata (CRS + bbox4326)."""
    payload = {
        "rasterFilename": "damage_map.tif",
        "crsWkt": crs_wkt,
        "bbox4326GeoJSON": bbox4326_geojson,
    }
    (output_dir / "change_map_meta.json").write_text(json.dumps(payload), encoding="utf-8")
