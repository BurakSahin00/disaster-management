# 03_change_map_from_tiffs.py (Alignment ile)

import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling

def align_to_pre(pre_src, post_src):
    """
    Pre TIFF'in gridine göre post TIFF'i hizalar.
    """
    print("⚠ Pre/Post TIFF boyutları farklı → otomatik hizalama yapılıyor...")

    aligned = np.zeros((post_src.count, pre_src.height, pre_src.width), dtype=np.float32)

    for i in range(post_src.count):
        reproject(
            source=rasterio.band(post_src, i+1),
            destination=aligned[i],
            src_transform=post_src.transform,
            src_crs=post_src.crs,
            dst_transform=pre_src.transform,
            dst_crs=pre_src.crs,
            resampling=Resampling.bilinear
        )
    print("✔ Post görüntü hizalandı.")
    return aligned


def compute_change_map(pre_tif, post_tif, out_tif="change_map.tif"):
    with rasterio.open(pre_tif) as pre_src, rasterio.open(post_tif) as post_src:
        
        pre = pre_src.read()  # (C,H,W)
        
        # Boyutlar aynı mı?
        need_align = (
            pre_src.width != post_src.width or
            pre_src.height != post_src.height or
            pre_src.crs != post_src.crs or
            pre_src.transform != post_src.transform
        )

        if need_align:
            post = align_to_pre(pre_src, post_src)
        else:
            post = post_src.read()

        print("✔ Change map hesaplanıyor...")
        diff = np.abs(post - pre)
        change = diff.mean(axis=0)

        # Normalize to 0–1
        change = (change - change.min()) / (change.max() - change.min() + 1e-6)

        # Output raster metadata
        meta = pre_src.meta.copy()
        meta.update({
            "count": 1,
            "dtype": "float32"
        })

        with rasterio.open(out_tif, "w", **meta) as dst:
            dst.write(change.astype(np.float32), 1)

        print("✔ Change map kaydedildi:", out_tif)


if __name__ == "__main__":
    compute_change_map(
        "dataset/pre/myanmar_earthquake_pre_122000133121_103001010FCDBB00-ms.tif",
        "dataset/post/myanmar_earthquake_post_122000133121_1030010110B24A00-ms.tif",
        "dataset_out/change_map.tif"
    )
