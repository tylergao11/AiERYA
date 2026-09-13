import { describe, expect, it } from 'vitest';
import { distance, inside, type Point } from '../src/core/math';
import { COMBAT, SPELLS, STEAM, planCombatStroke } from '../src/game/combat';
import type { Element, Wolf } from '../src/game/contracts';
import { World } from '../src/game/world';
import { mapPoint } from '../src/game/map';

const enemy = (id = 900, x = -6, z = 4): Wolf => ({ id, x, z, hp: 1000, maxHp: 1000, speed: 0, heading: 0, action: 'run', age: 0, attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
const slash = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
const circle = (x: number, z: number, r: number): Point[] => Array.from({ length: 49 }, (_, i) => ({ x: x + Math.cos(i / 48 * Math.PI * 2) * r, z: z + Math.sin(i / 48 * Math.PI * 2) * r }));
const advance = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) w.tick(1 / 60); };
const ready = (element: Element = 'metal') => { const w = new World(); w.selected = element; w.startWave(); return w; };

describe('active spells have a bounded intervention budget', () => {
  it('hits every intersected target with half metal damage after the first, including closed loops', () => {
    for (const path of [slash, circle(-6, 4, 2)]) {
      const w = ready(); w.wolves = [enemy(900), enemy(901, -5.8), enemy(902, -5.6)];
      expect(w.draw(path)).toBe(true);
      const power = planCombatStroke(path)!.multiplier;
      w.wolves.forEach((wolf,i) => expect(1000 - wolf.hp).toBeCloseTo((i ? 8 : 16) * power));
    }
  });
  it('allows consecutive same-element casts and selection changes while spirit lasts', () => {
    const w = ready(); w.spirit=48; expect(w.draw(slash)).toBe(true);
    w.selected = 'wood'; expect(w.draw(slash)).toBe(true);
    w.selected = 'metal'; expect(w.draw(slash)).toBe(true); expect(w.draw(slash)).toBe(true);
    expect(w.spirit).toBe(0); expect(w.draw(slash)).toBe(false);
    w.reset();
    expect(Object.values(w.combatTotals).every(value => value === 0)).toBe(true);
  });
  it('holds ready ward attacks until an enemy arrives and attacks immediately on contact', () => {
    const w = new World(); w.selected = 'metal'; w.place(circle(-6, 4, 3)); w.startWave(); advance(w, 0.2);
    const target = enemy(); w.wolves = [target]; w.tick(0.01);
    expect(target.hp).toBeLessThan(1000); const first = target.hp;
    w.tick(0.4); expect(target.hp).toBe(first); advance(w, 0.51); expect(target.hp).toBeLessThan(first);
  });
  it('does not permanently refresh roots while already rooted and provides recovery after release', () => {
    const w = new World(); w.selected = 'wood'; w.place(circle(-6, 4, 1)); w.startWave(); const target = enemy(); w.wolves = [target];
    w.tick(0.01); expect(target.rooted).toBeGreaterThan(1);
    advance(w, 1.5); expect(target.rooted).toBe(0); expect(target.rootImmunity).toBeGreaterThan(0);
    w.wards[0]!.pulse = 0; w.tick(0.01); expect(target.rooted).toBe(0);
    advance(w, 1.2); expect(target.rooted).toBeGreaterThan(0);
  });
});

