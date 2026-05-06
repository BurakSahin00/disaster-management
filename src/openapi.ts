import { config } from './config';

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SeniorProject Backend API',
    version: '1.0.0',
    description:
      'Backend service for ML-supported post-earthquake building damage assessment. Includes job orchestration, PostGIS persistence, GeoJSON layers, and OGC API Features-like endpoints.',
  },
  servers: [{ url: `http://localhost:${config.port}` }],
  tags: [
    { name: 'Jobs' },
    { name: 'Analyses' },
    { name: 'Images' },
    { name: 'GeoData' },
    { name: 'OGC' },
  ],
  paths: {
    '/jobs': {
      post: {
        tags: ['Jobs'],
        summary: 'Create ML pipeline job (upload pre/post GeoTIFF)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['pre', 'post'],
                properties: {
                  pre: { type: 'string', format: 'binary' },
                  post: { type: 'string', format: 'binary' },
                  analysisId: {
                    type: 'string',
                    description: 'Optional analysis id to link results.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '202': { description: 'Accepted (job created)' },
          '400': { description: 'Invalid request' },
        },
      },
    },
    '/jobs/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Get job status/result metadata',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Job' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/jobs/{id}/files/{file}': {
      get: {
        tags: ['Jobs'],
        summary: 'Download generated output file',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'file',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: [
                'damage_overlay.png',
                'building_mask.png',
                'damage_map.tif',
                'report.json',
                'buildings.geojson',
                'change_map_meta.json',
              ],
            },
          },
        ],
        responses: {
          '200': { description: 'File bytes' },
          '400': { description: 'File not allowed' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/analyses': {
      post: {
        tags: ['Analyses'],
        summary: 'Create analysis (ERD-aligned)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'preImageId', 'postImageId'],
                properties: {
                  userId: { type: 'string' },
                  preImageId: { type: 'string' },
                  postImageId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
          '400': { description: 'Invalid request' },
        },
      },
    },
    '/analyses/{id}': {
      get: {
        tags: ['Analyses'],
        summary: 'Get analysis by id',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Analysis' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/analyses/{analysisId}/ingest/buildings': {
      post: {
        tags: ['Analyses'],
        summary: 'Ingest buildings GeoJSON and recompute derived layers',
        parameters: [
          { name: 'analysisId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/geo+json': { schema: { type: 'object' } },
            'application/json': { schema: { type: 'object' } },
          },
        },
        responses: {
          '202': { description: 'Accepted' },
          '400': { description: 'Invalid request' },
        },
      },
    },
    '/analyses/{analysisId}/change-maps': {
      post: {
        tags: ['Analyses'],
        summary: 'Register change map (minimal metadata)',
        parameters: [
          { name: 'analysisId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['uri'],
                properties: {
                  uri: { type: 'string' },
                  crsWkt: { type: 'string', nullable: true },
                  bbox4326GeoJSON: { type: 'object', nullable: true },
                  meta: { type: 'object', nullable: true },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' }, '400': { description: 'Invalid request' } },
      },
    },
    '/images': {
      post: {
        tags: ['Images'],
        summary: 'Register satellite image metadata',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['uri'],
                properties: {
                  uri: { type: 'string' },
                  crsWkt: { type: 'string', nullable: true },
                  widthPx: { type: 'integer', nullable: true },
                  heightPx: { type: 'integer', nullable: true },
                  bands: { type: 'integer', nullable: true },
                  bbox4326GeoJSON: { type: 'object', nullable: true },
                  meta: { type: 'object', nullable: true },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' }, '400': { description: 'Invalid request' } },
      },
    },
    '/images/{id}': {
      get: {
        tags: ['Images'],
        summary: 'Get satellite image metadata by id',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Satellite image' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/analyses/{analysisId}/buildings.geojson': {
      get: {
        tags: ['GeoData'],
        summary: 'Get buildings GeoJSON for analysis',
        parameters: [
          { name: 'analysisId', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'bbox',
            in: 'query',
            required: false,
            schema: { type: 'string', example: 'minLon,minLat,maxLon,maxLat' },
          },
        ],
        responses: { '200': { description: 'FeatureCollection' } },
      },
    },
    '/analyses/{analysisId}/regions.geojson': {
      get: {
        tags: ['GeoData'],
        summary: 'Get regions GeoJSON for analysis',
        parameters: [
          { name: 'analysisId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bbox', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'FeatureCollection' } },
      },
    },
    '/analyses/{analysisId}/clusters.geojson': {
      get: {
        tags: ['GeoData'],
        summary: 'Get clusters GeoJSON for analysis',
        parameters: [
          { name: 'analysisId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bbox', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'FeatureCollection' } },
      },
    },
    '/analyses/{analysisId}/recompute': {
      post: {
        tags: ['GeoData'],
        summary: 'Recompute derived regions and clusters',
        parameters: [
          { name: 'analysisId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  gridType: { type: 'string', enum: ['square', 'hex'] },
                  epsMeters: { type: 'number' },
                  minPoints: { type: 'integer' },
                  gridSizeMeters: { type: 'number' },
                  clusterMinAvgDamageClass: { type: 'number' },
                  clusterMinCellCount: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Recompute result' } },
      },
    },
    '/ogc/collections': {
      get: {
        tags: ['OGC'],
        summary: 'List collections (OGC API Features-like)',
        responses: { '200': { description: 'Collections' } },
      },
    },
    '/ogc/collections/{collectionId}': {
      get: {
        tags: ['OGC'],
        summary: 'Get collection metadata',
        parameters: [
          {
            name: 'collectionId',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['buildings', 'regions', 'clusters'] },
          },
        ],
        responses: { '200': { description: 'Collection' }, '404': { description: 'Not found' } },
      },
    },
    '/ogc/collections/{collectionId}/items': {
      get: {
        tags: ['OGC'],
        summary: 'Get collection items as GeoJSON',
        parameters: [
          {
            name: 'collectionId',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['buildings', 'regions', 'clusters'] },
          },
          { name: 'analysisId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'bbox', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'FeatureCollection' },
          '400': { description: 'Missing analysisId' },
          '404': { description: 'Collection not found' },
        },
      },
    },
  },
} as const;
