import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateWardPower } from '../src/game/concentration';
import type { Ward } from '../src/game/contracts';
import { WardPainter } from '../src/render/wards';

vi.mock('../src/render/water', () => ({ WaterSurface: class { paint = vi.fn(); } }));
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const surfaces: { width: number; height: number }[] = [];
  function context(): CanvasRenderingContext2D {
    const state: Record<string, unknown> = { globalAlpha: 1 };
    return new Proxy(state, { get: (object, key: string) => object[key] ?? (() => {}), set: (object, key: string, value) => { object[key] = value; return true; } }) as unknown as CanvasRenderingContext2D;
  }
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} closePath() {} });
  vi.stubGlobal('document', { createElement: () => { const c = context(), canvas = { width: 0, height: 0, getContext: () => c }; surfaces.push(canvas); return canvas; } });
  const ward: Ward = { id: 1, element: 'water', x: 1, z: 1, points: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }],
    age: 1, radius: 2, charge: 0, pulse: 0, health: 80, maxHealth: 80, empowered: 0, suppressed: 0, power: calculateWardPower('water', 14, 4, 8) };
  return { painter: new WardPainter(), c: context(), ward, surfaces };
}

describe('water formation rendering budget', () => {
  it('rasterizes slow water motion at 30 Hz while composing at 60 Hz without changing the ward', () => {
    const { painter, c, ward, surfaces } = setup(), before = structuredClone(ward);
    const copies = vi.fn(); c.drawImage = copies;
    // Count work on the cached layer, rather than the visible canvas composites.
    const translate = vi.fn();
    painter.ground(c, [ward], 0);
    const layer = (surfaces[0] as HTMLCanvasElement).getContext('2d')!; layer.translate = translate;
    for (let frame = 1; frame < 60; frame++) painter.ground(c, [ward], frame / 60);
    expect(translate).toHaveBeenCalledTimes(29); expect(copies).toHaveBeenCalledTimes(60);
    expect(surfaces).toHaveLength(1); expect(ward).toEqual(before);
  });
  it('updates a changed state immediately and frees removed textures after the fade', () => {
    const { painter, c, ward, surfaces } = setup(); painter.ground(c, [ward], 0);
    const layer = (surfaces[0] as HTMLCanvasElement).getContext('2d')!, clear = vi.fn(); layer.clearRect = clear;
    painter.ground(c, [ward], .001); expect(clear).not.toHaveBeenCalled();
    ward.empowered = 5; painter.ground(c, [ward], .002); expect(clear).toHaveBeenCalledOnce();
    ward.power = { ...ward.power, multiplier: .01 }; painter.ground(c, [ward], .003); expect(clear).toHaveBeenCalledTimes(2);
    painter.retire(ward.id, .004, 'dismissed'); painter.ground(c, [], .1); expect(surfaces[0]!.width).toBeGreaterThan(0);
    painter.ground(c, [], 1); expect(surfaces[0]!.width).toBe(0);
  });
  it('invalidates on clock rewind and releases textures on scene disposal', () => {
    const { painter, c, ward, surfaces } = setup(); painter.ground(c, [ward], 10);
    const layer = (surfaces[0] as HTMLCanvasElement).getContext('2d')!, clear = vi.fn(); layer.clearRect = clear;
    painter.ground(c, [ward], 0); expect(clear).toHaveBeenCalledOnce();
    painter.clear(); expect(surfaces[0]!.width).toBe(0);
  });
  it('releases textures immediately when reset bypasses the removal animation', () => {
    const { painter, c, ward, surfaces } = setup(); painter.ground(c, [ward], 0);
    painter.retire(ward.id, .001, 'reset'); expect(surfaces[0]!.width).toBe(0);
  });
});
