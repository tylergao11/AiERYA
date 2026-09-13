import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import type { Wolf } from '../src/game/contracts';
import { SummonCommandArt } from '../src/render/summon-command-art';
import { toArt } from '../src/render/projection';

const wolf = (id: number, x = 0): Wolf => ({ id, x, z: 5, hp: 100, maxHp: 100, speed: 0, heading: 0, action: 'run', age: 0, attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
function setup() {
  const w = new World({ roguelike: true }); w.chooseDestiny({ serial: 1, fate: 'spirit', tier: 'ordinary', boon: 'twins', roots: ['water'] }); w.startWave();
  const target = wolf(900); w.wolves = [target];
  let pose = 0;
  const art = new SummonCommandArt(w, s => { const p = toArt(s); return { x: p.x + pose, y: p.y - 80 }; });
  return { w, art, target, pose: (value: number) => { pose = value; } };
}

describe('live command acknowledgements without advancing combat', () => {
  it('follows recipient position and visual pose, and drops removed spirits', () => {
    const { w, art, pose } = setup(), s = w.mechanics.spirits[0]!;
    const at = { x: 0, z: 4 }, points = [{ ...at }, { x: 4, z: 4 }];
    w.events.emit('summonOrder', { kind: 'infuse', at, points, element: 'water', spiritIds: [s.id] });
    const order = art.entries[0]!, start = art.recipientPoints(order)[0]!;
    s.x += 2; pose(12); at.x = 20; points[0]!.z = 30;
    expect(art.recipientPoints(order)[0]!.x).toBeCloseTo(start.x + 68);
    expect(order.at.x).toBe(0); expect(order.points![0]!.z).toBe(4);
    w.mechanics.spirits.splice(0, 1); expect(art.recipientPoints(order)).toEqual([]); art.dispose();
  });
  it('replaces abandoned target acknowledgements and bounds paid order bursts', () => {
    const { w, art, target } = setup(), next = wolf(901, 3); w.wolves.push(next);
    for (let i = 0; i < 20; i++) w.mechanics.commands.command(i % 2 ? next : target);
    expect(art.entries).toHaveLength(1); expect(art.target?.id).toBe(next.id);
    for (let i = 0; i < 20; i++) w.events.emit('summonOrder', { kind: 'infuse', at: target, element: 'fire', spiritIds: [] });
    expect(art.entries).toHaveLength(4);
    w.mechanics.commands.command({ x: -8, z: 9 }); expect(art.target).toBeNull();
    art.update(.65); expect(art.entries).toHaveLength(0); art.dispose();
  });
  it('keeps the ground marker planted and lifts only the target crest with a vault', () => {
    const { w, art, target } = setup(); w.mechanics.commands.command(target);
    target.motion = { pose: 'vault', elapsed: 0, stride: 0, lift: 40, landing: 0, immunity: 0, cooldown: 0, targetId: null, vaultCooldown: 0, vaultStagger: false };
    target.x = 3; const before = structuredClone(target); art.update(.1);
    expect(art.target?.at).toEqual(toArt(target)); expect(art.target?.lift).toBe(40); expect(target).toEqual(before);
    const hit = { at: target, targetId: target.id, amount: 10, element: 'water' as const, source: 'companion' as const, ongoing: false };
    w.events.emit('damage', { ...hit, ongoing: true }); expect(art.target?.hit).toBe(0);
    w.events.emit('damage', { ...hit, targetId: 901 }); expect(art.target?.hit).toBe(0);
    w.events.emit('damage', hit); expect(art.target?.hit).toBe(1);
    art.update(.17); expect(art.target?.hit).toBe(0); expect(target.hp).toBe(100); art.dispose();
  });
  it('releases a dead target at its last ground position, then clears on phase or disposal', () => {
    const { w, art, target } = setup(); w.mechanics.commands.command(target); target.action = 'dead'; w.events.emit('death', { wolf: target, element: 'water' });
    const at = toArt(target); target.x += 9; art.update(.12);
    expect(art.target?.dying).toBeCloseTo(.12); expect(art.target?.at).toEqual(at);
    art.update(.13); expect(art.target).toBeNull();
    target.action = 'run'; w.mechanics.commands.command(target); w.events.emit('phase', { phase: 'rest' }); expect(art.target).toBeNull(); expect(art.entries).toHaveLength(0);
    art.dispose(); w.mechanics.commands.command(target); expect(art.entries).toHaveLength(0);
  });
});
