import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DAMAGE_CLASSES } from '@/types'
import type { BuildingsGeoJson, GeoJsonBuilding } from '@/types'

interface LeafletMapProps {
  geojson: BuildingsGeoJson | null
  filters: Record<number, boolean>
  onSelectBuilding: (b: GeoJsonBuilding | null) => void
  selectedId: string | number | null
}

const CARTO_POSITRON = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

export default function LeafletMap({ geojson, filters, onSelectBuilding, selectedId }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<Map<string | number, { layer: L.Polygon; dmg: number }>>(new Map())

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: [37.5, 36.9], zoom: 14, zoomControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer(CARTO_POSITRON, {
      attribution: '© <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Draw polygons when GeoJSON changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson) return

    layersRef.current.forEach(({ layer }) => map.removeLayer(layer))
    layersRef.current.clear()

    geojson.features.forEach((feature) => {
      const dmg = feature.properties.damage_class ?? 0
      const clrObj = DAMAGE_CLASSES[dmg] ?? DAMAGE_CLASSES[0]
      const coords = feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])
      const poly = L.polygon(coords, {
        color: clrObj.color,
        weight: 1.8,
        fillColor: clrObj.color,
        fillOpacity: 0.45,
      }).addTo(map)

      poly.on('click', () => onSelectBuilding(feature))
      poly.on('mouseover', () => poly.setStyle({ fillOpacity: 0.75, weight: 2.5 }))
      poly.on('mouseout', () => poly.setStyle({ fillOpacity: 0.45, weight: 1.8 }))

      const id = feature.properties.id
      if (id != null) layersRef.current.set(id, { layer: poly, dmg })
    })

    if (geojson.features.length > 0) {
      const allCoords = geojson.features.flatMap((f) =>
        f.geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])
      )
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40] })
    }
  }, [geojson])

  // Highlight selected
  useEffect(() => {
    layersRef.current.forEach(({ layer }) => layer.setStyle({ weight: 1.8, fillOpacity: 0.45 }))
    if (selectedId != null && layersRef.current.has(selectedId)) {
      layersRef.current.get(selectedId)!.layer.setStyle({ weight: 3, fillOpacity: 0.85 })
    }
  }, [selectedId])

  // Apply filters
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.forEach(({ layer, dmg }) => {
      filters[dmg] ? map.addLayer(layer) : map.removeLayer(layer)
    })
  }, [filters])

  return <div ref={containerRef} className="w-full h-full" />
}
