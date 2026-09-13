import { describe, expect, it, vi } from 'vitest';
import { random } from '../src/core/math';
import { World } from '../src/game/world';
import type { Wolf } from '../src/game/contracts';
import { planCombatStroke } from '../src/game/combat';
import { slayerReturnWindow, returnWindowHint, returnWindowLabel } from '../src/game/slayer-return-window';

const line = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
const victim = (id: number, x = -6, z = 4): Wolf => ({ id, x, z, hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0, attack: 0, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
function setup() {
  const world = new World({ roguelike: true, random: random(42167) });
  world.chooseDestiny({ serial: 1, fate: 'slayer', roots: ['metal'], boon: 'three', tier: 'ordinary' });
  world.phase = 'rest';
  for (let n = 0; n < 600; n++) if (world.build.rollOffers(world.health).some(r => r.id === 'slayer-return')) { world.chooseUpgrade('slayer-return'); break; }
  expect(world.build.level('slayer-return')).toBe(1);
  world.startWave(); world.wolves = [victim(900)]; world.selected = 'metal';
  expect(world.invoke(line, .8)).toBe(true);
  return world;
}
describe('return timing follows actual old-stroke occupancy', () => {
  it('matches actual AOE return targets without spending or hitting from observation', () => {
    const w = setup(); w.wolves = [victim(900), victim(901, -5, 5.6), victim(902, 10, 20)];
    const hp = w.wolves.map(v => v.hp), spirit = w.spirit, saved = w.slayerTechniques.returnCut;
    const cue = slayerReturnWindow(w)!;
    expect(cue.total).toBe(2); expect(cue.state).toBe('ready');
    expect(w.wolves.map(v => v.hp)).toEqual(hp); expect(w.spirit).toBe(spirit); expect(w.slayerTechniques.returnCut).toBe(saved);
    const result = vi.fn(); w.events.on('slayerReturn', result);
    expect(w.invoke([{ x: -6, z: 2 }, { x: -6, z: 6 }])).toBe(true); w.mechanics.tick(.1);
    expect(result.mock.calls[0]![0].hits).toBe(cue.total); expect(slayerReturnWindow(w)).toBeNull();
  });
  it('shows waiting after enemies leave and becomes ready as a new group enters', () => {
    const w = setup(), target = w.wolves[0]!;
    target.z = 10; w.time += 1 / 60;
    expect(returnWindowLabel(slayerReturnWindow(w)!)).toBe('等敌入线');
    target.z = 4; w.time += 1 / 60;
    expect(returnWindowHint(slayerReturnWindow(w)!, 1.8)).toBe('回锋 1.8s · 1敌入线');
    target.action = 'dead'; w.time += 1 / 60;
    expect(slayerReturnWindow(w)!.total).toBe(0);
  });
  it('uses the saved metal element despite selecting fire, and recognizes real fire exposure', () => {
    const w = setup(); w.wolves = [victim(900)]; w.wolves[0]!.eliteSkill = 'guard'; w.selected = 'fire';
    expect(slayerReturnWindow(w)!.state).toBe('guarded');
    // Hit the wolf at the old line's thick edge without crossing its centerline.
    w.wolves[0]!.z = 5.3;
    expect(w.invoke([{ x: -6.5, z: 5.3 }, { x: -5.5, z: 5.3 }])).toBe(true);
    expect(w.slayerTechniques.returnCut).not.toBeNull();
    // A tiny fire investment exposes too little to remove armor; the cue stays guarded.
    w.time += 1 / 60; expect(slayerReturnWindow(w)!.state).toBe('guarded');
    expect(w.invoke([{ x: -8, z: 5.3 }, { x: -4, z: 5.3 }])).toBe(true);
    expect(w.enemyAbilities.armored(w.wolves[0]!)).toBe(false); w.time += 1 / 60;
    expect(slayerReturnWindow(w)!.state).toBe('ready');
  });
  it('reports partial guards separately and caps only visual contacts, not the enemy count', () => {
    const w = setup();
    w.slayerTechniques.returnCut!.stroke = { ...planCombatStroke([{x:-20,z:4},{x:20,z:4}])!, width: 2 };
    w.wolves = Array.from({length:40}, (_,i) => victim(900+i,-19+i,4));
    w.wolves[0]!.eliteSkill = 'guard';
    const cue=slayerReturnWindow(w)!;
    expect(cue.total).toBe(40); expect(cue.guarded).toBe(1); expect(cue.contacts.length).toBeLessThanOrEqual(6);
    expect(returnWindowHint(cue,2.8)).toContain('39敌入线');
  });
  it('includes the filled area of a closed stroke, not only its outline', () => {
    const w=setup(), points=[{x:-8,z:0},{x:0,z:0},{x:0,z:8},{x:-8,z:8},{x:-8,z:0}];
    w.slayerTechniques.returnCut!.stroke=planCombatStroke(points)!;
    w.wolves=[victim(900,-4,4),victim(901,3,4)];
    expect(slayerReturnWindow(w)!.total).toBe(1);
  });
  it('treats stop time as stored, then removes the cue on expiry, rest and restart', () => {
    const w=setup(); const initial=slayerReturnWindow(w)!;
    expect(initial.state).toBe('ready'); expect(w.ultimate.start()).toBe(true);
    expect(slayerReturnWindow(w)!.state).toBe('frozen'); w.ultimate.clear();
    w.slayerTechniques.tick(3); expect(slayerReturnWindow(w)).toBeNull();
    expect(w.invoke(line,.8)).toBe(true); w.phase='rest'; expect(slayerReturnWindow(w)).toBeNull();
    w.reset(); expect(slayerReturnWindow(w)).toBeNull();
  });
});
