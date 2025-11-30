
---

# 🚀 Toplu karşılaştırma nasıl çalıştırılır?

Bu klasördeki `coordinates.py`, `dataset/pre` ve `dataset/post` klasörlerindeki tüm `.tif` dosyalarını bulur ve her pre–post çifti için koordinat sistemi (CRS) uyumu ve coğrafi örtüşme (overlap) durumunu yazdırır.

1) Bağımlılığı kurun (RasterIO):

```powershell
pip install rasterio
```

2) Script'i çalıştırın (Windows PowerShell):

```powershell
cd "d:\\Senior Project\\project\\data_preprocessing"
python .\\coordinates.py
```

Çıktı örneği:

```
=== Batch comparison started ===
Pre files:   3 in ...\\dataset\\pre
Post files:  4 in ...\\dataset\\post
Total pairs: 12

[1/12] Comparing:
    PRE : ...\\dataset\\pre\\pre_1.tif
    POST: ...\\dataset\\post\\post_1.tif
--- DATASET 1 INFO ---
CRS: EPSG:xxxx
Bounds: BoundingBox(...)
...
```

Notlar:
- Artık script tüm kombinasyonları denemek yerine, isim eşleşmesine göre çiftleri oluşturur.
- Eşleştirme kuralı, dosya adının ilk `-` veya `_` karakterine kadar olan kısmı anahtar (key) olarak alır.
    - Örn: `10300100DF1DB000-ms.tif` -> key: `10300100DF1DB000`
    - Örn: `TILE_A_20200101_pre.tiff` -> key: `TILE`
- Sadece hem `pre` hem `post` klasöründe aynı key'e sahip dosyalar eşleştirilir.
- Her key için birden çok dosya varsa (ör. ms/pan), aynı key'e ait tüm pre×post kombinasyonları kıyaslanır.
- `.tif` ve `.tiff` uzantıları desteklenir.
- Bir dosyada hata olursa çift atlanır ve diğerlerine devam edilir.
- Klasörlerde `.tif/.tiff` yoksa uygun uyarı verilir.

---

## 🧩 256x256 Patch Üretimi (RGB)

`patch_tiles.py` script'i, tüm `pre` ve `post` TIFF dosyalarını seçtiğiniz RGB bant kombinasyonu ile normalize edip 256x256 (varsayılan) patch'lere böler.

Çalıştırma:

```powershell
cd "d:\\Senior Project\\project\\data_preprocessing"
python .\patch_tiles.py --patch-size 256 --bands 5,3,2 --gamma 1.1 --p-low 1 --p-high 99
```

Parametreler:
- `--pre` / `--post`: Klasör yolları (varsayılan: `dataset/pre`, `dataset/post`)
- `--out`: Çıkış kök klasörü (varsayılan: `patches`)
- `--patch-size`: Kare patch boyutu (örn. 256, 512)
- `--bands`: RGB bandları (1-tabanlı), boş bırakılırsa otomatik (>=5 -> 5,3,2 / >=3 -> 1,2,3)
- `--gamma`: Gamma düzeltmesi (1.0 = kapalı, <1 parlaklaştırır)
- `--p-low` / `--p-high`: Yüzdelik germe alt/üst sınırları
- `--no-pad`: Kenarda eksik kalan patch'leri pad etmek yerine atla
- `--format`: `png` veya `npy`

Çıkış klasör yapısı örneği:

```
patches/
    pre/
        10300100DF1DB000-ms/
            10300100DF1DB000-ms_y0_x0.png
            10300100DF1DB000-ms_y0_x256.png
            ...
    post/
        10300100E2226200-ms/
            10300100E2226200-ms_y0_x0.png
            ...
```

Notlar:
- Normalize işlemi (yüzdelik germe) patch bazında değil, tüm görüntü üzerinde yapılır (tutarlı renk için).
- Edge patch'leri pad edilirse siyah doldurulur (NoData).
- `npy` formatı model eğitimi için hızlı yükleme sağlar.


