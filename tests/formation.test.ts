import { describe, expect, it, vi } from 'vitest';
import { inside, polygonsOverlap, type Point } from '../src/core/math';
import type { Element, WardCompanionSpawn, WardFormationContext, WardFormationEffect, Wolf } from '../src/game/contracts';
import { upgrades } from '../src/game/content';
import { World } from '../src/game/world';

const path = (vertices: number[][]): Point[] => vertices.map(([x, z]) => ({ x: x!, z: z! }));
const square = path([[-8, 1], [-4, 1], [-4, 5], [-8, 5], [-8, 1]]);
const otherSquare = square.map(p => ({ x: p.x + 6, z: p.z }));
const concave = path([[-8, 1], [-2, 1], [-2, 7], [-3.5, 7], [-3.5, 2.5], [-6.5, 2.5], [-6.5, 7], [-8, 7], [-8, 1]]);
const spawn: WardCompanionSpawn = { kind: 'test-spirit', attack: { damage: 10, interval: 1, range: 6 } };
const effect = (id = 'test-effect', element?: Element): WardFormationEffect => ({ id, element, plan: () => [spawn] });
const ready = (element: Element = 'metal'): World => {
  const world = new World(); world.selected = element; world.spirit = 80; return world;
};
const advance = (world: World, seconds: number) => { for (let i = 0; i < seconds * 60; i++) world.tick(1 / 60); };
const wolf = (id: number, at: Point, hp = 100): Wolf => ({
  id, ...at, hp, maxHp: hp, speed: 0, heading: 0, action: 'run', age: 0, attack: 1,
  hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null,
});

