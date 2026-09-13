import { clamp, distance, interiorPoint, random, resample, segmentDistance, type Point } from '../core/math';
import type { Ward } from '../game/contracts';
import { toArt, type Pixel } from './projection';
import { wardContains, wardContours, wardRegions } from '../game/ward-geometry';

export interface WardNode extends Pixel { at: Point; clearance: number; size: number; variant: number }
export interface WardLayout {
  points: Pixel[];
  contours: Pixel[][];
  edge: Pixel[];
  nodes: WardNode[];
  grains: Pixel[];
  links: [Pixel, Pixel][];
  bounds: { x: number; y: number; width: number; height: number };
}

/** A bounded visual response to the simulation's concentration, never a rule multiplier. */
export const visualPower = (ward: Ward): number => ward.suppressed > 0 ? 0.05 : clamp((0.55 + Math.log2(Math.max(0.05, ward.power.multiplier)) * 0.2) * (ward.empowered > 0 ? 1.35 : 1), 0.15, 1);

/** Sample once per formation. Concave gaps remain empty; nodes never use a bounding circle. */
export function layoutWard(ward: Ward): WardLayout {
  const rng = random(ward.id * 1351), rings = wardContours(ward), all = rings.flat(), contours = rings.map(ring => ring.map(p => toArt(p))), points = contours.flat();
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
  const minZ = Math.min(...all.map(p => p.z)), maxZ = Math.max(...all.map(p => p.z));
  const x = Math.min(...points.map(p => p.x)) - 24, y = Math.min(...points.map(p => p.y)) - 24;
  const bounds = { x, y, width: Math.ceil(Math.max(...points.map(p => p.x)) - x + 24), height: Math.ceil(Math.max(...points.map(p => p.y)) - y + 24) };
  const grains: Pixel[] = [], candidates: Point[] = [{ x: ward.x, z: ward.z }, ...wardRegions(ward).slice(1).map(region => interiorPoint(region[0]!, p => wardContains(p, ward)))];
  for (let i = 0; i < 1800 && grains.length < 360; i++) {
    const at = { x: minX + rng() * (maxX - minX), z: minZ + rng() * (maxZ - minZ) };
    if (!wardContains(at, ward)) continue;
    grains.push(toArt(at));
    if (candidates.length < 160) candidates.push(at);
  }
  const nodes: WardNode[] = [], wanted = clamp(Math.ceil(Math.sqrt(ward.power.area) * 1.2), 3, 13);
  const clearances = new Map(candidates.map(p => [p, Math.min(...rings.flatMap(ring => ring.map((a, n) => segmentDistance(p, a, ring[(n + 1) % ring.length]!))))]));
  for (let i = 0; i < wanted; i++) {
    let best: Point | undefined, score = -1;
    for (const p of candidates) {
      const spacing = nodes.length ? Math.min(...nodes.map(n => distance(p, n.at))) : 1;
      const clearance = clearances.get(p)!;
      const value = spacing * Math.min(1, clearance / 0.55);
      if (value > score) { best = p; score = value; }
    }
    if (!best || (nodes.length && score < 0.55)) break;
    const clearance = clearances.get(best)! * 18;
    nodes.push({ ...toArt(best), at: { x: best.x, z: best.z }, clearance, size: 0.8 + rng() * 0.45, variant: Math.floor(rng() * 4) });
    candidates.splice(candidates.indexOf(best), 1);
  }
  const links: [Pixel, Pixel][] = [];
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i]!;
    const near = nodes.slice(0, i).sort((a, b) => distance(node.at, a.at) - distance(node.at, b.at));
    const target = near.find(p => resample([node.at, p.at], 0.2).every(sample => wardContains(sample, ward)));
    if (target) links.push([node, target]);
  }
  const edge = rings.flatMap(ring => resample([...ring, ring[0]!], Math.max(0.7, ward.power.perimeter / 120))).map(p => toArt(p));
  return { points, contours, edge, nodes, grains, links, bounds };
}
