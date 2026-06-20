'use client'
import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { Header } from '@/components/shared/Header'
import { MapLegend } from '@/components/map/MapLegend'
import { BuildingPopup } from '@/components/map/BuildingPopup'
import { StatCard } from '@/components/dashboard/StatCard'
import { DamageChart } from '@/components/dashboard/DamageChart'
import { FilterPanel } from '@/components/dashboard/FilterPanel'
import { Tag } from '@/components/shared/Tag'
import { DAMAGE_CLASSES } from '@/types'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { apiGet } from '@/lib/api'
import type { BuildingsGeoJson, GeoJsonBuilding } from '@/types'

const LeafletMap = dynamic(() => import('@/components/map/LeafletMap'), { ssr: false })

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function MapPage() {
  const params = useParams<{ analysisId: string }>()
  const { projectName } = useAnalysisStore()

  const [geojson, setGeojson] = useState<BuildingsGeoJson | null>(null)
  const [filters, setFilters] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true })
  const [selected, setSelected] = useState<GeoJsonBuilding | null>(null)
  const [tab, setTab] = useState<'summary' | 'filters'>('summary')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<BuildingsGeoJson>(`/analyses/${params.analysisId}/buildings.geojson`)
      .then(setGeojson)
      .catch((e) => setError(e.message))
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
  const geoJsonDownloadUrl = `${BASE}/analyses/${params.analysisId}/buildings.geojson`

  const HEADER_H = 52

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
            <button className="px-3 py-1.5 rounded-lg border border-[#d1cfc8] bg-white text-[12px] text-[#444] opacity-50 cursor-not-allowed">
              PDF Rapor
            </button>
          </>
        }
      />

      {/* Map area — fixed position, explicit pixel bounds */}
      <div style={{ position: 'fixed', top: HEADER_H, bottom: 0, left: 0, right: 300, overflow: 'hidden' }}>
        <LeafletMap
          geojson={geojson}
          filters={filters}
          onSelectBuilding={setSelected}
          selectedId={selected?.properties.id ?? null}
        />
        {error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] bg-white rounded-xl border border-red-200 shadow-lg px-5 py-3 text-center">
            <div className="text-[13px] font-semibold text-red-700">GeoJSON yüklenemedi</div>
            <div className="text-[11px] text-red-500 mt-0.5">{error}</div>
          </div>
        )}
        <MapLegend counts={counts} filters={filters} onToggle={toggleFilter} />
        {selected && <BuildingPopup building={selected} onClose={() => setSelected(null)} />}
      </div>

      {/* Right panel — fixed position */}
      <div style={{ position: 'fixed', top: HEADER_H, bottom: 0, right: 0, width: 300, overflow: 'hidden' }}
           className="bg-white border-l border-border flex flex-col">
          <div className="flex border-b border-border shrink-0">
            {(['summary', 'filters'] as const).map((id) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex-1 py-3 text-[12px] font-medium border-b-2 transition-all"
                style={{
                  color: tab === id ? '#2563EB' : '#8b8880',
                  borderBottomColor: tab === id ? '#2563EB' : 'transparent',
                }}
              >
                {id === 'summary' ? 'Özet' : 'Filtrele'}
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
                    ['Model', 'UNet + 4-sınıf'],
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
          </div>
      </div>
    </div>
  )
}

