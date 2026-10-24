import { z } from 'zod';

// The OrionStar serial format is not documented; this accepts what getRobotSn is expected to return.
export const serialSchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,64}$/)
  .describe('Robot serial number, from getRobotSn');

// Always with seconds (RFC 3339; enforced since zod 4.5): "2026-10-22T13:10-03:00" is refused. On Android, format
// with Instant.toString() or DateTimeFormatter.ISO_OFFSET_DATE_TIME, never OffsetDateTime.toString(), which drops
// zero seconds.
export const dateTimeSchema = z.iso.datetime({ offset: true });

export const mapNameSchema = z.string().min(1).max(128).describe('Map name, from getMapName');

export const poseSchema = z.object({
  x: z.number().describe('X on the current map, in meters'),
  y: z.number().describe('Y on the current map, in meters'),
  theta: z.number().describe('Facing direction, in radians'),
});

export type Pose = z.infer<typeof poseSchema>;
