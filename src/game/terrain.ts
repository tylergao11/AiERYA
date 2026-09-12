import { distance, inside, segmentDistance, type Point } from '../core/math';
import type { Element, Resource, Ward } from './contracts';
import { CLEARING, mapPoint, RIVER } from './map';

export const CAMP = mapPoint(273, 253);
export const MAGE = mapPoint(385, 321);
export const WORLD = { width: 64, depth: 52, playWidth: 44, playDepth: 38 } as const;
export const ROCKS = [
  { ...mapPoint(172, 319), radius: 1.35 },
  { ...mapPoint(1130, 825), radius: 1.5 },
  { ...mapPoint(1480, 379), radius: 1.5 },
] as const;
export const ENTRANCES: readonly Point[] = [mapPoint(1240, 365), mapPoint(1280, 550), mapPoint(815, 766)];
const sources: Resource[] = [
  { id: 'wood-grove', element: 'wood', title: '林木', ...mapPoint(664, 218), radius: 3.4, cooldown: 0 },
  { id: 'camp-fire', element: 'fire', title: '篝火', ...CAMP, radius: 2.4, cooldown: 0 },
  { id: 'sand-bank', element: 'earth', title: '沙地', ...mapPoint(1100, 641), radius: 3.2, cooldown: 0 },
  { id: 'ore-vein', element: 'metal', title: '铁器', ...mapPoint(339, 296), radius: 1.65, cooldown: 0 },
  { id: 'river-pool', element: 'water', title: '溪流', ...mapPoint(1396, 698), radius: 3, cooldown: 0 },
];
export const createResources = (): Resource[] => sources.map(resource => ({ ...resource }));
export function naturalElement(point: Point): Element | null {
  if (inside(point, RIVER)) return 'water';
  for (const source of sources) if (source.element !== 'water' && distance(point, source) < source.radius) return source.element;
  return null;
}
export function walkable(point: Point): boolean {
  return inside(point, CLEARING) && !inside(point, RIVER) && !ROCKS.some(rock => distance(point, rock) < rock.radius + 0.35);
}
export function buildable(point: Point): boolean {
  return walkable(point) && distance(point, CAMP) > 3.1 && distance(point, MAGE) > 1.4;
}
export function wallAt(point: Point, wards: readonly Ward[]): Ward | undefined {
  return wards.find(ward => ward.element === 'earth' && ward.health > 0 && ward.points.some((a, i) => segmentDistance(point, a, ward.points[(i + 1) % ward.points.length]!) < 0.55));
}
