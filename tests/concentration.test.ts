import { describe, expect, it } from 'vitest';
import type { Point } from '../src/core/math';
import { CONCENTRATION, calculateWardPower } from '../src/game/concentration';
import type { Element, Wolf } from '../src/game/contracts';
import { World } from '../src/game/world';

const rectangle = (width: number, height = width, x = -6, z = 4): Point[] => [
  { x: x - width / 2, z: z - height / 2 }, { x: x + width / 2, z: z - height / 2 },
  { x: x + width / 2, z: z + height / 2 }, { x: x - width / 2, z: z + height / 2 },
  { x: x - width / 2, z: z - height / 2 },
];
const enemy = (x = -6, z = 4): Wolf => ({
  id: 900, x, z, hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0,
  attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0,
  vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null,
});
function formation(element: Element, width = 4, height = width, investment = 14): World {
  const world = new World(); world.selected = element; world.spirit = 80;
  expect(world.place(rectangle(width, height), investment)).toBe(true);
  return world;
}
function pulse(world: World, target = enemy()): Wolf {
  world.wolves = [target]; world.startWave(); world.wards[0]!.pulse = 0; world.tick(1 / 60); return target;
}

describe('investment and concentration', () => {
  it('allows a formation beyond the old area limit without charging more spirit', () => {
    const world = new World(); world.spirit = 14;
    const drawing = rectangle(16, 16, -2, 5);
    expect(world.previewPlacement(drawing)).toMatchObject({ ok: true, area: 256, cost: 14 });
    expect(world.place(drawing)).toBe(true); expect(world.spirit).toBe(0);
    expect(world.wards[0]!.power.multiplier).toBeCloseTo(36 / 256);
  });

  it('dilutes the same investment in inverse proportion to area and exposes it to effects', () => {
    const small = formation('fire'), large = formation('fire', 8);
    expect(small.wards[0]!.power.multiplier).toBe(2.25);
    expect(large.wards[0]!.power.multiplier).toBe(0.5625);
    expect(small.spirit).toBe(large.spirit);
    const world = new World(); world.spirit = 80;
    let concentration = 0;
    world.formationEffects.add({ id: 'reader', plan: context => {
      concentration = context.ward.power.concentration;
      expect(Object.isFrozen(context.ward.power)).toBe(true); return [];
    } });
    world.place(rectangle(8)); expect(concentration).toBe(14 / 64);
  });

  it('increases power with actual investment and refunds eighty percent of that investment', () => {
    const world = formation('earth', 4, 4, 28);
    expect(world.spirit).toBe(52); expect(world.wards[0]!.maxHealth).toBe(360);
    expect(world.wards[0]!.power.multiplier).toBe(3);
    world.undo(); expect(world.spirit).toBeCloseTo(74.4);
    const cheap = formation('fire', 4, 4, 1); cheap.undo(); expect(cheap.spirit).toBeCloseTo(79.8);
  });

  it.each([0, -1, NaN, Infinity, 1.5, 81])('rejects an invalid or unaffordable investment: %s', investment => {
    const world = new World(); world.spirit = 80;
    expect(world.place(rectangle(4), investment)).toBe(false);
    expect(world.spirit).toBe(80); expect(world.wards).toHaveLength(0);
  });

  it('accepts tiny valid shapes while capping their concentration through minimum effective size', () => {
    const small = formation('fire', 1), tiny = formation('fire', 0.25);
    expect(small.wards[0]!.power.multiplier).toBe(4); expect(tiny.wards[0]!.power.multiplier).toBe(4);
    const smallWall = formation('earth', 1), tinyWall = formation('earth', 0.25);
    expect(smallWall.wards[0]!.maxHealth).toBe(480); expect(tinyWall.wards[0]!.maxHealth).toBe(480);
  });

  it('supports run-local concentration modifiers without spending extra spirit', () => {
    const world = new World(); world.spirit = 80;
    world.stats.add({ id: 'focus', stat: 'concentration', element: 'fire', multiply: 2 });
    expect(world.place(rectangle(4))).toBe(true);
    expect(world.wards[0]!.power.multiplier).toBe(4.5); expect(world.spirit).toBe(66);
    world.reset(); world.spirit = 80; world.place(rectangle(4));
    expect(world.wards[0]!.power.multiplier).toBe(2.25);
  });

  it('uses actual wall length so a long thin wall cannot exploit small enclosed area', () => {
    const square = formation('earth'), longWall = formation('earth', 16, 1), largeSquare = formation('earth', 8);
    expect(square.wards[0]!.power.area).toBe(longWall.wards[0]!.power.area);
    expect(square.wards[0]!.maxHealth).toBe(180); expect(largeSquare.wards[0]!.maxHealth).toBe(90);
    expect(longWall.wards[0]!.maxHealth).toBeCloseTo(120 * 24 / 34);
    expect(longWall.wards[0]!.maxHealth).toBeLessThan(square.wards[0]!.maxHealth);
  });

  it('keeps the same concentration for equal-area non-earth shapes', () => {
    expect(calculateWardPower('water', 14, 16, 16).multiplier).toBe(calculateWardPower('water', 14, 16, 34).multiplier);
  });
});

