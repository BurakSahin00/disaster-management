import request from 'supertest';
import express from 'express';

jest.mock('../../../src/geodata/geodata.service', () => ({
  getAnalysisBuildingsGeoJSONBbox: jest
    .fn()
    .mockResolvedValue({ type: 'FeatureCollection', features: [] }),
  getAnalysisRegionsGeoJSONBbox: jest
    .fn()
    .mockResolvedValue({ type: 'FeatureCollection', features: [] }),
  getAnalysisClustersGeoJSONBbox: jest
    .fn()
    .mockResolvedValue({ type: 'FeatureCollection', features: [] }),
}));

import {
  getAnalysisBuildingsGeoJSONBbox,
  getAnalysisRegionsGeoJSONBbox,
  getAnalysisClustersGeoJSONBbox,
} from '../../../src/geodata/geodata.service';
import { ogcRouter } from '../../../src/ogc/ogc.router';

const app = express();
app.use('/ogc', ogcRouter);

describe('OGC-like API', () => {
  it('lists collections', async () => {
    const res = await request(app).get('/ogc/collections');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.collections)).toBe(true);
  });

  it('requires analysisId for items', async () => {
    const res = await request(app).get('/ogc/collections/buildings/items');
    expect(res.status).toBe(400);
  });

  it('routes buildings items to buildings service', async () => {
    const res = await request(app).get(
      '/ogc/collections/buildings/items?analysisId=a1&bbox=1,2,3,4',
    );
    expect(res.status).toBe(200);
    expect(getAnalysisBuildingsGeoJSONBbox).toHaveBeenCalledWith({
      analysisId: 'a1',
      bbox4326: [1, 2, 3, 4],
    });
  });

  it('routes regions items to regions service (invalid bbox ignored)', async () => {
    const res = await request(app).get('/ogc/collections/regions/items?analysisId=a1&bbox=a,b,c,d');
    expect(res.status).toBe(200);
    expect(getAnalysisRegionsGeoJSONBbox).toHaveBeenCalledWith({
      analysisId: 'a1',
      bbox4326: undefined,
    });
  });

  it('routes clusters items to clusters service', async () => {
    const res = await request(app).get('/ogc/collections/clusters/items?analysisId=a1');
    expect(res.status).toBe(200);
    expect(getAnalysisClustersGeoJSONBbox).toHaveBeenCalledWith({
      analysisId: 'a1',
      bbox4326: undefined,
    });
  });
});
