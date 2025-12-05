import re
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import numpy as np
import matplotlib.pyplot as plt


def _find_tifs(directory: Path) -> List[Path]:
    """Return sorted list of .tif/.tiff files in the given directory (non-recursive)."""
    tifs = list(directory.glob("*.tif")) + list(directory.glob("*.tiff"))
    return sorted(tifs)


def _match_key(path: Path) -> str:
    """
    Extract a pairing key from filename to match pre/post images.

    Default rule: take the stem and cut at the first '-' or '_' character.
    Example:
      '10300100DF1DB000-ms.tif' -> '10300100DF1DB000'
      'TILE_A_20200101_pre.tif' -> 'TILE'

    Adjust this function to fit your naming scheme (e.g., regex capture).
    """
    stem = path.stem
    # Split at first '-' or '_' if present
    m = re.split(r"[-_]", stem, maxsplit=1)
    key = m[0] if m else stem
    return key.upper()  # case-insensitive matching

def _percentile_stretch(arr: np.ndarray, p_low: float = 2.0, p_high: float = 98.0) -> np.ndarray:
    """Contrast stretch a single band using percentiles; returns float32 in [0,1]."""
    # arr may be masked; use compressed values for percentiles
    if np.ma.isMaskedArray(arr):
        data = arr.compressed()
    else:
        data = arr
    if data.size == 0:
        return np.zeros_like(arr, dtype=np.float32)
    lo = np.percentile(data, p_low)
    hi = np.percentile(data, p_high)
    if hi <= lo:
        hi = lo + 1.0
    out = (arr.astype(np.float32) - lo) / (hi - lo)
    out = np.clip(out, 0.0, 1.0)
    return out.filled(0.0) if np.ma.isMaskedArray(out) else out


def load_rgb(path: Path, bands: Optional[Tuple[int, int, int]] = None, gamma: float = 1.0) -> np.ndarray:
    """
    Load an RGB preview from a multispectral raster with robust normalization.

    - bands: 1-based band indices as (R, G, B). If None, auto-select:
        * if src.count >= 5 -> (5,3,2)  # typical WorldView natural color
        * elif src.count >= 3 -> (1,2,3)
        * else -> raises ValueError
    - Applies per-band percentile stretch (2-98%) ignoring NoData
    - Applies optional gamma correction (gamma<1 brightens)
    - Returns float array in [0,1] with shape (H,W,3)
    """
    with rasterio.open(path) as src:
        if bands is None:
            if src.count >= 5:
                bands = (5, 3, 2)
            elif src.count >= 3:
                bands = (1, 2, 3)
            else:
                raise ValueError(f"Not enough bands to build RGB preview: count={src.count} for {path}")

        # Read as masked arrays to ignore NoData
        r = src.read(bands[0], masked=True)
        g = src.read(bands[1], masked=True)
        b = src.read(bands[2], masked=True)

        # Per-band robust stretch
        r_s = _percentile_stretch(r)
        g_s = _percentile_stretch(g)
        b_s = _percentile_stretch(b)

        rgb = np.dstack([r_s, g_s, b_s]).astype(np.float32)

        # Optional gamma correction
        if gamma != 1.0:
            # avoid negative/NaN
            rgb = np.clip(rgb, 0.0, 1.0) ** (1.0 / gamma)

        return rgb

def comparison(dataset_path1, dataset_path2):
    with rasterio.open(dataset_path1) as src1:
        bounds1 = src1.bounds
        crs1 = src1.crs

    with rasterio.open(dataset_path2) as src2:
        bounds2 = src2.bounds
        crs2 = src2.crs

    # Ayrıntılı bilgi yazdırma
    print("\n--- DATASET 1 INFO ---")
    print(f"Path: {dataset_path1}")
    print(f"CRS: {crs1}")
    print(f"Bounds: {bounds1}")

    print("\n--- DATASET 2 INFO ---")
    print(f"Path: {dataset_path2}")
    print(f"CRS: {crs2}")
    print(f"Bounds: {bounds2}")

    # 1. CRS karşılaştırması
    if crs1 != crs2:
        print("\nCoordinate Reference Systems (CRS) DO NOT MATCH!")
        print("Bu nedenle görüntüler aynı koordinat referansında değildir ve doğrudan karşılaştırılamaz.")
        return False

    print("\n✔ CRS equal. (Görüntüler aynı projeksiyonda.)")

    # 2. Boundaries üzerinden overlap hesaplama
    overlap = (bounds1.right == bounds2.right and
                   bounds1.left == bounds2.left and
                   bounds1.top == bounds2.top and
                   bounds1.bottom == bounds2.bottom)

    # 3. Detaylı açıklama ekleme
    if overlap:
        print("\nThe datasets OVERLAP.")
        print("Bu iki görüntü aynı coğrafi alanın en az bir bölümünü kapsamaktadır.")
    else:
        print("\nThe datasets DO NOT overlap.")
        print("Bu iki görüntü coğrafi olarak kesişen bir bölge içermiyor.")

    return overlap


