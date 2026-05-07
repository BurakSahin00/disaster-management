export interface DamageClass {
  id: number
  label: string
  color: string
  light: string
  border: string
}

export const DAMAGE_CLASSES: DamageClass[] = [
  { id: 0, label: 'Hasarsız',     color: '#16a34a', light: '#dcfce7', border: '#bbf7d0' },
  { id: 1, label: 'Az Hasarlı',   color: '#65a30d', light: '#ecfccb', border: '#d9f99d' },
  { id: 2, label: 'Ağır Hasarlı', color: '#ea580c', light: '#ffedd5', border: '#fed7aa' },
  { id: 3, label: 'Yıkık',        color: '#dc2626', light: '#fee2e2', border: '#fecaca' },
]

export interface Building {
  id: string | number
  damage_class: number
  area_m2?: number
  confidence?: number
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface JobResponse {
  id: string
  status: JobStatus
  result?: { analysisId?: string; summary?: Record<string, number> }
  error?: string
}

export interface GeoJsonBuilding {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: number[][][] }
  properties: Building
}

export interface BuildingsGeoJson {
  type: 'FeatureCollection'
  features: GeoJsonBuilding[]
}
