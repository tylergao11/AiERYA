import { describe, expect, it, vi } from 'vitest';
import { elementalReaction, GENERATES, OVERCOMES } from '../src/game/combat';
import { abilities } from '../src/game/content';
import { SPELLS, STEAM } from '../src/game/combat';
import { CONCENTRATION } from '../src/game/concentration';
import { ELEMENTS, type Element, type Wolf } from '../src/game/contracts';
import { CAMP } from '../src/game/terrain';
import { World } from '../src/game/world';

const slash = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
const square = [{ x: -8, z: 2 }, { x: -4, z: 2 }, { x: -4, z: 6 }, { x: -8, z: 6 }, { x: -8, z: 2 }];
const wolf = (aura: Element | null = null): Wolf => ({
  id: 999, x: -6, z: 4, hp: 1000, maxHp: 1000, speed: 0, heading: 0, action: 'run', age: 0,
  attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0,
  aura, auraTime: 5, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null,
});
function formation(element: Element) {
  const world = new World(); world.selected = element; expect(world.place(square)).toBe(true); world.startWave(); return world;
}
const battle = (element: Element, target: Wolf) => { const world = new World(); world.selected = element; world.startWave(); world.wolves = [target]; return world; };

describe('directional generation and overcoming', () => {
  it.each(ELEMENTS)('feeding %s onto its receiver strengthens the receiver, in either order', incoming => {
    const receiver = GENERATES[incoming];
    expect(elementalReaction(incoming, receiver)).toMatchObject({ kind: 'generate', from: incoming, to: receiver, result: receiver });
    expect(elementalReaction(receiver, incoming)).toMatchObject({ kind: 'generate', from: incoming, to: receiver, result: receiver });
    const target = wolf(receiver), w = battle(incoming, target); w.draw(slash);
    expect(target.aura).toBe(receiver); expect(target.maxHp - target.hp).toBeCloseTo(SPELLS[incoming].damage * 1.5);
  });
  it.each(ELEMENTS)('reversing %s overcoming weakens the incoming spell and preserves the existing aura', existing => {
    const incoming = OVERCOMES[existing], target = wolf(existing), w = battle(incoming, target);
    const reaction = vi.fn(); w.events.on('reaction', reaction); w.draw(slash);
    expect(target.maxHp - target.hp).toBeCloseTo(SPELLS[incoming].damage * 0.65);
    expect(target.aura).toBe(existing);
    expect(reaction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'resist', from: existing, to: incoming, name: '受克削弱' }));
  });
  it.each(ELEMENTS)('does not manufacture a reaction for repeated %s', element => {
    const target = wolf(element), w = battle(element, target); w.draw(slash);
    expect(elementalReaction(element, element)).toBeNull();
    expect(target.maxHp - target.hp).toBeCloseTo(SPELLS[element].damage);
  });
  it('adds fuel to a burning enemy without replacing the fire with roots or stacking forever', () => {
    const target = wolf('metal'); target.burning = 1; target.burnDps = 8;
    const w = battle('wood', target); w.draw(slash);
    expect(target.aura).toBe('fire'); expect(target.rooted).toBe(0);
    expect(target.burnDps).toBeCloseTo(10.8); expect(target.burning).toBe(1.2);
    const before = target.hp; w.tick(0.5); expect(before - target.hp).toBeCloseTo(5.4);
    w.draw(slash); expect(target.burnDps).toBeCloseTo(10.8);
    expect(w.notice).toContain('木生火·助燃');
  });
  it('water extinguishes actual burning even when the last aura was overwritten', () => {
    const target = wolf('metal'); target.burning = 1; target.burnDps = 8;
    const w = battle('water', target); w.draw(slash);
    expect(target.burning).toBe(0); expect(target.burnDps).toBe(0); expect(target.aura).toBe('water');
    expect(target.maxHp - target.hp).toBeCloseTo(SPELLS.water.damage + STEAM.burnBaseDamage + 8); expect(w.notice).toContain('水克火·蒸汽冲击');
  });
  it('fuels an already concentrated burn from its base without exponential growth', () => {
    const target = wolf('fire'); target.burning = 2; target.burnDps = target.burnBaseDps = 32;
    const w = battle('wood', target); w.draw(slash);
    expect(target.burnDps).toBeCloseTo(43.2);
    w.draw(slash); expect(target.burnDps).toBeCloseTo(43.2);
    w.selected = 'water'; w.draw(slash);
    expect(target.burnBaseDps).toBe(0); expect(target.burnDps).toBe(0);
  });
});

