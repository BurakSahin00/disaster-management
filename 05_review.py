import os
import numpy as np
import matplotlib.pyplot as plt

# WV3 Multispectral için RGB bantları (1-based: 5,3,2)
RGB_BANDS = (5, 3, 2)


def load_patch(base_path):
    pre = np.load(base_path + "_pre.npy")
    post = np.load(base_path + "_post.npy")
    
    change = None
    binary = None
    
    if os.path.exists(base_path + "_changemap.npy"):
        change = np.load(base_path + "_changemap.npy")
    
    if os.path.exists(base_path + "_binarymask.npy"):
        binary = np.load(base_path + "_binarymask.npy")
    
    return pre, post, change, binary


def to_rgb(patch, bands):
    """C,H,W patch’i RGB görüntüye çevirir."""
    b = [x - 1 for x in bands]  # 1-based → 0-based

    rgb = np.stack([patch[b[0]], patch[b[1]], patch[b[2]]], axis=-1)

    # Normalize 0–1
    rgb = (rgb - rgb.min()) / (rgb.max() - rgb.min() + 1e-6)

    return rgb


def visualize_patch(base_path):
    pre, post, change, binary = load_patch(base_path)

    pre_rgb = to_rgb(pre, RGB_BANDS)
    post_rgb = to_rgb(post, RGB_BANDS)

    plt.figure(figsize=(12, 8))

    # Pre patch
    plt.subplot(2, 2, 1)
    plt.imshow(pre_rgb)
    plt.title("Pre Patch (RGB)")
    plt.axis("off")

    # Post patch
    plt.subplot(2, 2, 2)
    plt.imshow(post_rgb)
    plt.title("Post Patch (RGB)")
    plt.axis("off")

    # Change map
    if change is not None:
        plt.subplot(2, 2, 3)
        plt.imshow(change, cmap="gray")
        plt.title("Change Map (SSIM)")
        plt.axis("off")

    # Binary mask
    if binary is not None:
        plt.subplot(2, 2, 4)
        plt.imshow(binary, cmap="gray")
        plt.title("Binary Change Mask")
        plt.axis("off")

    plt.tight_layout()
    plt.show()


# ----------------------------------------
# KULLANIM
# ----------------------------------------

# İncelemek istediğin patch ID'si
patch_id = "patch_000012"  # örnek

base_path = os.path.join("dataset_out/patches", patch_id)
visualize_patch(base_path)
