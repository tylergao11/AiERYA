import { distance, interiorPoint, lerp, type Point } from '../core/math';
import type { Element, Phase, Ward, WardPower } from './contracts';
import { calculateWardPower, CONCENTRATION } from './concentration';
import { buildable } from './terrain';
import { normalizeLoop } from './strokes';
import { clipToGround, sharedWardArea } from './ground-clipping';
import { wardArea, wardContains, wardContours } from './ward-geometry';

export interface WardPlacementContext {
  readonly phase: Phase;
  readonly element: Element;
  readonly energy: number;
  readonly investment: number;
  readonly costMultiplier?: number;
  readonly efficiency: number;
  readonly wards: readonly Ward[];
}
export type WardPlacementFailure = 'phase' | 'fate' | 'points' | 'open' | 'size' | 'crossing' | 'terrain' | 'limit' | 'overlap' | 'energy' | 'investment';
export type WardPlacementResult =
  | { ok: false; reason: WardPlacementFailure; message: string }
  | { ok: true; element: Element; points: Point[]; regions: Point[][][]; clipped: boolean; at: Point; radius: number; area: number; cost: number; power: WardPower };

/** Preserve stroke corners and sample the closing edge as well as the drawn edges. */
function closedBoundary(stroke: readonly Point[]): Point[] {
  const vertices = stroke.filter((p, i) => i === 0 || distance(p, stroke[i - 1]!) > 1e-6);
  if (vertices.length > 1 && distance(vertices[0]!, vertices.at(-1)!) < 1e-6) vertices.pop();
  const points: Point[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
    const count = Math.max(1, Math.ceil(distance(a, b) / 0.42));
    for (let j = 0; j < count; j++) points.push({ x: lerp(a.x, b.x, j / count), z: lerp(a.z, b.z, j / count) });
  }
  return points;
}

/** Side-effect free: preview and final placement use exactly the same rules. */
export function planWardPlacement(stroke: readonly Point[], context: WardPlacementContext): WardPlacementResult {
  const fail = (reason: WardPlacementFailure, message: string): WardPlacementResult => ({ ok: false, reason, message });
  if (context.phase !== 'prepare') return fail('phase', '战斗中直接划动施法，持续阵法在布局阶段绘制');
  if (!Number.isSafeInteger(context.investment) || context.investment <= 0
    || !Number.isFinite(context.efficiency) || context.efficiency <= 0) return fail('investment', '请投入有效的灵力');
  if (stroke.length > 1201 || stroke.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > 50 || Math.abs(p.z) > 50)) return fail('points', '阵线无效，请重新绘制');
  const loop = normalizeLoop(stroke);
  if (!loop) return fail('open', '再围拢一些即可，首尾接近会自动连起来');
  const clippedRegions = clipToGround(loop).filter(region => wardArea({ points: region[0]!, regions: [region] }) >= CONCENTRATION.minimumDrawingArea);
  if (!clippedRegions.length) return fail('terrain', '圈内没有可用空地，往空地内多画一些即可');
  clippedRegions.sort((a, b) => wardArea({ points: b[0]!, regions: [b] }) - wardArea({ points: a[0]!, regions: [a] }));
  const regions = clippedRegions.map(region => region.map(closedBoundary)), points = regions[0]![0]!;
  const shape = { points, regions }, exactShape = { points: clippedRegions[0]![0]!, regions: clippedRegions };
  const size = wardArea(exactShape), originalSize = wardArea({ points: loop });
  const clipped = size < originalSize - 1e-6;
  const at = interiorPoint(points, p => buildable(p) && wardContains(p, shape));
  if (!wardContains(at, shape) || !buildable(at)) return fail('terrain', '圈内空地太窄，请往空地内多画一些');
  if (context.wards.length >= 6) return fail('limit', '最多维持六座阵，先撤回一座再调整');
  if (context.wards.some(ward => { const overlap = sharedWardArea(shape, ward); return overlap / size > 0.25 + 1e-8 || overlap / ward.power.area > 0.25 + 1e-8; })) return fail('overlap', '这里大部分已有阵法，换一块空地即可；少量重叠没关系');
  const cost = context.investment * (context.costMultiplier ?? 1);
  if (context.energy < cost) return fail('energy', `此阵需要 ${cost} 灵力，当前灵力不足`);
  const perimeter = wardContours(exactShape).reduce((sum, ring) => sum + ring.reduce((length, p, i) => length + distance(p, ring[(i + 1) % ring.length]!), 0), 0);
  const power = calculateWardPower(context.element, context.investment, size, perimeter, context.efficiency);
  return { ok: true, element: context.element, points, regions, clipped, at, radius: Math.max(...wardContours(shape).flat().map(p => distance(p, at))), area: size, cost, power };
}
