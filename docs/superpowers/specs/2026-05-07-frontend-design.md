# Frontend Design — Disaster Management Analysis System

**Date:** 2026-05-07  
**Status:** Approved

---

## 1. Architecture & Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) | Progress Report Section 5.6; server/client split, file-based routing |
| Auth | NextAuth.js (credentials provider) | No backend auth endpoint yet; session carries role, swap-safe later |
| Styling | Tailwind CSS | Matches mockup aesthetic without runtime overhead |
| Map | React-Leaflet | Matches mockup; CDN-compatible, well-supported |
| File Upload | react-dropzone | TIFF drag-drop, pre + post separate zones |
| Realtime | Browser WebSocket API | No extra dependency; backend uses native WS at `/ws?jobId=<id>` |
| Language | TypeScript | Entire codebase typed |

### Directory Structure

```
src/
  app/
    (auth)/
      login/page.tsx
    (protected)/
      layout.tsx              ← session guard
      upload/page.tsx         ← 3-step flow
      analyses/[id]/page.tsx  ← map + stats
      admin/page.tsx          ← admin-only
    api/
      auth/[...nextauth]/route.ts
  components/
    upload/   UploadZone, ProgressScreen
    map/      LeafletMap, DamageLayer, StatsPanel
    ui/       StatCard, Tag, Logo, TweaksPanel
  lib/
    api.ts    ← typed fetch wrappers
    ws.ts     ← useJobSocket hook
  middleware.ts ← /admin route protection
```

---

## 2. Authentication

- **Provider:** NextAuth credentials — email + password matched against env vars
- **Session:** JWT, carries `{ id, email, role: "admin" | "user" }`
- **Env vars:**
  ```
  NEXTAUTH_SECRET=<random>
  ADMIN_EMAIL / ADMIN_PASS
  USER_EMAIL / USER_PASS
  ```
- **Route protection:** `middleware.ts` intercepts `/admin/*` — non-admin redirected to `/`
- **`(protected)/layout.tsx`:** server-side session check, unauthenticated → `/login`
- **Future:** when backend adds auth endpoint, only `api.ts` credential check changes

---

## 3. Pages & User Flow

### Upload Flow (`/upload`) — both roles

1. **UploadScreen** — drag-drop pre + post TIFF files, "Analiz Başlat" button
2. **ProgressScreen** — `POST /jobs` → 202, connect `WebSocket /ws?jobId=<id>`
   - `job.status` → step progress + log terminal
   - `job.completed` → `router.push(/analyses/[analysisId])`
   - `job.failed` → error message + retry button
3. **MapScreen** — `/analyses/[id]` (redirect target)

### Analysis Map (`/analyses/[id]`) — both roles

- Leaflet map with three GeoJSON layers: buildings, regions, clusters
- 4 damage classes color-coded (see Section 5)
- Left panel: StatCards per class + total building count
- Building popup: damage class label + confidence if available
- Layer toggles: buildings / regions / clusters
- TweaksPanel: accent color, map style, opacity

### Admin Panel (`/admin`) — admin only

- Table of all analyses (date, status, link to map)
- User list (env-based, static for now)

### Login (`/login`)

- Email + password form
- `signIn("credentials")` → success → `/upload`

---

## 4. API Integration

**Base URL:** `NEXT_PUBLIC_API_URL` env var (default `http://localhost:3001`)

### REST Endpoints Used

```
POST /jobs                               upload pre + post TIFF → {id, status}
GET  /jobs/:id                           poll job status
GET  /analyses/:id/buildings.geojson?bbox=minLng,minLat,maxLng,maxLat
GET  /analyses/:id/regions.geojson?bbox=...
GET  /analyses/:id/clusters.geojson?bbox=...
```

### WebSocket (`useJobSocket` hook)

```
ws://API_HOST/ws?jobId=<id>

Messages:
  job.status    → update progress step + append log line
  job.completed → analysisId extracted → redirect to map
  job.failed    → show error, enable retry
```

### GeoJSON Loading Strategy

Map fires `moveend` → current viewport `bbox` sent to geodata endpoints → only visible features loaded. Prevents performance issues on large datasets.

---

## 5. Damage Class Mapping

4 classes matching backend/pipeline exactly (NOT the 5-class mockup):

```typescript
const DAMAGE_CLASSES = {
  0: { key: 'no-damage',    label: 'Hasarsız',     color: '#22c55e' },
  1: { key: 'minor-damage', label: 'Az Hasarlı',   color: '#eab308' },
  2: { key: 'major-damage', label: 'Ağır Hasarlı', color: '#f97316' },
  3: { key: 'destroyed',    label: 'Yıkık',        color: '#ef4444' },
}
```

---

## 6. Component Design & Styling

**Visual language** from `AfetHasarAnalizi.html` mockup:

- **Accent:** `#2563EB` (Tailwind `blue-600`), overridable via TweaksPanel
- **Font:** IBM Plex Sans (body), IBM Plex Mono (log terminal)
- **Background:** `#0f172a` (slate-900), dark theme throughout

### Key Components

**`<UploadZone>`**  
react-dropzone, `.tif/.tiff` accept filter, separate zones for pre and post image, filename preview on selection.

**`<ProgressScreen>`**  
Steps: Upload → Segmentation → Polygon Extraction → Damage Classification → Complete.  
WebSocket log lines scroll in a Mono-font terminal div. Spinner → checkmark per completed step.

**`<LeafletMap>`**  
Loaded with `dynamic(() => import(...), { ssr: false })` to avoid SSR issues.  
GeoJSON layers rendered as `<GeoJSON>` components with `style` prop driven by `damage_class` property.  
`moveend` event triggers bbox-filtered geodata fetch.  
Popup shows damage label + class color badge.

**`<StatsPanel>`**  
Fixed left panel, 4x `<StatCard>` (icon + count + percentage per damage class), total building count header, layer toggle switches.

**`<TweaksPanel>`**  
Loaded via `<Script>` from CDN (tweaks-panel.jsx), `window.useTweaks` hook manages accent color + map tile style + layer opacity.

**`<AdminTable>`**  
Analysis list table: ID, date, status badge, link to `/analyses/[id]`.

### Layout

```
(protected)/layout.tsx
  <Navbar>  logo | page title | role badge | signout
  <main>    {children}
```

---

## 7. Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with openssl rand -base64 32>
ADMIN_EMAIL=admin@example.com
ADMIN_PASS=<strong password>
USER_EMAIL=user@example.com
USER_PASS=<strong password>
```

---

## 8. Out of Scope (this iteration)

- Multi-user management UI (user creation, deletion)
- Backend-side auth endpoint
- Image registration (`POST /images`) — handled by backend separately
- `POST /analyses/:id/recompute` trigger from UI
- Export / PDF report download
- Mobile responsive beyond basic Tailwind breakpoints