describe('closed formation transaction', () => {
  it('previews without running effects, then commits one ward and its units before events', () => {
    const world = ready(), planner = vi.fn(() => [spawn, spawn]);
    world.formationEffects.add({ id: 'pair', element: 'metal', plan: planner });
    const preview = world.previewPlacement(square);
    expect(preview).toMatchObject({ ok: true, area: 16, cost: 14 });
    expect(planner).not.toHaveBeenCalled(); expect(world.spirit).toBe(80);
    expect(world.wards).toHaveLength(0); expect(world.companions).toHaveLength(0);
    const events: string[] = [];
    world.events.on('ward', ({ ward, cost, area, phase }) => {
      events.push('ward'); expect(world.spirit).toBe(66);
      expect(world.companions.map(unit => unit.wardId)).toEqual([ward.id, ward.id]);
      expect({ cost, area, phase }).toEqual({ cost: 14, area: 16, phase: 'prepare' });
    });
    world.events.on('companionSpawned', () => events.push('unit'));
    expect(world.place(square)).toBe(true); expect(planner).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ward', 'unit', 'unit']);
    const ids = [world.wards[0]!.id, ...world.companions.map(unit => unit.id)];
    expect(new Set(ids).size).toBe(3);
    expect(planner.mock.calls[0]).toHaveLength(1);
  });

  it('does not charge or run effects for open, invalid, empty, overlapping or unaffordable drawings', () => {
    const world = ready(), planner = vi.fn(() => [spawn]);
    world.formationEffects.add({ id: 'one', plan: planner });
    expect(world.place(square.slice(0, -1))).toBe(false);
    expect(world.place(square.map((p, i) => i === 1 ? { x: NaN, z: p.z } : p))).toBe(false);
    expect(world.place(path([[-8, 1], [-6, 1], [-4, 1], [-8, 1]]))).toBe(false);
    world.spirit = 0; expect(world.place(square)).toBe(false);
    expect(planner).not.toHaveBeenCalled(); expect(world.companions).toHaveLength(0);
    world.spirit = 80; expect(world.place(square)).toBe(true);
    expect(world.place(square)).toBe(false); expect(planner).toHaveBeenCalledTimes(1);
    expect(world.spirit).toBe(66); expect(world.wards).toHaveLength(1);
  });

  it('rejects crossing polygons even if no vertex is inside the other polygon', () => {
    const horizontal = path([[-4, -0.1], [4, -0.1], [4, 0.1], [-4, 0.1]]);
    const vertical = path([[-0.1, -4], [0.1, -4], [0.1, 4], [-0.1, 4]]);
    expect(horizontal.some(p => inside(p, vertical))).toBe(false);
    expect(vertical.some(p => inside(p, horizontal))).toBe(false);
    expect(polygonsOverlap(horizontal, vertical)).toBe(true);
  });

  it.each([[2, 2, 14], [4, 5, 14], [4, 6, 14]])('preserves area and fixed investment after boundary sampling: %s by %s', (width, height, cost) => {
    const world = ready();
    const stroke = path([[-8, 1], [-8 + width!, 1], [-8 + width!, 1 + height!], [-8, 1 + height!], [-8, 1]]);
    expect(world.previewPlacement(stroke)).toMatchObject({ ok: true, area: width! * height!, cost });
  });

  it('rechecks resources at commit time instead of trusting an earlier preview', () => {
    const world = ready(), planner = vi.fn(() => [spawn]); world.formationEffects.add({ id: 'one', plan: planner });
    expect(world.previewPlacement(square).ok).toBe(true); world.spirit = 0;
    expect(world.place(square)).toBe(false); expect(planner).not.toHaveBeenCalled();
    expect(world.wards).toHaveLength(0); expect(world.companions).toHaveLength(0);
  });

  it('keeps the original concave boundary and gives effects an immutable detached snapshot', () => {
    const world = ready('water'); let received: WardFormationContext | undefined;
    world.formationEffects.add({ id: 'water-spirit', plan: context => { received = context; return [spawn]; } });
    expect(world.place(concave)).toBe(true);
    const ward = world.wards[0]!, unit = world.companions[0]!;
    expect(inside(unit, ward.points)).toBe(true); expect(inside({ x: -5, z: 5 }, ward.points)).toBe(false);
    expect(received!.ward.id).toBe(ward.id); expect(received!.ward.points).not.toBe(ward.points);
    expect(Object.isFrozen(received!.ward.points[0])).toBe(true);
    expect(Object.isFrozen(received!.ward.points)).toBe(true); expect(Object.isFrozen(received!.ward)).toBe(true);
    concave[0]!.x = -8.1;
    expect(ward.points[0]!.x).toBe(-8); concave[0]!.x = -8;
  });

  it.each([
    { ...spawn, at: { x: -5, z: 5 } },
    { ...spawn, attack: { damage: 10, interval: 0, range: 6 } },
  ])('rolls back all effects if one companion plan is invalid: %j', invalid => {
    const world = ready('water'); world.formationEffects.add(effect('valid'));
    world.formationEffects.add({ id: 'invalid', plan: () => [invalid] });
    const warnings: unknown[] = []; world.events.on('warning', event => warnings.push(event.cause));
    expect(world.place(concave)).toBe(false);
    expect(world.spirit).toBe(80); expect(world.wards).toHaveLength(0); expect(world.companions).toHaveLength(0);
    expect(warnings[0]).toBeInstanceOf(Error);
    world.formationEffects.remove('invalid'); expect(world.place(concave)).toBe(true);
    expect(world.wards[0]!.id).toBe(1); expect(world.companions[0]!.id).toBe(2);
  });

  it('isolates a throwing effect without spending energy or publishing formation events', () => {
    const world = ready(), formed = vi.fn(); world.events.on('ward', formed);
    world.formationEffects.add({ id: 'broken', plan: () => { throw new Error('broken content'); } });
    expect(world.place(square)).toBe(false); expect(formed).not.toHaveBeenCalled();
    expect(world.spirit).toBe(80); expect(world.companions).toHaveLength(0);
  });

  it('filters elements, replaces duplicate IDs and only applies new effects to future formations', () => {
    const world = ready(); expect(world.place(square)).toBe(true); expect(world.companions).toHaveLength(0);
    world.formationEffects.add(effect('water-only', 'water'));
    world.formationEffects.add({ id: 'replace', plan: () => [spawn, spawn] });
    world.formationEffects.add(effect('replace'));
    expect(world.place(otherSquare)).toBe(true); expect(world.companions).toHaveLength(1);
    expect(world.companions[0]!.wardId).toBe(world.wards[1]!.id);
    world.formationEffects.remove('replace'); expect(world.companions).toHaveLength(1);
  });
});

