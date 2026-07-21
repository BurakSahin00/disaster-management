// Lightweight unit test: verify the GeoJSON query shape without a real DB.
import { createHotspotRepository } from '../../../src/geodata/hotspot.repository';
import { Pool } from 'pg';

function makePool(rows: Record<string, unknown>[]): Pool {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

describe('hotspot.repository', () => {
  it('hasRegions returns true when rows exist', async () => {
    const repo = createHotspotRepository(makePool([{ exists: true }]));
    expect(await repo.hasRegions('a1')).toBe(true);
  });

  it('hasRegions returns false when no rows', async () => {
    const repo = createHotspotRepository(makePool([{ exists: false }]));
    expect(await repo.hasRegions('a1')).toBe(false);
  });

  it('countHotspotCells parses count string', async () => {
    const repo = createHotspotRepository(makePool([{ count: '42' }]));
    expect(await repo.countHotspotCells('a1')).toBe(42);
  });

  it('getHotspotGeoJSON returns empty FeatureCollection when no rows', async () => {
    const repo = createHotspotRepository(
      makePool([{ fc: { type: 'FeatureCollection', features: [] } }]),
    );
    const fc = await repo.getHotspotGeoJSON('a1') as { type: string; features: unknown[] };
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(0);
  });
});
