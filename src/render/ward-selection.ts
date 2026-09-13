import { clamp, inside, type Point } from '../core/math';
import type { Ward } from '../game/contracts';
import { wardContains, wardContours } from '../game/ward-geometry';
import { EARTH_WALL_ART } from './earth-wall';
import { ART } from './projection';

export const wardSelectionHeight = (ward: Ward): number => ward.element === 'earth'
  ? EARTH_WALL_ART.height * (1 - Math.pow(1 - clamp(ward.age / .55, 0, 1), 3)) : 0;

/** Select the visible roof/face of a raised wall, not the empty ground behind it. */
export function pickWard(point: Point, wards: readonly Ward[]): Ward | undefined {
  for (const ward of [...wards].sort((a, b) => b.z - a.z || b.id - a.id)) {
    const lift = wardSelectionHeight(ward) / ART.unitY;
    if (wardContains({ x: point.x, z: point.z + lift }, ward)) return ward;
    if (lift > 0 && wardContours(ward).some(ring => ring.some((a, i) => {
      const b = ring[(i + 1) % ring.length]!;
      return inside(point, [a, b, { x: b.x, z: b.z - lift }, { x: a.x, z: a.z - lift }]);
    }))) return ward;
  }
  return undefined;
}
