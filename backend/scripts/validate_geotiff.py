import argparse
import json
import sys

import rasterio


def inspect(path: str) -> dict:
    with rasterio.open(path) as src:
        # Touch minimal metadata; do not read full raster.
        return {
            "path": path,
            "driver": src.driver,
            "width": int(src.width),
            "height": int(src.height),
            "count": int(src.count),
            "crs": str(src.crs) if src.crs else None,
            "dtype": str(src.dtypes[0]) if src.dtypes else None,
        }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pre", required=True)
    ap.add_argument("--post", required=True)
    args = ap.parse_args()

    pre = inspect(args.pre)
    post = inspect(args.post)

    errors = []
    if pre["width"] != post["width"] or pre["height"] != post["height"]:
        errors.append("pre/post dimensions must match")
    if pre["count"] < 3 or post["count"] < 3:
        errors.append("pre/post must have at least 3 bands (RGB)")

    ok = len(errors) == 0
    payload = {"ok": ok, "errors": errors, "pre": pre, "post": post}
    sys.stdout.write(json.dumps(payload))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())