# ✅ **1. TIFF dosyalarının koordinatlarını otomatik karşılaştırma**

Her TIFF görüntüsünün içinde **GeoTIFF metadata** (coğrafi sınırlar, koordinatlar, çözünürlük, projeksiyon) bulunur.

Python’da `rasterio` kütüphanesi ile:

```python
import rasterio

def get_bounds(path):
    with rasterio.open(path) as src:
        return src.bounds, src.crs

bounds1, crs1 = get_bounds("pre_disaster.tif")
bounds2, crs2 = get_bounds("post_disaster.tif")

print(bounds1)
print(bounds2)
```

Bu kod:

* Sol-üst ve sağ-alt koordinatları çıkarır
* İki görüntünün **coğrafi olarak aynı alanı kapsayıp kapsamadığını** anlamanı sağlar

**Karşılaştırma:**

```python
def overlaps(b1, b2):
    return not (b1.right < b2.left or b1.left > b2.right or
                b1.top < b2.bottom or b1.bottom > b2.top)

print("Overlap:", overlaps(bounds1, bounds2))
```

### 📌 Bu sayede otomatik olarak:

* Aynı alanı kapsayan tile'ları bulursun
* % kaç örtüştüklerini hesaplayabilirsin
* Eşleşmeyen pre–post çiftlerini ayıklayabilirsin

---

# ✅ **2. Görüntülerin harita üzerindeki alanını çizerek görsel doğrulama**

Küçük bir kodla alanları plot edebilirsin:

```python
import matplotlib.pyplot as plt
from shapely.geometry import box

poly1 = box(bounds1.left, bounds1.bottom, bounds1.right, bounds1.top)
poly2 = box(bounds2.left, bounds2.bottom, bounds2.right, bounds2.top)

plt.plot(*poly1.exterior.xy, label="Pre-disaster")
plt.plot(*poly2.exterior.xy, label="Post-disaster")
plt.legend()
plt.show()
```

Bu, iki TIFF dosyasının harita üzerindeki kapsama alanını gösterir.

---

# ✅ **3. Görüntüleri otomatik olarak hizalama (co-registration)**

Eğer görüntülerin koordinatlarında ufak kaymalar varsa:

```python
import cv2
import numpy as np

def align_images(img1, img2):
    sift = cv2.SIFT_create()
    kp1, des1 = sift.detectAndCompute(img1, None)
    kp2, des2 = sift.detectAndCompute(img2, None)

    bf = cv2.BFMatcher()
    matches = bf.knnMatch(des1, des2, k=2)

    good = []
    for m,n in matches:
        if m.distance < 0.75*n.distance:
            good.append(m)

    # Homography hesaplama
    src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1,1,2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1,1,2)

    H, _ = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    aligned = cv2.warpPerspective(img1, H, (img2.shape[1], img2.shape[0]))

    return aligned, H
```

Bu algoritma:

* Deprem öncesi ve sonrası görüntülerdeki bina/hacim değişikliklerini bulur
* Görüntüleri pikseller bazında hizalar
* Change Detection modelleri için “temiz” veri üretir

---

# ✅ **4. Özet: Python ile yapabileceklerin**

| İşlem                                    | Mümkün mü? | Kullanılan Python kütüphanesi |
| ---------------------------------------- | ---------- | ----------------------------- |
| TIFF koordinat çıkarma                   | ✔          | rasterio                      |
| Pre–Post eş bölge eşleştirme             | ✔          | rasterio, shapely             |
| Görüntülerin % örtüşmesini hesaplama     | ✔          | shapely                       |
| Otomatik görüntü hizalama                | ✔          | OpenCV                        |
| Coğrafi doğrulama                        | ✔          | rasterio                      |
| Aynı alan olmayan görüntüleri filtreleme | ✔          | kendi fonksiyonun             |

---
