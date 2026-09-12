import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { StatModifiers } from '../src/game/stats';
import { distance, inside, type Point } from '../src/core/math';
import { CAMP, ROCKS } from '../src/game/terrain';

const circle = (x: number, z: number, r: number): Point[] => Array.from({ length: 49 }, (_, i) => ({ x: x + Math.cos(i / 48 * Math.PI * 2) * r, z: z + Math.sin(i / 48 * Math.PI * 2) * r }));
const advance = (world: World, seconds: number) => { for (let i = 0; i < seconds * 60; i++) world.tick(1 / 60); };

describe('drawing and elemental rules', () => {
  it('requires gathered energy and a simple closed region, without charging rejected input', () => {
    const world = new World(), path = circle(-5, 1, 2);
    expect(world.place(path)).toBe(false);
    world.gather('camp-fire'); expect(world.energy.fire).toBe(28);
    expect(world.place(path.slice(0, 25))).toBe(false); expect(world.energy.fire).toBe(28);
    expect(world.place(path)).toBe(true); expect(world.energy.fire).toBe(14); expect(world.wards).toHaveLength(1);
    expect(world.place(path)).toBe(false); expect(world.energy.fire).toBe(14);
  });
  it('rejects camp and rock enclosure without spending energy', () => {
    const world = new World(); world.energy.fire = 80;
    expect(world.place(circle(CAMP.x, CAMP.z, 4))).toBe(false);
    expect(world.place(circle(ROCKS[0]!.x, ROCKS[0]!.z, 3.2))).toBe(false);
    expect(world.energy.fire).toBe(80);
  });
  it('deduplicates terrain contacts and leaves no persistent ward after an open stroke', () => {
    const world = new World(); world.gather('camp-fire');
    const events: string[] = []; world.events.on('invoke', event => events.push(event.element));
    world.invoke([{ ...CAMP }, { x: CAMP.x + 0.6, z: CAMP.z + 0.2 }, { x: CAMP.x - 0.3, z: CAMP.z + 0.5 }]);
    expect(events).toEqual(['fire']); expect(world.energy.fire).toBe(24); expect(world.wards).toHaveLength(0);
    world.invoke([{ ...CAMP }, { x: CAMP.x + 0.6, z: CAMP.z + 0.2 }]); expect(world.energy.fire).toBe(24);
  });
  it('reads modified terrain, with independent charge recovery', () => {
    const world = new World(); world.energy.fire = 80;
    expect(world.place(circle(-5, 1, 2))).toBe(true);
    world.invoke([{ x: -7.5, z: 1 }, { x: -2.5, z: 1 }]);
    expect(world.wards[0]!.charge).toBe(0); expect(world.energy.fire).toBe(62);
    advance(world, 1); world.invoke([{ x: -7.5, z: 1 }, { x: -2.5, z: 1 }]); expect(world.energy.fire).toBe(62);
    advance(world, 4); expect(world.wards[0]!.charge).toBe(1);
  });
  it('resolves wood then fire as a combo in stroke order', () => {
    const world = new World(); world.energy.wood = world.energy.fire = 80;
    const events: boolean[] = []; world.events.on('invoke', event => events.push(event.combo));
    world.invoke([world.resources.find(r => r.element === 'wood')!, CAMP]);
    expect(events).toEqual([false, true]);
  });
  it('keeps a concave U-shaped formation and places its anchor inside its actual area', () => {
    const world = new World(); world.selected = 'water'; world.energy.water = 80;
    const path = [[-8,1],[-2,1],[-2,7],[-3.5,7],[-3.5,2.5],[-6.5,2.5],[-6.5,7],[-8,7],[-8,1]].map(([x,z]) => ({ x: x!, z: z! }));
    expect(world.place(path)).toBe(true);
    const ward = world.wards[0]!;
    expect(inside(ward, ward.points)).toBe(true);
    expect(inside({ x: -7.2, z: 5 }, ward.points)).toBe(true);
    expect(inside({ x: -5, z: 5 }, ward.points)).toBe(false);
    const wolf = (id: number, x: number) => ({ id, x, z: 5, hp: 100, maxHp: 100, speed: 0, heading: 0, action: 'run' as const, age: 0, attack: 1, hit: 0, burning: 0, rooted: 5, wet: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
    world.startWave(); world.wolves = [wolf(900, -7.2), wolf(901, -5)]; advance(world, 0.7);
    expect(world.wolves[0]!.hp).toBeLessThan(100);
    expect(world.wolves[1]!.hp).toBe(100);
  });
});

describe('routes, battle lifecycle and extension state', () => {
  it('all three entrances can reach camp through the natural routes', () => {
    const world = new World(); world.health = 10000; world.startWave(); advance(world, 65);
    expect(world.wolves).toHaveLength(12);
    expect(world.wolves.filter(wolf => distance(wolf, CAMP) > 3).map(wolf => ({ x: wolf.x, z: wolf.z }))).toEqual([]);
    expect(world.health).toBeLessThan(10000);
  });
  it('ends a failed defense and resets every persistent modifier and terrain state', () => {
    const world = new World(); world.startWave(); advance(world, 120); expect(world.phase).toBe('lost');
    world.stats.add({ id: 'external', stat: 'gather', multiply: 2 }); world.reset();
    expect(world.phase).toBe('prepare'); expect(world.wolves).toHaveLength(0); expect(world.wards).toHaveLength(0);
    expect(world.health).toBe(100); world.gather('camp-fire'); expect(world.energy.fire).toBe(28);
  });
  it('stacks external upgrades from base values and removes by identity', () => {
    const stats = new StatModifiers(); stats.add({ id: 'a', stat: 'damage', multiply: 1.2 }); stats.add({ id: 'b', stat: 'damage', element: 'fire', add: 5 });
    expect(stats.value('damage', 10, 'fire')).toBe(18); expect(stats.value('damage', 10, 'water')).toBe(12);
    stats.add({ id: 'a', stat: 'damage', multiply: 2 }); expect(stats.value('damage', 10, 'fire')).toBe(30);
    stats.remove('b'); expect(stats.value('damage', 10, 'fire')).toBe(20);
  });
});
