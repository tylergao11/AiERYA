import { describe, expect, it, vi } from 'vitest';
import type { Element, Wolf } from '../src/game/contracts';
import { World } from '../src/game/world';
import { elementalReaction } from '../src/game/combat';
import { bindWolf, REACTIONS, type ReactionRequest } from '../src/game/reactions';
import { CAMP } from '../src/game/terrain';

const slash = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
const square = [{ x: -8, z: 2 }, { x: -4, z: 2 }, { x: -4, z: 6 }, { x: -8, z: 6 }, { x: -8, z: 2 }];
const wolf = (id = 900, x = -6, z = 4, aura: Element | null = null): Wolf => ({ id, x, z, hp: 1000, maxHp: 1000, speed: 0, heading: 0, action: 'run', age: 0, attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura, auraTime: 5, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
const advance = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) w.tick(1 / 60); };
const battle = (element: Element, wolves: Wolf[]) => { const w = new World(); w.selected = element; w.startWave(); w.wolves = wolves; return w; };
const request = (from: Element, to: Element, power = 1): ReactionRequest => ({ reaction: elementalReaction(from, to)!, at: { x: -6, z: 4 }, power, focusId: 900 });

describe('five distinct generating tactics', () => {
  it('applies damage upgrades to field fire seeds once, without reapplying them to existing burn snapshots', () => {
    const w=new World();w.stats.add({id:'fire-power',stat:'damage',element:'fire',multiply:2});w.place(square);w.startWave();
    const a=wolf(900,-6,6.5);w.wolves=[a];w.selected='wood';w.draw(slash);
    expect(a.burnDps).toBeCloseTo(12*2*0.5*w.wards[0]!.power.multiplier*1.35);
  });
  it('wood carries a real fire seed to at most two unlit neighbors without refreshing stronger fires', () => {
    const a = wolf(), b = wolf(901, -6, 6.3), c = wolf(902, -5, 6.3), d = wolf(903, -7.5, 6.5), strong = wolf(904, -6, 5.8);
    a.burning = 2; a.burnDps = a.burnBaseDps = 12; strong.burning = 1; strong.burnDps = strong.burnBaseDps = 40;
    const w = battle('wood', [a,b,c,d,strong]); w.draw(slash);
    expect(a.burnDps).toBeCloseTo(16.2); expect([b,c,d].filter(wolf => wolf.burning > 0)).toHaveLength(2);
    expect(b.burnDps).toBeCloseTo(8.1); expect(strong.burnDps).toBe(40); expect(strong.burning).toBe(1);
    advance(w, 0.5); expect(d.burning).toBe(0); expect(w.combatTotals.reaction).toBeGreaterThan(0);
  });
  it('fire repairs earth, and earth protection reduces actual incoming bites', () => {
    const make = (empowered: boolean) => {
      const w = new World(); w.selected = 'earth'; w.place(square); const ward = w.wards[0]!; ward.health = 50;
      w.startWave(); if (empowered) { w.selected = 'fire'; w.draw(slash); }
      const repaired = ward.health; ward.pulse = 100;
      const a = wolf(); a.speed = 2.3; w.wolves = [a];
      for (let i=0;i<180 && ward.health === repaired;i++) w.tick(1/60);
      return { repaired, bite: repaired - ward.health, max: ward.maxHealth };
    };
    const plain = make(false), guarded = make(true);
    expect(guarded.repaired).toBeCloseTo(50 + Math.min(32, guarded.max * 0.2)); expect(plain.bite).toBe(12); expect(guarded.bite).toBeCloseTo(7.8);
  });
  it('fire meeting earth weakens actual camp damage instead of only changing a label', () => {
    const a = wolf(900, CAMP.x + 2, CAMP.z, 'earth'), w = battle('fire', [a]);
    w.draw([{ x: a.x - 2, z: a.z }, { x: a.x + 2, z: a.z }]);
    const hits = vi.fn(); w.events.on('campHit', hits);
    for (let i=0;i<180 && !hits.mock.calls.length;i++) w.tick(1/60);
    expect(hits).toHaveBeenCalled(); expect(hits.mock.calls[0]![0].amount).toBeCloseTo(1.4);
  });
  it('earth charges exactly three extra metal strikes and unspent charges expire', () => {
    const w = new World(); w.selected = 'metal'; w.place(square); w.startWave(); w.selected = 'earth'; w.draw(slash);
    const ward = w.wards[0]!, a = wolf(), b = wolf(901, -3.3, 4); w.wolves = [a,b];
    const echoes = vi.fn(); w.events.on('reactionEffect', event => { if(event.effect === 'chain') echoes(event); });
    advance(w, 3); expect(echoes).toHaveBeenCalledTimes(3); expect(ward.edgeCharges).toBe(0);
    expect(1000 - b.hp).toBeCloseTo(30 * ward.power.multiplier * 1.35 * 0.5 * 3);
    w.wolves = []; ward.edgeCharges = 3; advance(w, 1.1); expect(ward.edgeCharges).toBe(0);
  });
  it('an enemy marked by earth and metal carries a bounded chain opportunity into the next hit', () => {
    const a = wolf(900,-6,4,'metal'), b = wolf(901,-6,6.5), w = battle('earth',[a,b]);
    w.draw(slash); expect(a.reactions?.edgeCharges).toBe(3); advance(w,0.8); w.selected='metal';
    const before = b.hp; w.draw(slash); expect(before-b.hp).toBeCloseTo(8); expect(a.reactions?.edgeCharges).toBe(2);
  });
  it('metal and water pull surrounding enemies toward their crossing point, including off-stroke neighbors', () => {
    const a=wolf(900,-6,4,'fire'), b=wolf(901,-6,6.4); a.wet=2; a.slowAmount=0.5;
    const w=battle('metal',[a,b]); w.draw(slash); expect(b.vz).toBeLessThan(0);
    const z=b.z; advance(w,0.2); expect(b.z).toBeLessThan(z);
    expect(Math.hypot(b.vx,b.vz)).toBeLessThanOrEqual(REACTIONS.pullSpeed * 1.5);
  });
  it('water and wood spread roots to two neighbors without refreshing roots or bypassing recovery', () => {
    const a=wolf(900,-6,4,'wood'), b=wolf(901,-6,6.1), c=wolf(902,-5,6.4), immune=wolf(903,-7,6.1); a.rooted=0.4; immune.rootImmunity=1;
    const w=battle('water',[a,b,c,immune]); w.draw(slash);
    expect(a.rooted).toBe(0.4); expect(b.rooted).toBeGreaterThan(0); expect(c.rooted).toBeGreaterThan(0); expect(immune.rooted).toBe(0);
    expect(bindWolf(a,1.5)).toBe(false); advance(w,1.3); expect(a.rooted).toBe(0);
  });
});

