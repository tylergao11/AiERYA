import { describe, expect, it, vi } from 'vitest';
import { distance, type Point } from '../src/core/math';
import type { Wolf } from '../src/game/contracts';
import { NavigationField } from '../src/game/navigation';
import { CAMP, ENTRANCES } from '../src/game/terrain';
import { moveWolf, separateWolves, wolfClear, wolfGround, wolfSegmentClear, wolfSpawn } from '../src/game/wolf-collision';
import { staggerWolf, tickWolfMotion } from '../src/game/wolf-motion';
import { WOLF_KINDS, wolfKindForWave, wolfMotion, type WolfKind } from '../src/game/wolves';
import { World } from '../src/game/world';
import { wolfFrame } from '../src/render/wolf-frame';

const wolf = (at: Point = { x: -4, z: 3 }, kind: WolfKind = 'normal', id = 900): Wolf => ({
  ...at, id, kind, hp: 100, maxHp: 100, speed: 2.3, heading: -Math.PI / 2, action: 'run', age: 0,
  attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0,
  aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null,
});
const thinWall = () => {
  const world = new World(); world.selected = 'earth';
  expect(world.place([{ x: 0, z: 1 }, { x: 0.8, z: 1 }, { x: 0.8, z: 8 }, { x: 0, z: 8 }, { x: 0, z: 1 }])).toBe(true);
  return world.wards;
};
describe('wolf body navigation and collision', () => {
  it.each(['normal', 'elite', 'king'] as const)('%s reaches camp from every entrance without leaving valid ground', kind => {
    const nav = new NavigationField(); nav.rebuild(CAMP, []);
    for (const entrance of ENTRANCES) {
      const w = wolf(entrance, kind), bite = vi.fn();
      for (let i = 0; i < 2600 && !bite.mock.calls.length; i++) {
        tickWolfMotion(w, 1 / 60, nav, [], [w], CAMP, bite);
        expect(wolfGround(w, WOLF_KINDS[kind].radius)).toBe(true);
      }
      expect(bite).toHaveBeenCalled(); expect(distance(w, CAMP)).toBeLessThan(2.5);
    }
  });
  it.each(['normal', 'elite', 'king'] as const)('%s cannot tunnel through a thin wall or leave the clearing under large displacement', kind => {
    const wards = thinWall(), w = wolf({ x: -3, z: 4 }, kind);
    moveWolf(w, 15, 0, wards);
    expect(w.x).toBeLessThan(-WOLF_KINDS[kind].radius - 0.5);
    expect(wolfClear(w, WOLF_KINDS[kind].radius, wards)).toBe(true);
    moveWolf(w, -150, -120, wards);
    expect(wolfGround(w, WOLF_KINDS[kind].radius)).toBe(true);
  });
  it('prefers an open route around a soil wall and every preview segment keeps body clearance', () => {
    const wards = thinWall(), nav = new NavigationField(); nav.rebuild(CAMP, wards);
    const w = wolf({ x: 4, z: 4 }), bite = vi.fn();
    for (let i = 0; i < 2400 && distance(w, CAMP) > 2.5; i++) tickWolfMotion(w, 1 / 60, nav, wards, [w], CAMP, bite);
    expect(distance(w, CAMP)).toBeLessThan(2.5);
    const route = nav.route(ENTRANCES[1]!);
    expect(route.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < route.length; i++) expect(wolfSegmentClear(route[i - 1]!, route[i]!, 0.62)).toBe(true);
  });
  it('resolves coincident bodies and chooses unoccupied spawn positions', () => {
    const wolves = [wolf({ x: -3, z: 3 }, 'king', 900), wolf({ x: -3, z: 3 }, 'elite', 901), wolf({ x: -3, z: 3 }, 'normal', 902)];
    for (let i = 0; i < 8; i++) separateWolves(wolves, []);
    for (const a of wolves) for (const b of wolves) if (a !== b) expect(distance(a, b)).toBeGreaterThanOrEqual(WOLF_KINDS[a.kind!].radius + WOLF_KINDS[b.kind!].radius - 0.02);
    const at = wolfSpawn(wolves[0]!, 0.96, wolves, []);
    expect(at).not.toBeNull(); expect(wolves.every(w => distance(w, at!) >= 0.96 + WOLF_KINDS[w.kind!].radius)).toBe(true);
  });
});
describe('telegraphed attacks and hit interruption', () => {
  it('winds up and delivers one grounded bite before recovery, independently of vaulting', () => {
    const w = wolf({ x: CAMP.x + 2.6, z: CAMP.z + 0.4 }), nav = new NavigationField(), bite = vi.fn(); nav.rebuild(CAMP, []);
    const poses = new Set<string>(); let maxLift = 0;
    for (let i = 0; i < 62; i++) { tickWolfMotion(w, 1 / 60, nav, [], [w], CAMP, bite); poses.add(w.motion!.pose); maxLift = Math.max(maxLift, w.motion!.lift); if (i < 28) expect(bite).not.toHaveBeenCalled(); }
    expect([...poses]).toEqual(expect.arrayContaining(['windup', 'lunge', 'bite', 'recover']));
    expect(maxLift).toBe(0); expect(bite).toHaveBeenCalledTimes(1);
  });
  it('hit stun cancels the bite and repeated hits cannot restart stun indefinitely', () => {
    const w = wolf({ x: CAMP.x + 2, z: CAMP.z + 0.3 }), nav = new NavigationField(), bite = vi.fn(); nav.rebuild(CAMP, []);
    const m = wolfMotion(w); m.pose = 'lunge'; m.elapsed = 0.2; m.lift = 0;
    staggerWolf(w); expect(m.pose).toBe('stagger'); expect(m.lift).toBe(0);
    for (let i = 0; i < 15; i++) { staggerWolf(w); tickWolfMotion(w, 1 / 60, nav, [], [w], CAMP, bite); }
    expect(m.pose).not.toBe('stagger'); expect(bite).not.toHaveBeenCalled();
  });
  it('the king can finish attacks despite receiving a hit every second', () => {
    const w = wolf({ x: CAMP.x + 2, z: CAMP.z + 0.3 }, 'king'), nav = new NavigationField(), bite = vi.fn(); nav.rebuild(CAMP, []);
    for (let i = 0; i < 360; i++) { if (i % 60 === 0) staggerWolf(w); tickWolfMotion(w, 1 / 60, nav, [], [w], CAMP, bite); }
    expect(bite.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it('a soil ward damages a wolf touching its outer collision surface', () => {
    const world = new World(); world.selected = 'earth';
    world.place([{ x: -8, z: 1 }, { x: -4, z: 1 }, { x: -4, z: 5 }, { x: -8, z: 5 }, { x: -8, z: 1 }]);
    const w = wolf({ x: -9.2, z: 3 }); w.speed = 0; world.wolves = [w]; world.startWave(); world.tick(1 / 60);
    expect(wolfClear(w, 0.62, world.wards)).toBe(true); expect(w.hp).toBeLessThan(w.maxHp);
  });
  it('rooting and death cancel a grounded lunge and prevent a pending bite', () => {
    const w = wolf(CAMP), nav = new NavigationField(), bite = vi.fn(); nav.rebuild(CAMP, []);
    const m = wolfMotion(w); m.pose = 'lunge'; m.lift = 0; m.elapsed = 0.23; w.rooted = 2;
    tickWolfMotion(w, 1 / 60, nav, [], [w], CAMP, bite);
    expect(m.lift).toBe(0); expect(m.pose).toBe('run'); expect(bite).not.toHaveBeenCalled();
    w.action = 'dead'; w.age = 2; expect(wolfFrame(w)).toEqual({ row: 2, column: 3 });
    tickWolfMotion(w, 1, nav, [], [w], CAMP, bite); expect(bite).not.toHaveBeenCalled();
  });
  it('does not advance running frames when distance stays unchanged', () => {
    const w = wolf(); wolfMotion(w).stride = 2.2;
    expect(wolfFrame(w).column).toBe(2); w.age += 10; expect(wolfFrame(w).column).toBe(2);
  });
  it('teaches the caller in wave two and reserves the king for wave ten', () => {
    expect(Array.from({ length: 17 }, (_, i) => wolfKindForWave(1, i))).toEqual(Array(17).fill('normal'));
    expect(wolfKindForWave(2, 26)).toBe('elite');
    expect(Array.from({ length: 90 }, (_, i) => wolfKindForWave(3, i)).filter(k => k === 'king')).toHaveLength(0);
    expect(Array.from({ length: 360 }, (_, i) => wolfKindForWave(10, i)).filter(k => k === 'king')).toHaveLength(1);
    const world = new World(); world.wave = 2; world.startWave(); for (let i = 0; i < 90; i++) world.tick(1 / 60);
    expect(world.wolves[0]?.kind).toBe('normal');
  });
});
