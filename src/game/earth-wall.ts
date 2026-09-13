import { distance, segmentDistance, type Point } from '../core/math';
import type { Ward } from './contracts';
import { wardContains, wardContours } from './ward-geometry';

/** The entire effective drawing is solid; the small rim is the sloping wall foot. */
export const EARTH_WALL = Object.freeze({ rim: 0.55 });
export function earthWallAt(point: Point, ward: Ward, bodyRadius = 0): boolean {
  if (ward.element !== 'earth' || ward.health <= 0 || distance(point, ward) > ward.radius + EARTH_WALL.rim + bodyRadius) return false;
  return wardContains(point, ward) || wardContours(ward).some(ring => ring.some((a, i) =>
    segmentDistance(point, a, ring[(i + 1) % ring.length]!) < EARTH_WALL.rim + bodyRadius));
}
