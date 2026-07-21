#!/usr/bin/env python3
"""
Compute Getis-Ord G* local hotspot scores for region_damages cells.

Usage:
    python pipeline/hotspot.py --analysis-id <id> --db-url postgresql://...
"""
import argparse
import sys

import numpy as np
import psycopg2
import geopandas as gpd
from shapely.geometry import Point
from libpysal.weights import KNN
from esda.getisord import G_Local


def confidence_label(z: float) -> str:
    a = abs(z)
    if a >= 2.576:
        return "99%"
    if a >= 1.960:
        return "95%"
    if a >= 1.645:
        return "90%"
    return "not_significant"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--analysis-id", required=True)
    parser.add_argument("--db-url", required=True)
    args = parser.parse_args()

    conn = psycopg2.connect(args.db_url)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id,
                   ST_Y(ST_Centroid(geom_4326::geometry)) AS lat,
                   ST_X(ST_Centroid(geom_4326::geometry)) AS lng,
                   COALESCE((stats->>'avg_damage_class')::float, 0.0) AS avg_damage
            FROM region_damages
            WHERE analysis_id = %s
            """,
            [args.analysis_id],
        )
        rows = cur.fetchall()

        if not rows:
            print(
                f"No region_damages found for analysis {args.analysis_id}",
                file=sys.stderr,
            )
            sys.exit(1)

        ids = [r[0] for r in rows]
        lats = [float(r[1]) for r in rows]
        lngs = [float(r[2]) for r in rows]
        values = np.array([float(r[3]) for r in rows], dtype=float)

        if len(ids) == 1:
            # Single cell: z-score undefined, treat as not significant.
            cur.execute(
                """
                INSERT INTO hotspot_cells (analysis_id, region_id, z_score, p_value, confidence)
                VALUES (%s, %s, 0.0, 1.0, 'not_significant')
                ON CONFLICT (analysis_id, region_id)
                DO UPDATE SET z_score = EXCLUDED.z_score,
                              p_value = EXCLUDED.p_value,
                              confidence = EXCLUDED.confidence,
                              computed_at = now()
                """,
                [args.analysis_id, ids[0]],
            )
            conn.commit()
            print(f"Computed hotspot for 1 region.")
            return

        gdf = gpd.GeoDataFrame(
            {"value": values},
            geometry=[Point(lng, lat) for lat, lng in zip(lats, lngs)],
            crs="EPSG:4326",
        ).to_crs("EPSG:3857")

        k = min(8, len(gdf) - 1)
        w = KNN.from_dataframe(gdf, k=k)
        w.transform = "R"

        g = G_Local(values, w, star=True, permutations=0)

        for i, rid in enumerate(ids):
            z = float(g.Zs[i])
            p = float(g.p_norm[i])
            conf = confidence_label(z)
            cur.execute(
                """
                INSERT INTO hotspot_cells (analysis_id, region_id, z_score, p_value, confidence)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (analysis_id, region_id)
                DO UPDATE SET z_score = EXCLUDED.z_score,
                              p_value = EXCLUDED.p_value,
                              confidence = EXCLUDED.confidence,
                              computed_at = now()
                """,
                [args.analysis_id, rid, z, p, conf],
            )

        conn.commit()
        print(f"Computed hotspot for {len(ids)} regions.")
    except Exception as exc:
        print(f"Error computing hotspots: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
