import os
import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.warp import reproject, Resampling
from tqdm import tqdm

PATCH_SIZE = 256
STRIDE = 256
OUTPUT_DIR = "dataset_out/patches"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------------------------------------------------
# 1) POST TIFF'i otomatik olarak PRE TIFF'e hizalama
# ---------------------------------------------------------
def align_to_pre(pre_src, post_src):
    print("Pre/Post boyut veya CRS uyuşmuyor → otomatik hizalama yapılıyor...")

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

    print("Post görüntü başarıyla hizalandı.")
    return aligned


# ---------------------------------------------------------
# 2) Patch çıkarma
# ---------------------------------------------------------
def extract_patches(pre_tif, post_tif, buildings_vector_path=None):
    with rasterio.open(pre_tif) as pre_src, rasterio.open(post_tif) as post_src:

        # Boyut, CRS veya transform uyuşmuyorsa hizala
        need_align = (
            pre_src.width != post_src.width or
            pre_src.height != post_src.height or
            pre_src.crs != post_src.crs or
            pre_src.transform != post_src.transform
        )

        if need_align:
            post_full = align_to_pre(pre_src, post_src)
        else:
            post_full = post_src.read()

        pre_full = pre_src.read()

        patch_id = 0
        print("Patch üretimi başlatıldı...")

        for y in tqdm(range(0, pre_src.height - PATCH_SIZE + 1, STRIDE)):
            for x in range(0, pre_src.width - PATCH_SIZE + 1, STRIDE):

                pre_patch = pre_full[:, y:y+PATCH_SIZE, x:x+PATCH_SIZE]
                post_patch = post_full[:, y:y+PATCH_SIZE, x:x+PATCH_SIZE]

                # Tamamen boş ise geç
                if np.all(pre_patch == 0) and np.all(post_patch == 0):
                    continue

                base = f"patch_{patch_id:06d}"

                np.save(os.path.join(OUTPUT_DIR, base + "_pre.npy"), pre_patch)
                np.save(os.path.join(OUTPUT_DIR, base + "_post.npy"), post_patch)

                patch_id += 1

        print(f"[OK] Toplam üretilen patch sayısı: {patch_id}")


# ---------------------------------------------------------
# 3) Script başlangıcı
# ---------------------------------------------------------
if __name__ == "__main__":
    pre_tif_path = r"dataset\pre\myanmar_earthquake_pre_122000133121_103001010FCDBB00-ms.tif"
    post_tif_path = r"dataset\post\myanmar_earthquake_post_122000133121_1030010110B24A00-ms.tif"

    # Bina verisi yok → None bırakıyoruz
    buildings_vector_path = None

    extract_patches(pre_tif_path, post_tif_path, buildings_vector_path)
