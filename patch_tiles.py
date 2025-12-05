import argparse
from pathlib import Path
from typing import Optional, Tuple, List
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject
import matplotlib.image as mimage


def _percentile_stretch(arr: np.ndarray, p_low: float, p_high: float) -> np.ndarray:
    if np.ma.isMaskedArray(arr):
        data = arr.compressed()
    else:
        data = arr
    if data.size == 0:
        return np.zeros_like(arr, dtype=np.float32)
    # Ignore zeros (common NoData) to avoid white streaks after resampling
    data_nonzero = data[data != 0]
    if data_nonzero.size == 0:
        data_nonzero = data
    lo = np.percentile(data_nonzero, p_low)
    hi = np.percentile(data_nonzero, p_high)
    if hi <= lo:
        hi = lo + 1.0
    out = (arr.astype(np.float32) - lo) / (hi - lo)
    out = np.clip(out, 0.0, 1.0)
    return out.filled(0.0) if np.ma.isMaskedArray(out) else out


def load_rgb(path: Path, bands: Optional[Tuple[int, int, int]], gamma: float,
             p_low: float, p_high: float) -> np.ndarray:
    with rasterio.open(path) as src:
        if bands is None:
            if src.count >= 5:
                bands = (5, 3, 2)
            elif src.count >= 3:
                bands = (1, 2, 3)
            else:
                raise ValueError(f"Not enough bands to build RGB preview: count={src.count} for {path}")
        r = src.read(bands[0], masked=True)
        g = src.read(bands[1], masked=True)
        b = src.read(bands[2], masked=True)
        # Treat explicit NoData and zeros as masked to reduce banding
        r = np.ma.masked_equal(r, src.nodata if src.nodata is not None else 0)
        g = np.ma.masked_equal(g, src.nodata if src.nodata is not None else 0)
        b = np.ma.masked_equal(b, src.nodata if src.nodata is not None else 0)
        r_s = _percentile_stretch(r, p_low, p_high)
        g_s = _percentile_stretch(g, p_low, p_high)
        b_s = _percentile_stretch(b, p_low, p_high)
        rgb = np.dstack([r_s, g_s, b_s]).astype(np.float32)
        if gamma != 1.0:
            rgb = np.clip(rgb, 0.0, 1.0) ** (1.0 / gamma)
        return rgb


def align_to_reference_grid(ref_path: Path, mov_path: Path, bands: Optional[Tuple[int,int,int]],
                            p_low: float, p_high: float, resampling: Resampling = Resampling.bilinear) -> np.ndarray:
    """Reproject mov raster to the exact grid of ref raster and return normalized RGB."""
    with rasterio.open(ref_path) as ref:
        H, W = ref.height, ref.width
        ref_transform = ref.transform
        ref_crs = ref.crs

    with rasterio.open(mov_path) as mov:
        if bands is None:
            bands = (5,3,2) if mov.count >= 5 else (1,2,3)
        aligned = np.zeros((H, W, 3), dtype=np.float32)
        for i, band_idx in enumerate(bands):
            src_band = mov.read(band_idx)
            dst_band = np.zeros((H, W), dtype=np.float32)
            reproject(
                source=src_band,
                destination=dst_band,
                src_transform=mov.transform,
                src_crs=mov.crs,
                dst_transform=ref_transform,
                dst_crs=ref_crs,
                resampling=resampling,
                src_nodata=mov.nodata,
                dst_nodata=0.0,
            )
            # Robust stretch per band, masking zeros
            aligned[..., i] = _percentile_stretch(np.ma.masked_equal(dst_band, 0.0), p_low, p_high)
        return aligned


def extract_rgb_patches(tif_path: Path, out_root: Path, patch_size: int = 256, bands: Optional[Tuple[int, int, int]] = None,
                        gamma: float = 1.0, p_low: float = 2.0, p_high: float = 98.0, pad: bool = True,
                        format: str = "png") -> int:
    rgb = load_rgb(tif_path, bands, gamma, p_low, p_high)
    h, w = rgb.shape[:2]
    stem = tif_path.stem
    out_dir = out_root / stem
    out_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for y in range(0, h, patch_size):
        for x in range(0, w, patch_size):
            patch = rgb[y:y + patch_size, x:x + patch_size, :]
            if patch.shape[0] < patch_size or patch.shape[1] < patch_size:
                if not pad:
                    continue
                canvas = np.zeros((patch_size, patch_size, 3), dtype=patch.dtype)
                canvas[:patch.shape[0], :patch.shape[1], :] = patch
                patch = canvas
            out_path = out_dir / f"{stem}_y{y}_x{x}.{format}"
            if format == "png":
                mimage.imsave(out_path, patch, vmin=0.0, vmax=1.0)
            elif format == "npy":
                np.save(out_path, patch)
            else:
                raise ValueError("Unsupported format; use png or npy")
            count += 1
    return count


def list_tifs(directory: Path) -> List[Path]:
    return sorted(list(directory.glob("*.tif")) + list(directory.glob("*.tiff")))


