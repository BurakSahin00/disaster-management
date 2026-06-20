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
  recomputeRegionsAndClusters: jest.fn().mockResolvedValue({ regions: 0, clusters: 0 }),
}));

import {
  getAnalysisBuildingsGeoJSONBbox,
  getAnalysisRegionsGeoJSONBbox,
  getAnalysisClustersGeoJSONBbox,
} from '../../../src/geodata/geodata.service';
import { geodataRouter } from '../../../src/geodata/geodata.router';

const app = express();
app.use(express.json());
app.use('/', geodataRouter);

describe('geodata bbox parsing', () => {
  it('passes bbox to buildings handler when valid', async () => {
    await request(app).get('/analyses/a1/buildings.geojson?bbox=1,2,3,4').expect(200);
    expect(getAnalysisBuildingsGeoJSONBbox).toHaveBeenCalledWith({
      analysisId: 'a1',
      bbox4326: [1, 2, 3, 4],
    });
  });

  it('omits bbox when invalid (non-numeric)', async () => {
    await request(app).get('/analyses/a1/regions.geojson?bbox=a,b,c,d').expect(200);
    expect(getAnalysisRegionsGeoJSONBbox).toHaveBeenCalledWith({
      analysisId: 'a1',
      bbox4326: undefined,
    });
  });

  it('omits bbox when wrong length', async () => {
    await request(app).get('/analyses/a1/clusters.geojson?bbox=1,2,3').expect(200);
    expect(getAnalysisClustersGeoJSONBbox).toHaveBeenCalledWith({
      analysisId: 'a1',
      bbox4326: undefined,
    });
  });
});
