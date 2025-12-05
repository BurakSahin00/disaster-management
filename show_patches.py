import os
import time
import numpy as np
import matplotlib.pyplot as plt

# === TRAIN klasörünü burada ayarla ===
train_folder = "dataset_out/train"

# Train klasöründen sadece *_pre.npy dosyalarını al
files = sorted([
    f for f in os.listdir(train_folder)
    if f.endswith("_pre.npy")
])

print(f"Toplam {len(files)} patch bulundu.")

def show_patch(pre_path):
    pre = np.load(pre_path)

    # (C, H, W) -> (H, W, C)
    pre = np.transpose(pre, (1, 2, 0))

    band_indices = [5, 3, 2]
    pre = pre[band_indices, :, :]

    # Normalize
    pre = (pre - pre.min()) / (pre.max() - pre.min() + 1e-6)
    plt.imshow(pre)
    plt.axis("off")
    plt.show()



# === GÖSTERİM DÖNGÜSÜ ===
for f in files:
    pre_path = os.path.join(train_folder, f)
    print(f"Gösteriliyor: {pre_path}")

    show_patch(pre_path)

    # 5 saniye bekle
    time.sleep(5)

    plt.close("all")
