'use client'
import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Header } from '@/components/shared/Header'
import { MapLegend } from '@/components/map/MapLegend'
import { BuildingPopup } from '@/components/map/BuildingPopup'
import { TiffOverlayControl } from '@/components/map/TiffOverlayControl'
import { StatCard } from '@/components/dashboard/StatCard'
import { DamageChart } from '@/components/dashboard/DamageChart'
import { FilterPanel } from '@/components/dashboard/FilterPanel'
import { Tag } from '@/components/shared/Tag'
import { DAMAGE_CLASSES } from '@/types'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { apiGet } from '@/lib/api'
import { generateDamageReport } from '@/lib/generateReport'
import type { BuildingsGeoJson, GeoJsonBuilding, RegionsGeoJson, ClustersGeoJson } from '@/types'

const LeafletMap = dynamic(() => import('@/components/map/LeafletMap'), { ssr: false })

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const LAYER_META = [
  {
    id: 'buildings' as const,
    label: 'Binalar',
    desc: 'Bireysel bina hasar poligonları',
    color: '#2563EB',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="4" width="12" height="9" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M4 4V2.5C4 2 4.5 1 7 1C9.5 1 10 2 10 2.5V4" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'regions' as const,
    label: 'Bölge Analizi',
    desc: 'Ort. hasar şiddetine göre ızgara hücreleri',
    color: '#ea580c',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="5.5" height="5.5" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="7.5" y="1" width="5.5" height="5.5" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="1" y="7.5" width="5.5" height="5.5" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'clusters' as const,
    label: 'Hasar Kümeleri',
    desc: 'DBSCAN ile tespit edilen etki bölgeleri',
    color: '#7c3aed',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2"/>
        <circle cx="7" cy="7" r="2" fill="currentColor" opacity="0.4"/>
      </svg>
    ),
  },
]

