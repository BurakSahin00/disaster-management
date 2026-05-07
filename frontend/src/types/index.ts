export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Job {
  id: string
  status: JobStatus
  analysis_id: string | null
  pre_path: string
  post_path: string
  output_dir: string
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown }
  properties: Record<string, unknown>
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}
