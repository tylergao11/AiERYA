import { describe, expect, it, vi } from 'vitest';
import { random } from '../src/core/math';
import { BirthDraft } from '../src/game/birth-draft';
import { ELEMENTS, type Wolf } from '../src/game/contracts';
import { REWARDS, RunBuild, destinyBoons, destinyName, validDestiny, type Boon } from '../src/game/roguelike';
import { World } from '../src/game/world';

function mixed(boons: readonly Boon[]): World {
  const world = new World({ roguelike: true, random: random(7326) }), draft = world.birthDraft;
  for (let n = 0; !boons.every(b => draft.candidates.some(d => d.boon === b)); n++) {
    if (n > 100) throw new Error('Requested combination not reached in random batches');
    draft.roll();
  }
  for (const boon of boons) draft.toggle(draft.candidates.find(d => d.boon === boon)!.serial);
  expect(world.chooseBirth()).toBe(true);
  return world;
}
const target = (): Wolf => ({ id: 900, x: -6, z: 4, hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0, attack: 10, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
const slash = [{ x: -7, z: 4 }, { x: -5, z: 4 }];

describe('five random talents, choose two', () => {
  it('draws five distinct valid named talents and can naturally roll all twelve types', () => {
    const draft = new BirthDraft(random(4567)), seen = new Set<string>();
    for (let n = 0; n < 200; n++) {
      expect(draft.candidates).toHaveLength(5);
      expect(new Set(draft.candidates.map(destinyName)).size).toBe(5);
      const effects = draft.candidates.flatMap(destinyBoons);
      expect(new Set(effects).size).toBe(effects.length);
      expect(draft.candidates.every(validDestiny)).toBe(true);
      draft.candidates.forEach(d => seen.add(destinyName(d))); draft.roll();
    }
    expect(seen.size).toBe(12);
  });
  it('never injects a pity talent, and permits a lucky heaven in the first batch', () => {
    let seed = 1;
    while (new BirthDraft(random(seed)).candidates.some(d => d.tier === 'heaven')) { if (seed++ > 200) throw new Error('No ordinary batch found'); }
    let rng = random(seed); const unlucky = new BirthDraft(() => rng());
    for (let n = 0; n < 50; n++) { expect(unlucky.candidates.some(d => d.tier === 'heaven')).toBe(false); rng = random(seed); unlucky.roll(); }
    expect(new BirthDraft(() => 1 - Number.EPSILON).candidates[0]!.tier).toBe('heaven');
  });
  it('caps selections at two while allowing inspection, cancellation and replacement', () => {
    const d = new BirthDraft(random(135)), ids = d.candidates.map(t => t.serial);
    ids.slice(0, 2).forEach(id => expect(d.toggle(id)).toBe(true)); expect(d.ready).toBe(true);
    expect(d.toggle(ids[2]!)).toBe(false); expect(d.detail.serial).toBe(ids[2]); expect([...d.selected]).toEqual(ids.slice(0, 2));
    d.toggle(ids[1]!); expect(d.ready).toBe(false); d.toggle(ids[2]!); expect(d.ready).toBe(true);
    expect(d.choices.map(t => t.serial)).toEqual([ids[0], ids[2]]);
  });
  it('replaces the whole batch, clears choices and rejects stale candidates', () => {
    const d = new BirthDraft(random(315)), old = d.candidates;
    old.slice(0, 2).forEach(t => d.toggle(t.serial)); d.roll();
    expect(d.selected.size).toBe(0); expect(d.ready).toBe(false); expect(d.toggle(old[0]!.serial)).toBe(false);
    expect(d.inspect(old[1]!.serial)).toBe(false); expect(d.round).toBe(2);
  });
  it('requires exactly two current choices to enter and snapshots them independently', () => {
    const w = new World({ roguelike: true, random: random(265) }), d = w.birthDraft;
    expect(w.chooseBirth()).toBe(false); d.toggle(d.candidates[0]!.serial); expect(w.chooseBirth()).toBe(false);
    d.toggle(d.candidates[1]!.serial); const names = d.choices.map(destinyName); expect(w.chooseBirth()).toBe(true);
    expect(w.phase).toBe('prepare'); expect(w.build.starting.map(destinyName)).toEqual(names); expect(w.chooseBirth()).toBe(false);
    d.roll(); expect(w.build.starting.map(destinyName)).toEqual(names);
    w.reset(); expect(w.phase).toBe('destiny'); expect(w.build.starting).toHaveLength(0); expect(d.ready).toBe(false); expect(d.round).toBe(3);
  });
  it('rejects duplicate or invalid injected choices without replacing an existing build', () => {
    const draft = new BirthDraft(random(18)), build = new RunBuild();
    build.begin(draft.detail); const before = build.destiny;
    expect(build.beginPair([draft.detail, draft.detail])).toBe(false);
    expect(build.beginPair(draft.candidates.slice(0, 3))).toBe(false);
    expect(build.beginPair([draft.detail, { ...draft.candidates[1]!, roots: [] }])).toBe(false);
    expect(build.destiny).toBe(before);
  });
});

describe('chosen talents work together in actual combat', () => {
  it('combines debt casting and a migrating ancient array', () => {
    const w = mixed(['debt', 'living']);
    expect(w.build.is('slayer')).toBe(true); expect(w.build.is('array')).toBe(true);
    expect(w.build.roots).toEqual(ELEMENTS); expect(w.build.spellOnly).toBe(false);
    w.selectElement('metal'); expect(w.draw(loopAt(-6, 4))).toBe(true);
    w.startWave(); expect(w.moveMain(w.wards[0]!.id, { x: 3, z: 4 })).toBe(true);
    expect(w.spirit).toBe(90); const wolf = target(); w.wolves = [wolf]; w.spirit = 0;
    expect(w.invoke(slash)).toBe(true); expect(w.spirit).toBe(-1.5);
    expect(10000 - wolf.hp).toBeCloseTo(42 * .5 * w.build.affinityPower('metal') * 1.6);
  });
  it('combines a slayer scar and a real spirit reproduction', () => {
    const w = mixed(['scar', 'mimic']); w.selectElement('metal'); w.startWave();
    const wolf = target(); w.wolves = [wolf]; Object.assign(w.mechanics.spirits[0]!,{x:-6.5,z:4,cooldown:0});
    const event = vi.fn(); w.events.on('invoke', event); expect(w.invoke(slash)).toBe(true);
    expect(w.mechanics.scar).not.toBeNull(); const hp = wolf.hp;
    const echo=vi.fn();w.events.on('summonImpact',e=>{if(e.echo)echo(e);});
    for (let n = 0; n < 65; n++) w.tick(1 / 60);
    expect(event).toHaveBeenCalledTimes(1);expect(echo).toHaveBeenCalled();expect(wolf.hp).toBeLessThan(hp);
  });
  it('allows the ancestor and twin to coexist and attack separately', () => {
    const w = mixed(['beast', 'twins']);
    expect(w.mechanics.spirits.map(s => s.role)).toEqual(['main', 'twin']);
    expect(w.mechanics.spirits[0]!.size).toBe(1.75); expect(w.mechanics.spirits[1]!.power).toBe(.65);
    w.startWave(); w.wolves = [target()]; w.mechanics.spirits.forEach(s=>{s.x=-7;s.z=4;});for (let n = 0; n < 36; n++) w.tick(1 / 60);
    expect(w.combatTotals.companion).toBeGreaterThan(0);
    expect(w.mechanics.spirits.every(s => s.cast > 0 || s.cooldown > 0)).toBe(true);
  });
  it('mixes progression from both chosen lanes and awakens them together', () => {
    const w = mixed(['fivefold', 'twins']);
    for (const id of ['array-density', 'array-cycle', 'spirit-might']) {
      w.phase = 'rest';
      for (let n = 0; !w.build.offers.some(r => r.id === id); n++) { if (n > 200) throw new Error('Missing mixed reward'); w.build.rollOffers(100); }
      w.chooseUpgrade(id);
    }
    expect(w.build.progress).toBe(3); expect(w.build.core()?.title).toBe('双命觉醒');
    w.phase = 'rest'; for (let n = 0; !w.build.offers.some(r => r.id === 'awaken'); n++) { if (n > 200) throw new Error('Missing awakening'); w.build.rollOffers(100); } w.chooseUpgrade('awaken'); expect(w.build.stage).toBe(1);
    expect(w.mechanics.spirits.some(s => s.role === 'support')).toBe(true);
    w.selectElement('metal'); w.draw(loopAt(-6, 4)); expect(w.mechanics.spirits.some(s => s.role === 'array')).toBe(false); expect(w.wards).toHaveLength(1);
    w.startWave(); w.wolves = [target()]; w.tick(.01); expect(w.mechanics.arrays.total).toBeGreaterThan(0);
    const eligible = new Set<string>(); for (let n = 0; n < 100; n++) w.build.rollOffers(100).forEach(r => eligible.add(REWARDS.find(d => d.id === r.id)?.lane ?? 'core'));
    expect(['array', 'spirit'].every(lane => eligible.has(lane))).toBe(true);
  });
});

function loopAt(x: number, z: number) { return [{ x: x - 3, z: z - 3 }, { x: x + 3, z: z - 3 }, { x: x + 3, z: z + 3 }, { x: x - 3, z: z + 3 }, { x: x - 3, z: z - 3 }]; }
