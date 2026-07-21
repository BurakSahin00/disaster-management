# DisasterSense — Post-Earthquake Building Damage Assessment

ML-supported system for assessing building damage after earthquakes. Upload pre- and
post-disaster GeoTIFF satellite imagery; a two-stage deep learning pipeline segments
buildings and classifies damage, and the results are served as an interactive map with
PostGIS-backed geospatial layers and downloadable reports.

## Features

- **Two-stage ML pipeline** — SegFormer building segmentation followed by a 4-class
  damage classifier (no damage / minor / major / destroyed) on paired pre/post crops
- **Interactive damage map** (Leaflet) with toggleable layers:
  - Per-building damage polygons with filtering and popups
  - Region grid aggregation (square/hex) and DBSCAN damage clusters
  - **Heat map** layer (building-density weighted, adjustable radius)
  - **Hotspot analysis** (Getis-Ord style spatial statistics over region cells)
- **Async job queue** with real-time progress over WebSocket
- **Projects & user management** — JWT auth, `admin` / `analyst` / `viewer` roles,
  registration requests approved by admins
- **PDF report generation** and raw output downloads (GeoJSON, damage raster, overlay)
- **OGC API Features**-compliant read interface (`/ogc/collections/...`)
- Swagger UI at `GET /docs`

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, TypeScript, Express 5 |
| Pipeline | Python, PyTorch (SegFormer + CNN classifier), GeoPandas, PySAL/esda |
| Database | PostgreSQL + PostGIS |
| Frontend | Next.js 16, React 19, Tailwind CSS, Leaflet, Zustand |

## Repository Layout

```
backend/     Express API — job queue, auth, PostGIS integration, migrations
pipeline/    Python ML pipeline (segmentation → classification) + hotspot.py
frontend/    Next.js app — dashboard, job progress, interactive map
```

## Getting Started

### Prerequisites

- Node.js 20+, Python 3.10+, PostgreSQL with PostGIS
- Trained model files (segmentation model directory + damage classifier `.pth`)

### 1. Database

Create a PostGIS-enabled database, then note its connection string
(e.g. `postgresql://postgres:password@localhost:5432/damage`).

### 2. Backend

```powershell
cd backend
npm install
copy .env.example .env   # fill in the values below
npm run migrate          # applies SQL migrations in src/migrations/
npm run dev              # dev server on http://localhost:3001
```

Required `.env` values:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostGIS connection string |
| `SEG_MODEL_PATH` | Path to segmentation model (directory for SegFormer) |
| `DMG_MODEL_PATH` | Path to damage classifier `.pth` |
| `PYTHON_BIN` | Python executable (default `python`) |
| `PIPELINE_ENTRYPOINT` | Defaults to `../pipeline/main.py` |
| `API_KEY` | Static key for `x-api-key`; if unset, the check is skipped (dev) |
| `JWT_SECRET` | JWT signing secret |
| `CORS_ORIGIN` | Comma-separated allowed origins |

### 3. Pipeline

```powershell
cd pipeline
pip install -r requirements.txt
```

The backend spawns the pipeline as a child process per job. It can also be run
standalone:

```powershell
python main.py --pre pre.tif --post post.tif --seg-model models/segformer --dmg-model models/damage.pth --output outputs/
```

### 4. Frontend

```powershell
cd frontend
npm install
npm run dev              # http://localhost:3000
```

Optional `.env.local`: `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`) and
`NEXT_PUBLIC_API_KEY` (sent as `x-api-key`).

### Default accounts

Seeded by migrations: `admin@disastersense.local / admin123` and
`analyst@disastersense.local / analyst123`.

## Usage

1. Sign in and create or pick a project on the dashboard.
2. Upload pre- and post-disaster GeoTIFFs — a job is queued and the pipeline runs
   (progress streams live on the job page).
3. Open the analysis map: filter damage classes, toggle regions/clusters/heat map,
   run hotspot analysis, inspect buildings, and export the PDF report.

## Key API Endpoints

- `POST /jobs` — submit a job (multipart `pre` + `post` GeoTIFFs) → `202 { id }`
- `GET /jobs/:id` — job status (or WebSocket `/ws?jobId=<id>`)
- `GET /analyses/:id/buildings.geojson` · `regions.geojson` · `clusters.geojson`
- `POST /analyses/:id/hotspot` — compute hotspot cells, then
  `GET /analyses/:id/hotspot.geojson`
- `POST /analyses/:id/recompute` — rebuild region grid / clusters with custom params

All GeoJSON endpoints accept `?bbox=minLon,minLat,maxLon,maxLat`. Full reference:
Swagger UI at `/docs`.

## Testing

```powershell
cd backend
npm test                  # unit tests (Jest)
npm run db:test:up        # PostGIS test container (docker compose)
npm run test:integration  # integration tests against live PostGIS

cd frontend
npm test                  # Jest + jsdom component/unit tests
```

## Damage Classes

| Value | Label | Color |
|-------|-------|-------|
| 0 | No Damage | green |
| 1 | Minor Damage | olive |
| 2 | Major Damage | orange |
| 3 | Destroyed | red |