describe('overcoming spends an element on a new tactic', () => {
  it('wood breaks earth into a bounded root eruption outside the direct stroke', () => {
    const a=wolf(900,-6,4,'earth'), b=wolf(901,-6,6.8), outside=wolf(902,-6,7.3); const w=battle('wood',[a,b,outside]);
    w.draw(slash); expect(1000-b.hp).toBe(12); expect(b.rooted).toBeGreaterThan(0); expect(outside.hp).toBe(1000);
    expect(w.combatTotals.reaction).toBe(24);
  });
  it('earth consumes wetness to leave a temporary mud zone affecting later arrivals', () => {
    const a=wolf(900,-6,4,'metal'); a.wet=2; a.slowAmount=0.8;
    const w=battle('earth',[a]); w.draw(slash); expect(a.wet).toBe(0); expect(w.reactionEffects.zones).toHaveLength(1);
    expect(w.wards).toHaveLength(0); expect(w.companions).toHaveLength(0);
    const b=wolf(901,-6,6.4); b.speed=2; w.wolves.push(b); advance(w,0.2);
    expect(b.reactions?.mireSlow).toBeCloseTo(0.65); expect(b.reactions?.mired).toBeGreaterThan(0);
    advance(w,4.3); expect(w.reactionEffects.zones).toHaveLength(0); expect(b.reactions?.mired).toBe(0);
  });
  it('mud respects simulation pauses and reset clears every temporary zone', () => {
    const a=wolf(900,-6,4,'water'),w=battle('earth',[a]);w.draw(slash); const remaining=w.reactionEffects.zones[0]!.remaining;
    w.phase='rest'; advance(w,2); expect(w.reactionEffects.zones[0]!.remaining).toBe(remaining);
    w.reset(); expect(w.reactionEffects.zones).toHaveLength(0); expect(w.wolves).toHaveLength(0);
  });
  it('fire melts metal into vulnerability that increases later damage and then expires', () => {
    const a=wolf(900,-6,4,'metal'),w=battle('fire',[a]);w.draw(slash);
    expect(a.reactions?.exposure).toBe(0.25); advance(w,0.8); w.selected='metal'; a.aura=null;a.auraTime=0;
    const before=w.combatTotals.spell;w.draw(slash);expect(w.combatTotals.spell-before).toBeCloseTo(20);
    advance(w,3.3); expect(a.reactions?.exposure).toBe(0);
  });
  it('a weaker melt cannot refresh stronger vulnerability and repeated applications never multiply it', () => {
    const a=wolf(),w=battle('fire',[a]);w.reactionEffects.resolve([request('fire','metal',2)]); advance(w,0.5);
    const before=a.reactions!.exposed;w.reactionEffects.resolve([request('fire','metal',0.5)]);
    expect(a.reactions!.exposed).toBeCloseTo(before);expect(a.reactions!.exposure).toBe(0.4);
    w.reactionEffects.resolve([request('fire','metal',2)]);expect(a.reactions!.exposure).toBe(0.4);
  });
  it('metal spends actual remaining roots on one heavy strike and one splinter, without a recursive chain', () => {
    const a=wolf(900,-6,4,'fire'),b=wolf(901,-6,6.3),c=wolf(902,-5,6.5);a.rooted=1;
    const w=battle('metal',[a,b,c]); w.draw(slash);
    expect(a.rooted).toBe(0); expect(1000-a.hp).toBe(52); expect(1000-b.hp).toBeCloseTo(9.6); expect(c.hp).toBe(1000);
    advance(w,2.5); const before=b.hp; w.draw(slash);expect(b.hp).toBe(before);
  });
  it('a lethal primary cut can still scatter splinters without stealing another enemy’s roots or counting overkill', () => {
    const a=wolf(900,-6,4,'wood'),b=wolf(901,-6,6.3);a.hp=5;a.rooted=1;b.rooted=1;
    const w=battle('metal',[a,b]);w.draw(slash);
    expect(w.kills).toBe(1);expect(b.rooted).toBe(1);expect(1000-b.hp).toBeCloseTo(9.6);
    expect(w.combatTotals.spell+w.combatTotals.reaction).toBeCloseTo(14.6);
  });
  it('spent field energy cannot create another counter effect simply by reawakening its attack state', () => {
    const w=new World();w.selected='water';w.place(square);w.startWave();w.selected='earth';w.draw(slash);
    const effects=vi.fn();w.events.on('reactionEffect',effects);w.wards[0]!.suppressed=0;w.draw(slash);expect(effects).not.toHaveBeenCalled();expect(w.wards[0]!.charge).toBe(0);
  });
  it('deduplicates repeated contacts while covering every enemy and retaining distinct mud zones', () => {
    const wolves=Array.from({length:12},(_,i)=>wolf(900+i,-6+(i%4)*0.4,4+Math.floor(i/4)*0.4)),w=battle('wood',wolves);
    w.reactionEffects.resolve(Array.from({length:100},()=>request('wood','earth')));
    expect(w.combatTotals.reaction).toBe(12*12); expect(wolves.filter(wolf=>wolf.rooted>0)).toHaveLength(12);
    for(let i=0;i<5;i++) w.reactionEffects.resolve([{...request('earth','water'),at:{x:i*7-14,z:4}}]);
    expect(w.reactionEffects.zones).toHaveLength(5);
  });
  it('does not accidentally damage or mark enemies when the incoming element is resisted', () => {
    const a=wolf(900,-6,4,'water'),w=battle('fire',[a]);w.draw(slash);
    expect(1000-a.hp).toBeCloseTo(2.6);expect(a.reactions).toBeUndefined();expect(w.combatTotals.reaction).toBe(0);
  });
  it('keeps tiny-concentration follow-up effects weak', () => {
    const a=wolf(),w=battle('wood',[a]);w.reactionEffects.resolve([request('wood','earth',0.1)]);
    expect(1000-a.hp).toBeCloseTo(1.2);expect(a.rooted).toBeCloseTo(0.085);
    w.reactionEffects.resolve([request('fire','metal',0.1)]);expect(a.reactions!.exposure).toBeCloseTo(0.025);
  });
});