def main():
    parser = argparse.ArgumentParser(description="Slice TIFFs into normalized RGB patches.")
    parser.add_argument("--pre", type=str, default="dataset/pre", help="Directory with pre-event TIFFs")
    parser.add_argument("--post", type=str, default="dataset/post", help="Directory with post-event TIFFs")
    parser.add_argument("--out", type=str, default="patches", help="Output root directory")
    parser.add_argument("--patch-size", type=int, default=256, help="Patch size (square)")
    parser.add_argument("--bands", type=str, default="", help="Comma-separated 1-based band indices e.g. 5,3,2")
    parser.add_argument("--gamma", type=float, default=1.15, help="Gamma correction (1.0 = none; <1 brighten; >1 darken/linearize)")
    parser.add_argument("--p-low", type=float, default=2.0, help="Lower percentile for stretch")
    parser.add_argument("--p-high", type=float, default=98.0, help="Upper percentile for stretch")
    parser.add_argument("--no-pad", action="store_true", help="Skip partial edge patches instead of padding")
    parser.add_argument("--format", type=str, default="png", choices=["png", "npy"], help="Patch output format")
    args = parser.parse_args()

    base_dir = Path(__file__).parent.resolve()
    pre_dir = (base_dir / args.pre).resolve()
    post_dir = (base_dir / args.post).resolve()
    out_root = (base_dir / args.out).resolve()
    out_pre = out_root / "pre"
    out_post = out_root / "post"
    out_pre.mkdir(parents=True, exist_ok=True)
    out_post.mkdir(parents=True, exist_ok=True)

    bands = None
    if args.bands:
        parts = args.bands.split(',')
        if len(parts) != 3:
            raise ValueError("--bands must have exactly 3 comma-separated integers")
        bands = tuple(int(p) for p in parts)  # type: ignore

    pre_files = list_tifs(pre_dir)
    post_files = list_tifs(post_dir)
    if not pre_files:
        print(f"No TIFFs found in {pre_dir}")
    if not post_files:
        print(f"No TIFFs found in {post_dir}")
    if not pre_files and not post_files:
        return

    print("=== Patch extraction started ===")
    print(f"Pre TIFFs : {len(pre_files)}")
    print(f"Post TIFFs: {len(post_files)}")
    print(f"Output root: {out_root}")
    print(f"Patch size : {args.patch_size}")
    print(f"Bands      : {bands if bands else 'auto'}")
    print(f"Percentiles: {args.p_low}-{args.p_high}")
    print(f"Gamma      : {args.gamma}\n")

    total_patches = 0
    for tif in pre_files:
        count = extract_rgb_patches(tif, out_pre, patch_size=args.patch_size, bands=bands, gamma=args.gamma,
                                    p_low=args.p_low, p_high=args.p_high, pad=not args.no_pad, format=args.format)
        print(f"[PRE ] {tif.name} -> {count} patches")
        total_patches += count
    for tif in post_files:
        # Align each post image to the corresponding pre image grid if a match exists by stem
        # Fallback to native grid if no matching pre is found
        match = next((p for p in pre_files if p.stem == tif.stem), None)
        if match:
            try:
                aligned_rgb = align_to_reference_grid(match, tif, bands, args.p_low, args.p_high, resampling=Resampling.bilinear)
                # Save aligned patches by writing a temporary mem array via npy route
                # Create a temp npy file-like array pathless by iterating patches directly
                h, w = aligned_rgb.shape[:2]
                stem = tif.stem
                out_dir = (out_post / stem)
                out_dir.mkdir(parents=True, exist_ok=True)
                count = 0
                for y in range(0, h, args.patch_size):
                    for x in range(0, w, args.patch_size):
                        patch = aligned_rgb[y:y + args.patch_size, x:x + args.patch_size, :]
                        if patch.shape[0] < args.patch_size or patch.shape[1] < args.patch_size:
                            if args.no_pad:
                                continue
                            canvas = np.zeros((args.patch_size, args.patch_size, 3), dtype=patch.dtype)
                            canvas[:patch.shape[0], :patch.shape[1], :] = patch
                            patch = canvas
                        out_path = out_dir / f"{stem}_y{y}_x{x}.{args.format}"
                        if args.format == "png":
                            mimage.imsave(out_path, patch, vmin=0.0, vmax=1.0)
                        else:
                            np.save(out_path, patch)
                        count += 1
                print(f"[POST-aligned] {tif.name} -> {count} patches")
                total_patches += count
                continue
            except Exception:
                pass
        count = extract_rgb_patches(tif, out_post, patch_size=args.patch_size, bands=bands, gamma=args.gamma,
                                    p_low=args.p_low, p_high=args.p_high, pad=not args.no_pad, format=args.format)
        print(f"[POST] {tif.name} -> {count} patches")
        total_patches += count

    print(f"\n=== Patch extraction finished. Total patches: {total_patches} ===")


if __name__ == "__main__":
    main()
