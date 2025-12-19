import os
import numpy as np
from skimage.metrics import structural_similarity as ssim
from tqdm import tqdm

# Patch klasörün
PATCH_DIR = "dataset_out/patches"

# Maxar WorldView Multispectral için RGB band indexleri (1 tabanlı → 5,3,2)
RGB_BANDS = (5, 3, 2)

# SSIM threshold (değişim hassasiyeti)
THRESH = 0.05  # 0.2–0.4 arası iyidir, gerekirse ayarlayabiliriz


def extract_rgb(pre, post, rgb_bands):
    """Pre/Post patch'lerden RGB kompoziti çıkarır."""
    # 1-based index → 0-based
    b = [x - 1 for x in rgb_bands]

    pre_rgb = np.stack([pre[b[0]], pre[b[1]], pre[b[2]]], axis=-1)
    post_rgb = np.stack([post[b[0]], post[b[1]], post[b[2]]], axis=-1)

    # Normalize 0-1
    pre_rgb = (pre_rgb - pre_rgb.min()) / (pre_rgb.max() - pre_rgb.min() + 1e-6)
    post_rgb = (post_rgb - post_rgb.min()) / (post_rgb.max() - post_rgb.min() + 1e-6)

    return pre_rgb, post_rgb


def compute_ssim_change(pre_rgb, post_rgb):
    score, diff = ssim(
        pre_rgb,
        post_rgb,
        full=True,
        channel_axis=-1,
        data_range=1.0
    )

    # diff: (H,W,3) → gri tonlama
    diff_gray = diff.mean(axis=-1)  

    change_map = 1 - diff_gray  # 0 = aynı, 1 = değişim
    return change_map




def create_binary_mask(change_map, thresh):
    """Eşik değerine göre binary maske üretir."""
    return (change_map > thresh).astype(np.uint8)


def process_patches():
    files = [f for f in os.listdir(PATCH_DIR) if f.endswith("_pre.npy")]
    files = sorted(files)

    print(f"Toplam {len(files)} patch bulundu. SSIM değişim haritaları üretiliyor...")

    for f in tqdm(files):
        base = f.replace("_pre.npy", "")
        pre = np.load(os.path.join(PATCH_DIR, base + "_pre.npy"))
        post = np.load(os.path.join(PATCH_DIR, base + "_post.npy"))

        # RGB bantlarını çıkar
        pre_rgb, post_rgb = extract_rgb(pre, post, RGB_BANDS)

        # SSIM change map
        change_map = compute_ssim_change(pre_rgb, post_rgb)

        # Binary mask
        binary_mask = create_binary_mask(change_map, THRESH)

        # Kaydet
        np.save(os.path.join(PATCH_DIR, base + "_changemap.npy"), change_map)
        np.save(os.path.join(PATCH_DIR, base + "_binarymask.npy"), binary_mask)

    print("✔ Tüm patchler için SSIM değişim haritaları oluşturuldu.")


if __name__ == "__main__":
    process_patches()