describe('field reactions persist and change combat', () => {
  it.each(ELEMENTS.filter(element => element !== 'water'))('%s suppresses its opposing ward temporarily without destroying it', incoming => {
    const w = formation(OVERCOMES[incoming]), ward = w.wards[0]!, pulse = vi.fn();
    w.selected = incoming; w.draw(slash); expect(ward.suppressed).toBe(2); expect(ward.empowered).toBe(0);
    const target = wolf(); if (ward.element === 'earth') target.x = -8;
    w.wolves = [target]; ward.pulse = 0; w.events.on('pulse', pulse);
    w.tick(0.5); expect(target.hp).toBe(1000); expect(pulse).not.toHaveBeenCalled();
    expect(ward.health).toBe(ward.maxHealth); w.tick(1.6); expect(pulse).toHaveBeenCalledTimes(1);
    expect(w.wards).toHaveLength(1);
  });
  it('water consumes burning in the blast radius while fire wards and companions keep attacking', () => {
    const w = new World(); w.formationEffects.add({ id: 'pet', plan: () => [{ kind: 'test', attack: { damage: 10, interval: 1, range: 10 } }] });
    w.place(square); w.startWave(); const target = wolf('fire'); target.burning = 2; target.burnDps = 8; target.z = 4.8; w.wolves = [target];
    w.selected = 'water'; w.draw([{ x: -8, z: 2 }, { x: -4, z: 2 }]);
    expect(target.burning).toBe(0); expect(target.hp).toBeLessThan(1000);
    const before = target.hp; target.vx = target.vz = 0; w.tick(0.5);
    expect(target.hp).toBeLessThan(before); expect(w.companions[0]!.cooldown).toBeGreaterThan(0); expect(target.burning).toBeGreaterThan(0);
    w.tick(1.6); expect(target.hp).toBeLessThan(before);
  });
  it('wood raises fire ward damage and burn strength for a bounded duration', () => {
    const w = formation('fire'), ward = w.wards[0]!; w.selected = 'wood'; w.draw(slash);
    expect(ward.empowered).toBe(4); expect(ward.suppressed).toBe(0);
    const target = wolf(); w.wolves = [target]; ward.pulse = 0; w.tick(0.01);
    expect(target.burnDps).toBeCloseTo(CONCENTRATION.burnDps * 1.35 * ward.power.multiplier);
    expect(target.maxHp - target.hp).toBeCloseTo((abilities.fire.damage + CONCENTRATION.burnDps * 0.01) * 1.35 * ward.power.multiplier);
    w.wolves = []; w.tick(4); expect(ward.empowered).toBe(0);
  });
  it('spends empowerment and heat on steam and allows later generation', () => {
    const w = formation('fire'), ward = w.wards[0]!;
    w.selected = 'wood'; w.draw(slash); w.selected = 'water'; w.draw(slash);
    expect(ward.empowered).toBe(0); expect(ward.suppressed).toBe(0); expect(ward.charge).toBe(0);
    w.selected = 'wood'; w.draw(slash);
    expect(ward.empowered).toBe(4); expect(ward.suppressed).toBe(0);
  });
  it('does not repeatedly extract bursts from a fire ward with spent heat', () => {
    const w = formation('fire'); w.selected = 'water';
    const target = wolf(); target.z = 5.8; w.wolves = [target];
    const edge = [{ x: -8, z: 2 }, { x: -4, z: 2 }];
    w.draw(edge); const before = target.hp; w.draw(edge);
    expect(target.hp).toBe(before);
  });
  it('changes the natural campfire without damaging camp health, and cleans up on reset', () => {
    const w = new World(); w.startWave(); w.selected = 'wood';
    const atFire = [{ x: CAMP.x - 1, z: CAMP.z }, { x: CAMP.x + 1, z: CAMP.z }];
    const reaction = vi.fn(); w.events.on('reaction', reaction); w.draw(atFire);
    expect(w.naturalPower('fire')).toBe(1.35);
    expect(reaction).toHaveBeenCalledWith(expect.objectContaining({ from: 'wood', to: 'fire', sourceElement: 'fire', name: '助燃' }));
    w.selected = 'water'; w.draw(atFire);
    expect(w.naturalPower('fire')).toBe(1); expect(w.naturalInfluences.fire.charge).toBe(0); expect(w.health).toBe(100);
    w.tick(2.1); expect(w.naturalPower('fire')).toBe(1);
    w.draw(atFire); w.reset(); expect(w.naturalPower('fire')).toBe(1);
  });
  it('takes source strength before the stroke buffs it, independent of crossing order', () => {
    const a = formation('fire'), b = formation('fire');
    const targetA = wolf(), targetB = wolf(); a.wolves = [targetA]; b.wolves = [targetB]; a.selected = b.selected = 'wood';
    a.draw(slash); b.draw([...slash].reverse());
    expect(targetA.hp).toBe(targetB.hp); expect(targetA.burnDps).toBe(targetB.burnDps);
    expect(targetA.aura).toBe('fire'); expect(a.spirit).toBe(74);
  });
});
