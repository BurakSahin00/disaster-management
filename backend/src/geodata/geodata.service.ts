import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { jobsRepository } from '../jobs/jobs.repository';
import * as crypto from 'crypto';
import { geodataRepository } from './geodata.repository';

type Feature = { type: 'Feature'; geometry: object | null; properties?: Record<string, unknown> };
type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

function isFeatureCollection(x: unknown): x is FeatureCollection {
  if (typeof x !== 'object' || x === null) return false;
  const obj = x as Record<string, unknown>;
  if (obj['type'] !== 'FeatureCollection') return false;
  return Array.isArray(obj['features']);
}

export async function persistBuildingsGeoJSONToPostGIS(input: {
  analysisId: string;
  featureCollection: unknown;
  changeMapId?: string | null;
}): Promise<{ buildingsInserted: number; damagesInserted: number }> {
  if (!isFeatureCollection(input.featureCollection)) {
    throw new Error('Invalid buildings.geojson (expected FeatureCollection).');
  }

  let buildingsInserted = 0;
  let damagesInserted = 0;

  for (const feature of input.featureCollection.features) {
    if (!feature || feature.type !== 'Feature' || !feature.geometry) continue;
    const props = feature.properties ?? {};

    const localId = props['id'];
    const buildingId =
      typeof localId === 'number' || typeof localId === 'string'
        ? `${input.analysisId}:b:${String(localId)}`
        : crypto.randomUUID();

    const extraProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (k === 'id' || k === 'damage_class' || k === 'confidence') continue;
      extraProps[k] = v;
    }
    const propsPayload = Object.keys(extraProps).length > 0 ? extraProps : null;

    await geodataRepository.insertBuilding({
      id: buildingId,
      geomGeoJSON: feature.geometry,
      props: propsPayload,
    });
    buildingsInserted += 1;

    const damageClassRaw = props.damage_class;
    const damageClass = typeof damageClassRaw === 'number' ? damageClassRaw : undefined;
    if (damageClass === undefined) continue;

    await geodataRepository.insertBuildingDamage({
      id: crypto.randomUUID(),
      analysisId: input.analysisId,
      buildingId,
      changeMapId: input.changeMapId ?? null,
      damageClass,
      confidence: typeof props.confidence === 'number' ? props.confidence : null,
      geomGeoJSON: feature.geometry,
      props: propsPayload,
    });
    damagesInserted += 1;
  }

  return { buildingsInserted, damagesInserted };
}

export async function getAnalysisBuildingsGeoJSON(analysisId: string): Promise<object> {
  return geodataRepository.getBuildingsGeoJSONByAnalysis(analysisId);
}

export async function getAnalysisBuildingsGeoJSONBbox(input: {
  analysisId: string;
  bbox4326?: [number, number, number, number];
}): Promise<object> {
  return geodataRepository.getBuildingsGeoJSONByAnalysis(input.analysisId, input.bbox4326);
}

export async function recomputeRegionsAndClusters(input: {
  analysisId: string;
  gridType?: 'square' | 'hex';
  epsMeters?: number;
  minPoints?: number;
  gridSizeMeters?: number;
  clusterMinAvgDamageClass?: number;
  clusterMinCellCount?: number;
}): Promise<{ regions: number; clusters: number }> {
  return geodataRepository.recomputeRegionsAndClustersFromBuildings(input);
}

export async function getAnalysisRegionsGeoJSON(analysisId: string): Promise<object> {
  return geodataRepository.getRegionsGeoJSONByAnalysis(analysisId);
}

export async function getAnalysisRegionsGeoJSONBbox(input: {
  analysisId: string;
  bbox4326?: [number, number, number, number];
}): Promise<object> {
  return geodataRepository.getRegionsGeoJSONByAnalysis(input.analysisId, input.bbox4326);
}

export async function getAnalysisClustersGeoJSON(analysisId: string): Promise<object> {
  return geodataRepository.getClustersGeoJSONByAnalysis(analysisId);
}

export async function getAnalysisClustersGeoJSONBbox(input: {
  analysisId: string;
  bbox4326?: [number, number, number, number];
}): Promise<object> {
  return geodataRepository.getClustersGeoJSONByAnalysis(input.analysisId, input.bbox4326);
}

export interface PreImageMeta {
  url: string;
  bounds: [[number, number], [number, number]];
}

// In-flight preview generation promises keyed by analysisId — prevents duplicate spawns.
const previewInFlight = new Map<string, Promise<PreImageMeta>>();

function resolvePreviewScript(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'pipeline', 'tools', 'tiff_preview.py'),
    path.resolve(__dirname, '..', '..', '..', '..', 'pipeline', 'tools', 'tiff_preview.py'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      `tiff_preview.py not found. Tried:\n- ${candidates.join('\n- ')}`,
    );
  }
  return found;
}

export async function getPreImageForAnalysis(analysisId: string): Promise<PreImageMeta> {
  // Deduplicate concurrent calls for the same analysis.
  const inflight = previewInFlight.get(analysisId);
  if (inflight) return inflight;

  const work = _generatePreImage(analysisId);
  previewInFlight.set(analysisId, work);
  work.finally(() => previewInFlight.delete(analysisId));
  return work;
}

async function _generatePreImage(analysisId: string): Promise<PreImageMeta> {
  const job = await jobsRepository.findByAnalysisId(analysisId);
  if (!job) throw new Error('No job found for this analysis');

  const pngPath = path.join(job.output_dir, 'pre_preview.png');
  const boundsPath = path.join(job.output_dir, 'pre_preview_bounds.json');

  if (fs.existsSync(pngPath) && fs.existsSync(boundsPath)) {
    const bounds = JSON.parse(
      fs.readFileSync(boundsPath, 'utf-8'),
    ) as [[number, number], [number, number]];
    return { url: `/analyses/${analysisId}/pre-image.png`, bounds };
  }

  const scriptPath = resolvePreviewScript();
  const boundsJson = await new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(config.pythonBin, [
      scriptPath,
      '--input', job.pre_path,
      '--output', pngPath,
    ]);
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`tiff_preview failed (code ${code}): ${stderr}`));
      else resolve(stdout.trim());
    });
  });

  const parsed = JSON.parse(boundsJson) as { bounds: [[number, number], [number, number]] };
  fs.writeFileSync(boundsPath, JSON.stringify(parsed.bounds));

  return { url: `/analyses/${analysisId}/pre-image.png`, bounds: parsed.bounds };
}
