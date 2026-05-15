'use client'
import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { DAMAGE_CLASSES } from '@/types'
import type { BuildingsGeoJson, GeoJsonBuilding } from '@/types'
import { getLeafletOuterRings } from './geojsonToLeaflet'

const CARTO_POSITRON = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

interface LeafletMapProps {
  geojson: BuildingsGeoJson | null
  filters: Record<number, boolean>
  onSelectBuilding: (b: GeoJsonBuilding | null) => void
  selectedId: string | number | null
}

function PolygonLayer({ geojson, filters, onSelectBuilding, selectedId }: LeafletMapProps) {
  const map = useMap()
  const layersRef = useRef<Map<string | number, { layers: L.Polygon[]; dmg: number }>>(new Map())

  useEffect(() => {
    layersRef.current.forEach(({ layers }) => layers.forEach((layer) => map.removeLayer(layer)))
    layersRef.current.clear()
    if (!geojson) return

    geojson.features.forEach((feature) => {
      const dmg = feature.properties.damage_class ?? 0
      const clr = DAMAGE_CLASSES[dmg] ?? DAMAGE_CLASSES[0]
      const polygons = getLeafletOuterRings(feature.geometry).map((coords) => {
        const poly = L.polygon(coords, {
          color: clr.color, weight: 1.8, fillColor: clr.color, fillOpacity: 0.45,
        }).addTo(map)
        poly.on('click', () => onSelectBuilding(feature))
        poly.on('mouseover', () => poly.setStyle({ fillOpacity: 0.75, weight: 2.5 }))
        poly.on('mouseout', () => poly.setStyle({ fillOpacity: 0.45, weight: 1.8 }))
        return poly
      })
      const id = feature.properties.id
      if (id != null) layersRef.current.set(id, { layers: polygons, dmg })
    })

    if (geojson.features.length > 0) {
      const all = geojson.features.flatMap(f =>
        getLeafletOuterRings(f.geometry).flat()
      )
      map.fitBounds(L.latLngBounds(all), { padding: [40, 40] })
    }

    return () => {
      layersRef.current.forEach(({ layers }) => layers.forEach((layer) => map.removeLayer(layer)))
      layersRef.current.clear()
    }
  }, [geojson])

  useEffect(() => {
    layersRef.current.forEach(({ layers }) =>
      layers.forEach((layer) => layer.setStyle({ weight: 1.8, fillOpacity: 0.45 }))
    )
    if (selectedId != null && layersRef.current.has(selectedId)) {
      layersRef.current
        .get(selectedId)!
        .layers.forEach((layer) => layer.setStyle({ weight: 3, fillOpacity: 0.85 }))
    }
  }, [selectedId])

  useEffect(() => {
    layersRef.current.forEach(({ layers, dmg }) => {
      layers.forEach((layer) => {
        filters[dmg] ? map.addLayer(layer) : map.removeLayer(layer)
      })
    })
  }, [filters])

  return null
}

export default function LeafletMap(props: LeafletMapProps) {
  return (
    <MapContainer
      center={[37.5745, 36.9228]}
      zoom={14}
      zoomControl={true}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        url={CARTO_POSITRON}
        attribution='© <a href="https://carto.com">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      <PolygonLayer {...props} />
    </MapContainer>
  )
}
