/**
 * Platform benchmark (SAUCIS revision, Reviewer 2 – M6): PostGIS ingest, map queries,
 * regional aggregation + DBSCAN impact zones and Getis-Ord Gi* hotspot analysis,
 * measured with the platform's own service/repository code on 1k / 5k / 10k buildings.
 *
 * Usage (backend/ klasöründe):
 *   DATABASE_URL=postgresql://... PYTHON_BIN=python npx tsx src/scripts/benchmark.ts \
 *     [--sizes 1000,5000,10000] [--repeats 5] [--out benchmark_results.json] [--skip-hotspot] [--geojson buildings.geojson]
 *
 * Each repeat creates a fresh analysis, measures every step, then deletes the analysis and its buildings.
 * Without --geojson, synthetic building footprints are generated (10–16 m squares on a ~22 m street grid)
 * with spatially clustered damage (higher damage near three random epicentres; overall class shares close
 * to the xBD tier1 distribution). With --geojson, the features of a real buildings.geojson (pipeline output)
 * are tiled until N buildings are reached.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { performance } from 'perf_hooks';
import { pool } from '../db';
import {
  persistBuildingsGeoJSONToPostGIS,
  recomputeRegionsAndClusters,
} from '../geodata/geodata.service';
import { geodataRepository } from '../geodata/geodata.repository';
import { computeHotspot, getHotspotGeoJSON } from '../geodata/hotspot.service';

type Feature = {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--'))
    return process.argv[i + 1];
  return process.argv.includes(`--${name}`) ? 'true' : def;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAT0 = 36.2;
const LON0 = 36.16;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

function syntheticBuildings(n: number, seed: number): Feature[] {
  const rnd = mulberry32(seed);
  const side = Math.ceil(Math.sqrt(n));
  const spacing = 22; // m between building centres
  const extent = side * spacing;
  const epicentres = [0, 1, 2].map(() => [rnd() * extent, rnd() * extent]);
  const feats: Feature[] = [];
  for (let i = 0; i < n; i++) {
    const gx = (i % side) * spacing + (rnd() - 0.5) * 4;
    const gy = Math.floor(i / side) * spacing + (rnd() - 0.5) * 4;
    const s = 10 + rnd() * 6;
    const ring = [
      [gx, gy],
      [gx + s, gy],
      [gx + s, gy + s],
      [gx, gy + s],
      [gx, gy],
    ].map(([x, y]) => [LON0 + x / M_PER_DEG_LON, LAT0 + y / M_PER_DEG_LAT]);
    const d = Math.min(...epicentres.map(([ex, ey]) => Math.hypot(gx - ex, gy - ey)));
    const pDamaged = 0.08 + 0.6 * Math.exp(-d / (0.12 * extent));
    let cls = 0;
    if (rnd() < pDamaged) cls = 1 + Math.min(2, Math.floor(rnd() * 3));
    feats.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { id: i, damage_class: cls, confidence: 0.5 + rnd() * 0.5 },
    });
  }
  return feats;
}

function tiledFromGeojson(path: string, n: number): Feature[] {
  const fc = JSON.parse(fs.readFileSync(path, 'utf-8')) as { features: Feature[] };
  const base = fc.features.filter((f) => f && f.geometry);
  if (!base.length) throw new Error(`${path} contains no features`);
  const out: Feature[] = [];
  // shift copies by 0.01 deg so tiles do not overlap
  for (let k = 0; out.length < n; k++) {
    const dx = (k % 10) * 0.01;
    const dy = Math.floor(k / 10) * 0.01;
    for (const f of base) {
      if (out.length >= n) break;
      const shift = (c: unknown): unknown =>
        Array.isArray(c) && typeof c[0] === 'number'
          ? [(c[0] as number) + dx, (c[1] as number) + dy]
          : (c as unknown[]).map(shift);
      out.push({
        type: 'Feature',
        geometry: { type: f.geometry.type, coordinates: shift(f.geometry.coordinates) },
        properties: { ...f.properties, id: out.length },
      });
    }
  }
  return out;
}

function bboxOf(features: Feature[]): [number, number, number, number] {
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      minx = Math.min(minx, c[0] as number);
      maxx = Math.max(maxx, c[0] as number);
      miny = Math.min(miny, c[1] as number);
      maxy = Math.max(maxy, c[1] as number);
    } else (c as unknown[]).forEach(visit);
  };
  features.forEach((f) => visit(f.geometry.coordinates));
  return [minx, miny, maxx, maxy];
}

async function timed<T>(fn: () => Promise<T>): Promise<[number, T]> {
  const t = performance.now();
  const r = await fn();
  return [(performance.now() - t) / 1000, r];
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function main() {
  const sizes = (arg('sizes', '1000,5000,10000') as string).split(',').map((x) => parseInt(x, 10));
  const repeats = parseInt(arg('repeats', '5') as string, 10);
  const outPath = arg('out', 'benchmark_results.json') as string;
  const skipHotspot = arg('skip-hotspot') === 'true';
  const geojsonPath = arg('geojson');

  const env = {
    time: new Date().toISOString(),
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    ram_gb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    platform: `${os.type()} ${os.release()}`,
    node: process.version,
    postgres: (await pool.query('SELECT version() AS v')).rows[0].v as string,
    postgis: (await pool.query('SELECT postgis_full_version() AS v')).rows[0].v as string,
    data: geojsonPath ? `tiled from ${geojsonPath}` : 'synthetic (seeded)',
    defaults: { grid_m: 250, eps: 'gridType square → 1.5 × grid', minPoints: 1, gi_knn: 8 },
  };
  console.log(JSON.stringify(env, null, 1));

  const steps = [
    'ingest',
    'regions_dbscan',
    'hotspot_gi',
    'q_buildings_all',
    'q_buildings_bbox',
    'q_regions',
    'q_clusters',
    'q_hotspot',
  ];
  const results: Record<string, Record<string, number[]>> = {};
  const counts: Record<string, Record<string, number>> = {};

  for (const n of sizes) {
    results[n] = Object.fromEntries(steps.map((s) => [s, [] as number[]]));
    for (let r = 0; r < repeats; r++) {
      const feats = geojsonPath
        ? tiledFromGeojson(geojsonPath, n)
        : syntheticBuildings(n, 1000 + r);
      const [minx, miny, maxx, maxy] = bboxOf(feats);
      const view: [number, number, number, number] = [
        minx,
        miny,
        minx + (maxx - minx) / 2,
        miny + (maxy - miny) / 2,
      ];
      const analysisId = `bench-${n}-${r}-${crypto.randomUUID().slice(0, 8)}`;
      await pool.query(
        `INSERT INTO analyses (id, user_id, pre_image_id, post_image_id, status) VALUES ($1, 'system', 'image-pre', 'image-post', 'completed')`,
        [analysisId],
      );
      try {
        const [tIngest] = await timed(() =>
          persistBuildingsGeoJSONToPostGIS({
            analysisId,
            featureCollection: { type: 'FeatureCollection', features: feats },
          }),
        );
        const [tReg, rc] = await timed(() => recomputeRegionsAndClusters({ analysisId }));
        results[n].ingest.push(tIngest);
        results[n].regions_dbscan.push(tReg);
        if (r === 0) counts[n] = { buildings: n, regions: rc.regions, clusters: rc.clusters };
        if (!skipHotspot) {
          const [tHot] = await timed(() => computeHotspot(analysisId));
          results[n].hotspot_gi.push(tHot);
        }
        results[n].q_buildings_all.push(
          (await timed(() => geodataRepository.getBuildingsGeoJSONByAnalysis(analysisId)))[0],
        );
        results[n].q_buildings_bbox.push(
          (await timed(() => geodataRepository.getBuildingsGeoJSONByAnalysis(analysisId, view)))[0],
        );
        results[n].q_regions.push(
          (await timed(() => geodataRepository.getRegionsGeoJSONByAnalysis(analysisId)))[0],
        );
        results[n].q_clusters.push(
          (await timed(() => geodataRepository.getClustersGeoJSONByAnalysis(analysisId)))[0],
        );
        if (!skipHotspot)
          results[n].q_hotspot.push((await timed(() => getHotspotGeoJSON(analysisId)))[0]);
      } finally {
        await pool.query('DELETE FROM analyses WHERE id = $1', [analysisId]);
        await pool.query('DELETE FROM buildings WHERE id LIKE $1', [`${analysisId}:b:%`]);
      }
      console.log(
        `n=${n} repeat ${r + 1}/${repeats}: ` +
          steps
            .filter((s) => results[n][s].length > r)
            .map((s) => `${s}=${results[n][s][r].toFixed(3)}s`)
            .join('  '),
      );
    }
  }

  const summary: Record<
    string,
    Record<string, { median_s: number; min_s: number; max_s: number }>
  > = {};
  for (const n of sizes) {
    summary[n] = {};
    for (const s of steps) {
      const v = results[n][s];
      if (v.length)
        summary[n][s] = { median_s: median(v), min_s: Math.min(...v), max_s: Math.max(...v) };
    }
  }
  console.log('\nMedian (s):');
  console.log(['step'.padEnd(18), ...sizes.map((n) => String(n).padStart(10))].join(''));
  for (const s of steps) {
    if (!summary[sizes[0]][s]) continue;
    console.log(
      [s.padEnd(18), ...sizes.map((n) => summary[n][s].median_s.toFixed(3).padStart(10))].join(''),
    );
  }
  console.log('counts:', counts);
  fs.writeFileSync(
    outPath,
    JSON.stringify({ env, sizes, repeats, counts, summary, raw: results }, null, 1),
  );
  console.log(`\nSaved → ${outPath}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exitCode = 1;
});
