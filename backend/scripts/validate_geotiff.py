import argparse
import json
import sys

import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform_bounds


def inspect(path: str) -> dict:
    with rasterio.open(path) as src:
        bounds = src.bounds
        crs = src.crs
        return {
            "path": path,
            "driver": src.driver,
            "width": int(src.width),
            "height": int(src.height),
            "count": int(src.count),
            "has_crs": crs is not None,
            "crs_wkt": crs.to_wkt() if crs else None,
            # to_epsg() may return None for valid non-EPSG CRS — used only for display
            "crs_label": f"EPSG:{crs.to_epsg()}" if (crs and crs.to_epsg()) else (crs.to_authority()[1] if (crs and crs.to_authority()) else "bilinmeyen projeksiyon"),
            "dtype": str(src.dtypes[0]) if src.dtypes else None,
            "bounds": {
                "left": bounds.left,
                "bottom": bounds.bottom,
                "right": bounds.right,
                "top": bounds.top,
            },
        }


def crs_equal(wkt_a: str, wkt_b: str) -> bool:
    """Compare two CRS by WKT using rasterio's equality (handles equivalent projections)."""
    try:
        return CRS.from_wkt(wkt_a) == CRS.from_wkt(wkt_b)
    except Exception:
        return wkt_a == wkt_b


def to_wgs84(bounds: dict, crs_wkt: str) -> dict | None:
    """Reproject bounds to WGS84 for overlap comparison. Returns None on failure."""
    try:
        src_crs = CRS.from_wkt(crs_wkt)
        left, bottom, right, top = transform_bounds(
            src_crs,
            "EPSG:4326",
            bounds["left"],
            bounds["bottom"],
            bounds["right"],
            bounds["top"],
        )
        return {"left": left, "bottom": bottom, "right": right, "top": top}
    except Exception:
        return None


def overlap_fraction(a: dict, b: dict) -> float:
    """Return the fraction of the smaller image's area that overlaps with the other.
    Returns 0.0 if there is no overlap."""
    ix_left   = max(a["left"],   b["left"])
    ix_bottom = max(a["bottom"], b["bottom"])
    ix_right  = min(a["right"],  b["right"])
    ix_top    = min(a["top"],    b["top"])

    if ix_right <= ix_left or ix_top <= ix_bottom:
        return 0.0

    ix_area = (ix_right - ix_left) * (ix_top - ix_bottom)
    area_a  = (a["right"] - a["left"]) * (a["top"] - a["bottom"])
    area_b  = (b["right"] - b["left"]) * (b["top"] - b["bottom"])
    smaller = min(area_a, area_b)
    return ix_area / smaller if smaller > 0 else 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pre", required=True)
    ap.add_argument("--post", required=True)
    args = ap.parse_args()

    pre = inspect(args.pre)
    post = inspect(args.post)

    errors = []

    if pre["width"] != post["width"] or pre["height"] != post["height"]:
        errors.append(
            f"Pre ve post görüntülerinin boyutları eşleşmiyor "
            f"(pre: {pre['width']}x{pre['height']}, post: {post['width']}x{post['height']})"
        )

    if pre["count"] < 3 or post["count"] < 3:
        errors.append("Her iki görüntü de en az 3 bant (RGB) içermelidir")

    # CRS existence check — only reject if truly no CRS at all
    pre_has_crs = pre["has_crs"]
    post_has_crs = post["has_crs"]
    if not pre_has_crs or not post_has_crs:
        errors.append("Her iki görüntüde de koordinat referans sistemi (CRS) tanımlı olmalıdır")
    else:
        # CRS match check
        if not crs_equal(pre["crs_wkt"], post["crs_wkt"]):
            errors.append(
                f"Pre ve post görüntülerinin koordinat sistemleri uyuşmuyor "
                f"(pre: {pre['crs_label']}, post: {post['crs_label']})"
            )
        else:
            # Geographic overlap check — prefer WGS84, fall back to native CRS bounds.
            # Both images share the same CRS at this point, so native comparison is valid.
            pre_wgs = to_wgs84(pre["bounds"], pre["crs_wkt"])
            post_wgs = to_wgs84(post["bounds"], post["crs_wkt"])

            if pre_wgs is None or post_wgs is None:
                print(
                    f"[validate] WGS84 reprojection failed — using native CRS bounds. "
                    f"pre_wgs={pre_wgs} post_wgs={post_wgs}",
                    file=sys.stderr,
                )
                pre_cmp = pre["bounds"]
                post_cmp = post["bounds"]
            else:
                pre_cmp = pre_wgs
                post_cmp = post_wgs

            frac = overlap_fraction(pre_cmp, post_cmp)
            print(
                f"[validate] overlap_fraction={frac:.4f} "
                f"pre={pre_cmp} post={post_cmp}",
                file=sys.stderr,
            )
            MIN_OVERLAP = 0.10
            if frac < MIN_OVERLAP:
                errors.append(
                    f"Pre ve post görüntüleri coğrafi olarak yeterince örtüşmüyor "
                    f"(örtüşme oranı: %{round(frac * 100)}, minimum %{round(MIN_OVERLAP * 100)} gerekli) — "
                    "aynı bölgeye ait görüntü çifti yüklediğinizden emin olun"
                )

    ok = len(errors) == 0
    payload = {"ok": ok, "errors": errors, "pre": pre, "post": post}
    sys.stdout.write(json.dumps(payload))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
