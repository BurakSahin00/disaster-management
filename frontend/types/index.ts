export interface DamageClass {
  id: number
  label: string
  color: string
  light: string
  border: string
}

export const DAMAGE_CLASSES: DamageClass[] = [
  { id: 0, label: 'No Damage',    color: '#16a34a', light: '#dcfce7', border: '#bbf7d0' },
  { id: 1, label: 'Minor Damage', color: '#65a30d', light: '#ecfccb', border: '#d9f99d' },
  { id: 2, label: 'Major Damage', color: '#ea580c', light: '#ffedd5', border: '#fed7aa' },
  { id: 3, label: 'Destroyed',    color: '#dc2626', light: '#fee2e2', border: '#fecaca' },
]

export interface Building {
  id?: string | number
  building_id?: string
  damage_class: number
  area_m2?: number
  confidence?: number
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface JobResponse {
  id: string
  status: JobStatus
  analysis_id?: string | null
  result?: { summary?: Record<string, number> }
  error?: string
}

export interface GeoJsonBuilding {
  type: 'Feature'
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
  properties: Building
}

export interface BuildingsGeoJson {
  type: 'FeatureCollection'
  features: GeoJsonBuilding[]
}

export interface ProjectRow {
  id: string
  user_id: string
  name: string
  created_at: string
  analysis_count: number
}

export interface ProjectAnalysisListItem {
  analysis_id: string
  analysis_status: string
  analysis_created_at: string
  analysis_completed_at: string | null
  pre_image_id: string
  post_image_id: string
  job_id: string | null
  job_status: string | null
  job_pre_path: string | null
  job_post_path: string | null
  job_created_at: string | null
  job_completed_at: string | null
}

export interface ProjectAnalysesResponse {
  project: { id: string; user_id: string; name: string; created_at: string }
  items: ProjectAnalysisListItem[]
}

export interface RegionProperties {
  region_id: string
  severity: number
  count?: number
  avg_damage_class?: number
  damage_class_counts?: Record<string, number>
  cell_size_m?: number
}

export interface RegionFeature {
  type: 'Feature'
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
  properties: RegionProperties
}

export interface RegionsGeoJson {
  type: 'FeatureCollection'
  features: RegionFeature[]
}

export interface ClusterProperties {
  cluster_id: string
  severity: number
  region_cells?: number
  avg_cell_severity?: number
  eps_m?: number
  minpoints?: number
}

export interface ClusterFeature {
  type: 'Feature'
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
  properties: ClusterProperties
}

export interface ClustersGeoJson {
  type: 'FeatureCollection'
  features: ClusterFeature[]
}

export interface HotspotProperties {
  region_id: string
  z_score: number
  p_value: number
  confidence: string
}

export interface HotspotFeature {
  type: 'Feature'
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
  properties: HotspotProperties
}

export interface HotspotGeoJson {
  type: 'FeatureCollection'
  features: HotspotFeature[]
}
