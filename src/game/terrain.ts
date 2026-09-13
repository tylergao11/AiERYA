import { distance, inside, segmentDistance, type Point } from '../core/math';
import type { Element, NaturalSource, Ward } from './contracts';
import { CLEARING, mapPoint, RIVER } from './map';
import { earthWallAt } from './earth-wall';

export const CAMP = mapPoint(273, 253);
export const CAMP_FIRE = Object.freeze({ radius: 2.4, burnDps: 1.5, emberSeconds: 0.6 });
export const MAGE = mapPoint(385, 321);
export const WORLD = { width: 64, depth: 52, playWidth: 44, playDepth: 38 } as const;
export const ROCKS = [
  { ...mapPoint(172, 319), radius: 1.35 },
  { ...mapPoint(1130, 825), radius: 1.5 },
  { ...mapPoint(1480, 379), radius: 1.5 },
] as const;
export const ENTRANCES: readonly Point[] = [mapPoint(1240, 365), mapPoint(1280, 550), mapPoint(815, 766)];
const sources: NaturalSource[] = [
  { id: 'wood-grove', element: 'wood', title: '林木', ...mapPoint(664, 218), radius: 3.4 },
  { id: 'camp-fire', element: 'fire', title: '篝火', ...CAMP, radius: CAMP_FIRE.radius },
  { id: 'sand-bank', element: 'earth', title: '沙地', ...mapPoint(1100, 641), radius: 3.2 },
  { id: 'ore-vein', element: 'metal', title: '铁器', ...mapPoint(339, 296), radius: 1.65 },
  { id: 'river-pool', element: 'water', title: '溪流', ...mapPoint(1396, 698), radius: 3 },
];
export const createNaturalSources = (): NaturalSource[] => sources.map(source => ({ ...source }));
export function naturalElement(point: Point): Element | null {
  if (inside(point, RIVER)) return 'water';
  for (const source of sources) if (source.element !== 'water' && distance(point, source) < source.radius) return source.element;
  return null;
}
export function walkable(point: Point): boolean {
  return inside(point, CLEARING) && !inside(point, RIVER) && !ROCKS.some(rock => distance(point, rock) < rock.radius + 0.35);
}
export function buildable(point: Point): boolean {
  const onEdge = (polygon: readonly Point[]) => polygon.some((a, i) => segmentDistance(point, a, polygon[(i + 1) % polygon.length]!) < 1e-7);
  return (inside(point, CLEARING) || onEdge(CLEARING)) && (!inside(point, RIVER) || onEdge(RIVER))
    && !ROCKS.some(rock => distance(point, rock) < rock.radius + 0.35 - 1e-7)
    && distance(point, CAMP) >= 3.1 - 1e-7 && distance(point, MAGE) >= 1.4 - 1e-7;
}
export function wallAt(point: Point, wards: readonly Ward[]): Ward | undefined {
  return wards.find(ward => earthWallAt(point, ward));
}
