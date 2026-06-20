# Backend (Node.js + TypeScript + PostGIS)

ML-supported post-earthquake building damage assessment system backend.

- Accepts **pre/post GeoTIFF** uploads
- Runs the **Python ML pipeline** (`../pipeline/main.py`) asynchronously
- Persists analysis outputs in **PostgreSQL/PostGIS**
- Serves map-ready layers as **GeoJSON** (buildings/regions/clusters)
- Provides an **OGC API Features–like** read interface under `/ogc`

## Requirements

- **Node.js** (project tested with recent Node; Windows PowerShell supported)
- **PostgreSQL + PostGIS** (local install is fine)
- (Optional) **Python** + ML models if you want to run the real pipeline

## Setup

Install dependencies:

```powershell
cd D:\SeniorProject\backend
npm install
```

Create an env file:

```powershell
copy .env.example .env
```

Fill in at least:

- `DATABASE_URL`
- `SEG_MODEL_PATH`
- `DMG_MODEL_PATH`
- `PYTHON_BIN` (usually `python`)
- `PIPELINE_ENTRYPOINT` (defaults to `../pipeline/main.py`)

## Database (PostGIS)

Make sure your DB has PostGIS available, then run migrations:

```powershell
npm run migrate
```

## Run

Dev server:

```powershell
npm run dev
```

API docs (Swagger UI):

- `GET /docs`
- OpenAPI JSON: `GET /openapi.json`

Build:

```powershell
npm run build
```

## Testing

### Unit tests

```powershell
npm test
```

### Integration tests (real PostGIS)

Set `DATABASE_URL` in the same terminal session:

```powershell
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/damage_test"
npm run test:integration
```

What it does:

- Connects to `DATABASE_URL`
- Applies migrations
- Runs `*.int.test.ts` integration tests (real DB, real PostGIS functions)

## API Overview

### Jobs (async pipeline)

- `POST /jobs` (multipart/form-data)
  - fields: `pre` (GeoTIFF), `post` (GeoTIFF)
  - optional: `analysisId` / `analysis_id` (links job to an ERD `analysis`)
  - returns: `202 { id, status }`

- `GET /jobs/:id`
  - returns job status and `result` (parsed `report.json`) when completed

- `GET /jobs/:id/files/:file`
  - allowed files: `damage_overlay.png`, `building_mask.png`

### Analyses + ingest (ERD aligned)

- `POST /analyses` `{ userId, preImageId, postImageId }`
- `GET /analyses/:id`

Webhook-like ingest (useful for decoupled ML engine / replaying results):

- `POST /analyses/:analysisId/ingest/buildings`
  - body: GeoJSON `FeatureCollection` (EPSG:4326)
  - persists to PostGIS, then recomputes regions/clusters
  - returns `202`

### Map layers (GeoJSON)

- `GET /analyses/:analysisId/buildings.geojson`
- `GET /analyses/:analysisId/regions.geojson`
- `GET /analyses/:analysisId/clusters.geojson`

All support optional bbox filtering:

```
?bbox=minLon,minLat,maxLon,maxLat
```

Manual recompute for derived layers:

- `POST /analyses/:analysisId/recompute`
  - body (optional):
    - `gridType`: `"square"` or `"hex"` (hex falls back to square if unavailable in your PostGIS)
    - `gridSizeMeters`
    - `epsMeters`
    - `minPoints`
    - `clusterMinAvgDamageClass`
    - `clusterMinCellCount`

### OGC API Features–like

- `GET /ogc/collections`
- `GET /ogc/collections/:collectionId`
- `GET /ogc/collections/:collectionId/items?analysisId=...&bbox=...`

Collections:

- `buildings`
- `regions`
- `clusters`

## Realtime (WebSocket)

Connect:

```
/ws?jobId=<jobId>
```

Messages:

- `job.status` (e.g. running)
- `job.completed` (includes `analysisId` if linked)
- `job.failed`

## Outputs on disk

- `uploads/`: stored uploaded GeoTIFFs (ignored by git)
- `outputs/<jobId>/`: pipeline outputs (ignored by git)

## Notes

- This backend is designed to be **asynchronous** for large file uploads and long-running inference.
- Auth/RBAC is intentionally minimal at the moment (single-user workflow focus).
