import { describe, expect, it } from 'vitest';
import { elementState } from '../src/render/element-state';
import { strokeGeometry, strokePoint } from '../src/render/stroke';

describe('element state presentation', () => {
  it('uses actual status timers and prioritizes suppression until it expires', () => {
    const influence = { empowered: 4, suppressed: 2 };
    expect(elementState(influence)).toBe('weakened');
    influence.suppressed = 0; expect(elementState(influence)).toBe('enhanced');
    influence.empowered = 0; expect(elementState(influence)).toBe('normal');
    expect(influence).toEqual({ empowered: 0, suppressed: 0 });
  });
  it('keeps decoration density independent of pointer event rate', () => {
    const sparse = strokeGeometry([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    const dense = strokeGeometry(Array.from({ length: 1001 }, (_, x) => ({ x, y: 0 })));
    expect(dense.length).toBe(sparse.length); expect(dense.marks).toEqual(sparse.marks);
    expect(dense.marks.length).toBeLessThanOrEqual(36);
  });
  it('follows corners and clamps a direction cue to the real stroke', () => {
    const input = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], before = structuredClone(input);
    const geometry = strokeGeometry(input);
    expect(strokePoint(geometry, 125)).toEqual({ x: 100, y: 25, angle: Math.PI / 2 });
    expect(strokePoint(geometry, 999)).toEqual({ x: 100, y: 50, angle: Math.PI / 2 });
    expect(input).toEqual(before);
  });
  it('handles a stationary tip without invalid geometry', () => {
    const geometry = strokeGeometry([{ x: 3, y: 7 }, { x: 3, y: 7 }]);
    expect(geometry.marks).toHaveLength(0); expect(strokePoint(geometry, 0)).toEqual({ x: 3, y: 7, angle: 0 });
  });
});
