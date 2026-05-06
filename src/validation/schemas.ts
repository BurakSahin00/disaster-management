import { z } from 'zod';

export const zCreateAnalysis = z.object({
  userId: z.string().min(1),
  preImageId: z.string().min(1),
  postImageId: z.string().min(1),
});

export const zRegisterImage = z.object({
  uri: z.string().min(1),
  crsWkt: z.string().optional(),
  widthPx: z.number().int().positive().optional(),
  heightPx: z.number().int().positive().optional(),
  bands: z.number().int().positive().optional(),
  bbox4326GeoJSON: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const zRegisterChangeMap = z.object({
  uri: z.string().min(1),
  crsWkt: z.string().optional(),
  bbox4326GeoJSON: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const zRecompute = z
  .object({
    gridType: z.enum(['square', 'hex']).optional(),
    epsMeters: z.number().positive().optional(),
    minPoints: z.number().int().positive().optional(),
    gridSizeMeters: z.number().positive().optional(),
    clusterMinAvgDamageClass: z.number().min(0).max(3).optional(),
    clusterMinCellCount: z.number().int().positive().optional(),
  })
  .optional();

// Minimal GeoJSON validation: FeatureCollection-ish.
export const zFeatureCollection = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.unknown()),
});
