-- 007_hotspot.sql
-- Stores Getis-Ord G* z-scores per region cell per analysis.

CREATE TABLE IF NOT EXISTS hotspot_cells (
  id           SERIAL PRIMARY KEY,
  analysis_id  TEXT    NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  region_id    TEXT    NOT NULL REFERENCES region_damages(id) ON DELETE CASCADE,
  z_score      FLOAT   NOT NULL,
  p_value      FLOAT   NOT NULL,
  confidence   TEXT    NOT NULL CHECK (confidence IN ('99%', '95%', '90%', 'not_significant')),
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, region_id)
);

CREATE INDEX IF NOT EXISTS hotspot_cells_analysis_id_idx ON hotspot_cells(analysis_id);
