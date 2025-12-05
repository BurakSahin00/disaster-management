import argparse
import json
from pathlib import Path
from typing import Tuple

import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
import cv2
from sklearn.model_selection import train_test_split


# ===============================================================
# 1. ALIGNMENT
# ===============================================================

def align_to_reference(ref_path: Path, mov_path: Path) -> Tuple[np.ndarray, dict]:
    with rasterio.open(ref_path) as ref, rasterio.open(mov_path) as mov:
        transform, w, h = calculate_default_transform(
            mov.crs, ref.crs, mov.width, mov.height, *mov.bounds
        )
        kwargs = mov.meta.copy()
        kwargs.update({
            "transform": transform,
            "crs": ref.crs,
            "width": w,
            "height": h
        })

        aligned = np.zeros((mov.count, h, w), dtype=np.float32)

        for i in range(1, mov.count + 1):
            reproject(
                rasterio.band(mov, i),
                aligned[i - 1],
                src_transform=mov.transform,
                src_crs=mov.crs,
                dst_transform=transform,
                dst_crs=ref.crs,
                resampling=Resampling.bilinear
            )

    return aligned, kwargs


# ===============================================================
# 2. HAZE / HISTOGRAM CORRECTION
# ===============================================================

def preprocess_image(arr: np.ndarray) -> np.ndarray:
    # Dark object subtraction
    black = np.percentile(arr, 1, axis=(1, 2), keepdims=True)
    arr = np.clip(arr - black, 0, None)

    # CLAHE for contrast
    out = np.zeros_like(arr)
    for i in range(arr.shape[0]):
        tile = (arr[i] / arr[i].max() * 255).astype(np.uint8)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        tile = clahe.apply(tile)
        out[i] = tile.astype(np.float32)

    return out


# ===============================================================
# 3. NORMALIZATION STATS
# ===============================================================

def compute_mean_std(patches):
    all_pixels = np.concatenate([p.reshape(p.shape[0], -1) for p in patches], axis=1)
    return all_pixels.mean(axis=1), all_pixels.std(axis=1)


# ===============================================================
# 4. PATCH EXTRACTION
# ===============================================================

def extract_patches(pre_img, post_img, out_dir, patch_size=256, stride=128):
    h, w = pre_img.shape[1:]
    Path(out_dir).mkdir(parents=True, exist_ok=True)

    patches = []

    for y in range(0, h - patch_size, stride):
        for x in range(0, w - patch_size, stride):

            pre_patch = pre_img[:, y:y + patch_size, x:x + patch_size]
            post_patch = post_img[:, y:y + patch_size, x:x + patch_size]

            # Save images
            pre_out = Path(out_dir) / f"tile_y{y}_x{x}_pre.npy"
            post_out = Path(out_dir) / f"tile_y{y}_x{x}_post.npy"

            np.save(pre_out, pre_patch)
            np.save(post_out, post_patch)

            patches.append(pre_patch)

    return patches


# ===============================================================
# 5. TRAIN/VAL/TEST SPLIT
# ===============================================================

def split_dataset(files, out_root):
    train, test = train_test_split(files, test_size=0.3)
    val, test = train_test_split(test, test_size=0.5)

    for name, split in zip(["train", "val", "test"], [train, val, test]):
        split_dir = out_root / name
        split_dir.mkdir(parents=True, exist_ok=True)
        for f in split:
            Path(f).rename(split_dir / Path(f).name)

    return train, val, test


# ===============================================================
# 6. MAIN
# ===============================================================

def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("--pre", type=str, required=True)
    parser.add_argument("--post", type=str, required=True)
    parser.add_argument("--out", type=str, default="dataset_out")
    parser.add_argument("--patch-size", type=int, default=256)
    parser.add_argument("--stride", type=int, default=128)

    args = parser.parse_args()

    pre_path = Path(args.pre)
    post_path = Path(args.post)
    out_root = Path(args.out)

    out_root.mkdir(parents=True, exist_ok=True)

    # ------------------------------------
    # ALIGNMENT
    # ------------------------------------
    print("Aligning post → pre...")
    post_aligned, meta = align_to_reference(pre_path, post_path)

    # ------------------------------------
    # LOAD PRE
    # ------------------------------------
    with rasterio.open(pre_path) as p:
        pre_img = p.read().astype(np.float32)

    # ------------------------------------
    # PREPROCESSING
    # ------------------------------------
    print("Preprocessing images...")
    pre_img = preprocess_image(pre_img)
    post_img = preprocess_image(post_aligned)

    # ------------------------------------
    # PATCH EXTRACTION
    # ------------------------------------
    print("Extracting patches...")
    patches = extract_patches(
        pre_img, post_img,
        out_dir=out_root / "patches",
        patch_size=args.patch_size,
        stride=args.stride
    )

    # ------------------------------------
    # NORMALIZATION STATS
    # ------------------------------------
    mean, std = compute_mean_std(patches)
    np.save(out_root / "mean.npy", mean)
    np.save(out_root / "std.npy", std)

    # ------------------------------------
    # SPLIT TRAIN/VAL/TEST
    # ------------------------------------
    files = list((out_root / "patches").glob("*_pre.npy"))
    train, val, test = split_dataset(files, out_root)

    # ------------------------------------
    # METADATA SAVE
    # ------------------------------------
    metadata = {
        "crs": meta["crs"].to_string(),
        "transform": list(meta["transform"]),
        "mean": mean.tolist(),
        "std": std.tolist(),
        "patch_size": args.patch_size,
        "stride": args.stride,
    }
    with open(out_root / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=4)

    print("\n🎯 Dataset hazır!")
    print(f"Train patches: {len(train)}")
    print(f"Val patches:   {len(val)}")
    print(f"Test patches:  {len(test)}")
    print(f"Kayıt dizini:  {out_root}")


if __name__ == "__main__":
    main()
