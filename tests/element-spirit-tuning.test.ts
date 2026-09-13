import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { ELEMENTS, type Element, type Wolf } from '../src/game/contracts';
import { elementalReaction, GENERATES, planCombatStroke, SPELLS } from '../src/game/combat';
import { SPIRIT_DAMAGE } from '../src/game/rogue-balance';

const wolf = (id = 900, x = -6, z = 4): Wolf => ({ id, x, z, hp: 1000, maxHp: 1000, speed: 0, heading: 0, action: 'run', age: 0,
  attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0,
  aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
const line = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
function react(from: Element, to: Element, target = wolf(), others: Wolf[] = []) {
  const w = new World(); w.wolves = [target, ...others];
  w.reactionEffects.resolve([{ reaction: elementalReaction(from, to)!, at: target, power: 1, focusId: target.id, rooted: target.rooted }]);
  return { w, target };
}
function summon(element: Element) {
  const w = new World({ roguelike: true });
  w.chooseDestiny({ serial: 1, fate: 'spirit', tier: 'ordinary', boon: 'mimic', roots: [element] }); w.startWave();
  const s = w.mechanics.spirits[0]!; Object.assign(s, { x: -7, z: 4 });
  const target = wolf(); w.wolves = [target];
  const attack = () => w.mechanics.spiritSkills.attack(s, target, SPIRIT_DAMAGE[element], { kind: 'spirit', spiritId: s.id });
  return { w, s, target, attack };
}

describe('elemental reaction tuning', () => {
  it.each(ELEMENTS)('%s doubles the generation bonus, preserving ordinary base damage', element => {
    const w = new World(), target = wolf(); w.startWave(); w.wolves = [target];
    target.aura = GENERATES[element]; target.auraTime = 5;
    w.castRogueStroke(planCombatStroke(line)!, element);
    expect(1000 - target.hp).toBeCloseTo(SPELLS[element].damage * 2);
  });
  it('doubles spreading fire damage', () => {
    const near = wolf(901, -5); react('wood', 'fire', wolf(), [near]);
    expect(near.burnDps).toBeCloseTo(3 * .5 * 1.35 * 2);
  });
  it('doubles weakening and metal chain damage without adding extra charges', () => {
    const guard = react('fire', 'earth').target; expect(guard.reactions?.weakness).toBeCloseTo(.6);
    const edge = react('earth', 'metal').target; expect(edge.reactions?.edgePower).toBe(1); expect(edge.reactions?.edgeCharges).toBe(3);
  });
  it('doubles pulling and root time while leaving ordinary water spirit pulling alone', () => {
    const near = wolf(901, -5), { w } = react('metal', 'water', wolf(), [near]);
    expect(near.vx).toBe(-10); w.reactionEffects.pull({ x: -6, z: 4 }, [near], 1); expect(near.vx).toBe(-5);
    const root = wolf(902, -5); react('water', 'wood', wolf(), [root]); expect(root.rooted).toBeCloseTo(1.7);
  });
  it('doubles rupture, mire duration, melt and cut effects', () => {
    const rupture = react('wood', 'earth').target; expect(1000 - rupture.hp).toBe(24); expect(rupture.rooted).toBeCloseTo(1.7);
    expect(react('earth', 'water').w.reactionEffects.zones[0]).toMatchObject({ remaining: 8, slow: .65 });
    const melt = react('fire', 'metal').target; expect(1000 - melt.hp).toBe(12); expect(melt.reactions?.exposure).toBe(.5);
    const cut = wolf(); cut.rooted = 1; react('metal', 'wood', cut); expect(1000 - cut.hp).toBe(48); expect(cut.rooted).toBe(0);
  });
  it('doubles the full steam snapshot exactly once', () => {
    const w = new World(), target = wolf(); target.burning = 1; target.burnDps = 8; target.aura = 'fire'; target.auraTime = 5;
    w.startWave(); w.wolves = [target]; w.castRogueStroke(planCombatStroke(line)!, 'water');
    expect(1000 - target.hp).toBe(SPELLS.water.damage + (8 + 8) * 2); expect(target.burning).toBe(0);
  });
});

describe('summon attacks gain 50 percent and a bounded splash', () => {
  it.each(ELEMENTS)('%s keeps its direct hit at 150 percent', element => {
    const { w, s, target, attack } = summon(element); attack();
    expect(1000 - target.hp).toBeCloseTo(SPIRIT_DAMAGE[element] * s.power * w.build.affinityPower(element) * 1.5);
  });
  it.each(['metal', 'wood', 'water', 'fire'] as const)('%s splashes nearby off-axis targets without reaching distant enemies', element => {
    const { w, target, attack } = summon(element), near = wolf(901, -6, 5.3), far = wolf(902, -6, 6.5); w.wolves.push(near, far);
    attack(); expect(1000 - near.hp).toBeCloseTo((1000 - target.hp) * .4); expect(far.hp).toBe(1000);
  });
  it('does not double-hit existing metal pierce or earth stomp contacts', () => {
    for (const element of ['metal', 'earth'] as const) {
      const { w, target, attack } = summon(element), near = wolf(901, -5.5); w.wolves.push(near); attack();
      expect(1000 - near.hp).toBeCloseTo((1000 - target.hp) * (element === 'metal' ? .5 : .35));
    }
  });
  it('limits new splash to three enemies and never recurses', () => {
    const { w, attack } = summon('water'); const near = [1, 2, 3, 4, 5].map(n => wolf(900 + n, -6, 4 + n * .2)); w.wolves.push(...near);
    attack(); expect(near.filter(v => v.hp < 1000)).toHaveLength(3);
  });
  it('keeps damage upgrades and mimic scaling multiplicative once', () => {
    const { w, s } = summon('metal'), target = wolf();
    w.hitRogue(target, 20, 'metal', { kind: 'mimic', spiritId: s.id, scale: .5 });
    expect(1000 - target.hp).toBeCloseTo(20 * w.build.affinityPower('metal') * s.power * 1.5 * .5);
  });
});
