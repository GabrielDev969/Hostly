import { z } from 'zod';
import { mapNameSchema, poseSchema } from './common.ts';

export const MAX_MAP_POINTS = 500;

export const mapPointSchema = poseSchema.extend({
  name: z.string().min(1).max(128),
});

export const mapPointsRequestSchema = z.object({
  mapName: mapNameSchema,
  points: z.array(mapPointSchema).max(MAX_MAP_POINTS).describe('Points read with getPlaceList'),
});

export const mapPointsResponseSchema = z.object({
  mapName: mapNameSchema,
  pointCount: z.int().min(0),
});

export type MapPoint = z.infer<typeof mapPointSchema>;
export type MapPointsRequest = z.infer<typeof mapPointsRequestSchema>;
export type MapPointsResponse = z.infer<typeof mapPointsResponseSchema>;
