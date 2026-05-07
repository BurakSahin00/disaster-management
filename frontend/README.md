# Afet Hasar Analizi — Frontend

Next.js 14 tabanlı afet sonrası bina hasar analizi görselleştirme arayüzü. Makine öğrenmesi pipeline'ından gelen GeoJSON verilerini interaktif harita üzerinde sunar.

---

## Özellikler

- **2 rol kimlik doğrulama** — Admin ve kullanıcı, NextAuth.js credentials provider
- **TIFF yükleme akışı** — Ön ve son görüntüyü sürükle-bırak ile yükle, WebSocket üzerinden anlık ilerleme takibi
- **İnteraktif harita** — React-Leaflet, viewport bbox filtreli GeoJSON katmanları (binalar, bölgeler, kümeler)
- **4 hasar sınıfı** renk kodlaması ile görselleştirme
- **Admin paneli** — Tüm analizleri listele (admin rolüne özel)

## Hasar Sınıfları

| Sınıf | Etiket | Renk |
|-------|--------|------|
| 0 | Hasarsız | `#22c55e` |
| 1 | Az Hasarlı | `#eab308` |
| 2 | Ağır Hasarlı | `#f97316` |
| 3 | Yıkık | `#ef4444` |

---

## Kurulum

### Gereksinimler

- Node.js 18+
- Backend API çalışır durumda (varsayılan: `http://localhost:3001`)

### Adımlar

```bash
cd frontend
npm install
```

`.env.local` dosyası oluştur:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32 ile üret>
ADMIN_EMAIL=admin@example.com
ADMIN_PASS=guclu-sifre
USER_EMAIL=user@example.com
USER_PASS=guclu-sifre
```

```bash
npm run dev
```

Uygulama `http://localhost:3000` adresinde açılır.

---

## Proje Yapısı

```
frontend/
  src/
    app/
      (auth)/login/          ← Giriş sayfası
      (protected)/
        layout.tsx           ← Oturum koruması + Navbar
        upload/              ← TIFF yükleme + WebSocket ilerleme
        analyses/[id]/       ← Harita + istatistik paneli
        admin/               ← Admin analiz listesi
      api/auth/[...nextauth] ← NextAuth handler
    components/
      upload/   UploadZone, ProgressScreen
      map/      LeafletMap, LeafletMapInner, StatsPanel
      ui/       StatCard, Navbar, Logo, Tag, TweaksPanel
    lib/
      api.ts    → Backend REST çağrıları
      ws.ts     → useJobSocket hook (WebSocket)
      auth.ts   → NextAuth yapılandırması
      damage.ts → Hasar sınıfı eşlemeleri
    types/      → TypeScript tip tanımları
  __mocks__/    → Jest için Leaflet mock'ları
```

---

## API Entegrasyonu

Backend base URL: `NEXT_PUBLIC_API_URL` env değişkeni

| Endpoint | Kullanım |
|----------|----------|
| `POST /jobs` | TIFF yükleme ve iş başlatma |
| `GET /jobs/:id` | İş durumu sorgulama |
| `GET /analyses/:id/buildings.geojson?bbox=...` | Bina katmanı |
| `GET /analyses/:id/regions.geojson?bbox=...` | Bölge katmanı |
| `GET /analyses/:id/clusters.geojson?bbox=...` | Küme katmanı |
| `WS /ws?jobId=<id>` | Gerçek zamanlı iş durumu |

---

## Komutlar

```bash
npm run dev        # Geliştirme sunucusu
npm run build      # Prodüksiyon build
npm run start      # Prodüksiyon sunucusu
npm test           # Jest test suite (27 test)
npm run lint       # ESLint
```

---

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Framework | Next.js 14 (App Router) |
| Auth | NextAuth.js v4 (credentials) |
| Stil | Tailwind CSS |
| Harita | React-Leaflet + Leaflet |
| Dosya Yükleme | react-dropzone |
| Gerçek Zamanlı | Browser WebSocket API |
| Test | Jest + React Testing Library |
| Dil | TypeScript |
