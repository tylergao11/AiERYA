import { describe, expect, it, vi } from 'vitest';
import { random, type Point } from '../src/core/math';
import { ELEMENTS, type Element, type Wolf } from '../src/game/contracts';
import { FateRoller, RunBuild, REWARDS, validDestiny, destinyBoons, type Boon, type Destiny, type Fate } from '../src/game/roguelike';
import { SLAYER_DAMAGE } from '../src/game/rogue-combat';
import { World } from '../src/game/world';
import { planCombatStroke } from '../src/game/combat';
import { abilities } from '../src/game/content';

const slash = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
const square = [{ x: -8, z: 2 }, { x: -4, z: 2 }, { x: -4, z: 6 }, { x: -8, z: 6 }, { x: -8, z: 2 }];
function destiny(fate: Fate, boon: Boon | null, roots: readonly Element[] = ['metal']): Destiny {
  return { serial: 1, fate, boon, roots, tier: boon === null ? 'heaven' : ['debt', 'living', 'beast'].includes(boon) ? 'unusual' : 'ordinary' };
}
function run(fate: Fate = 'slayer', boon: Boon | null = 'three', roots: readonly Element[] = ['metal']): World {
  const w = new World({ roguelike: true, random: random(42167) }); expect(w.chooseDestiny(destiny(fate, boon, roots))).toBe(true); return w;
}
function wolf(id = 900, at: Point = { x: -6, z: 4 }, hp = 1000): Wolf {
  return { id, ...at, hp, maxHp: hp, speed: 0, heading: 0, action: 'run', age: 0, attack: 10, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null };
}
function learn(w: World, id: string): void {
  w.phase = 'rest';
  for (let i = 0; i < 600; i++) {
    if (w.build.rollOffers(w.health).some(r => r.id === id)) { w.chooseUpgrade(id); expect(w.phase).toBe('prepare'); return; }
  }
  throw new Error(`Unavailable reward ${id}`);
}
function cast(w: World, points = slash): void { expect(w.invoke(points)).toBe(true); }
function advance(w: World, seconds: number): void { for (let t = 0; t < Math.round(seconds * 60); t++) w.tick(1 / 60); }
function awaken(w: World): void { for (let n = 0; n < 3; n++) learn(w, w.build.is('array') ? ['array-density', 'array-cycle', 'array-invoke'][n]! : `${w.build.destiny!.fate}-${w.build.is('slayer') ? 'edge' : 'might'}`); learn(w, 'awaken'); }

describe('opening rolls and compatible growth', () => {
  it('starts with an actual roll and guarantees heaven by roll twenty without a scripted first roll', () => {
    const roller = new FateRoller(() => .4); expect(roller.count).toBe(1); expect(roller.current.tier).toBe('ordinary');
    for (let i = 1; i < 19; i++) expect(roller.roll().tier).toBe('ordinary');
    expect(roller.roll().tier).toBe('heaven'); expect(roller.missed).toBe(0); expect(roller.recent).toEqual(roller.current);
  });
  it('retains independent candidates and heaven while browsing does not change the pity count', () => {
    const r = new FateRoller(random(6541)); r.save(); const first = r.current;
    for (let i = 0; i < 30; i++) { r.roll(); r.save(); }
    const count = r.count, missed = r.missed; expect(r.saved).toHaveLength(3); r.select(0);
    expect(r.current).toEqual(first); expect(r.count).toBe(count); expect(r.missed).toBe(missed); r.select(-1); expect(r.current.tier).toBe('heaven');
  });
  it('samples every supported configuration with real roots and internally consistent boons', () => {
    const r = new FateRoller(random(72931)), seen = new Set<string>(); let singles = 0;
    for (let i = 0; i < 30000; i++) { const d = r.roll(); expect(validDestiny(d)).toBe(true); singles += Number(d.roots.length === 1); seen.add(`${d.fate}:${d.tier}:${d.boon}:${d.roots.join()}`); }
    expect(seen.size).toBe(180); expect(singles / 30000).toBeGreaterThan(.72); expect(singles / 30000).toBeLessThan(.78);
  });
  it.each(['slayer', 'array', 'spirit'] as const)('%s can roll every growth lane without a reserved matching slot', fate => {
    const b = new RunBuild(random(312)); b.begin(destiny(fate, null, ['water']));
    const offeredElements = new Set<Element>(), lanes = new Set<string>(); let withoutMain = 0;
    for (let i = 0; i < 80; i++) {
      const offers = b.rollOffers(100); expect(new Set(offers.map(r => r.id)).size).toBe(offers.length);
      if (!offers.some(r => REWARDS.find(d => d.id === r.id)?.lane === fate)) withoutMain++;
      for (const r of offers) { const d = REWARDS.find(d => d.id === r.id); if (!d) continue; if (d.root) offeredElements.add(d.root); lanes.add(d.lane); expect(r.id).not.toBe('common-repair'); }
    }
    expect(offeredElements.size).toBe(5); expect([...lanes].sort()).toEqual(['array', 'common', 'reaction', 'root', 'slayer', 'spirit']); expect(withoutMain).toBeGreaterThan(20);
  });
  it('consumes exactly three run rerolls and rejects unavailable or repeated rewards', () => {
    const w = run(); w.phase = 'rest'; w.build.rollOffers(100);
    expect(w.rerollRewards()).toBe(true); expect(w.rerollRewards()).toBe(true); expect(w.rerollRewards()).toBe(true); expect(w.rerollRewards()).toBe(false);
    w.chooseUpgrade('ascend'); expect(w.phase).toBe('rest'); const id = w.build.offers[0]!.id; w.chooseUpgrade(id); w.chooseUpgrade(id); expect(w.build.level(id)).toBe(1);
  });
});

