# 02_train_val_split.py

import os
import random
import shutil

PATCH_DIR = "dataset_out/patches"
OUTPUT_ROOT = "dataset_out"
TRAIN_DIR = os.path.join(OUTPUT_ROOT, "train")
VAL_DIR = os.path.join(OUTPUT_ROOT, "val")

os.makedirs(TRAIN_DIR, exist_ok=True)
os.makedirs(VAL_DIR, exist_ok=True)

# Tüm pre patch'leri baz al
all_pre = sorted([f for f in os.listdir(PATCH_DIR) if f.endswith("_pre.npy")])

random.seed(42)
random.shuffle(all_pre)

split_idx = int(len(all_pre) * 0.7)
train_pre = all_pre[:split_idx]
val_pre = all_pre[split_idx:]

def move_triplet(pre_file_list, target_dir):
    for pre_name in pre_file_list:
        base = pre_name.replace("_pre.npy", "")
        post_name = base + "_post.npy"
        mask_name = base + "_mask.npy"

        for name in [pre_name, post_name, mask_name]:
            src = os.path.join(PATCH_DIR, name)
            if os.path.exists(src):
                dst = os.path.join(target_dir, name)
                shutil.copy2(src, dst)

move_triplet(train_pre, TRAIN_DIR)
move_triplet(val_pre,   VAL_DIR)

print(f"Train patch sayısı: {len(train_pre)}")
print(f"Val patch sayısı:   {len(val_pre)}")