describe('steam exchanges existing fire for one real area explosion', () => {
  it('consumes the full remaining burn, hits nearby enemies outside the stroke, and respects the radius', () => {
    const w = ready('water'), burning = enemy(), neighbor = enemy(901, -6, 6.8), outside = enemy(902, -6, 7.3);
    burning.burning = 2; burning.burnDps = burning.burnBaseDps = 12;
    w.wolves = [burning, neighbor, outside]; w.draw(slash);
    expect(burning.burning).toBe(0); expect(burning.burnDps).toBe(0);
    expect(1000 - burning.hp).toBe(34); expect(1000 - neighbor.hp).toBe(32); expect(outside.hp).toBe(1000);
    expect(w.combatTotals.steam).toBe(64); expect(w.combatTotals.spell).toBe(2);
    const before = neighbor.hp; advance(w, 3.1); w.draw(slash); expect(neighbor.hp).toBe(before);
  });
  it('resolves only the strongest overlapping explosion per target and never chain-explodes bystanders', () => {
    const w = ready('water'), a = enemy(), b = enemy(901, -5.8), neighbor = enemy(902, -6, 6.8);
    a.burning = b.burning = 2; a.burnDps = a.burnBaseDps = 12; b.burnDps = b.burnBaseDps = 8;
    w.wolves = [a, b, neighbor]; w.draw(slash);
    expect(1000 - neighbor.hp).toBe(32); expect(1000 - a.hp).toBe(34); expect(1000 - b.hp).toBe(34);
  });
  it('preserves the fire ward and its ability to ignite again, but spends its heat once', () => {
    const w = new World(); w.place(circle(-6, 4, 3)); w.startWave(); w.selected = 'water'; const ward = w.wards[0]!;
    const target = enemy(); w.wolves = [target]; w.draw(slash);
    expect(ward.charge).toBe(0); expect(ward.suppressed).toBe(0); expect(ward.health).toBe(ward.maxHealth);
    expect(w.combatTotals.steam).toBeGreaterThan(0); w.tick(0.01); expect(target.burning).toBeGreaterThan(0);
    // Isolate consumed field heat from fresh wolf burning to test duplicate extraction.
    w.wolves = []; let explosions = 0; w.events.on('steam', () => explosions++); w.draw(slash); expect(explosions).toBe(0);
    advance(w, STEAM.reheatSeconds + 0.1); w.draw(slash); expect(explosions).toBe(1);
  });
  it('keeps passive water slowing compatible with fire damage instead of silently deleting it', () => {
    const w = new World(); w.selected = 'water'; w.place(circle(-6, 4, 3)); const target = enemy(); target.burning = 2; target.burnDps = 12;
    w.startWave(); w.wolves = [target]; w.tick(0.01); expect(target.burning).toBeGreaterThan(0); expect(target.slowAmount).toBeGreaterThan(0.5);
  });
  it('counts actual damage, including a lethal burn tick, without counting overkill', () => {
    const w = ready('water'), target = enemy(); target.hp = 5; target.burning = 2; target.burnDps = 12; w.wolves = [target]; w.draw(slash);
    expect(Object.values(w.combatTotals).reduce((a, b) => a + b, 0)).toBe(5); expect(w.kills).toBe(1);
  });
});

