'use client'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { HotspotGeoJson, HotspotProperties } from '@/types'

export function hotspotFillColor(zScore: number): string {
  if (zScore >= 2.576) return '#dc2626'   // hot 99%
  if (zScore >= 1.960) return '#f97316'   // hot 95%
  if (zScore >= 1.645) return '#fbbf24'   // hot 90%
  if (zScore <= -2.576) return '#1d4ed8'  // cold 99%
  if (zScore <= -1.960) return '#60a5fa'  // cold 95%
  if (zScore <= -1.645) return '#93c5fd'  // cold 90%
  return 'transparent'
}

interface HotspotLayerProps {
  geojson: HotspotGeoJson | null
  visible: boolean
}

export function HotspotLayer({ geojson, visible }: HotspotLayerProps) {
  const map = useMap()
  const layersRef = useRef<L.Layer[]>([])

  useEffect(() => {
    layersRef.current.forEach((l) => map.removeLayer(l))
    layersRef.current = []
    if (!geojson) return

    const layer = L.geoJSON(geojson as Parameters<typeof L.geoJSON>[0], {
      style: (feature) => {
        const z = Number((feature?.properties as HotspotProperties | undefined)?.z_score ?? 0)
        const fill = hotspotFillColor(z)
        return {
          fillColor: fill,
          fillOpacity: fill === 'transparent' ? 0 : 0.55,
          weight: 0,
          stroke: false,
        }
      },
      onEachFeature: (feature, featureLayer) => {
        const p = feature.properties as HotspotProperties | undefined
        featureLayer.bindTooltip(
          `<div style="font-size:12px;line-height:1.5">
            <b>G* z-skoru:</b> ${Number(p?.z_score ?? 0).toFixed(2)}<br/>
            <b>Güven:</b> ${p?.confidence ?? '—'}
          </div>`,
          { sticky: true },
        )
      },
    })

    if (visible) layer.addTo(map)
    layersRef.current = [layer]

    return () => {
      layersRef.current.forEach((l) => map.removeLayer(l))
      layersRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson])

  useEffect(() => {
    layersRef.current.forEach((l) => {
      visible ? map.addLayer(l) : map.removeLayer(l)
    })
  }, [visible, map])

  return null
}
