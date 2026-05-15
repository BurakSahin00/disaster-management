import { getLeafletOuterRings } from '@/components/map/geojsonToLeaflet'

describe('getLeafletOuterRings', () => {
  it('converts Polygon coordinates from lng/lat to lat/lng', () => {
    const rings = getLeafletOuterRings({
      type: 'Polygon',
      coordinates: [
        [
          [27.1, 38.4],
          [27.101, 38.4],
          [27.101, 38.401],
          [27.1, 38.4],
        ],
      ],
    })

    expect(rings).toEqual([
      [
        [38.4, 27.1],
        [38.4, 27.101],
        [38.401, 27.101],
        [38.4, 27.1],
      ],
    ])
  })

  it('returns one Leaflet outer ring for each MultiPolygon polygon', () => {
    const rings = getLeafletOuterRings({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [27.1, 38.4],
            [27.101, 38.4],
            [27.1, 38.4],
          ],
        ],
        [
          [
            [29.0, 41.0],
            [29.001, 41.0],
            [29.0, 41.0],
          ],
        ],
      ],
    })

    expect(rings).toEqual([
      [
        [38.4, 27.1],
        [38.4, 27.101],
        [38.4, 27.1],
      ],
      [
        [41.0, 29.0],
        [41.0, 29.001],
        [41.0, 29.0],
      ],
    ])
  })
})
