import { describe, expect, it, vi } from 'vitest';
import type { Wolf } from '../src/game/contracts';
import { CAMP, CAMP_FIRE } from '../src/game/terrain';
import { World } from '../src/game/world';

const wolf = (id = 900, offset = 2): Wolf => ({
  id, x: CAMP.x + offset, z: CAMP.z, hp: 100, maxHp: 100, speed: 0, heading: 0,
  action: 'run', age: 0, attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0,
  rooted: 99, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0,
  pack: 0, routeAge: 0, waypoint: null,
});
const advance = (w: World, seconds: number) => { for (let t = 0; t < Math.round(seconds * 60); t++) w.tick(1 / 60); };
function battle() {
  const w = new World({ roguelike: true });
  w.chooseDestiny({ serial: 1, fate: 'slayer', boon: 'three', tier: 'ordinary', roots: ['metal'] });
  w.startWave(); w.spirit = 0;
  // Isolate campfire kill income from the separately tested passive recovery.
  w.stats.add({ id: 'campfire-income-isolation', stat: 'regen', multiply: 0 });
  vi.spyOn(w.assault, 'tick').mockImplementation(() => {});
  return w;
}

describe('campfire emergency defense', () => {
  it('burns nearby wolves slowly at zero spirit, without hitting distant wolves or staggering', () => {
    const w = battle(), near = wolf(), far = wolf(901, CAMP_FIRE.radius + 1);
    w.wolves = [near, far]; const hit = vi.fn(); w.events.on('hit', hit);
    w.stats.add({ id: 'fire-upgrade', stat: 'damage', element: 'fire', add: 100 });
    advance(w, 2);
    expect(near.hp).toBeCloseTo(97); expect(far.hp).toBe(100);
    expect(near.campBurning).toBeGreaterThan(0); expect(near.burning).toBe(0); expect(near.aura).toBeNull();
    expect(w.combatTotals.campfire).toBeCloseTo(3);
    expect(w.spirit).toBe(0); expect(w.ledger.spent).toBe(0); expect(hit).not.toHaveBeenCalled();
  });

  it('leaves only a short ember after the wolf exits the heat', () => {
    const w = battle(), target = wolf(); w.wolves = [target]; advance(w, 1);
    target.x = CAMP.x + CAMP_FIRE.radius + 2;
    advance(w, 1); const hp = target.hp; advance(w, 1);
    expect(hp).toBeCloseTo(100 - 1.5 * 1.6); expect(target.hp).toBe(hp);
    expect(target.campBurning).toBe(0); expect(target.campBurnDps).toBe(0);
  });

  it('does not weaken, extend, or steal credit for a stronger player burn', () => {
    const w = battle(), target = wolf(); w.wolves = [target];
    target.burning = 1; target.burnDps = target.burnBaseDps = 8; target.burnSource = 'ward';
    const origin = { kind: 'array' as const, wardId: 77 }; w.mechanics.noteBurn(target, origin);
    advance(w, .5);
    expect(target.hp).toBeCloseTo(95.25); expect(target.burning).toBeCloseTo(.5);
    expect(target.burnDps).toBe(8); expect(target.burnSource).toBe('ward');
    expect(w.mechanics.burnOrigin(target)).toBe(origin); expect(w.combatTotals.campfire).toBeCloseTo(.75);
  });

  it('pays normal kill income once, while allowing a healthy wolf to bite back', () => {
    const w = battle(), target = wolf(); target.hp = target.maxHp = 12; target.rooted = 0;
    w.wolves = [target]; const death = vi.fn(); w.events.on('death', death);
    advance(w, 9);
    expect(target.action).toBe('dead'); expect(w.kills).toBe(1); expect(w.health).toBeLessThan(100);
    expect(w.health).toBeGreaterThan(0); expect(w.spirit).toBe(w.killSpirit);
    expect(w.ledger.earned).toBe(w.killSpirit); expect(death).toHaveBeenCalledOnce();
    advance(w, 2); expect(w.spirit).toBe(w.killSpirit); expect(death).toHaveBeenCalledOnce();
  });

  it('does not convert a later wood spell into fuel for the weak camp embers', () => {
    const w = new World(), target = wolf(); target.rooted = 0;
    w.startWave(); w.wolves = [target]; w.tick(1 / 60);
    expect(target.campBurning).toBeGreaterThan(0);
    target.x = CAMP.x + 4; w.selected = 'wood';
    expect(w.invoke([{ x: target.x - .5, z: target.z }, { x: target.x + .5, z: target.z }])).toBe(true);
    expect(target.rooted).toBeGreaterThan(0); expect(target.aura).toBe('wood'); expect(target.burning).toBe(0);
  });

  it('lets an already lethal player burn settle before the camp heat', () => {
    const w = battle(), target = wolf(); w.wolves = [target]; target.hp = .01;
    target.burning = 1; target.burnDps = 8; target.burnSource = 'ward';
    const origin = { kind: 'array' as const, wardId: 77 }; w.mechanics.noteBurn(target, origin);
    const afterDeath = vi.spyOn(w.mechanics, 'afterDeath'); w.tick(1 / 60);
    expect(afterDeath).toHaveBeenCalledWith(target, 'fire', origin);
    expect(w.combatTotals.campfire).toBe(0);
  });

  it('does not pay currency for enemy-summoned wolves', () => {
    const w = battle(), target = wolf(); target.summoned = true; target.hp = .1; w.wolves = [target];
    advance(w, .2); expect(target.action).toBe('dead'); expect(w.spirit).toBe(0); expect(w.ledger.earned).toBe(0);
  });

  it('respects suppressed fire and resumes after the fire recovers', () => {
    const w = battle(), target = wolf(); w.wolves = [target]; w.naturalInfluences.fire.suppressed = 2;
    advance(w, 1); expect(target.hp).toBe(100); expect(target.burning).toBe(0);
    advance(w, 2); expect(target.hp).toBeLessThan(100);
    w.reset(); expect(w.combatTotals.campfire).toBe(0); expect(w.naturalPower('fire')).toBe(1);
  });

  it.each(['prepare', 'rest', 'won', 'lost'] as const)('does not burn during %s', phase => {
    const w = battle(), target = wolf(); w.wolves = [target]; w.phase = phase;
    advance(w, 1); expect(target.hp).toBe(100); expect(target.burning).toBe(0);
  });
});
