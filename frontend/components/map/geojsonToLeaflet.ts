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
