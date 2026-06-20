-- Core ERD schema (adapted + corrected)
-- Notes vs report ERD:
-- - Analysis must reference TWO images (pre/post) for bitemporal workflow.
-- - BuildingDamage is anchored to Analysis + Building; ChangeMap is optional reference.
-- - Cluster ↔ RegionDamage modeled as N:N via join table.

-- ─────────────────────────────────────────────────────────────────────────────
-- Reference entities
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','analyst','viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS satellite_images (
  id            TEXT PRIMARY KEY,
  -- Store on-disk/object-storage location; keep DB lean.
  uri           TEXT NOT NULL,
  -- GeoTIFF metadata (CRS, transform, pixel size, etc.) for reproducibility.
  crs_wkt       TEXT,
  width_px      INTEGER,
  height_px     INTEGER,
  bands         INTEGER,
  -- Optional: bounding box in EPSG:4326 for fast map queries.
  bbox_4326     geometry(Polygon, 4326),
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS satellite_images_bbox_4326_gix
  ON satellite_images
  USING GIST (bbox_4326);

CREATE TABLE IF NOT EXISTS analyses (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  pre_image_id  TEXT NOT NULL REFERENCES satellite_images(id) ON DELETE RESTRICT,
  post_image_id TEXT NOT NULL REFERENCES satellite_images(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS analyses_user_id_idx ON analyses(user_id);

-- Persistent repository of building footprints (pre-disaster / baseline).
-- If you have per-analysis extracted buildings only, you can still use this table
-- by inserting new rows for each detected footprint and referencing them.
CREATE TABLE IF NOT EXISTS buildings (
  id         TEXT PRIMARY KEY,
  -- Global footprint geometry in EPSG:4326 (recommended for web maps).
  geom_4326  geometry(MultiPolygon, 4326) NOT NULL,
  props      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS buildings_geom_4326_gix
  ON buildings
  USING GIST (geom_4326);

-- ─────────────────────────────────────────────────────────────────────────────
-- Analysis-driven entities
-- ─────────────────────────────────────────────────────────────────────────────

-- Raster-based change detection output. We store a URI + metadata; raster itself
-- can live on disk/object storage.
CREATE TABLE IF NOT EXISTS change_maps (
  id          TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  uri         TEXT NOT NULL,
  crs_wkt     TEXT,
  bbox_4326   geometry(Polygon, 4326),
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS change_maps_analysis_id_idx ON change_maps(analysis_id);
CREATE INDEX IF NOT EXISTS change_maps_bbox_4326_gix
  ON change_maps
  USING GIST (bbox_4326);

-- Building-level damage output.
CREATE TABLE IF NOT EXISTS building_damages (
  id            TEXT PRIMARY KEY,
  analysis_id   TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  building_id   TEXT NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
  change_map_id TEXT REFERENCES change_maps(id) ON DELETE SET NULL,
  -- 0=no,1=minor,2=major,3=destroyed
  damage_class  SMALLINT NOT NULL CHECK (damage_class BETWEEN 0 AND 3),
  confidence    DOUBLE PRECISION,
  -- Optional: per-analysis geometry if buildings are derived from mask each time.
  geom_4326     geometry(MultiPolygon, 4326),
  props         JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analysis_id, building_id)
);

CREATE INDEX IF NOT EXISTS building_damages_analysis_id_idx ON building_damages(analysis_id);
CREATE INDEX IF NOT EXISTS building_damages_building_id_idx ON building_damages(building_id);
CREATE INDEX IF NOT EXISTS building_damages_geom_4326_gix
  ON building_damages
  USING GIST (geom_4326);

-- Region-level aggregations (e.g., grid/administrative region).
CREATE TABLE IF NOT EXISTS region_damages (
  id          TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  change_map_id TEXT REFERENCES change_maps(id) ON DELETE SET NULL,
  geom_4326   geometry(MultiPolygon, 4326) NOT NULL,
  severity    DOUBLE PRECISION,
  stats       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS region_damages_analysis_id_idx ON region_damages(analysis_id);
CREATE INDEX IF NOT EXISTS region_damages_geom_4326_gix
  ON region_damages
  USING GIST (geom_4326);

-- Cluster of region-level damage areas (impact zones).
CREATE TABLE IF NOT EXISTS clusters (
  id          TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  geom_4326   geometry(MultiPolygon, 4326) NOT NULL,
  severity    DOUBLE PRECISION,
  stats       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clusters_analysis_id_idx ON clusters(analysis_id);
CREATE INDEX IF NOT EXISTS clusters_geom_4326_gix
  ON clusters
  USING GIST (geom_4326);

CREATE TABLE IF NOT EXISTS cluster_regions (
  cluster_id     TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  region_damage_id TEXT NOT NULL REFERENCES region_damages(id) ON DELETE CASCADE,
  PRIMARY KEY (cluster_id, region_damage_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Bridge existing async jobs table into ERD world
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS analysis_id TEXT REFERENCES analyses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_analysis_id_idx ON jobs(analysis_id);