const atArt = (x: number, y: number, radius: number): Point[] => { const p = mapPoint(x,y); return circle(p.x,p.z,radius); };
// Defend the actual straight approaches, including the lower entrance.
const layout: [Element, Point[]][] = [
  ['water', atArt(650,304,2.6)], ['fire', atArt(480,283,2.4)], ['metal', atArt(386,272,1.75)],
  ['wood', atArt(500,468,2.7)], ['water', atArt(423,395,2.5)], ['fire', atArt(360,335,2.3)],
];
function simulate(wards: boolean, gold: boolean, allWaves = false, tactical = false) {
  const w = new World();
  if (wards) for (const [element, points] of layout) { w.selected = element; expect(w.place(points), `${element} ${JSON.stringify(points[0])}: ${w.notice}`).toBe(true); }
  w.startWave(); let casts = 0;
  const used: Record<string, number> = {};
  w.events.on('reactionEffect', event => { used[event.effect] = (used[event.effect] ?? 0) + 1; });
  w.events.on('steam', () => { used.steam = (used.steam ?? 0) + 1; });
  const nextWave = () => { if (w.phase === 'rest' && w.wave < 3) { w.chooseUpgrade('resonance'); w.startWave(); } };
  for (let i = 0; i < 270 * 60 && w.phase === 'battle'; i++) {
    if (tactical && w.spirit >= w.spellCost) {
      const alive = w.wolves.filter(wolf => wolf.action !== 'dead');
      const options: { element: Element; at: Point; score: number }[] = [];
      for (const wolf of alive) {
        if(distance(wolf,w.camp)<10)options.push({element:'metal',at:wolf,score:1});
        const neighbors = alive.filter(other => distance(wolf, other) < 3.2).length;
        if (wolf.burning > 0.5 && neighbors >= 2 && wolf.hp > 10) options.push({ element: 'water', at: wolf, score: 10 + neighbors });
        if (wolf.rooted > 0.3 && wolf.hp > 20) options.push({ element: 'metal', at: wolf, score: 8 });
        if (wolf.wet > 0 && neighbors >= 3 && !w.reactionEffects.zones.length) options.push({ element: 'earth', at: wolf, score: 6 });
        if (wolf.wet > 0 && neighbors >= 2) options.push({ element: 'metal', at: wolf, score: 4 });
        if (wolf.aura === 'metal' && wolf.hp > 40 && !(wolf.reactions?.exposed! > 0)) options.push({ element: 'fire', at: wolf, score: 9 });
      }
      for (const ward of w.wards) if (ward.empowered === 0 && alive.some(wolf => inside(wolf, ward.points))) {
        if (ward.element === 'fire') options.push({ element: 'wood', at: ward, score: 7 });
        if (ward.element === 'metal') options.push({ element: 'earth', at: ward, score: 5 });
      }
      for (const ward of w.wards) if (ward.element === 'fire' && ward.charge >= 0.5 && alive.length) {
        const edge = [...ward.points].sort((a,b) => Math.min(...alive.map(wolf=>distance(a,wolf))) - Math.min(...alive.map(wolf=>distance(b,wolf))))[0]!;
        const nearby = alive.filter(wolf=>distance(wolf,edge)<3.1);
        if (nearby.length >= 2) options.push({ element:'water',at:edge,score:20+nearby.length });
      }
      const choice = options.sort((a,b)=>b.score-a.score)[0];
      if (choice) { w.selected = choice.element; if (w.draw([{ x: choice.at.x - 2, z: choice.at.z }, { x: choice.at.x + 2, z: choice.at.z }])) casts++; }
    } else if (gold && w.spirit >= w.spellCost) {
      const targets = w.wolves.filter(wolf => wolf.action !== 'dead').sort((a, b) => distance(a, w.camp) - distance(b, w.camp));
      if (targets[0]) {
        const a = targets[0], b = targets.find(wolf => wolf !== a && distance(a, wolf) < 10) ?? { x: a.x + 0.5, z: a.z };
        w.selected = 'metal'; if (w.draw([{ x: a.x, z: a.z }, { x: b.x, z: b.z }])) casts++;
      }
    }
    w.tick(1 / 60);
    if (allWaves) nextWave();
  }
  return { phase: w.phase, seconds: Math.round(w.time * 10) / 10, health: w.health, kills: w.kills, casts, damage: w.combatTotals, used };
}
describe('first wave defense comparison using real navigation, attacks and regeneration', () => {
  it('requires sustained defenses rather than replacing every ward with repeated gold', () => {
    const goldOnly = simulate(false, true), wardsOnly = simulate(true, false), supported = simulate(true, true);
    console.info('DEFENSE_COMPARISON', JSON.stringify({ goldOnly, wardsOnly, supported }));
    expect(goldOnly.phase).toBe('lost');
    // The campfire now contributes weak fallback damage; sustained wards still
    // kill more than twice as many enemies and are required to survive this run.
    expect(goldOnly.damage.campfire).toBeGreaterThan(0);
    expect(wardsOnly.kills).toBeGreaterThan(goldOnly.kills*2);
    expect(wardsOnly.kills).toBeLessThanOrEqual(96);
    expect(supported.phase).toBe('rest'); expect(supported.damage.ward).toBeGreaterThan(supported.damage.spell);
    expect(COMBAT.regeneration / COMBAT.spellCost * SPELLS.metal.damage * 1.5).toBeLessThan(10);
  });
  it('keeps the same defenses playable through the three opening waves and their upgrades', () => {
    const result = simulate(true, true, true);
    expect(result.phase).toBe('rest'); expect(result.kills).toBe(396);
    expect(result.damage.ward).toBeGreaterThan(result.damage.spell * 2);
  });
  it('supports tactical element switching across three waves, with formations still contributing', () => {
    const first = simulate(true, false, false, true), campaign = simulate(true, false, true, true);
    console.info('TACTICAL_COMPARISON', JSON.stringify({ first, campaign }));
    expect(first.phase).toBe('rest'); expect(campaign.phase).toBe('rest'); expect(campaign.kills).toBe(396);
    expect(Object.keys(campaign.used).length).toBeGreaterThanOrEqual(4);
    expect(campaign.damage.steam + campaign.damage.reaction).toBeGreaterThan(campaign.damage.spell * .5);
    expect(campaign.damage.ward).toBeGreaterThan(campaign.damage.spell * 2);
  });
  it('previews a finite route ending at camp for every entrance', () => {
    const w = new World();
    for (const from of [{ x: 15.7, z: -4.7 }, { x: 17.1, z: 5.5 }, { x: 0.5, z: 17.6 }]) {
      const route = w.navigation.route(from);
      expect(route.length).toBeGreaterThanOrEqual(2); expect(route.length).toBeLessThan(120);
      expect(distance(route.at(-1)!, w.camp)).toBeLessThan(1.8);
    }
  });
});
