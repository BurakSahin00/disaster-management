'use client'

import type L from 'leaflet'
import { MapContainer, TileLayer, GeoJSON, useMapEvents } from 'react-leaflet'
import type { StyleFunction } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getDamageClass } from '@/lib/damage'
import type { GeoJSONFeatureCollection, GeoJSONFeature } from '@/types'

interface BoundsListenerProps {
  onBoundsChange: (bbox: string) => void
}

function BoundsListener({ onBoundsChange }: BoundsListenerProps) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds()
      const bbox = [
        b.getWest().toFixed(6),
        b.getSouth().toFixed(6),
        b.getEast().toFixed(6),
        b.getNorth().toFixed(6),
      ].join(',')
      onBoundsChange(bbox)
    },
  })
  return null
}

interface LeafletMapInnerProps {
  showBuildings: boolean
  showRegions: boolean
  showClusters: boolean
  onBoundsChange: (bbox: string) => void
  buildings: GeoJSONFeatureCollection | null
  regions: GeoJSONFeatureCollection | null
  clusters: GeoJSONFeatureCollection | null
}

export function LeafletMapInner({
  showBuildings,
  showRegions,
  showClusters,
  onBoundsChange,
  buildings,
  regions,
  clusters,
}: LeafletMapInnerProps) {
  const buildingStyle: StyleFunction = (feature) => {
    const dmg = getDamageClass((feature?.properties as Record<string, unknown>)?.damage_class as number ?? 0)
    return { color: dmg.color, fillColor: dmg.color, fillOpacity: 0.6, weight: 1 }
  }

  const buildingPopup = (feature: GeoJSONFeature, layer: L.Layer) => {
    const props = feature.properties
    const dmg = getDamageClass(props?.damage_class as number ?? 0)
    const confidence = props?.confidence as number | undefined
    ;(layer as L.Path).bindPopup(
      `<div class="text-sm">
        <strong>${dmg.label}</strong>
        ${confidence != null ? `<br/><span style="color:#94a3b8">Güven: ${(confidence * 100).toFixed(1)}%</span>` : ''}
       </div>`
    )
  }

  return (
    <MapContainer center={[39, 35]} zoom={7} className="h-full w-full" style={{ background: '#1e293b' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <BoundsListener onBoundsChange={onBoundsChange} />

      {showBuildings && buildings && buildings.features.length > 0 && (
        <GeoJSON
          key={`buildings-${buildings.features.length}`}
          data={buildings}
          style={buildingStyle}
          onEachFeature={buildingPopup}
        />
      )}

      {showRegions && regions && regions.features.length > 0 && (
        <GeoJSON
          key={`regions-${regions.features.length}`}
          data={regions}
          style={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.15, weight: 2 }}
        />
      )}

      {showClusters && clusters && clusters.features.length > 0 && (
        <GeoJSON
          key={`clusters-${clusters.features.length}`}
          data={clusters}
          style={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.1, weight: 2, dashArray: '6,4' }}
        />
      )}
    </MapContainer>
  )
}
