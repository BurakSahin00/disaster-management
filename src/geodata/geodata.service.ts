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
}): Promise<{ buildingsInserted: number; damagesInserted: number }> {
  if (!isFeatureCollection(input.featureCollection)) {
    throw new Error('Invalid buildings.geojson (expected FeatureCollection).');
  }

  let buildingsInserted = 0;
  let damagesInserted = 0;

  for (const feature of input.featureCollection.features) {
    if (!feature || feature.type !== 'Feature' || !feature.geometry) continue;
    const props = feature.properties ?? {};

    const buildingId =
      typeof props.id === 'number' || typeof props.id === 'string'
        ? String(props.id)
        : crypto.randomUUID();

    await geodataRepository.insertBuilding({
      id: buildingId,
      geomGeoJSON: feature.geometry,
      props: null,
    });
    buildingsInserted += 1;

    const damageClassRaw = props.damage_class;
    const damageClass = typeof damageClassRaw === 'number' ? damageClassRaw : undefined;
    if (damageClass === undefined) continue;

    await geodataRepository.insertBuildingDamage({
      id: crypto.randomUUID(),
      analysisId: input.analysisId,
      buildingId,
      damageClass,
      confidence: typeof props.confidence === 'number' ? props.confidence : null,
      geomGeoJSON: feature.geometry,
      props: null,
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
