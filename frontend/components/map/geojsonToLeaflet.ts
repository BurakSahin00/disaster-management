export type GeoJsonPolygonGeometry = {
  type: 'Polygon'
  coordinates: number[][][]
}

export type GeoJsonMultiPolygonGeometry = {
  type: 'MultiPolygon'
  coordinates: number[][][][]
}

export type GeoJsonPolygonLikeGeometry = GeoJsonPolygonGeometry | GeoJsonMultiPolygonGeometry

export type LeafletRing = [number, number][]

const toLeafletRing = (ring: number[][]): LeafletRing =>
  ring.map(([lng, lat]) => [lat, lng] as [number, number])

export function getLeafletOuterRings(geometry: GeoJsonPolygonLikeGeometry): LeafletRing[] {
  if (geometry.type === 'Polygon') {
    const outer = geometry.coordinates[0]
    return outer ? [toLeafletRing(outer)] : []
  }

  return geometry.coordinates
    .map((polygon) => polygon[0])
    .filter((outer): outer is number[][] => Array.isArray(outer))
    .map(toLeafletRing)
}

/**
 * Returns the [lat, lng] centroid of the first outer ring.
 * GeoJSON stores [lng, lat]; this returns Leaflet-order [lat, lng].
 */
export function buildingCentroid(
  geometry: GeoJsonPolygonLikeGeometry,
): [number, number] | null {
  const ring =
    geometry.type === 'MultiPolygon'
      ? geometry.coordinates[0]?.[0]
      : geometry.coordinates[0]
  if (!ring?.length) return null
  const sumLng = ring.reduce((s, c) => s + (c[0] ?? 0), 0)
  const sumLat = ring.reduce((s, c) => s + (c[1] ?? 0), 0)
  return [sumLat / ring.length, sumLng / ring.length]
}
