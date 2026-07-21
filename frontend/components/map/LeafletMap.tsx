'use client'
import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { DAMAGE_CLASSES } from '@/types'
import type { BuildingsGeoJson, GeoJsonBuilding, RegionsGeoJson, ClustersGeoJson } from '@/types'
import { getLeafletOuterRings } from './geojsonToLeaflet'
import { HeatmapLayer } from './HeatmapLayer'
import { HotspotLayer } from './HotspotLayer'
import type { HotspotGeoJson } from '@/types'

const CARTO_POSITRON = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

function severityColor(severity: number): string {
  if (severity < 0.5) return '#16a34a'
  if (severity < 1.5) return '#65a30d'
  if (severity < 2.5) return '#ea580c'
  return '#dc2626'
}

interface LeafletMapProps {
  geojson: BuildingsGeoJson | null
  filters: Record<number, boolean>
  onSelectBuilding: (b: GeoJsonBuilding | null) => void
  selectedId: string | number | null
  regionsGeojson: RegionsGeoJson | null
  clustersGeojson: ClustersGeoJson | null
  layerVisibility: { buildings: boolean; regions: boolean; clusters: boolean; heatmap: boolean; hotspot: boolean }
  tiffOverlay: {
    url: string
    bounds: L.LatLngBoundsExpression
    opacity: number
    visible: boolean
  } | null
  heatmapPoints: [number, number, number][]
  heatmapRadius: number
  hotspotGeojson: HotspotGeoJson | null
}

function PolygonLayer({ geojson, filters, onSelectBuilding, selectedId, visible }: {
  geojson: BuildingsGeoJson | null
  filters: Record<number, boolean>
  onSelectBuilding: (b: GeoJsonBuilding | null) => void
  selectedId: string | number | null
  visible: boolean
}) {
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
      const id = feature.properties.building_id ?? feature.properties.id
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
      const show = visible && filters[dmg]
      layers.forEach((layer) => {
        show ? map.addLayer(layer) : map.removeLayer(layer)
      })
    })
  }, [filters, visible])

  return null
}

function RegionLayer({ geojson, visible }: { geojson: RegionsGeoJson | null; visible: boolean }) {
  const map = useMap()
  const layersRef = useRef<L.Polygon[]>([])

  useEffect(() => {
    layersRef.current.forEach((l) => map.removeLayer(l))
    layersRef.current = []
    if (!geojson) return

    geojson.features.forEach((feature) => {
      const sev = feature.properties.severity ?? 0
      const color = severityColor(sev)
      const count = feature.properties.count ?? 0
      const avg = (feature.properties.avg_damage_class ?? sev).toFixed(2)
      const rings = getLeafletOuterRings(feature.geometry as Parameters<typeof getLeafletOuterRings>[0])
      rings.forEach((coords) => {
        const poly = L.polygon(coords, {
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.3,
        })
        poly.bindTooltip(
          `<div style="font-size:12px;line-height:1.5">
            <b>Avg. damage:</b> ${avg}<br/>
            <b>Buildings:</b> ${count}
          </div>`,
          { sticky: true }
        )
        if (visible) poly.addTo(map)
        layersRef.current.push(poly)
      })
    })

    return () => {
      layersRef.current.forEach((l) => map.removeLayer(l))
      layersRef.current = []
    }
  }, [geojson])

  useEffect(() => {
    layersRef.current.forEach((l) => {
      visible ? map.addLayer(l) : map.removeLayer(l)
    })
  }, [visible])

  return null
}

function TiffOverlayLayer({ url, bounds, opacity, visible }: {
  url: string
  bounds: L.LatLngBoundsExpression
  opacity: number
  visible: boolean
}) {
  const map = useMap()
  const overlayRef = useRef<L.ImageOverlay | null>(null)

  useEffect(() => {
    if (!map.getPane('tiffPane')) {
      const pane = map.createPane('tiffPane')
      pane.style.zIndex = '250'
    }
    const layer = L.imageOverlay(url, bounds, {
      opacity: opacity / 100,
      interactive: false,
      pane: 'tiffPane',
    })
    if (visible) layer.addTo(map)
    overlayRef.current = layer
    return () => {
      map.removeLayer(layer)
      overlayRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, bounds])

  useEffect(() => {
    overlayRef.current?.setOpacity(opacity / 100)
  }, [opacity])

  useEffect(() => {
    if (!overlayRef.current) return
    visible ? map.addLayer(overlayRef.current) : map.removeLayer(overlayRef.current)
  }, [visible, map])

  return null
}

function ClusterLayer({ geojson, visible }: { geojson: ClustersGeoJson | null; visible: boolean }) {
  const map = useMap()
  const layersRef = useRef<L.Polygon[]>([])

  useEffect(() => {
    layersRef.current.forEach((l) => map.removeLayer(l))
    layersRef.current = []
    if (!geojson) return

    geojson.features.forEach((feature) => {
      const cells = feature.properties.region_cells ?? '?'
      const sev = (feature.properties.avg_cell_severity ?? feature.properties.severity ?? 0).toFixed(2)
      const rings = getLeafletOuterRings(feature.geometry as Parameters<typeof getLeafletOuterRings>[0])
      rings.forEach((coords) => {
        const poly = L.polygon(coords, {
          color: '#7c3aed',
          weight: 2.5,
          fillColor: '#7c3aed',
          fillOpacity: 0.12,
          dashArray: '6 4',
        })
        poly.bindTooltip(
          `<div style="font-size:12px;line-height:1.5">
            <b>Damage cluster</b><br/>
            <b>Cells:</b> ${cells}<br/>
            <b>Avg. severity:</b> ${sev}
          </div>`,
          { sticky: true }
        )
        if (visible) poly.addTo(map)
        layersRef.current.push(poly)
      })
    })

    return () => {
      layersRef.current.forEach((l) => map.removeLayer(l))
      layersRef.current = []
    }
  }, [geojson])

  useEffect(() => {
    layersRef.current.forEach((l) => {
      visible ? map.addLayer(l) : map.removeLayer(l)
    })
  }, [visible])

  return null
}

export default function LeafletMap({
  geojson,
  filters,
  onSelectBuilding,
  selectedId,
  regionsGeojson,
  clustersGeojson,
  layerVisibility,
  tiffOverlay,
  heatmapPoints,
  heatmapRadius,
  hotspotGeojson,
}: LeafletMapProps) {
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
      {tiffOverlay && (
        <TiffOverlayLayer
          url={tiffOverlay.url}
          bounds={tiffOverlay.bounds}
          opacity={tiffOverlay.opacity}
          visible={tiffOverlay.visible}
        />
      )}
      <HeatmapLayer
        points={heatmapPoints}
        radius={heatmapRadius}
        visible={layerVisibility.heatmap}
      />
      <HotspotLayer
        geojson={hotspotGeojson}
        visible={layerVisibility.hotspot}
      />
      <RegionLayer geojson={regionsGeojson} visible={layerVisibility.regions} />
      <ClusterLayer geojson={clustersGeojson} visible={layerVisibility.clusters} />
      <PolygonLayer
        geojson={geojson}
        filters={filters}
        onSelectBuilding={onSelectBuilding}
        selectedId={selectedId}
        visible={layerVisibility.buildings}
      />
    </MapContainer>
  )
}
