import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import type { GameEvents, Wolf, Ward } from '../src/game/contracts';
import { spiritRestriction } from '../src/game/spirit-restrictions';
import { SpiritRestrictionArt } from '../src/render/spirit-restriction-art';
import { summonStatus } from '../src/ui/summon-status';
import { SpiritArt } from '../src/render/spirit-art';

function setup() {
  const w = new World({ roguelike: true }); w.chooseDestiny({ serial: 1, fate: 'spirit', tier: 'ordinary', boon: 'twins', roots: ['fire'] }); w.startWave();
  w.mechanics.spirits.splice(1); const s = w.mechanics.spirits[0]!; Object.assign(s, { x: -6, z: 6 });
  const target: Wolf = { id: 8700, x: -1, z: 6, hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0, attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null };
  w.wolves = [target]; w.selected = 'water'; w.invoke([{ x: -3, z: 6 }, { x: 1, z: 6 }]); return { w, s, target };
}

describe('spirit restrictions cancel a real windup without running a match', () => {
  it('a brief silence cannot resurrect an abandoned launch or spend its paid order', () => {
    const { w, s, target } = setup(), attacks: GameEvents['spiritAttack'][] = [], states: string[] = [];
    w.events.on('spiritAttack', e => attacks.push(e)); w.events.on('spiritRestriction', e => states.push(e.state));
    w.mechanics.tick(.01); expect(s.cast).toBeGreaterThan(0); const cooldown = s.cooldown, stock = w.mechanics.commands.amount(s.id);
    w.enemyAbilities.zones.push({ x: s.x, z: s.z, radius: 2, remaining: 3 }); w.mechanics.tick(.03);
    expect(s.cast).toBe(0); expect(s.cooldown).toBeGreaterThan(0); expect(s.cooldown).toBeLessThanOrEqual(cooldown);
    w.enemyAbilities.zones.length = 0; w.mechanics.tick(.25);
    expect(states).toEqual(['silenced', 'free']); expect(attacks.filter(e => e.stage === 'launch')).toHaveLength(0);
    expect(target.hp).toBe(10000); expect(w.mechanics.commands.amount(s.id)).toBe(stock);
    s.cooldown = 0; w.mechanics.tick(.01); w.mechanics.tick(.21); w.mechanics.tick(.3);
    expect(attacks.filter(e => e.stage === 'launch')).toHaveLength(1); expect(target.hp).toBeLessThan(10000);
  });
  it('an already launched missile stays valid if a later restriction ends before its contact', () => {
    const { w, s, target } = setup(); w.mechanics.tick(.01); w.mechanics.tick(.21);
    const stock = w.mechanics.commands.amount(s.id); expect(stock).toBe(1);
    w.enemyAbilities.zones.push({ x: s.x, z: s.z, radius: 2, remaining: 3 }); w.mechanics.tick(.01);
    w.enemyAbilities.zones.length = 0; w.mechanics.tick(.23);
    expect(target.hp).toBeLessThan(10000); expect(w.mechanics.commands.amount(s.id)).toBe(stock);
  });
  it('bound pressure shares the UI rule, emits once and never refunds cooldown or stock', () => {
    const { w, s } = setup(), states: string[] = []; w.events.on('spiritRestriction', e => states.push(e.state));
    s.wardId = 991; w.wards.push({ id: 991, suppressed: 2, health: 100 } as Ward); s.cast = .2; s.cooldown = .8;
    const token = w.mechanics.restrictions.begin(s), stock = w.mechanics.commands.amount(s.id);
    for (let n = 0; n < 4; n++) w.mechanics.restrictions.refresh(w, [s]);
    expect(states).toEqual(['suppressed']); expect(w.mechanics.restrictions.valid(s, token)).toBe(false); expect(s.cast).toBe(0);
    expect(spiritRestriction(w, s)).toBe('suppressed'); expect(summonStatus(w, s).state).toBe('受压'); expect(s.cooldown).toBe(.8); expect(w.mechanics.commands.amount(s.id)).toBe(stock);
    w.wards[0]!.suppressed = 0; w.mechanics.restrictions.refresh(w, [s]); expect(states).toEqual(['suppressed', 'free']);
    w.mechanics.restrictions.clear(); w.mechanics.restrictions.refresh(w, [s]); expect(states).toHaveLength(2);
  });
  it('body restriction transitions follow actual status and leave simulation state untouched', () => {
    const { w, s } = setup(), art = new SpiritRestrictionArt();
    w.enemyAbilities.zones.push({ x: s.x, z: s.z, radius: 2, remaining: 3 }); const before = structuredClone(s);
    art.update(w, .1); expect(art.get(s.id)).toMatchObject({ state: 'silenced', weight: 1 }); expect(s).toEqual(before);
    w.enemyAbilities.zones.length = 0; art.update(w, .05); expect(art.get(s.id)?.state).toBeNull(); expect(art.get(s.id)?.weight).toBeLessThan(1);
    art.update(w, .32); expect(art.get(s.id)).toBeUndefined();
    w.enemyAbilities.zones.push({ x: s.x, z: s.z, radius: 2, remaining: 3 }); art.update(w, .1); w.phase='rest';art.update(w,0);expect(art.get(s.id)).toBeUndefined();
    w.phase='battle';art.update(w,.1);w.mechanics.spirits.length = 0; art.update(w, 0); expect(art.get(s.id)).toBeUndefined();
  });
  it('an active seal stops the painted attack while movement and stored orders remain available', () => {
    const {w,s}=setup(),art=new SpiritArt(w);s.cast=.4;s.targetId=8700;
    art.poses.attack(s,{stage:'windup',spiritId:s.id,targetId:8700,at:s,to:{x:0,z:6},element:'water',style:'ranged',duration:.2,heavy:false});
    w.enemyAbilities.zones.push({x:s.x,z:s.z,radius:2,remaining:3});const stock=w.mechanics.commands.amount(s.id),before=structuredClone(s);
    art.update(.05);expect(art.poses.get(s).elapsed).toBe(1);expect(s).toEqual(before);
    s.x-=.15;art.update(.03);expect(art.poses.get(s).vx).toBeLessThan(0);expect(w.mechanics.commands.amount(s.id)).toBe(stock);art.clear();
  });
});
