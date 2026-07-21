'use client'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'

const GRADIENT: Record<string, string> = {
  '0.0':  '#16a34a',
  '0.33': '#65a30d',
  '0.66': '#ea580c',
  '1.0':  '#dc2626',
}

interface HeatmapLayerProps {
  points: [number, number, number][]
  radius: number
  visible: boolean
}

export function HeatmapLayer({ points, radius, visible }: HeatmapLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.Layer | null>(null)

  // Recreate the layer whenever points or radius change.
  // leaflet.heat does not support mutating radius after creation.
  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }
    if (!points.length) return

    const layer = L.heatLayer(points, {
      radius,
      blur: 20,
      max: 3,
      gradient: GRADIENT,
    })
    if (visible) layer.addTo(map)
    layerRef.current = layer

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, radius])

  useEffect(() => {
    if (!layerRef.current) return
    visible ? map.addLayer(layerRef.current) : map.removeLayer(layerRef.current)
  }, [visible, map])

  return null
}
