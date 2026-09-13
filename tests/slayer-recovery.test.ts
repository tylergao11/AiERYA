import { describe, expect, it } from 'vitest';
import { random } from '../src/core/math';
import { World } from '../src/game/world';
import { ELEMENTS, type Wolf } from '../src/game/contracts';
import type { Fate } from '../src/game/roguelike';
import { ROGUE as B } from '../src/game/rogue-balance';

const line = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
const cleanup = [{ x: -6.5, z: 4 }, { x: -5.5, z: 4 }];
const wolf = (id = 900, z = 4, hp = 1): Wolf => ({ id, x: -6, z, hp, maxHp: hp, speed: 0, heading: 0, action: 'run', age: 0, attack: 0, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
function run(fate: Fate = 'slayer', debt = false) {
  const w = new World({ roguelike: true, random: random(42167) });
  expect(w.chooseDestiny({ serial: 1, fate, roots: ['metal'], tier: debt ? 'unusual' : 'ordinary', boon: debt ? 'debt' : fate === 'slayer' ? 'three' : fate === 'array' ? 'fivefold' : 'mimic' })).toBe(true);
  return w;
}
function begin(w = run()) { w.startWave(); w.selected = 'metal'; w.wolves = [wolf()]; return w; }
function learn(w: World, id: string) {
  w.phase = 'rest';
  for (let n = 0; n < 600; n++) if (w.build.rollOffers(w.health).some(r => r.id === id)) { w.chooseUpgrade(id); expect(w.build.level(id)).toBeGreaterThan(0); return; }
  throw Error(`Missing reward ${id}`);
}

describe('slayer kill-funded continuation', () => {
  it.each(ELEMENTS)('%s kills fund a shorter cleanup stroke before any natural recovery tick', element => {
    const w = begin(); w.selected = element; w.spirit = w.strokeCost(line);
    expect(w.invoke(line)).toBe(true); expect(w.kills).toBe(1);
    expect(w.spirit).toBeCloseTo(2.55); // .75 native income + 1.8 finite refund.
    expect(w.spirit).toBeGreaterThanOrEqual(w.strokeCost(cleanup)); expect(w.regeneration).toBe(B.slayer.regen);
    w.wolves.push(wolf(901)); expect(w.invoke(cleanup)).toBe(true); expect(w.kills).toBe(2);
    expect(w.spirit).toBeCloseTo(3); expect(w.spirit).toBeGreaterThanOrEqual(w.strokeCost(line));
  });
  it('credits every AOE victim once and the visible total equals the wallet and ledger increase', () => {
    const w = begin(); w.spirit = 3; w.wolves = Array.from({ length: 24 }, (_, i) => wolf(900 + i));
    const received: number[] = []; w.events.on('spiritRecovered', e => received.push(e.amount));
    const earned = w.ledger.earned;
    w.invoke(line); expect(w.kills).toBe(24); expect(received).toHaveLength(24);
    expect(w.spirit).toBeCloseTo(24 * .75 + 1.8);
    expect(received.reduce((a, b) => a + b, 0)).toBeCloseTo(w.spirit);
    expect(w.ledger.earned - earned).toBeCloseTo(w.spirit);
    for (const dead of w.wolves) w.hitRogue(dead, 100, 'metal', { kind: 'derived' });
    expect(received).toHaveLength(24); expect(w.kills).toBe(24);
  });
  it('delayed side slashes recover income even after the shared refund ticket is exhausted', () => {
    const w = begin(); w.spirit = 3; w.wolves = [wolf(), wolf(901, 1.9), wolf(902, 6.1)];
    w.invoke(line); expect(w.kills).toBe(1); expect(w.spirit).toBeCloseTo(2.55);
    w.mechanics.tick(.2); expect(w.kills).toBe(3); expect(w.spirit).toBeCloseTo(4.05);
  });
  it('AOE income and shared refunds stop at 100 without overstating recovery feedback', () => {
    const w = begin(); w.spirit = 100; w.wolves = Array.from({ length: 24 }, (_, i) => wolf(900 + i));
    const received: number[] = []; w.events.on('spiritRecovered', e => received.push(e.amount));
    expect(w.invoke(line)).toBe(true); expect(w.kills).toBe(24); expect(w.spirit).toBe(100);
    expect(w.ledger.spent).toBe(3); expect(w.ledger.earned).toBeCloseTo(3);
    expect(received.every(amount => amount > 0)).toBe(true);
    expect(received.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(3);
  });
  it('a burn kill carries the paid cast refund when the initial hit leaves the balance at zero', () => {
    const w = begin(); w.selected = 'fire'; w.spirit = 3; w.wolves = [wolf(900, 4, 33)];
    w.invoke(line); expect(w.kills).toBe(0); expect(w.spirit).toBe(0);
    w.tick(.5); expect(w.kills).toBe(1); expect(w.spirit).toBeCloseTo(2.55 + .5 * w.regeneration);
  });
  it('the zero-mana ultimate can kill to restart casting, while receiving no refund for free strokes', () => {
    const w = begin(); w.spirit = 0; w.wolves = [wolf(), wolf(901), wolf(902)];
    expect(w.startUltimate()).toBe(true); expect(w.queueUltimateStroke(line, 'metal', 1.2)).toBe(true);
    w.tick(3); w.tick(.28);
    expect(w.kills).toBe(3); expect(w.spirit).toBe(2.25); expect(w.slayerCombo.momentum).toBe(0);
    w.tick(.6); w.wolves.push(wolf(903)); expect(w.invoke(cleanup)).toBe(true);
  });
  it('heavy AOE kills get all base income but share one bounded extra refund', () => {
    const w = begin(); w.spirit = w.strokeCost(line, 1.2); w.wolves = [wolf(), wolf(901), wolf(902)];
    const received: number[] = []; w.events.on('spiritRecovered', e => received.push(e.amount));
    w.invoke(line, 1.2); expect(w.spirit).toBeCloseTo(2.25 + B.slayer.refundCap);
    expect(received).toEqual([2.75, 2.75, .75]);
  });
  it('summoned reinforcements neither grant income nor consume a refund intended for native wolves', () => {
    const w = begin(); w.spirit = 3; const summoned = { ...wolf(), summoned: true }; w.wolves = [summoned, wolf(901)];
    const received: number[] = []; w.events.on('spiritRecovered', e => received.push(e.amount));
    w.invoke(line); expect(w.kills).toBe(2); expect(w.spirit).toBeCloseTo(2.55); expect(received).toHaveLength(1);
  });
  it('income growth and its overdrive tradeoff apply to the slayer base, preserving other flow incomes', () => {
    const w = run(); learn(w, 'common-regen'); expect(w.killSpirit).toBeCloseTo(.975);
    learn(w, 'common-overdrive'); expect(w.killSpirit).toBeCloseTo(.78);
    expect(run('array').killSpirit).toBe(1); expect(run('spirit').killSpirit).toBe(1);
  });
  it('kill income repays overdraw rather than being discarded while the balance is negative', () => {
    const w = begin(run('slayer', true)); w.spirit = 0;
    expect(w.invoke(line)).toBe(true); expect(w.spirit).toBeCloseTo(-.45);
    expect(w.spirit).toBeGreaterThan(-w.strokeCost(line));
  });
});