describe('actual World integration and slayer mechanics', () => {
  it('requires accepting a destiny, then keeps all five innate elements available regardless of rolled affinity', () => {
    const w = new World({ roguelike: true }); expect(w.phase).toBe('destiny'); w.startWave(); expect(w.phase).toBe('destiny'); expect(w.place(square)).toBe(false);
    expect(w.chooseDestiny(destiny('spirit', 'twins', ['water']))).toBe(true); expect(w.selectElement('fire')).toBe(true); expect(w.place(square)).toBe(true); w.startWave(); expect(w.invoke(slash)).toBe(true); expect(w.spirit).toBe(83);
  });
  it.each(ELEMENTS)('single %s slayer can deal real damage without building a ward', element => {
    const w = run('slayer', 'scar', [element]), target = wolf(); expect(w.place(square)).toBe(false); w.startWave(); w.wolves = [target]; cast(w);
    expect(1000 - target.hp).toBeCloseTo(SLAYER_DAMAGE[element] * 1.2); expect(w.spirit).toBe(97);
  });
  it('three blades physically hit both offset paths and spend only one cast cost', () => {
    const w = run(), center = wolf(900), left = wolf(901, { x: -6, z: 1.9 }), right = wolf(902, { x: -6, z: 6.1 }); w.startWave(); w.wolves = [center, left, right]; cast(w);
    expect(left.hp).toBe(1000); expect(right.hp).toBe(1000); advance(w, .15);
    expect(1000 - center.hp).toBeCloseTo(50.4); expect(1000 - left.hp).toBeCloseTo(50.4 * .45); expect(1000 - right.hp).toBeCloseTo(50.4 * .45); expect(w.spirit).toBeCloseTo(97 + .15 * w.regeneration);
  });
  it('crossing a live scar causes an actual explosion; expired scars do not', () => {
    const w = run('slayer', 'scar'), target = wolf(); w.startWave(); w.wolves = [target]; cast(w); const before = target.hp;
    cast(w, [{ x: -6, z: 2 }, { x: -6, z: 6 }]); expect(before - target.hp).toBeCloseTo((42 + 52) * 1.2);
    advance(w, 5.1); expect(w.mechanics.scar).toBeNull();
  });
  it('heaven slayer owns both independent opening effects', () => {
    const w = run('slayer', null); expect(destinyBoons(w.build.destiny!)).toEqual(['three', 'scar']); w.startWave(); const events = vi.fn(); w.events.on('invoke', events); cast(w); advance(w, .15); expect(events).toHaveBeenCalledTimes(3); expect(w.mechanics.scar).not.toBeNull();
  });
  it('debt has a hard floor, increases actual cast power and natural recovery repays the debt', () => {
    const w = run('slayer', 'debt'), target = wolf(); w.startWave(); w.wolves = [target]; w.spirit = 0; cast(w); expect(w.spirit).toBe(-3); expect(1000 - target.hp).toBeCloseTo(42 * 1.2 * 1.6);
    w.spirit = -35; const hp = target.hp; expect(w.invoke(slash)).toBe(false); expect(target.hp).toBe(hp); advance(w, .5); expect(w.spirit).toBeCloseTo(-35 + .5 * w.regeneration);
  });
  it('shares a finite refund ticket among the manual cast and all derived kills', () => {
    const w = run(); learn(w, 'slayer-return'); w.startWave(); w.spirit = 20;
    w.wolves = Array.from({ length: 9 }, (_, n) => wolf(900 + n, { x: -6 + n % 3 * .25, z: [1.9, 4, 6.1][Math.floor(n / 3)]! }, 1));
    cast(w); advance(w, .2); expect(w.kills).toBe(9); expect(w.spirit).toBeCloseTo(20 - 3 + 1.8 + 9 * .75 + .2 * w.regeneration);
  });
  it('awakened and ascended slayer attacks add real hits without recursively creating more casts', () => {
    const w = run('slayer', 'scar'); awaken(w); for (let i = 0; i < 3; i++) learn(w, 'slayer-return'); learn(w, 'ascend'); expect(w.build.stage).toBe(2);
    w.startWave(); const invoke = vi.fn(); w.events.on('invoke', invoke); for (let i = 0; i < 3; i++) { cast(w); advance(w, .75); } expect(invoke).toHaveBeenCalledTimes(7);
  });
});