describe('concentration in actual combat', () => {
  it.each(['fire', 'metal', 'wood', 'water'] as const)('scales %s pulse damage and preserves attack frequency', element => {
    const small = formation(element), large = formation(element, 8);
    const a = pulse(small), b = pulse(large);
    expect(a.maxHp - a.hp).toBeCloseTo((b.maxHp - b.hp) * 4);
    expect(small.wards[0]!.pulse).toBe(large.wards[0]!.pulse);
  });

  it('scales both initial fire damage and ongoing burn, including flat damage upgrades', () => {
    const small = formation('fire'), large = formation('fire', 8);
    for (const world of [small, large]) world.stats.add({ id: 'flat', stat: 'damage', add: 5 });
    const a = pulse(small), b = pulse(large);
    expect(a.burnDps).toBe(38.25); expect(b.burnDps).toBe(9.5625);
    const beforeA = a.hp, beforeB = b.hp;
    small.wards[0]!.pulse = large.wards[0]!.pulse = 100;
    small.tick(0.5); large.tick(0.5);
    expect(beforeA - a.hp).toBeCloseTo(19.125); expect(beforeB - b.hp).toBeCloseTo(4.78125);
  });

  it('scales wood binding and water slowing, with bounded high-concentration control', () => {
    const wood = pulse(formation('wood')), broadWood = pulse(formation('wood', 8));
    expect(wood.rooted + 1 / 60).toBeCloseTo(1.5);
    expect(broadWood.rooted + 1 / 60).toBeCloseTo(1.1 * 0.5625);
    const water = pulse(formation('water')), broadWater = pulse(formation('water', 8));
    expect(water.slowAmount).toBeCloseTo(0.8); expect(broadWater.slowAmount).toBeCloseTo(0.6 * 0.5625);
    expect(pulse(formation('water', 0.25, 0.25, 80)).slowAmount).toBe(CONCENTRATION.maxSlowAmount);
    expect(pulse(formation('wood', 0.25, 0.25, 80)).rooted).toBeCloseTo(CONCENTRATION.maxRootSeconds - 1 / 60);
  });

  it.each(['fire', 'water'] as const)('does not refresh a strong %s status using a weaker formation', element => {
    const world = new World(); world.selected = element; world.spirit = 80;
    world.place(rectangle(4, 4, -8, 4)); world.place(rectangle(8, 8, 3, 5));
    const target = enemy(-8, 4); world.wolves = [target]; world.startWave();
    world.wards[0]!.pulse = 0; world.tick(0.01);
    const duration = element === 'fire' ? target.burning : target.wet;
    target.x = 3; target.z = 5; world.wards[0]!.pulse = 100; world.wards[1]!.pulse = 0;
    world.tick(0.1);
    expect(element === 'fire' ? target.burning : target.wet).toBeCloseTo(duration - 0.1);
    expect(element === 'fire' ? target.burnDps : target.slowAmount).toBeCloseTo(element === 'fire' ? 27 : 0.8);
    world.wards.forEach(ward => { ward.pulse = 100; }); world.tick(3);
    expect(element === 'fire' ? target.burnDps : target.slowAmount).toBe(0);
  });

  it.each(['fire', 'metal', 'wood', 'water'] as const)('does not give a tiny %s formation free reach outside its shape', element => {
    const target = pulse(formation(element, 0.5), enemy(-5.6, 4));
    expect(target.hp).toBe(target.maxHp); expect(target.burning + target.rooted + target.wet).toBe(0);
  });

  it('bases combat stroke power on the stroke instead of an unrelated ward area', () => {
    const small = formation('metal'), large = formation('metal', 8);
    const a = enemy(), b = enemy(); small.wolves = [a]; large.wolves = [b];
    const stroke = [{ x: -6, z: 4 }, { x: -5, z: 4 }];
    small.startWave(); large.startWave(); small.invoke(stroke); large.invoke(stroke);
    expect(a.maxHp - a.hp).toBeCloseTo(4);
    expect(a.maxHp - a.hp).toBeCloseTo(b.maxHp - b.hp);
    expect(small.spirit).toBe(63); expect(large.spirit).toBe(63);
  });

  it('repairs earth through fire generation, capped at its concentration-based maximum', () => {
    const world = formation('earth', 16, 1); const ward = world.wards[0]!;
    ward.health = 5;
    world.startWave(); world.selected = 'fire'; world.invoke([{ x: -6, z: 4 }, { x: -5, z: 4 }]);
    expect(ward.health).toBeCloseTo(5 + ward.maxHealth * 0.2 * .25); expect(ward.health).toBeLessThanOrEqual(ward.maxHealth);
  });

  it('keeps an unpowered stroke from applying full-strength elemental control', () => {
    const world = new World(); world.selected = 'wood'; world.spirit = 0; const target = enemy(); world.wolves = [target]; world.startWave();
    world.invoke([{ x: -7, z: 4 }, { x: -5, z: 4 }]);
    expect(target.hp).toBe(target.maxHp); expect(target.rooted).toBe(0);
  });

  it('shares the companion attack budget and dilutes it with the owning formation', () => {
    const attack = (width: number, count: number) => {
      const world = new World(); world.selected = 'metal'; world.spirit = 80;
      world.formationEffects.add({ id: 'pets', plan: () => Array.from({ length: count }, () => ({ kind: 'test-spirit', attack: { damage: 10, interval: 1, range: 20 } })) });
      world.place(rectangle(width));
      const target = enemy(-6, 10); world.wolves = [target]; world.startWave(); world.tick(1 / 60);
      return { damage: target.maxHp - target.hp, world };
    };
    const single = attack(4, 1), pair = attack(4, 2), broad = attack(8, 2);
    expect(single.damage).toBe(22.5); expect(pair.damage).toBe(22.5); expect(broad.damage).toBe(5.625);
    expect(pair.world.companions.map(unit => unit.powerShare)).toEqual([0.5, 0.5]);
  });
});
