import request from 'supertest';
import express from 'express';

jest.mock('../../../src/geodata/hotspot.service', () => ({
  computeHotspot: jest.fn().mockResolvedValue({ cellCount: 10 }),
  getHotspotGeoJSON: jest.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
}));

import { computeHotspot, getHotspotGeoJSON } from '../../../src/geodata/hotspot.service';
import { geodataRouter } from '../../../src/geodata/geodata.router';

const app = express();
app.use(express.json());
app.use('/', geodataRouter);

describe('POST /analyses/:analysisId/hotspot', () => {
  it('returns 200 with status ok and cellCount', async () => {
    const res = await request(app).post('/analyses/a1/hotspot').expect(200);
    expect(res.body).toEqual({ status: 'ok', cellCount: 10 });
    expect(computeHotspot).toHaveBeenCalledWith('a1');
  });

  it('returns 404 when service throws with status 404', async () => {
    const err = Object.assign(new Error('No region data'), { status: 404 });
    (computeHotspot as jest.Mock).mockRejectedValueOnce(err);
    const res = await request(app).post('/analyses/a1/hotspot').expect(404);
    expect(res.body.error).toBe('No region data');
  });
});

describe('GET /analyses/:analysisId/hotspot.geojson', () => {
  it('returns 200 with FeatureCollection', async () => {
    const res = await request(app).get('/analyses/a1/hotspot.geojson').expect(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(getHotspotGeoJSON).toHaveBeenCalledWith('a1', undefined);
  });

  it('passes valid bbox to service', async () => {
    await request(app).get('/analyses/a1/hotspot.geojson?bbox=1,2,3,4').expect(200);
    expect(getHotspotGeoJSON).toHaveBeenCalledWith('a1', [1, 2, 3, 4]);
  });

  it('omits bbox when invalid', async () => {
    await request(app).get('/analyses/a1/hotspot.geojson?bbox=a,b,c,d').expect(200);
    expect(getHotspotGeoJSON).toHaveBeenCalledWith('a1', undefined);
  });

  it('returns 404 when service throws with status 404', async () => {
    const err = Object.assign(new Error('No hotspot data'), { status: 404 });
    (getHotspotGeoJSON as jest.Mock).mockRejectedValueOnce(err);
    const res = await request(app).get('/analyses/a1/hotspot.geojson').expect(404);
    expect(res.body.error).toBe('No hotspot data');
  });
});