export default function MapPage() {
  const params = useParams<{ analysisId: string }>()
  const { projectName, projectId } = useAnalysisStore()

  const [geojson, setGeojson] = useState<BuildingsGeoJson | null>(null)
  const [regionsGeojson, setRegionsGeojson] = useState<RegionsGeoJson | null>(null)
  const [clustersGeojson, setClustersGeojson] = useState<ClustersGeoJson | null>(null)

  const [filters, setFilters] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true })
  const [layerVisibility, setLayerVisibility] = useState({ buildings: true, regions: false, clusters: false })

  const [selected, setSelected] = useState<GeoJsonBuilding | null>(null)
  const [tab, setTab] = useState<'summary' | 'filters' | 'layers'>('summary')
  const [error, setError] = useState<string | null>(null)
  const [tiffMeta, setTiffMeta] = useState<{ url: string; bounds: [[number, number], [number, number]] } | null>(null)
  const [tiffLoading, setTiffLoading] = useState(true)
  const [tiffError, setTiffError] = useState<string | null>(null)
  const [tiffVisible, setTiffVisible] = useState(false)
  const [tiffOpacity, setTiffOpacity] = useState(50)

  useEffect(() => {
    const id = params.analysisId
    apiGet<BuildingsGeoJson>(`/analyses/${id}/buildings.geojson`)
      .then(setGeojson)
      .catch((e) => setError(e.message))

    apiGet<RegionsGeoJson>(`/analyses/${id}/regions.geojson`)
      .then(setRegionsGeojson)
      .catch(() => {/* bölge verisi henüz oluşturulmamış olabilir */})

    apiGet<ClustersGeoJson>(`/analyses/${id}/clusters.geojson`)
      .then(setClustersGeojson)
      .catch(() => {/* küme verisi henüz oluşturulmamış olabilir */})

    setTiffLoading(true)
    fetch(`${BASE}/analyses/${id}/pre-image`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ url: string; bounds: [[number, number], [number, number]] }>
      })
      .then((meta) => {
        setTiffMeta({ url: `${BASE}${meta.url}`, bounds: meta.bounds })
        setTiffError(null)
      })
      .catch((e: Error) => setTiffError(e.message))
      .finally(() => setTiffLoading(false))
  }, [params.analysisId])

  const counts = useMemo(() => {
    const c: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
    geojson?.features.forEach((f) => { c[f.properties.damage_class ?? 0] = (c[f.properties.damage_class ?? 0] ?? 0) + 1 })
    return c
  }, [geojson])

  const total = geojson?.features.length ?? 0
  const damaged = (counts[2] ?? 0) + (counts[3] ?? 0)
  const safe = (counts[0] ?? 0) + (counts[1] ?? 0)

  const toggleFilter = (id: number) => setFilters((f) => ({ ...f, [id]: !f[id] }))
  const toggleLayer = (id: keyof typeof layerVisibility) =>
    setLayerVisibility((v) => ({ ...v, [id]: !v[id] }))

  const handleDownloadPdf = () => {
    generateDamageReport({
      analysisId: params.analysisId,
      projectName: projectName || 'Isimsiz Proje',
      counts,
      total,
      regionCount,
      clusterCount,
      regionsGeojson,
      clustersGeojson,
    })
  }

  const geoJsonDownloadUrl = `${BASE}/analyses/${params.analysisId}/buildings.geojson`
  const HEADER_H = 52

  const regionCount = regionsGeojson?.features.length ?? 0
  const clusterCount = clustersGeojson?.features.length ?? 0

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#F7F6F3' }}>
      <Header
        center={
          <div className="flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#a8a49f" strokeWidth="1.8"><polyline points="1 4 8 10 15 4"/></svg>
            <span className="text-[13px] text-[#6b6864]">{projectName || 'Analiz'}</span>
          </div>
        }
        right={
          <>
            {projectId && (
              <Link
                href={`/projects/${projectId}`}
                className="text-[12px] font-medium text-accent hover:underline mr-1"
              >
                Proje
              </Link>
            )}
            <Tag {...DAMAGE_CLASSES[0]} label={`${counts[0]} Hasarsız`} />
            <Tag {...DAMAGE_CLASSES[3]} label={`${counts[3]} Yıkık`} />
            <div className="w-px h-[22px] bg-border" />
            <a
              href={geoJsonDownloadUrl}
              download="buildings.geojson"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent bg-accent-light text-accent text-[12px] font-medium hover:bg-blue-100 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1z"/><path d="M5 8h6M8 5v6"/></svg>
              GeoJSON İndir
            </a>
            <button
              onClick={handleDownloadPdf}
              disabled={total === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d1cfc8] bg-white text-[12px] text-[#444] hover:bg-[#faf9f7] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 1h5l4 4v10H3V1z"/>
                <path d="M9 1v4h4M6 9h4M8 7v4"/>
              </svg>
              PDF Rapor
            </button>
          </>
        }
      />

      <div style={{ position: 'fixed', top: HEADER_H, bottom: 0, left: 0, right: 300, overflow: 'hidden' }}>
        <LeafletMap
          geojson={geojson}
          filters={filters}
          onSelectBuilding={setSelected}
          selectedId={selected?.properties.building_id ?? selected?.properties.id ?? null}
          regionsGeojson={regionsGeojson}
          clustersGeojson={clustersGeojson}
          layerVisibility={layerVisibility}
          tiffOverlay={
            tiffMeta
              ? {
                  url: tiffMeta.url,
                  bounds: tiffMeta.bounds,
                  opacity: tiffOpacity,
                  visible: tiffVisible,
                }
              : null
          }
        />
        {error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] bg-white rounded-xl border border-red-200 shadow-lg px-5 py-3 text-center">
            <div className="text-[13px] font-semibold text-red-700">GeoJSON yüklenemedi</div>
            <div className="text-[11px] text-red-500 mt-0.5">{error}</div>
          </div>
        )}
        <MapLegend counts={counts} filters={filters} onToggle={toggleFilter} />
        {selected && <BuildingPopup building={selected} onClose={() => setSelected(null)} />}
        <TiffOverlayControl
          loading={tiffLoading}
          error={tiffError}
          available={tiffMeta !== null}
          visible={tiffVisible}
          opacity={tiffOpacity}
          onToggle={() => setTiffVisible((v) => !v)}
          onOpacityChange={setTiffOpacity}
        />
      </div>

      <div style={{ position: 'fixed', top: HEADER_H, bottom: 0, right: 0, width: 300, overflow: 'hidden' }}
           className="bg-white border-l border-border flex flex-col">
          <div className="flex border-b border-border shrink-0">
            {(['summary', 'filters', 'layers'] as const).map((id) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex-1 py-3 text-[12px] font-medium border-b-2 transition-all"
                style={{
                  color: tab === id ? '#2563EB' : '#8b8880',
                  borderBottomColor: tab === id ? '#2563EB' : 'transparent',
                }}
              >
                {id === 'summary' ? 'Özet' : id === 'filters' ? 'Filtrele' : 'Katmanlar'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'summary' && (
              <>
                <div className="flex gap-2 mb-3.5">
                  <StatCard label="Toplam Bina" value={total} sub="Tespit edilen" />
                  <StatCard label="Etkilenen" value={`%${total > 0 ? Math.round(damaged / total * 100) : 0}`} sub={`${damaged} bina`} color="#ea580c" />
                </div>
                <div className="flex gap-2 mb-5">
                  <StatCard label="Güvenli" value={safe} sub="Hasarsız+Az" color="#16a34a" />
                  <StatCard label="Yıkık" value={counts[3] ?? 0} sub={`%${total > 0 ? Math.round((counts[3] ?? 0) / total * 100) : 0}`} color="#dc2626" />
                </div>
                <DamageChart counts={counts} total={total} />
                <div className="mt-4 bg-[#faf9f7] rounded-lg p-3 border border-border">
                  <div className="text-[11px] font-semibold text-[#6b6864] mb-1.5 uppercase tracking-[0.4px]">Analiz Detayları</div>
                  {[
                    ['Analiz ID', params.analysisId.slice(0, 8) + '…'],
                    ['Koordinat', 'EPSG:4326'],
                    ['Model', 'SegFormer + 4-sınıf'],
                    ['Bölge sayısı', regionCount > 0 ? String(regionCount) : '—'],
                    ['Küme sayısı', clusterCount > 0 ? String(clusterCount) : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5 border-b border-[#f0ede8]">
                      <span className="text-[11px] text-text-muted">{k}</span>
                      <span className="text-[11px] font-mono text-text-primary">{v}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'filters' && (
              <FilterPanel
                filters={filters}
                counts={counts}
                total={total}
                onToggle={toggleFilter}
                onShowAll={() => setFilters({ 0: true, 1: true, 2: true, 3: true })}
                onShowCritical={() => setFilters({ 0: false, 1: false, 2: true, 3: true })}
              />
            )}

            {tab === 'layers' && (
              <div>
                <p className="text-[11px] text-[#6b6864] mb-3.5 leading-relaxed">
                  Harita üzerinde gösterilecek katmanları seçin.
                </p>
                {LAYER_META.map((layer) => {
                  const on = layerVisibility[layer.id]
                  const unavailable = layer.id === 'regions'
                    ? regionCount === 0
                    : layer.id === 'clusters'
                    ? clusterCount === 0
                    : false
                  return (
                    <div
                      key={layer.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => !unavailable && toggleLayer(layer.id)}
                      onKeyDown={(e) => e.key === 'Enter' && !unavailable && toggleLayer(layer.id)}
                      className="flex items-start gap-2.5 p-3 rounded-lg border mb-2 transition-all"
                      style={{
                        border: `1px solid ${on && !unavailable ? layer.color + '66' : '#ebe9e4'}`,
                        background: on && !unavailable ? layer.color + '10' : 'white',
                        cursor: unavailable ? 'not-allowed' : 'pointer',
                        opacity: unavailable ? 0.5 : 1,
                      }}
                    >
                      <div
                        className="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center mt-px transition-all"
                        style={{
                          border: `1.5px solid ${on && !unavailable ? layer.color : '#d1cfc8'}`,
                          background: on && !unavailable ? layer.color : 'white',
                          color: on && !unavailable ? 'white' : layer.color,
                        }}
                      >
                        {on && !unavailable && (
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                            <polyline points="2 5 4.5 7.5 8.5 2.5" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: layer.color }}>{layer.icon}</span>
                          <span className="text-[12px] font-medium" style={{ color: on && !unavailable ? layer.color : '#444' }}>
                            {layer.label}
                          </span>
                        </div>
                        <div className="text-[10px] text-text-faint mt-0.5">{layer.desc}</div>
                        {unavailable && (
                          <div className="text-[10px] text-[#ea580c] mt-0.5">Veri henüz hesaplanmadı</div>
                        )}
                        {!unavailable && layer.id === 'regions' && (
                          <div className="text-[10px] text-text-faint mt-0.5">{regionCount} hücre</div>
                        )}
                        {!unavailable && layer.id === 'clusters' && (
                          <div className="text-[10px] text-text-faint mt-0.5">{clusterCount} küme</div>
                        )}
                      </div>
                    </div>
                  )
                })}

                <div className="mt-4 rounded-lg bg-[#faf9f7] border border-border p-3">
                  <div className="text-[10px] font-semibold text-[#6b6864] uppercase tracking-[0.4px] mb-2">Bölge Renk Skalası</div>
                  {[
                    { range: '0.0 – 0.5', label: 'Hasarsız bölge', color: '#16a34a' },
                    { range: '0.5 – 1.5', label: 'Az hasarlı bölge', color: '#65a30d' },
                    { range: '1.5 – 2.5', label: 'Ağır hasarlı bölge', color: '#ea580c' },
                    { range: '2.5 – 3.0', label: 'Yıkık bölge', color: '#dc2626' },
                  ].map(({ range, label, color }) => (
                    <div key={range} className="flex items-center gap-2 py-0.5">
                      <div className="w-3 h-3 rounded-[2px] shrink-0" style={{ background: color }} />
                      <span className="text-[10px] text-text-muted flex-1">{label}</span>
                      <span className="text-[10px] font-mono text-text-faint">{range}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-[#f0ede8] flex items-center gap-2">
                    <div className="w-3 h-3 rounded-[2px] shrink-0 border-2 border-dashed border-[#7c3aed]" style={{ background: '#7c3aed22' }} />
                    <span className="text-[10px] text-text-muted">Hasar kümesi sınırı</span>
                  </div>
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  )
}