def align_to_reference(ref_path: Path, mov_path: Path, resampling: Resampling = Resampling.bilinear) -> np.ndarray:
    """Reproject the moving image to exactly match the reference grid.

    Returns a float32 array of shape (H,W,3) aligned to the reference using load_rgb's band selection.
    """
    with rasterio.open(ref_path) as ref:
        ref_profile = ref.profile
        ref_transform = ref.transform
        ref_crs = ref.crs
        H, W = ref.height, ref.width

    # Load moving image RGB first (in its native grid)
    rgb_mov = load_rgb(mov_path, bands=(5,3,2), gamma=1.0)
    # Prepare output buffer aligned to reference
    aligned = np.zeros((H, W, 3), dtype=np.float32)

    with rasterio.open(mov_path) as mov:
        for i, band_idx in enumerate((5, 3, 2) if mov.count >= 5 else (1, 2, 3)):
            src_band = mov.read(band_idx).astype(np.float32)
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
            aligned[..., i] = dst_band

    # Normalize with robust percentiles to reduce streaking
    for i in range(3):
        aligned[..., i] = _percentile_stretch(np.ma.masked_equal(aligned[..., i], 0.0))
    return aligned


def main():
    # Base directories relative to this file
    base_dir = Path(__file__).parent
    pre_dir = (base_dir / "dataset" / "pre").resolve()
    post_dir = (base_dir / "dataset" / "post").resolve()

    pre_tifs = _find_tifs(pre_dir)
    post_tifs = _find_tifs(post_dir)

    if not pre_tifs:
        print(f"No .tif files found in: {pre_dir}")
    if not post_tifs:
        print(f"No .tif files found in: {post_dir}")
    if not pre_tifs or not post_tifs:
        return

    # Group files by matching key
    pre_by_key: Dict[str, List[Path]] = {}
    post_by_key: Dict[str, List[Path]] = {}
    for p in pre_tifs:
        pre_by_key.setdefault(_match_key(p), []).append(p)
    for p in post_tifs:
        post_by_key.setdefault(_match_key(p), []).append(p)

    shared_keys = sorted(set(pre_by_key.keys()) & set(post_by_key.keys()))
    missing_in_post = sorted(set(pre_by_key.keys()) - set(post_by_key.keys()))
    missing_in_pre = sorted(set(post_by_key.keys()) - set(pre_by_key.keys()))

    # Build list of matched pairs (cartesian product within each shared key)
    pairs: List[Tuple[Path, Path]] = []
    for key in shared_keys:
        for pre_path in pre_by_key[key]:
            for post_path in post_by_key[key]:
                pairs.append((pre_path, post_path))

    print("\n=== Matched comparison started (by filename key) ===")
    print(f"Pre files:        {len(pre_tifs)} in {pre_dir}")
    print(f"Post files:       {len(post_tifs)} in {post_dir}")
    print(f"Shared keys:      {len(shared_keys)}")
    print(f"Pairs to compare: {len(pairs)}\n")

    if missing_in_post:
        print(f"Keys only in PRE (no POST match): {len(missing_in_post)} -> {missing_in_post[:10]}{ ' ...' if len(missing_in_post) > 10 else ''}")
    if missing_in_pre:
        print(f"Keys only in POST (no PRE match): {len(missing_in_pre)} -> {missing_in_pre[:10]}{ ' ...' if len(missing_in_pre) > 10 else ''}")

    if not pairs:
        print("No matched pairs found. Adjust the _match_key() rule to fit your filenames.")
        return

    for idx, (pre_path, post_path) in enumerate(pairs, start=1):
        print("\n" + "=" * 80)
        print(f"[{idx}/{len(pairs)}] Comparing (key={_match_key(pre_path)}):\n  PRE : {pre_path}\n  POST: {post_path}")
        try:
            comparison(str(pre_path), str(post_path))
        except Exception as e:
            print(f"\nSkipped due to error: {e}")

    # Görselleştirme: son eşleşen çift için örnek
    pre = load_rgb(pre_path, bands=(5,3,2), gamma=1.15)
    # Align post to pre grid to avoid visual shifts
    try:
        post_aligned = align_to_reference(pre_path, post_path, resampling=Resampling.bilinear)
        # Apply gamma after alignment
        post = np.clip(post_aligned, 0.0, 1.0) ** (1.0/1.15)
    except Exception:
        post = load_rgb(post_path, bands=(5,3,2), gamma=1.15)

    plt.figure(figsize=(14, 6))

    # Solda pre, sağda post (yan yana)
    ax1 = plt.subplot(1, 2, 1)
    ax1.set_title("Pre (Afet Öncesi)")
    ax1.imshow(pre)
    ax1.axis('off')

    ax2 = plt.subplot(1, 2, 2)
    ax2.set_title("Post (Afet Sonrası)")
    ax2.imshow(post)
    ax2.axis('off')

    plt.tight_layout()
    plt.show()
    print("\n=== Matched comparison finished ===")


if __name__ == "__main__":
    main()
