import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
import { type Point } from '../core/math';
import { CLEARING, RIVER } from './map';
import { CAMP, MAGE, ROCKS } from './terrain';
import { wardArea, wardRegions, type WardShape } from './ward-geometry';

const ring = (points: readonly Point[]): Ring => points.map(p => [p.x, p.z]);
function exclusion(at: Point, radius: number): Ring {
  // Circumscribed polygon keeps its straight chords outside the actual collider.
  const r = (radius + 1e-5) / Math.cos(Math.PI / 64);
  return Array.from({ length: 64 }, (_, i) => [at.x + Math.cos(i / 64 * Math.PI * 2) * r, at.z + Math.sin(i / 64 * Math.PI * 2) * r]);
}
const ground: MultiPolygon = polygonClipping.difference([ring(CLEARING)], [ring(RIVER)],
  [exclusion(CAMP, 3.1)], [exclusion(MAGE, 1.4)], ...ROCKS.map(rock => [exclusion(rock, rock.radius + 0.35)]));

/** Preserve every connected piece and hole, using one shared spirit investment. */
export function clipToGround(points: readonly Point[]): Point[][][] {
  return polygonClipping.intersection([ring(points)], ground).map(region => region.map(contour =>
    contour.slice(0, -1).map(([x, z]) => ({ x, z }))));
}

/** Exact overlap also covers narrow edge walls and separated clipped pieces. */
export function sharedWardArea(a: WardShape, b: WardShape): number {
  const polygon = (shape: WardShape): MultiPolygon => wardRegions(shape).map(region => region.map(ring));
  return polygonClipping.intersection(polygon(a), polygon(b)).reduce((sum, region) => {
    const rings = region.map(contour => contour.slice(0,-1).map(([x,z])=>({x,z})));
    return sum + wardArea({ points:rings[0]!,regions:[rings] });
  }, 0);
}
