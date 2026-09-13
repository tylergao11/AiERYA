import { describe, expect, it } from 'vitest';
import { Camera2D, ART } from '../src/render/projection';
import { CLEARING } from '../src/game/map';

const windowRect = { x: 0, y: 184, width: 320, height: 200 };
describe('optional Slayer close view keeps the whole playable ground reachable', () => {
  it('enlarges targets while keeping picking invertible after moving the view', () => {
    const c = new Camera2D(); c.resize(320, 568); const base = c.scale;
    c.navigate(windowRect, 1.85); c.panBy(68, -42);
    expect(c.scale / base).toBeCloseTo(1.85);
    for (const point of CLEARING) {
      const p = c.project(point), restored = c.unproject(p.x, p.y);
      expect(restored.x).toBeCloseTo(point.x, 8); expect(restored.z).toBeCloseTo(point.z, 8);
    }
  });
  it('can reach every clearing edge without exposing space outside the illustration', () => {
    const c = new Camera2D(); c.resize(320, 568); c.navigate(windowRect, 1.85);
    for (const point of CLEARING) {
      const p = c.project(point);
      c.panBy(160-p.x, 284-p.y);
      const moved = c.project(point);
      expect(moved.x).toBeGreaterThanOrEqual(0); expect(moved.x).toBeLessThanOrEqual(320);
      expect(moved.y).toBeGreaterThanOrEqual(184); expect(moved.y).toBeLessThanOrEqual(384);
      expect(c.offsetX).toBeLessThanOrEqual(0); expect(c.offsetX + ART.width*c.scale).toBeGreaterThanOrEqual(320);
      expect(c.offsetY).toBeLessThanOrEqual(184); expect(c.offsetY + ART.height*c.scale).toBeGreaterThanOrEqual(384);
    }
  });
  it('temporary special-move focus returns to the chosen view instead of the world centre', () => {
    const c = new Camera2D(); c.resize(320, 568); c.navigate(windowRect, 1.85); c.panBy(89,-54);
    const base = { scale:c.scale, x:c.offsetX, y:c.offsetY };
    c.focus({x:12,z:8},1.28,.5); expect(c.scale).toBeGreaterThan(base.scale);
    c.focus(null); expect(c.scale).toBeCloseTo(base.scale); expect(c.offsetX).toBeCloseTo(base.x); expect(c.offsetY).toBeCloseTo(base.y);
    c.navigate(null); expect(c.scale).toBe(.2); expect(c.offsetX).toBe(0); expect(c.offsetY).toBe(184);
  });
  it('keeps the viewport bounded and finite on resize and rejects invalid navigation', () => {
    const c = new Camera2D(); c.resize(390,844); c.navigate({x:0,y:290,width:390,height:365},1.85);
    c.panBy(Infinity,NaN); c.resize(844,390);
    const r=c.viewport!; expect(r.x+r.width).toBeLessThanOrEqual(844);expect(r.y+r.height).toBeLessThanOrEqual(390);
    expect([c.scale,c.offsetX,c.offsetY].every(Number.isFinite)).toBe(true);
    c.navigate({x:0,y:NaN,width:320,height:200},NaN); expect(c.viewport).toBeNull();
  });
});
