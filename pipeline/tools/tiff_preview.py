#!/usr/bin/env python3
"""
Convert a GeoTIFF to a downsampled RGB PNG preview.
Prints EPSG:4326 bounds as JSON to stdout.

Usage:
    python tiff_preview.py --input pre.tif --output preview.png
Stdout:
    {"bounds": [[minLat, minLng], [maxLat, maxLng]]}
"""
import os

# PostgreSQL/PostGIS ships an older proj.db that conflicts with rasterio's PROJ.
# Override PROJ_DATA before GDAL/rasterio initializes so the correct database is used.
try:
    import pyproj
    os.environ['PROJ_DATA'] = pyproj.datadir.get_data_dir()
except Exception:
    pass

import argparse
import json
import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.enums import Resampling

MAX_DIM = 1024


def percentile_stretch(band: np.ndarray) -> np.ndarray:
    flat = band.flatten()
    valid = flat[flat > 0]
    if len(valid) == 0:
        return np.zeros_like(band, dtype=np.uint8)
    p1, p99 = np.percentile(valid, [1, 99])
    if p99 <= p1:
        return np.zeros_like(band, dtype=np.uint8)
    stretched = np.clip(
        (band.astype(np.float32) - p1) / (p99 - p1) * 255, 0, 255
    )
    return stretched.astype(np.uint8)


def main() -> None:
    parser = argparse.ArgumentParser(description="GeoTIFF to PNG preview")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with rasterio.open(args.input) as src:
        bounds_4326 = transform_bounds(src.crs, "EPSG:4326", *src.bounds)
        min_lon, min_lat, max_lon, max_lat = bounds_4326

        scale = min(MAX_DIM / src.width, MAX_DIM / src.height, 1.0)
        out_w = max(1, int(src.width * scale))
        out_h = max(1, int(src.height * scale))

        n_bands = src.count
        band_indices = list(range(1, min(n_bands, 3) + 1))

        bands_uint8 = []
        for b in band_indices:
            data = src.read(
                b,
                out_shape=(out_h, out_w),
                resampling=Resampling.lanczos,
            )
            bands_uint8.append(percentile_stretch(data))

        while len(bands_uint8) < 3:
            bands_uint8.append(bands_uint8[0])

        rgb = np.stack(bands_uint8, axis=0)  # shape: (3, H, W)

        with rasterio.open(
            args.output,
            "w",
            driver="PNG",
            height=out_h,
            width=out_w,
            count=3,
            dtype=np.uint8,
        ) as dst:
            dst.write(rgb)

    print(json.dumps({"bounds": [[min_lat, min_lon], [max_lat, max_lon]]}))


if __name__ == "__main__":
    main()
