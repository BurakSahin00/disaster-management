'use client'

import { useState, useCallback } from 'react'
import { LeafletMap } from '@/components/map/LeafletMap'
import { StatsPanel } from '@/components/map/StatsPanel'
import { getBuildings, getRegions, getClusters } from '@/lib/api'
import type { GeoJSONFeatureCollection } from '@/types'

interface AnalysisPageProps {
  params: { id: string }
}

export default function AnalysisPage({ params }: AnalysisPageProps) {
  const [buildings, setBuildings] = useState<GeoJSONFeatureCollection | null>(null)
  const [regions, setRegions] = useState<GeoJSONFeatureCollection | null>(null)
  const [clusters, setClusters] = useState<GeoJSONFeatureCollection | null>(null)
  const [showBuildings, setShowBuildings] = useState(true)
  const [showRegions, setShowRegions] = useState(false)
  const [showClusters, setShowClusters] = useState(false)

  const handleBoundsChange = useCallback(
    async (bbox: string) => {
      const results = await Promise.allSettled([
        showBuildings ? getBuildings(params.id, bbox) : Promise.resolve(null),
        showRegions   ? getRegions(params.id, bbox)   : Promise.resolve(null),
        showClusters  ? getClusters(params.id, bbox)  : Promise.resolve(null),
      ])

      const [b, r, c] = results.map((res) => (res.status === 'fulfilled' ? res.value : null))
      if (b) setBuildings(b)
      if (r) setRegions(r)
      if (c) setClusters(c)
    },
    [params.id, showBuildings, showRegions, showClusters]
  )

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <StatsPanel
        buildings={buildings}
        showBuildings={showBuildings}
        showRegions={showRegions}
        showClusters={showClusters}
        onToggleBuildings={() => setShowBuildings((v) => !v)}
        onToggleRegions={() => setShowRegions((v) => !v)}
        onToggleClusters={() => setShowClusters((v) => !v)}
      />
      <div className="flex-1 relative">
        <LeafletMap
          showBuildings={showBuildings}
          showRegions={showRegions}
          showClusters={showClusters}
          onBoundsChange={handleBoundsChange}
          buildings={buildings}
          regions={regions}
          clusters={clusters}
        />
      </div>
    </div>
  )
}