describe('persistent formation companions', () => {
  it('waits during preparation and attacks repeatedly on its own battle cooldown', () => {
    const world = ready(); world.formationEffects.add(effect()); expect(world.place(square)).toBe(true);
    // Outside metal ward reach, inside companion range: only the companion can hit.
    const target = wolf(900, { x: -6, z: 8 }); world.wolves = [target];
    const attacks = vi.fn(); world.events.on('companionAttack', attacks);
    advance(world, 2); expect(target.hp).toBe(100); expect(attacks).not.toHaveBeenCalled();
    world.startWave(); world.tick(1 / 60); expect(target.hp).toBe(77.5);
    advance(world, 0.5); expect(target.hp).toBe(77.5);
    advance(world, 0.55); expect(target.hp).toBe(55); expect(attacks).toHaveBeenCalledTimes(2);
    expect(world.kills).toBe(0); expect(world.companions).toHaveLength(1);
  });

  it('uses combat modifiers and normal death settlement, with no attacks after the game ends', () => {
    const world = ready(); world.formationEffects.add(effect()); world.place(square);
    world.stats.add({ id: 'strong', stat: 'damage', multiply: 2 });
    world.stats.add({ id: 'far', stat: 'range', multiply: 2 });
    const target = wolf(900, { x: -6, z: 10 }, 20); world.wolves = [target];
    world.startWave(); world.tick(1 / 60);
    expect(target.action).toBe('dead'); expect(world.kills).toBe(1);
    world.phase = 'won'; const survivor = wolf(901, { x: -6, z: 8 }); world.wolves = [survivor];
    advance(world, 3); expect(survivor.hp).toBe(100);
  });

  it('keeps companion identity through wave rest without spending attack cooldown', () => {
    const world = ready(); world.formationEffects.add(effect()); world.place(square);
    const target = wolf(900, { x: -6, z: 8 }); world.wolves = [target];
    world.startWave(); world.tick(1 / 60);
    const unit = world.companions[0]!, cooldown = unit.cooldown;
    world.phase = 'rest'; advance(world, 5);
    expect(world.companions[0]).toBe(unit); expect(unit.cooldown).toBe(cooldown); expect(target.hp).toBe(77.5);
    world.chooseUpgrade('clear-mind'); world.startWave(); advance(world, 1.1); expect(target.hp).toBe(55);
  });

  it('removes only the last ward and its own units on undo', () => {
    const world = ready(); world.formationEffects.add(effect()); world.place(square); world.place(otherSquare);
    const first = world.companions[0]!, last = world.companions[1]!;
    const removed: number[] = []; world.events.on('companionRemoved', event => {
      removed.push(event.id); expect(event.reason).toBe('undo');
      expect(world.companions.some(unit => unit.wardId === event.wardId)).toBe(false);
    });
    world.undo(); expect(world.companions).toEqual([first]); expect(removed).toEqual([last.id]);
    expect(world.spirit).toBeCloseTo(63.2);
  });

  it('cleans up units when wolves destroy the owning earth ward', () => {
    const world = ready('earth'); world.formationEffects.add(effect()); world.place(square);
    const ward = world.wards[0]!; ward.health = 12;
    const attacker = wolf(900, { x: -6, z: 3 }); attacker.speed = 2.3;
    world.wolves = [attacker]; const removed = vi.fn(); world.events.on('companionRemoved', removed);
    // The wall falls on a completed bite, after any companion hit interrupts.
    world.startWave(); advance(world, 2.5);
    expect(world.wards).toHaveLength(0); expect(world.companions).toHaveLength(0);
    expect(removed.mock.calls[0]![0]).toMatchObject({ wardId: ward.id, reason: 'destroyed' });
  });

  it('clears units and run-specific formation effects on reset', () => {
    const world = ready(); world.formationEffects.add(effect()); world.place(square);
    const removed = vi.fn(); world.events.on('companionRemoved', removed);
    world.reset(); expect(world.companions).toHaveLength(0); expect(world.wards).toHaveLength(0);
    expect(removed.mock.calls[0]![0]).toMatchObject({ reason: 'reset' });
    world.selected = 'metal'; world.spirit = 80; world.place(square);
    expect(world.companions).toHaveLength(0);
  });

  it('accepts a formation effect through the existing upgrade selection entry', () => {
    const world = ready(); world.phase = 'rest'; world.wave = 1;
    const findUpgrade = vi.spyOn(upgrades, 'find').mockReturnValue({
      id: 'test-upgrade', title: 'test', detail: 'test', modifiers: [], formationEffects: [effect()],
    });
    try { world.chooseUpgrade('test-upgrade'); } finally { findUpgrade.mockRestore(); }
    expect(world.phase).toBe('prepare'); expect(world.place(square)).toBe(true);
    expect(world.companions[0]!.effectId).toBe('test-effect:1');
  });
});
