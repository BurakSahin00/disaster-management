import type { Job, GeoJSONFeatureCollection } from '@/types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export function createJob(pre: File, post: File): Promise<{ id: string; status: string }> {
  const form = new FormData()
  form.append('pre', pre)
  form.append('post', post)
  return request('/jobs', { method: 'POST', body: form })
}

export function getJob(id: string): Promise<Job> {
  return request(`/jobs/${id}`)
}

export function getBuildings(analysisId: string, bbox: string): Promise<GeoJSONFeatureCollection> {
  return request(`/analyses/${analysisId}/buildings.geojson?bbox=${bbox}`)
}

export function getRegions(analysisId: string, bbox: string): Promise<GeoJSONFeatureCollection> {
  return request(`/analyses/${analysisId}/regions.geojson?bbox=${bbox}`)
}

export function getClusters(analysisId: string, bbox: string): Promise<GeoJSONFeatureCollection> {
  return request(`/analyses/${analysisId}/clusters.geojson?bbox=${bbox}`)
}

export function getJobs(): Promise<Job[]> {
  return request('/jobs')
}
