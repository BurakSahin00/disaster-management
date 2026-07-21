import { buildingCentroid } from '@/components/map/geojsonToLeaflet'

describe('buildingCentroid', () => {
  it('returns [lat, lng] centroid for a Polygon', () => {
    const geometry = {
      type: 'Polygon' as const,
      // GeoJSON order: [lng, lat] — a 1° square at (lat=10, lng=20)
      coordinates: [[[20, 10], [21, 10], [21, 11], [20, 11], [20, 10]]],
    }
    const result = buildingCentroid(geometry)
    expect(result).not.toBeNull()
    // centroid lat ≈ (10+10+11+11+10)/5 = 10.4
    expect(result![0]).toBeCloseTo(10.4, 5)
    // centroid lng ≈ (20+21+21+20+20)/5 = 20.4
    expect(result![1]).toBeCloseTo(20.4, 5)
  })

  it('returns [lat, lng] centroid for the first ring of a MultiPolygon', () => {
    const geometry = {
      type: 'MultiPolygon' as const,
      coordinates: [
        [[[30, 50], [31, 50], [31, 51], [30, 51], [30, 50]]],
        [[[100, 0], [101, 0], [101, 1], [100, 1], [100, 0]]],
      ],
    }
    const result = buildingCentroid(geometry)
    expect(result).not.toBeNull()
    // First ring only: lat avg = (50+50+51+51+50)/5 = 50.4
    expect(result![0]).toBeCloseTo(50.4, 5)
    // First ring only: lng avg = (30+31+31+30+30)/5 = 30.4
    expect(result![1]).toBeCloseTo(30.4, 5)
  })

  it('returns null when coordinates are empty', () => {
    const geometry = { type: 'Polygon' as const, coordinates: [[]] }
    expect(buildingCentroid(geometry)).toBeNull()
  })
})
