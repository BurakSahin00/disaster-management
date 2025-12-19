# Change Map

* Girdi:

  * Afet öncesi görüntü (**Pre**)
  * Afet sonrası görüntü (**Post**)
* Çıktı:

  * **Değişim yoğunluğu haritası** (continuous change map)
  * veya **İkili değişim haritası** (binary change map)

Bu haritalar, özellikle **afet sonrası hasar tespiti**, **bina yıkımı analizi** ve **etki alanı belirleme** için kullanılır.

---

# Change Map Türleri

## 2.1 Sürekli (Continuous) Change Map

Her piksel için bir **değişim şiddeti değeri** üretir.

* Düşük değer → değişim yok
* Yüksek değer → güçlü değişim

Bu harita:

* Görsel analiz için çok uygundur
* Threshold uygulanarak binary haritaya dönüştürülebilir

Örnek: Heatmap (kırmızı = yüksek değişim)

---

## 2.2 İkili (Binary) Change Map

Her piksel için:

* `0` → değişim yok
* `1` → değişim var

Bu format:

* Hasar bölgelerinin net ayrımı
* Kümelendirme
* Alan hesaplama
* CNN / PostGIS entegrasyonu

için kullanılır.

---

# Label Olmadan Change Map Üretme (Unsupervised)

## 3.1 Absolute Difference (En Basit Yöntem)

### Mantık:

Pre ve Post görüntü arasındaki mutlak fark alınır.

### Özellikleri:

* Çok hızlı
* Gürültüye hassas
* Işık farklarından etkilenebilir

---

## 3.2 Change Vector Analysis (CVA)

### Mantık:

Çok bantlı piksel farkı bir **vektör** olarak düşünülür.

### Avantajları:

* Multispectral veride çok etkilidir
* Işık değişimlerinden daha az etkilenir
* Afet hasarı için akademik olarak yaygındır

---

## 3.3 Structural Similarity (SSIM)

### Mantık:

Piksel değil, **yapısal benzerliği** ölçer.

* Bina yıkımı gibi **geometrik değişimlerde** çok başarılı
* Hesaplaması daha pahalıdır

---

# Thresholding: Sürekli Haritadan Binary Haritaya

Ham change map **gürültülüdür**.
Bu yüzden threshold uygulanır.

## 4.1 Sabit Threshold

* Deneysel olarak belirlenir
* Genelde önerilmez

## 4.2 Otsu Threshold (Önerilir)

* Histogramdan otomatik eşik bulur
* Etiket gerektirmez

## 4.3 Percentile Threshold

* En yüksek %10–15 değişim pikselini seçer
* Afet senaryolarında pratiktir

---

# Gürültü Azaltma ve Temizleme (Çok Önemli)

Ham binary change map şunları içerir:

* Tek piksellik gürültü
* Gölge / aydınlık kaynaklı sahte değişimler

Bu yüzden:

## 5.1 Morphological Operations

* Opening → küçük gürültüleri siler
* Closing → boşlukları doldurur

## 5.2 Küçük Bileşenleri Silme

* Belirli alanın altındaki nesneler atılır

---

```
Pre/Post TIFF
   ↓
Alignment
   ↓
Preprocessing
   ↓
Patch Extraction
   ↓
Change Map (CVA / Diff / SSIM)
   ↓
Threshold + Filtering
   ↓
Binary Change Map
   ↓
Clustering / PostGIS / CNN
```

---
