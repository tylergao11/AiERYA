import { describe, expect, it } from 'vitest';
import { random, type Point } from '../src/core/math';
import { World } from '../src/game/world';
import type { Wolf } from '../src/game/contracts';
import { planCombatStroke } from '../src/game/combat';
import { ENCOUNTERS, encounter } from '../src/game/encounters';
import { ENEMY_SKILLS } from '../src/game/enemy-abilities';

const line = (length = 4, x = -6, z = 4): Point[] => [{ x: x - length / 2, z }, { x: x + length / 2, z }];
const wolf = (id = 900, x = -6, z = 4): Wolf => ({ id, x, z, kind: 'normal', hp: 1000, maxHp: 1000, speed: 0, heading: 0, action: 'run', age: 0, attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
const ready = (fate: 'slayer' | 'array' | 'spirit' = 'slayer') => {
  const w = new World({ roguelike: true, random: random(421) });
  expect(w.chooseDestiny({ serial: 1, fate, roots: ['metal'], tier: fate === 'array' ? 'unusual' : 'ordinary', boon: fate === 'slayer' ? 'scar' : fate === 'array' ? 'living' : 'mimic' })).toBe(true);
  w.startWave(); w.selected = 'metal'; return w;
};

describe('mana investment and horde counterplay', () => {
  it('a tenth-length stroke pays and deals a tenth; tiny strokes never receive a fixed damage floor', () => {
    const results = [.4, 4, 8].map(length => { const w = ready(), v = wolf(); w.wolves = [v]; const before = w.spirit; expect(w.invoke(line(length))).toBe(true); return { mana: before - w.spirit, damage: 1000 - v.hp }; });
    results.forEach((r,i)=>expect(r.mana).toBeCloseTo([.3,3,6][i]!));
    expect(results[0]!.damage).toBeCloseTo(results[1]!.damage / 10);
    expect(results[2]!.damage).toBeCloseTo(results[1]!.damage * 2);
    expect(results[0]!.damage).toBeLessThan(8);
  });
  it('allows immediate consecutive same-element casts and checks their actual price', () => {
    const w = ready(); w.spirit = .7;
    expect(w.invoke(line(.4))).toBe(true); expect(w.invoke(line(.4))).toBe(true);
    expect(w.spirit).toBeCloseTo(.1); expect(w.invoke(line(.4))).toBe(false);
    expect(w.spirit).toBeCloseTo(.1);
    w.tick(.25); expect(w.spirit).toBeCloseTo(.85); expect(w.invoke(line(.4))).toBe(true);
    expect(w.spirit).toBeCloseTo(.55);
  });
  it('keeps damage per mana bounded on oversized loops and auto-close does not create free investment', () => {
    const shape = (r: number) => [[-r,-r],[r,-r],[r,r],[-r,r],[-r,-r]].map(([x,z]) => ({x:x!,z:z!}));
    const small = planCombatStroke(shape(.15))!, normal = planCombatStroke(shape(1))!, large = planCombatStroke(shape(12))!;
    expect(small.multiplier).toBeLessThan(normal.multiplier);
    expect(large.multiplier / large.investment!).toBeLessThan(normal.multiplier / normal.investment!);
    expect(large.investment).toBeLessThanOrEqual(8);
  });
  it('still resolves all 24 crossed targets and scales their metal damage without a target cap', () => {
    const w = ready(); w.wolves = Array.from({length:24}, (_,i) => wolf(900+i,-6+(i%8)*.25,4+Math.floor(i/8)*.3));
    w.invoke(line()); expect(w.wolves.every(v => v.hp < 1000)).toBe(true);
    const hits = w.wolves.map(v => 1000-v.hp).sort((a,b)=>b-a);
    expect(hits[1]).toBeCloseTo(hits[0]! / 2); expect(hits.at(-1)).toBeCloseTo(hits[1]!);
  });
  it('a committed long slayer cut clears a packed group of third-wave fodder and recovers spirit for the next cut', () => {
    const w=ready();w.wolves=Array.from({length:12},(_,i)=>({...wolf(900+i,-9.5+(i%4)*1.5,2.75+Math.floor(i/4)*1.25),hp:42,maxHp:42}));
    expect(w.strokeCost(line(8))).toBe(6);expect(w.invoke(line(8))).toBe(true);
    expect(w.kills).toBe(12);expect(w.wolves.every(v=>v.action==='dead')).toBe(true);
    expect(w.spirit).toBe(100); // Only the 6 spent can be recovered; overflow is discarded.
    expect(w.ledger.earned).toBeCloseTo(6);
  });
  it('armored elites resist manual damage but fire opens a usable vulnerability window', () => {
    const w = ready(), guard = wolf(); guard.kind='elite'; guard.eliteSkill='guard'; w.wolves=[guard];
    w.invoke(line()); const armoredDamage=1000-guard.hp;
    w.selected='fire'; w.invoke(line()); expect(w.enemyAbilities.armored(guard)).toBe(false);
    w.selected='metal'; const hp=guard.hp; w.invoke(line()); expect(hp-guard.hp).toBeGreaterThan(armoredDamage*2);
    const passive = ready(), g = wolf(); g.kind='elite'; g.eliteSkill='guard'; passive.wolves=[g];
    passive.hitRogue(g,100,'metal',{kind:'array'}); expect(1000-g.hp).toBeCloseTo(120);
  });
  it.each([['call','metal'],['silence','wood'],['hunt','earth']] as const)('%s is telegraphed, cannot be broken by a tiny mark, and can be countered with %s', (skill, element) => {
    const w = ready('spirit'), v=wolf(); v.kind='elite'; v.eliteSkill=skill; w.wolves=[v];
    Object.assign(w.mechanics.spirits[0]!,{x:-7,z:4});
    w.enemyAbilities.tick(2.6); expect(w.enemyAbilities.casting(v.id)).toBe(true);
    w.selected=element; w.invoke(line(.4)); expect(w.enemyAbilities.casting(v.id)).toBe(true);
    w.invoke(line()); expect(w.enemyAbilities.casting(v.id)).toBe(true);
    for(let n=0;n<95&&w.enemyAbilities.casting(v.id);n++)w.mechanics.tick(1/60);
    expect(w.enemyAbilities.casting(v.id)).toBe(false);
  });
  it('a hunter suppresses spirit attacks locally; moving out or killing its owner removes the threat', () => {
    const w=ready('spirit'), v=wolf(); v.kind='elite';v.eliteSkill='hunt';w.wolves=[v];
    const s=w.mechanics.spirits[0]!;Object.assign(s,{x:-7,z:4});
    w.enemyAbilities.tick(2.6);w.enemyAbilities.tick(ENEMY_SKILLS.huntDelay+.01);
    expect(w.enemyAbilities.silenced(s)).toBe(true);
    expect(w.mechanics.spiritSkills.attack(s,v,100,{kind:'spirit',spiritId:s.id})).toBe(false);
    s.x=-11;expect(w.enemyAbilities.silenced(s)).toBe(false);
    s.x=-7;v.action='dead';w.enemyAbilities.tick(.01);expect(w.enemyAbilities.silenced(s)).toBe(false);
  });
  it('offers all elite counters among a much larger ordinary horde without flooding the screen with elites', () => {
    expect([1,2,3].map(n=>encounter(n).count)).toEqual([96,132,168]);
    const roles = encounter(5).spawns.map(s=>s.eliteSkill).filter(Boolean);
    expect(roles).toEqual(['guard','call','silence','hunt','call']);expect(ENCOUNTERS.aliveLimit).toBe(96);
  });
  it('short wall repairs and array releases scale down along with mana consumption', () => {
    const measure=(length:number)=>{const w=new World();w.selected='earth';w.place([{x:-8,z:2},{x:-4,z:2},{x:-4,z:6},{x:-8,z:6},{x:-8,z:2}]);const a=w.wards[0]!;a.health=1;w.startWave();w.selected='fire';w.invoke(line(length));return a.health-1;};
    expect(measure(.4)).toBeCloseTo(measure(4)/10);
  });
  it('does not round a tiny fraction of a stored ward strike up to a full free chain', () => {
    const measure=(length:number)=>{
      const w=new World();w.selected='metal';w.place([{x:-8,z:2},{x:-4,z:2},{x:-4,z:6},{x:-8,z:6},{x:-8,z:2}]);w.startWave();w.selected='earth';w.invoke(line(length));
      w.wolves=[wolf(),wolf(901,-5.8)];let chains=0;w.events.on('reactionEffect',e=>{if(e.effect==='chain')chains++;});w.tick(.01);return chains;
    };
    expect(measure(.4)).toBe(0);expect(measure(4)).toBe(1);
  });
});
