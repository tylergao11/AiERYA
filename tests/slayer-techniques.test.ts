import { describe, expect, it, vi } from 'vitest';
import { random } from '../src/core/math';
import { World } from '../src/game/world';
import type { Wolf } from '../src/game/contracts';
import { pureSlayer } from '../src/game/slayer-combo';
import { planCombatStroke } from '../src/game/combat';
import { rewardExample } from '../src/ui/reward-examples';
import { REWARDS } from '../src/game/roguelike';
import { ECONOMY } from '../src/game/economy';

const line = [{ x: -8, z: 4 }, { x: -4, z: 4 }], cross = [{ x: -6, z: 2 }, { x: -6, z: 6 }];
const victim = (id = 900, z = 4): Wolf => ({ id, x: -6, z, hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0, attack: 0, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
function setup() {
  const w = new World({ roguelike: true, random: random(42167) });
  w.chooseDestiny({ serial: 1, fate: 'slayer', roots: ['metal'], boon: 'three', tier: 'ordinary' }); return w;
}
function learn(w: World, id: string) {
  w.phase = 'rest';
  for (let n = 0; n < 600; n++) if (w.build.rollOffers(w.health).some(r => r.id === id)) { w.chooseUpgrade(id); expect(w.phase).toBe('prepare'); return; }
  throw Error(`Missing reward ${id}`);
}
function begin(w: World) { w.startWave(); w.selected = 'metal'; w.wolves = [victim()]; }

describe('coherent slayer reward routes', () => {
  it('reports resolved return contacts, guarded targets and distinct actual damage', () => {
    const w=setup();learn(w,'slayer-return');begin(w);w.wolves.push(victim(901));
    w.invoke(line,.8);w.wolves[0]!.eliteSkill='guard';
    const returns=vi.fn(),damage=vi.fn();w.events.on('slayerReturn',returns);w.events.on('damage',damage);
    w.invoke(cross);w.mechanics.tick(.1);
    expect(returns).toHaveBeenCalledOnce();
    const result=returns.mock.calls[0]![0];
    expect(result.hits).toBe(2);expect(result.guarded).toBe(1);expect(result.contacts).toHaveLength(1);
    expect(result.points[0]).toEqual(line.at(-1));expect(result.direction.x).toBe(-1);
    expect(damage.mock.calls.filter(([e])=>e.returning).map(([e])=>e.targetId)).toEqual([900,901]);
    expect(damage.mock.calls.some(([e])=>!e.returning)).toBe(true);
  });
  it('reports an empty return and scales presentation investment to the paid crossing', () => {
    const w=setup();learn(w,'slayer-return');begin(w);w.invoke(line,1.2);
    const returns=vi.fn();w.events.on('slayerReturn',returns);
    w.invoke([{x:-6,z:3.8},{x:-6,z:4.2}]);w.wolves=[];w.mechanics.tick(.1);
    const result=returns.mock.calls[0]![0];
    expect(result.hits).toBe(0);expect(result.guarded).toBe(0);expect(result.contacts).toEqual([]);
    expect(result.investment).toBeCloseTo(.1);
  });
  it('reports every actually exploited target once, while preserving the paid follow-up damage', () => {
    const w = setup(); learn(w, 'slayer-focus'); begin(w); w.wolves.push(victim(901));
    const strike = vi.fn(), damage = vi.fn(); w.events.on('slayerStrike', strike); w.events.on('damage', damage);
    w.invoke(line, 1.2); expect(strike.mock.calls.at(-1)![0].openings).toBeUndefined();
    const hp = w.wolves.map(v => v.hp); damage.mockClear(); w.invoke(line);
    expect(strike.mock.calls.at(-1)![0].openings).toHaveLength(2);
    expect(damage.mock.calls.filter(([e]) => e.opening).map(([e]) => e.targetId)).toEqual([900, 901]);
    expect(hp[0]! - w.wolves[0]!.hp).toBeCloseTo(42 * 1.2 * 1.3);
    expect(hp[1]! - w.wolves[1]!.hp).toBeCloseTo(42 * 1.2 * 1.3 / 2);
    w.invoke(line); expect(strike.mock.calls.at(-1)![0].openings).toBeUndefined();
  });
  it('keeps guarded targets out of pursuit celebrations without cancelling other targets', () => {
    const w = setup(); learn(w, 'slayer-focus'); begin(w); w.wolves[0]!.eliteSkill = 'guard'; w.wolves.push(victim(901));
    const strike = vi.fn(), damage = vi.fn(); w.events.on('slayerStrike', strike); w.events.on('damage', damage);
    w.invoke(line, 1.2); damage.mockClear(); w.invoke(line);
    expect(strike.mock.calls.at(-1)![0].guarded).toBe(1);
    expect(strike.mock.calls.at(-1)![0].openings).toHaveLength(1);
    expect(damage.mock.calls.filter(([e]) => e.opening).map(([e]) => e.targetId)).toEqual([901]);
    expect(w.slayerTechniques.openings.size).toBe(0);
  });
  it('quick paid hits accelerate the next held charge without making a quick swipe charge itself', () => {
    const w = setup(); for (let i = 0; i < 3; i++) learn(w, 'slayer-edge'); begin(w);
    for (let i = 0; i < 3; i++) w.invoke(line);
    expect(w.slayerTechniques.initiative).toBeCloseTo(.6);
    expect(w.quoteStroke(line, 0)!.stroke.charge).toBe(0);
    expect(w.quoteStroke(line, .1)!.stroke.charge).toBe(0);
    expect(w.quoteStroke(line, .6)!.stroke.charge).toBe(3);
    expect(w.quoteStroke(line, .6)!.cost).toBeCloseTo(ECONOMY.strokePrice * 2.6);
    w.invoke(line, .6); expect(w.slayerTechniques.initiative).toBe(0);
  });
  it('tiny strokes scale initiative down, and empty strokes do not build it', () => {
    const w = setup(); learn(w, 'slayer-edge'); begin(w);
    w.invoke([{ x: -6.2, z: 4 }, { x: -5.8, z: 4 }]); expect(w.slayerTechniques.initiative).toBeCloseTo(.01);
    w.wolves = []; w.invoke(line); expect(w.slayerTechniques.initiative).toBeCloseTo(.01);
    w.slayerCombo.clear(); w.slayerTechniques.tick(.01); expect(w.slayerTechniques.initiative).toBe(0);
  });
  it('a heavy hit leaves one return path, crossing it triggers one paid-scaled reverse stroke', () => {
    const w = setup(); learn(w, 'slayer-return'); begin(w);
    w.invoke(line, .8); expect(w.slayerTechniques.returnCut).not.toBeNull();
    const saved = w.slayerTechniques.returnCut!, events = vi.fn(); w.events.on('slayerReturn', events);
    w.invoke(cross); expect(w.slayerTechniques.returnCut).toBeNull();
    w.mechanics.tick(.1); expect(events).toHaveBeenCalledOnce();
    w.invoke(cross); w.mechanics.tick(.1); expect(events).toHaveBeenCalledOnce();
    expect(saved.stroke.points[0]).toEqual(line[0]);
  });
  it('a tiny crossing cannot replay the full previous heavy attack', () => {
    const w = setup(); learn(w, 'slayer-return'); begin(w); w.invoke(line, 1.2);
    const input = planCombatStroke([{ x: -6, z: 3.8 }, { x: -6, z: 4.2 }])!;
    const result = w.slayerTechniques.after(input, 'metal', w.mechanics.beginCast(false, 1, .1), new Set([900]))!;
    expect(result.stroke.multiplier).toBeCloseTo(.05); expect(result.stroke.direction.x).toBe(-1);
  });
  it('full charge marks all hit survivors; each mark boosts one paid quick hit only', () => {
    const w = setup(); learn(w, 'slayer-focus'); begin(w); w.wolves.push(victim(901));
    w.invoke(line, 1.2); expect(w.slayerTechniques.openings.size).toBe(2);
    const hp = w.wolves.map(v => v.hp); w.invoke(line);
    expect(hp[0]! - w.wolves[0]!.hp).toBeCloseTo(42 * 1.2 * 1.3);
    expect(hp[1]! - w.wolves[1]!.hp).toBeCloseTo(42 * 1.2 * 1.3 / 2);
    expect(w.slayerTechniques.openings.size).toBe(0);
    const next = w.wolves[0]!.hp; w.invoke(line); expect(next - w.wolves[0]!.hp).toBeCloseTo(42 * 1.2);
  });
  it('echoes cannot spend openings; marks and return paths expire and clear on reset', () => {
    const w = setup(); learn(w, 'slayer-focus'); learn(w, 'slayer-return'); begin(w); w.invoke(line, 1.2);
    expect(w.slayerTechniques.openingPower(900, { kind: 'derived' })).toBe(1); expect(w.slayerTechniques.openings.size).toBe(1);
    w.slayerTechniques.tick(3.01); expect(w.slayerTechniques.openings.size).toBe(0); expect(w.slayerTechniques.returnCut).toBeNull();
    w.invoke(line, 1.2); w.reset(); expect(w.slayerTechniques.openings.size).toBe(0); expect(w.slayerTechniques.returnCut).toBeNull();
  });
  it('each redesigned card describes the actual trigger and a visible follow-up', () => {
    for (const id of ['slayer-edge', 'slayer-return', 'slayer-focus']) {
      const d = REWARDS.find(r => r.id === id)!;
      const e = rewardExample({ ...d, tag: '', detail: d.detail(1), level: 1 });
      expect(e.result.length).toBeLessThan(40); expect(e.steps).toHaveLength(2);
    }
  });
});

describe('pure slayer set', () => {
  it('common, element and reaction rewards preserve the set, while dormant foreign talents break it', () => {
    const w = setup(); expect(pureSlayer(w.build)).toBe(true);
    for (const id of ['common-regen', 'root-metal-pursuit', 'reaction-forge', 'slayer-edge']) { learn(w, id); expect(pureSlayer(w.build)).toBe(true); }
    learn(w, 'array-density'); expect(w.build.is('array')).toBe(false); expect(pureSlayer(w.build)).toBe(false);
  });
  it('two slayer birth talents preserve the set; mixed births and acquired opportunities break it', () => {
    const a = setup(); a.build.beginPair([{ serial: 1, fate: 'slayer', roots: ['metal'], tier: 'ordinary', boon: 'three' }, { serial: 2, fate: 'slayer', roots: ['fire'], tier: 'ordinary', boon: 'scar' }]);
    expect(pureSlayer(a.build)).toBe(true);
    const b = setup(); b.build.beginPair([{ serial: 1, fate: 'slayer', roots: ['metal'], tier: 'ordinary', boon: 'three' }, { serial: 2, fate: 'array', roots: ['fire'], tier: 'ordinary', boon: 'twinArray' }]);
    expect(pureSlayer(b.build)).toBe(false); learn(a, 'opportunity-twins'); expect(pureSlayer(a.build)).toBe(false);
  });
  it('spending banked momentum in a full charged hit releases a perpendicular AOE exactly once', () => {
    const w = setup(); begin(w); w.wolves.push(victim(901, 7.2));
    w.slayerCombo.hit(2, 3, 0);
    const special = vi.fn(); w.events.on('slayerFinisher', special);
    w.invoke(line, 1.2); expect(w.wolves[1]!.hp).toBe(10000);
    w.mechanics.tick(.1); expect(special).toHaveBeenCalledOnce(); expect(w.wolves[1]!.hp).toBeLessThan(10000);
    expect(special.mock.calls[0]![0].hits).toBe(2);
    w.mechanics.tick(.3); expect(special).toHaveBeenCalledOnce();
  });
  it('reports no impact when targets have died before the delayed cross-cut lands', () => {
    const w = setup(); begin(w); w.slayerCombo.hit(2, 3, 0);
    const special = vi.fn(); w.events.on('slayerFinisher', special);
    w.invoke(line, 1.2); w.wolves = []; w.mechanics.tick(.1);
    expect(special).toHaveBeenCalledOnce(); expect(special.mock.calls[0]![0].hits).toBe(0);
  });
  it('no set finisher from an empty slash, uncharged slash, insufficient momentum or a foreign talent', () => {
    for (const variant of ['miss', 'quick', 'empty-bank', 'mixed']) {
      const w = setup(); if (variant === 'mixed') learn(w, 'spirit-might'); begin(w);
      if (variant !== 'empty-bank') w.slayerCombo.hit(2, 3, 0);
      if (variant === 'miss') w.wolves = [];
      const special = vi.fn(); w.events.on('slayerFinisher', special);
      w.invoke(line, variant === 'quick' ? 0 : 1.2); w.mechanics.tick(.2); expect(special).not.toHaveBeenCalled();
    }
  });
});
