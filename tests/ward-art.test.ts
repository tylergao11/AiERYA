import { describe, expect, it } from 'vitest';
import { area, distance, inside, interiorPoint, resample, type Point } from '../src/core/math';
import { calculateWardPower } from '../src/game/concentration';
import type { Ward } from '../src/game/contracts';
import { ART, type Pixel } from '../src/render/projection';
import { layoutWard, visualPower } from '../src/render/ward-layout';

const concave: Point[] = [[0, 0], [12, 0], [12, 12], [9, 12], [9, 3], [3, 3], [3, 12], [0, 12]].map(([x, z]) => ({ x: x!, z: z! }));
const fromPixel = (p: Pixel): Point => ({ x: (p.x - ART.x) / ART.unitX, z: (p.y - ART.y) / ART.unitY });
function ward(points = concave): Ward {
  const perimeter = points.reduce((sum, p, i) => sum + distance(p, points[(i + 1) % points.length]!), 0);
  return { ...interiorPoint(points), id: 19, element: 'wood', points, age: 1, radius: 10, charge: 1, pulse: 0, health: 80, maxHealth: 80, empowered: 0, suppressed: 0,
    power: calculateWardPower('wood', 14, area(points), perimeter) };
}

describe('formation art geometry', () => {
  it('keeps all material nodes, ground grains and connections inside a concave formation', () => {
    const formation = ward(), layout = layoutWard(formation);
    expect(layout.nodes.length).toBeGreaterThan(2);
    for (const p of [...layout.nodes, ...layout.grains]) expect(inside(fromPixel(p), formation.points)).toBe(true);
    for (const link of layout.links) for (const p of resample(link.map(fromPixel), 0.08)) expect(inside(p, formation.points)).toBe(true);
    expect(layout.nodes.some(p => p.at.x > 3 && p.at.x < 9 && p.at.z > 3)).toBe(false);
  });
  it('retains its layout across frames and does not mutate the simulation', () => {
    const formation = ward(), before = structuredClone(formation), first = layoutWard(formation);
    expect(layoutWard(formation)).toEqual(first);
    expect(formation).toEqual(before);
    formation.age = 40; formation.charge = 0; formation.health = 10;
    expect(layoutWard(formation)).toEqual(first);
  });
  it('caps decorations on a large area and fits a thin bent area without a bounding circle', () => {
    const big = ward([{ x: -30, z: -30 }, { x: 30, z: -30 }, { x: 30, z: 30 }, { x: -30, z: 30 }]);
    const layout = layoutWard(big);
    expect(layout.nodes.length).toBeLessThanOrEqual(13); expect(layout.edge.length).toBeLessThanOrEqual(122); expect(layout.grains.length).toBeLessThanOrEqual(360);
    const thin = ward(concave.map(p => ({ x: p.x, z: p.z * 0.07 })));
    for (const node of layoutWard(thin).nodes) expect(inside(node.at, thin.points)).toBe(true);
  });
  it('shows concentration monotonically with finite visual limits', () => {
    const formation = ward(), levels = [0, 0.01, 0.1, 0.5, 1, 2, 100].map(multiplier => visualPower({ ...formation, power: { ...formation.power, multiplier } }));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    for (const value of levels) { expect(value).toBeGreaterThanOrEqual(0.15); expect(value).toBeLessThanOrEqual(1); }
    expect(levels[2]).toBeLessThan(levels[4]!);
  });
});