describe('innate five-element roots with additive roguelike affinities', () => {
  it.each(ELEMENTS)('a water affinity never prevents %s casting or formation', element => {
    const w = run('spirit', 'twins', ['water']); expect(w.build.roots).toEqual(ELEMENTS); expect(w.selectElement(element)).toBe(true); expect(w.place(square)).toBe(true); w.startWave(); expect(w.invoke(slash)).toBe(true);
  });
  it('only boosts the rolled affinity; other innate elements retain their normal power', () => {
    const w = run('slayer', 'scar', ['fire']); w.startWave();
    for (const element of ELEMENTS) { const target = wolf(); w.wolves = [target]; w.hitRogue(target, 10, element, { kind: 'manual' }); expect(1000 - target.hp).toBeCloseTo(element === 'fire' ? 12 : 10); }
  });
  it('dual affinities boost each selected element while leaving all five castable', () => {
    const w = run('slayer', 'scar', ['water', 'fire']);
    for (const element of ELEMENTS) { expect(w.build.owns(element)).toBe(true); expect(w.build.affinityPower(element)).toBeCloseTo(['water', 'fire'].includes(element) ? 1.12 : 1); }
  });
  it('a spirit can be switched through all five elements regardless of its initial affinity', () => {
    const w = run('spirit', 'mimic', ['water']), pet = w.mechanics.spirits[0]!, elements = new Set<Element>();
    for (let i = 0; i < 5; i++) { elements.add(pet.element); expect(w.cycleSpirit(pet.id)).toBe(true); } expect(elements.size).toBe(5);
  });
  it('off-affinity elemental rewards remain usable and affect actual damage', () => {
    const w = run('slayer', 'scar', ['water']); learn(w, 'root-metal-pursuit'); w.startWave(); const primary = wolf(901, { x: -6, z: 4 }, 1), second = wolf(902, { x: -4, z: 4 }); w.wolves = [primary, second];
    w.hitRogue(primary, 2, 'metal', { kind: 'manual' }); expect(1000 - second.hp).toBeCloseTo(24);
  });
});

