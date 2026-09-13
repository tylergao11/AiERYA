import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { Camera2D, ART, toArt } from '../src/render/projection';
import { SlayerCloseup, SLAYER_CLOSEUP } from '../src/render/slayer-closeup';
import { DrawingInput } from '../src/ui/input';
import type { SceneView } from '../src/render/view';
import type { GameInterface } from '../src/ui/interface';
import type { GameEvents } from '../src/game/contracts';

afterEach(() => vi.unstubAllGlobals());
const at = { x: -6, z: 4 };
const heavy: GameEvents['slayerStrike'] = { at, element: 'metal', level: 3, hits: 5, kills: 3, investment: 2.6, combo: 20, tier: 2, burst: 0 };
function setup(width = 1280, height = 720, reduced = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  const world = new World({ roguelike: true }); world.chooseDestiny({ serial: 1, fate: 'slayer', roots: ['metal'], tier: 'ordinary', boon: 'three' }); world.startWave();
  const closeup = new SlayerCloseup(world), camera = new Camera2D(); camera.resize(width, height);
  return { world, closeup, camera };
}

describe('interruptible slayer special-move closeups', () => {
  it('pushes into a finisher, returns on time, and preserves the player zoom', () => {
    const { world, closeup, camera } = setup(); camera.changeZoom(-220);
    const initial = { scale: camera.scale, x: camera.offsetX, y: camera.offsetY };
    try {
      world.events.emit('slayerFinisher', { at, element: 'metal', hits: 2 }); closeup.update(.1, camera);
      expect(camera.scale / initial.scale).toBeCloseTo(SLAYER_CLOSEUP.desktopZoom); expect(closeup.active).toBe(true);
      closeup.update(1, camera); expect(closeup.active).toBe(false);
      expect(camera.scale).toBe(initial.scale); expect(camera.offsetX).toBe(initial.x); expect(camera.offsetY).toBe(initial.y);
    } finally { closeup.dispose(); }
  });
  it('only promotes to a stronger shot, without restarting it for repeated special effects', () => {
    const { world, closeup, camera } = setup();
    try {
      world.events.emit('slayerStrike', heavy); closeup.update(.08, camera); const scale = camera.scale;
      world.events.emit('slayerFinisher', { at, element: 'metal', hits: 2 }); closeup.update(0, camera); expect(camera.scale).toBeCloseTo(scale);
      for (let i = 0; i < 30; i++) { world.events.emit('slayerFinisher', { at, element: 'metal', hits: 2 }); closeup.update(.02, camera); }
      expect(closeup.active).toBe(true);
      world.events.emit('slayerFinisher', { at, element: 'metal', hits: 2 }); closeup.update(.09, camera); expect(closeup.active).toBe(false);
    } finally { closeup.dispose(); }
  });
  it('leaves ordinary, empty and tiny strikes at the normal view', () => {
    const { world, closeup, camera } = setup(); const base = camera.scale;
    try {
      for (const e of [{ ...heavy, level: 0 }, { ...heavy, hits: 0 }, { ...heavy, kills: 2 }, { ...heavy, investment: .1 }]) {
        world.events.emit('slayerStrike', e); closeup.update(.1, camera); expect(closeup.active).toBe(false); expect(camera.scale).toBe(base);
      }
    } finally { closeup.dispose(); }
  });
  it('only frames a cross finisher when at least one target takes an unguarded hit', () => {
    const { world, closeup, camera } = setup(), base = camera.scale;
    try {
      for (const result of [{ hits: 0 }, { hits: 3, guarded: 3 }, {}]) {
        world.events.emit('slayerFinisher', { at, element: 'metal', ...result });
        closeup.update(.1, camera); expect(closeup.active).toBe(false); expect(camera.scale).toBe(base);
      }
      world.events.emit('slayerFinisher', { at, element: 'metal', hits: 3, guarded: 2 });
      closeup.update(.1, camera); expect(closeup.active).toBe(true); expect(camera.scale).toBeGreaterThan(base);
    } finally { closeup.dispose(); }
  });
  it('interrupts on drawing, phase transitions, reset and the time-stop ultimate', () => {
    const { world, closeup, camera } = setup(); const base = camera.scale;
    try {
      const trigger = () => { world.events.emit('slayerFinisher', { at, element: 'metal', hits: 2 }); closeup.update(.1, camera); expect(camera.scale).toBeGreaterThan(base); };
      trigger(); closeup.update(0, camera, true); expect(camera.scale).toBe(base);
      trigger(); world.events.emit('phase', { phase: 'rest' }); closeup.update(0, camera); expect(camera.scale).toBe(base);
      trigger(); world.events.emit('reset', undefined); closeup.update(0, camera); expect(camera.scale).toBe(base);
      trigger(); world.startUltimate(); closeup.update(.1, camera); expect(camera.scale).toBe(base);
      world.events.emit('slayerFinisher', { at, element: 'metal', hits: 2 }); expect(closeup.active).toBe(false);
    } finally { closeup.dispose(); }
  });
  it('keeps reduced-motion framing static and never changes combat state', () => {
    const { world, closeup, camera } = setup(1280, 720, true);
    const baseline = { scale: camera.scale, x: camera.offsetX, y: camera.offsetY }, state = [world.time, world.spirit, world.health, world.kills];
    try {
      world.events.emit('slayerFinisher', { at, element: 'metal', hits: 2 }); closeup.update(.15, camera);
      expect({ scale: camera.scale, x: camera.offsetX, y: camera.offsetY }).toEqual(baseline);
      expect([world.time, world.spirit, world.health, world.kills]).toEqual(state);
    } finally { closeup.dispose(); }
  });
  it.each([[390, 844], [844, 390], [320, 568], [667, 375], [568, 320]])('bounds mobile focus and keeps coordinate inversion exact at %s × %s', (width, height) => {
    const { world, closeup, camera } = setup(width, height), base = camera.scale;
    try {
      for (const point of [{ x: -19, z: -10 }, { x: 24, z: 17 }, at]) {
        closeup.cancel(); world.events.emit('slayerFinisher', { at: point, element: 'metal', hits: 2 }); closeup.update(.1, camera);
        expect(camera.scale / base).toBeCloseTo(SLAYER_CLOSEUP.mobileZoom);
        const projected = camera.project(point), back = camera.unproject(projected.x, projected.y);
        expect(back.x).toBeCloseTo(point.x, 8); expect(back.z).toBeCloseTo(point.z, 8);
        for (const [offset, size, extent] of [[camera.offsetX, width, ART.width * camera.scale], [camera.offsetY, height, ART.height * camera.scale]]) {
          expect(offset!).toBeGreaterThanOrEqual(Math.min(0, size! - extent!) - 1e-8);
          expect(offset!).toBeLessThanOrEqual(Math.max(0, size! - extent!) + 1e-8);
        }
      }
    } finally { closeup.dispose(); }
  });
  it('restores normal targeting before the very first point of a new gesture is picked', () => {
    vi.stubGlobal('window', new EventTarget());
    const { world, closeup, camera } = setup();
    const target = camera.project(at), end = camera.project({ x: at.x + 4, z: at.z });
    const canvas = Object.assign(new EventTarget(), { setPointerCapture: vi.fn() });
    const order: string[] = [];
    const view = { canvas, beginStroke: () => { order.push('restore'); closeup.cancel(); camera.focus(null); }, pick: (x: number, y: number) => { order.push('pick'); return camera.unproject(x, y); }, preview: vi.fn(), previewRemoval: vi.fn() } as unknown as SceneView;
    const input = new DrawingInput(world, view, { blocked: false, removing: false } as GameInterface);
    const draw = vi.spyOn(world, 'invoke');
    try {
      world.events.emit('slayerFinisher', { at, element: 'metal', hits: 2 }); closeup.update(.1, camera);
      for (const [type, point] of [['pointerdown', target], ['pointerup', end]] as const) canvas.dispatchEvent(Object.assign(new Event(type), { button: 0, pointerId: 1, clientX: point.x, clientY: point.y }));
      expect(order.slice(0, 2)).toEqual(['restore', 'pick']); expect(draw).toHaveBeenCalledOnce();
      expect(draw.mock.calls[0]![0][0]!.x).toBeCloseTo(at.x); expect(draw.mock.calls[0]![0][0]!.z).toBeCloseTo(at.z);
      expect(closeup.active).toBe(false);
    } finally { input.dispose(); closeup.dispose(); }
  });
  it('disposal removes the event listeners and rejects invalid focus positions', () => {
    const { world, closeup, camera } = setup();
    world.events.emit('slayerFinisher', { at: { x: NaN, z: 1 }, element: 'metal', hits: 2 }); closeup.update(.1, camera); expect(closeup.active).toBe(false);
    closeup.dispose(); world.events.emit('slayerFinisher', { at, element: 'metal', hits: 2 }); expect(closeup.active).toBe(false);
    const point = camera.unproject(toArt(at).x * camera.scale + camera.offsetX, toArt(at).y * camera.scale + camera.offsetY); expect(point.x).toBeCloseTo(at.x);
  });
});