describe('ancient arrays and independent spirits', () => {
  it('stamps two gift arrays with separate budgets and rejects a third', () => {
    const w = run('array', 'twinArray'); expect(w.draw(loopAt(-6, 4))).toBe(true); expect(w.draw(loopAt(3, 4))).toBe(true);
    expect(w.spirit).toBe(100); expect(w.wards.map(w => w.mainSlot)).toEqual([0, 1]); expect(w.wards[1]!.power.multiplier / w.wards[0]!.power.multiplier).toBeCloseTo(.65); expect(w.draw(loopAt(3, 13))).toBe(true); expect(w.wards[2]!.mainSlot).toBeUndefined(); expect(w.spirit).toBe(86);
  });
  it('cannot farm spirit or healing by undoing and restoring a gifted array', () => {
    const w = run('array', 'fivefold'); expect(w.draw(loopAt(-6, 4))).toBe(true); w.wards[0]!.health = 40; w.spirit = 20; w.undo(); expect(w.spirit).toBe(20); expect(w.mechanics.spirits).toHaveLength(0);
    expect(w.draw(loopAt(-6, 4))).toBe(true); expect(w.wards[0]!.health).toBe(w.wards[0]!.maxHealth); expect(w.spirit).toBe(6); expect(w.mechanics.spirits).toHaveLength(0);
  });
  it('main growth updates existing arrays and preserves their current health fraction', () => {
    const w = run('array', 'twinArray', ['earth']); w.draw(loopAt(-6, 4)); const ward = w.wards[0]!, old = ward.power.multiplier; ward.health /= 2; learn(w, 'array-density'); expect(ward.power.multiplier).toBeCloseTo(old); expect(ward.health / ward.maxHealth).toBeCloseTo(.5);
  });
  it('living-array migration validates before charging and preserves identity, health and cooldowns', () => {
    const w = run('array', 'living'); w.draw(loopAt(-6, 4)); const ward = w.wards[0]!; ward.health = 40; ward.pulse = .7; w.startWave(); const event = vi.fn(); w.events.on('wardMoved', event);
    expect(w.moveMain(ward.id, { x: 999, z: 999 })).toBe(false); expect(w.spirit).toBe(100); expect(w.moveMain(ward.id, { x: 3, z: 4 })).toBe(true); expect(w.spirit).toBe(90); expect(ward.health).toBe(40); expect(ward.pulse).toBe(.7); expect(w.wards[0]!.id).toBe(ward.id); expect(event).toHaveBeenCalledOnce();
    expect(w.moveMain(ward.id, { x: -6, z: 4 })).toBe(true); expect(w.spirit).toBe(80);
  });
  it('array attacks stay on the terrain and never create a companion', () => {
    const w = run('array', 'fivefold'); w.draw(loopAt(-6, 4)); expect(w.mechanics.spirits).toHaveLength(0); const target = wolf(900, { x: -5.5, z: 4 }); w.startWave(); w.wolves = [target]; advance(w,.6); expect(w.combatTotals.companion).toBe(0); expect(target.hp).toBeLessThan(1000); w.phase = 'prepare'; w.undo(); expect(w.mechanics.spirits).toHaveLength(0);
  });
  it('heaven array retains both arrays and awakens auxiliary relay without pets', () => {
    const w = run('array', null); w.draw(loopAt(-6, 4)); w.draw(loopAt(3, 4)); awaken(w); expect(w.mechanics.spirits).toHaveLength(0); expect(w.wards).toHaveLength(2); w.startWave(); w.wolves = [wolf()]; advance(w,.6); expect(w.mechanics.arrays.total).toBeGreaterThan(1);
  });
  it('stored array momentum powers a manual release; ascension keeps control with the player', () => {
    const w = run('array', 'fivefold'); w.draw(loopAt(-6, 4)); awaken(w); const ward=w.wards[0]!, target=wolf(); w.startWave(); w.wolves=[target];
    for(let i=0;i<5;i++){w.time+=.25;w.hitRogue(target,60,'metal',{kind:'array',wardId:ward.id});}
    const stored=w.mechanics.arrays.total, hp=target.hp;expect(stored).toBeGreaterThan(20);cast(w);expect(target.hp).toBeLessThan(hp);expect(w.mechanics.arrays.total).toBeLessThan(stored);
    learn(w,'array-echo');learn(w,'array-remnant');learn(w,'ascend');expect(w.build.stage).toBe(2);expect(w.build.core()).toBeNull();
  });
  it('twins attack separately; extra support never divides the original spirit power', () => {
    const w = run('spirit', 'twins'), main = w.mechanics.spirits[0]!, twin = w.mechanics.spirits[1]!; expect(main.power).toBe(1); expect(twin.power).toBe(.65); awaken(w); expect(w.mechanics.spirits).toHaveLength(3); expect(main.power).toBe(1); expect(twin.power).toBe(.65);
    w.startWave(); w.wolves = [wolf()]; w.mechanics.spirits.forEach(s=>{s.x=-10;s.z=4;}); const attackers=new Set<number>();w.events.on('spiritAttack',e=>{if(e.stage==='impact')attackers.add(e.spiritId);});advance(w,.6);expect(attackers).toEqual(new Set(w.mechanics.spirits.map(s=>s.id)));expect(w.combatTotals.companion).toBeGreaterThan(0);
  });
  it('mimic repeats a delivered order and keeps its native element without another mana payment', () => {
    const w = run('spirit', 'mimic', ['fire', 'water']); const s=w.mechanics.spirits[0]!;expect(s.element).toBe('water');w.startWave();w.wolves=[wolf()];Object.assign(s,{x:-10,z:4,cooldown:0});
    const invoke=vi.fn(),echo=vi.fn();w.events.on('invoke',invoke);w.events.on('summonImpact',e=>{if(e.echo)echo(e);});cast(w);expect(w.wolves[0]!.hp).toBe(1000);advance(w,.95);
    expect(invoke).not.toHaveBeenCalled();expect(echo).toHaveBeenCalledOnce();expect(s.element).toBe('water');expect(w.spirit).toBeCloseTo(100-w.spellCost+.95*w.regeneration);expect(w.combatTotals.companion).toBeGreaterThan(0);
  });
  it('heaven spirit initially has two imitators, later support does not imitate again', () => {
    const w = run('spirit', null);awaken(w);const event=vi.fn();w.events.on('summonImpact',e=>{if(e.echo)event(e);});w.startWave();w.wolves=[wolf(900,{x:-6,z:4},10000)];w.mechanics.spirits.forEach(s=>{s.x=-10;s.z=4;s.cooldown=0;});cast(w,[{x:-9,z:4},{x:-3,z:4}]);advance(w,.95);expect(event).toHaveBeenCalledTimes(2);expect(w.mechanics.spirits).toHaveLength(3);
  });
  it('ancestor evolves on twelve main-spirit kills and remains unique after both breakthroughs', () => {
    const w = run('spirit', 'beast'), main = w.mechanics.spirits[0]!; w.startWave();
    for (let i = 0; i < 12; i++) { const target = wolf(900 + i, { x: -6, z: 4 }, 1); w.wolves = [target]; w.hitRogue(target, 5, 'metal', { kind: 'spirit', spiritId: main.id }); }
    expect(w.mechanics.beastMarks).toBe(12); expect(main.size).toBeGreaterThan(2); awaken(w); for (let i = 0; i < 3; i++) learn(w, 'spirit-harmony'); learn(w, 'ascend'); expect(w.mechanics.spirits).toHaveLength(1);
    w.phase='battle';w.wolves=[wolf(930,{x:main.x+1,z:main.z},10000)];main.cooldown=0;w.mechanics.commands.resonance=100;const impacts=vi.fn();w.events.on('summonImpact',e=>{if(e.union)impacts(e);});cast(w,[{x:main.x,z:main.z},{x:main.x+2,z:main.z}]);advance(w,.3);expect(w.mechanics.commands.resonance).toBe(0);expect(impacts).toHaveBeenCalledOnce();
  });
  it('spirit-command makes the same existing pet hit a marked target harder', () => {
    const w = run('spirit', 'twins'); learn(w, 'spirit-command'); w.startWave(); const target = wolf(), main = w.mechanics.spirits[0]!; w.wolves = [target]; w.mechanics.commands.command(target); w.hitRogue(target, 10, 'metal', { kind: 'spirit', spiritId: main.id }); expect(1000 - target.hp).toBeCloseTo(10 * 1.2 * 1.3);
  });
});

describe('root effects, resources and run lifecycle', () => {
  it('metal pursuit has a target limit and cannot recursively kill a whole chain', () => {
    const w = run('slayer', 'scar'); learn(w, 'root-metal-pursuit'); w.startWave(); w.wolves = [wolf(901, { x: -6, z: 4 }, 1), wolf(902, { x: -4, z: 4 }, 1), wolf(903, { x: -2, z: 4 }, 1)];
    w.hitRogue(w.wolves[0]!, 2, 'metal', { kind: 'manual' }); expect(w.kills).toBe(2); expect(w.wolves[2]!.hp).toBe(1);
  });
  it('wood death seeds damage later without creating recursive seeds', () => {
    const w = run('slayer', 'scar', ['wood']); learn(w, 'root-wood-seed'); w.startWave(); const dead = wolf(901, { x: -6, z: 4 }, 1), nearby = wolf(902, { x: -4, z: 4 }); w.wolves = [dead, nearby]; dead.rooted = .5;
    w.hitRogue(dead, 5, 'wood', { kind: 'manual' }); expect(w.mechanics.seeds).toHaveLength(1); advance(w, .65); expect(nearby.hp).toBeLessThan(1000); expect(w.mechanics.seeds).toHaveLength(0);
  });
  it('water ripple requires a wet target and enforces a shared interval', () => {
    const w = run('slayer', 'scar', ['water']); learn(w, 'root-water-ripple'); w.startWave(); const target = wolf(), near = wolf(901, { x: -4, z: 4 }); w.wolves = [target, near];
    w.hitRogue(target, 1, 'water', { kind: 'manual' }); expect(near.hp).toBe(1000); w.hitRogue(target, 1, 'water', { kind: 'manual' }); const hp = near.hp; expect(hp).toBeLessThan(1000); w.hitRogue(target, 1, 'water', { kind: 'manual' }); expect(near.hp).toBe(hp);
  });
  it('fire ember inherits a weaker burn, survives a burn kill, and never spreads from derived embers', () => {
    const w = run('slayer', 'scar', ['fire']); learn(w, 'root-fire-ember'); w.startWave(); const first = wolf(901, { x: -6, z: 4 }, 1), second = wolf(902, { x: -3, z: 4 }, 1), third = wolf(903, { x: 0, z: 4 }, 1); w.wolves = [first, second, third];
    first.burning = 1; first.burnDps = 100; w.tick(.03); expect(first.action).toBe('dead'); expect(second.burnDps).toBeCloseTo(45); expect(second.action).toBe('dead'); expect(third.burning).toBe(0);
  });
  it('earth triggers only on the third direct hit, with no recursive stacks', () => {
    const w = run('slayer', 'scar', ['earth']); learn(w, 'root-earth-fracture'); w.startWave(); const target = wolf(); w.wolves = [target];
    for (let i = 0; i < 3; i++) w.hitRogue(target, 1, 'earth', { kind: 'manual' }); expect(1000 - target.hp).toBeCloseTo((3 + 32) * 1.2);
  });
  it('reserves, regeneration, overdrive and repair apply their actual rewards once', () => {
    const w = run(); w.spirit = 10; learn(w, 'common-capacity'); expect(w.capacity).toBe(100); expect(w.spirit).toBe(40); learn(w, 'common-regen'); expect(w.regeneration).toBeCloseTo(3.9); expect(w.killSpirit).toBeCloseTo(.975); learn(w, 'common-overdrive'); expect(w.regeneration).toBeCloseTo(3.12); expect(w.killSpirit).toBeCloseTo(.78); w.health = 40; learn(w, 'common-repair'); expect(w.health).toBe(70);
  });
  it('all three reserve rewards replenish spirit without raising its cap or banking overflow', () => {
    const w = run(); w.spirit = 97;
    for (let level = 1; level <= 3; level++) {
      learn(w, 'common-capacity');
      expect(w.build.level('common-capacity')).toBe(level);
      expect(w.capacity).toBe(100); expect(w.spirit).toBe(100); expect(w.ledger.earned).toBe(3);
      expect(w.build.learned.find(r => r.id === 'common-capacity')!.detail).toBe('立即恢复 30 灵力，最多恢复至 100');
    }
  });
  it('pause and rest do not fire pending attacks, regenerate or advance companion cooldowns', () => {
    const w = run('spirit', 'mimic'); w.startWave(); cast(w); const event = vi.fn(); w.events.on('invoke', event); const spirit = w.spirit; w.phase = 'rest'; advance(w, 1); expect(w.spirit).toBe(spirit); expect(event).not.toHaveBeenCalled(); w.tick(0); expect(event).not.toHaveBeenCalled();
  });
  it('clears run state and timers on restart while retaining opening-roll candidates', () => {
    const w = run('spirit', 'twins'); w.fateRoller.save(); learn(w, 'common-capacity'); w.startWave(); w.reset(); expect(w.phase).toBe('destiny'); expect(w.capacity).toBe(100); expect(w.build.active).toBe(false); expect(w.mechanics.spirits).toHaveLength(0); expect(w.build.offers).toHaveLength(0); expect(w.fateRoller.saved).toHaveLength(1);
  });
  it('retains build after the ten-wave endpoint, offers a reward once and supports further growth', () => {
    const w = run(); learn(w, 'slayer-edge'); w.wave = 10; w.phase = 'won'; const d = w.build.destiny; w.continueRun(); expect(w.phase).toBe('rest'); expect(w.build.offers).toHaveLength(3); const revision = w.build.revision; w.continueRun(); expect(w.build.revision).toBe(revision);
    const reward = w.build.offers[0]!; w.chooseUpgrade(reward.id); w.startWave(); expect(w.wave).toBe(11); expect(w.phase).toBe('battle'); expect(w.build.destiny).toEqual(d); expect(w.build.level('slayer-edge')).toBeGreaterThanOrEqual(1);
    expect(reward.boon ? w.build.has(reward.boon) : w.build.level(reward.id) > 0).toBe(true);
  });
  it('keeps long-path concentration on side blades', () => { const w = run(); const s = planCombatStroke([{ x: -20, z: 4 }, { x: 12, z: 4 }])!; for (const side of w.mechanics.sideStrokes(s)) expect(side.multiplier / side.investment!).toBeCloseTo(.5); });
  it('ending and resuming after a chosen reward cannot grant that wave again', () => {
    const w = run(); w.wave = 10; w.phase = 'won'; w.continueRun(); w.chooseUpgrade(w.build.offers[0]!.id); const progress = w.build.progress;
    w.finishRun(); expect(w.victoryHasReward).toBe(false); w.continueRun(); expect(w.phase).toBe('prepare'); expect(w.build.offers).toHaveLength(0); expect(w.build.progress).toBe(progress);
  });
  it('a full charged hit opens a one-use quick-cut follow-up instead of passively multiplying every hit', () => {
    const w = run(); learn(w, 'slayer-focus'); learn(w, 'common-spell'); w.startWave(); const target = wolf(); w.wolves = [target];
    w.invoke(slash, 1.2); expect(1000 - target.hp).toBeCloseTo(42 * 1.2 * 2.6 * 1.25);
    const hp = target.hp; cast(w); expect(hp - target.hp).toBeCloseTo(42 * 1.2 * 1.25 * 1.3);
    const next = target.hp; cast(w); expect(next - target.hp).toBeCloseTo(42 * 1.2 * 1.25);
  });
  it('array routing keeps baseline cadence; dormant spirit speed does not affect arrays', () => {
    const a = run('array', 'fivefold'); a.draw(loopAt(-6, 4)); const ward = a.wards[0]!; learn(a, 'array-cycle'); learn(a, 'spirit-harmony'); a.startWave(); a.wolves = [wolf()]; a.tick(.01);
    expect(ward.pulse).toBeCloseTo(abilities.metal.interval); expect(a.mechanics.spirits).toHaveLength(0); expect(a.build.learned.find(r=>r.id==='spirit-harmony')?.dormant).toContain('需御灵机缘');
  });
  it('weak later burns cannot steal a prior cast refund credit or refresh its duration', () => {
    const w = run('slayer', 'scar', ['fire']); w.startWave(); const target = wolf(); w.wolves = [target]; w.spirit = 20; const first = w.mechanics.beginCast(false);
    w.hitRogue(target, 0, 'fire', first); const dps = target.burnDps; target.burning = .5;
    w.hitRogue(target, 0, 'fire', { kind: 'derived', scale: .1, noProc: true }); expect(target.burnDps).toBe(dps); expect(target.burning).toBe(.5); expect(w.mechanics.burnOrigin(target)?.ticket).toBe(first.ticket);
  });
});

function loopAt(x: number, z: number) { return [{ x: x - 3, z: z - 3 }, { x: x + 3, z: z - 3 }, { x: x + 3, z: z + 3 }, { x: x - 3, z: z + 3 }, { x: x - 3, z: z - 3 }]; }
