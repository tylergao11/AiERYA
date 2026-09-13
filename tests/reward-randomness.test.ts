import { describe, expect, it, vi } from 'vitest';
import { random } from '../src/core/math';
import { ELEMENTS, type Wolf } from '../src/game/contracts';
import { BOONS, OPPORTUNITIES, type Boon, type Fate } from '../src/game/roguelike';
import { World } from '../src/game/world';
import { wardArea } from '../src/game/ward-geometry';

function run(fate: Fate = 'slayer', boon: Boon = 'scar'): World {
  const w = new World({ roguelike: true, random: random(312) });
  w.chooseDestiny({ serial: 1, fate, boon, roots: ['metal'], tier: 'ordinary' }); return w;
}
function learn(w: World, id: string): void {
  w.phase = 'rest';
  for (let n = 0; n < 600; n++) if (w.build.rollOffers(w.health).some(r => r.id === id)) { w.chooseUpgrade(id); expect(w.phase).toBe('prepare'); return; }
  throw new Error(`Reward unavailable: ${id}`);
}
const target = (): Wolf => ({ id: 900, x: -6, z: 4, hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0, attack: 10, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
const shape = (x = -6, z = 4) => [{ x: x - 3, z: z - 2 }, { x: x + 3, z: z - 2 }, { x: x + 1, z: z + 2 }, { x: x - 3, z: z + 1 }, { x: x - 3, z: z - 2 }];

describe('unreserved wave rewards and earned changes of direction', () => {
  it('can offer three dormant cards; matching growth has only a mild probability advantage', () => {
    const w = run(), counts: Record<string, number> = {}; let allDormant = 0, opportunityCount = 0;
    for (let n = 0; n < 5000; n++) {
      const offers = w.build.rollOffers(100); expect(offers).toHaveLength(3); expect(new Set(offers.map(r => r.id)).size).toBe(3);
      if (offers.every(r => r.dormant)) allDormant++;
      for (const r of offers) { counts[r.id] = (counts[r.id] ?? 0) + 1; if (r.boon) opportunityCount++; }
    }
    expect(allDormant).toBeGreaterThan(10);
    expect(counts['slayer-edge']! / counts['array-density']!).toBeGreaterThan(1.05);
    expect(counts['slayer-edge']! / counts['array-density']!).toBeLessThan(1.5);
    expect(counts['root-metal-pursuit']! / counts['root-water-ripple']!).toBeLessThan(1.4);
    expect(opportunityCount / 15000).toBeGreaterThan(.08); expect(opportunityCount / 15000).toBeLessThan(.18);
    expect(counts['common-repair']).toBeUndefined(); expect(counts['opportunity-scar']).toBeUndefined(); expect(counts.awaken).toBeUndefined();
    for (const r of OPPORTUNITIES.filter(r => r.boon !== 'scar')) expect(counts[r.id]).toBeGreaterThan(100);
  });
  it('draws earned breakthroughs in any slot, without guaranteeing them, and caps progression', () => {
    const w = run(); for (let n = 0; n < 3; n++) learn(w, 'slayer-edge');
    const positions = new Set<number>(); let missing = 0;
    for (let n = 0; n < 300; n++) {
      const offers = w.build.rollOffers(100), position = offers.findIndex(r => r.id === 'awaken');
      if (position < 0) missing++; else positions.add(position);
      expect(offers.some(r => r.id === 'slayer-edge' || r.id === 'ascend')).toBe(false);
    }
    expect(positions.size).toBe(3); expect(missing).toBeGreaterThan(100);
    learn(w, 'awaken'); expect(w.build.stage).toBe(1); expect(w.build.core()).toBeNull();
    for (let n = 0; n < 3; n++) learn(w, 'slayer-return'); learn(w, 'ascend');
    for (let n = 0; n < 100; n++) expect(w.build.rollOffers(100).some(r => ['awaken', 'ascend'].includes(r.id))).toBe(false);
  });
  it('retains dormant spirit growth, then creates stronger pets when the corresponding opportunity arrives', () => {
    const w = run(); for (let n = 0; n < 3; n++) learn(w, 'spirit-might');
    expect(w.build.progress).toBe(0); expect(w.build.learned[0]!.dormant).toContain('尚未生效'); expect(w.notice).toContain('已记下'); expect(w.mechanics.spirits).toHaveLength(0);
    learn(w, 'opportunity-twins'); expect(w.build.progress).toBe(3); expect(w.build.learned[0]!.dormant).toBeUndefined(); expect(w.build.core()).not.toBeNull();
    expect(w.mechanics.spirits.map(s => s.role)).toEqual(['main', 'twin']); expect(w.build.roots).toEqual(ELEMENTS);
    const enemy = target(), main = w.mechanics.spirits[0]!; w.startWave(); w.wolves = [enemy];
    w.hitRogue(enemy, 10, 'metal', { kind: 'spirit', spiritId: main.id }); expect(10000 - enemy.hp).toBeCloseTo(10 * 1.2 * 1.75);
    main.energy = 4; main.cooldown = .6;
    learn(w, 'opportunity-mimic'); expect(w.mechanics.spirits[0]).toBe(main); expect(main.energy).toBe(4); expect(main.cooldown).toBe(.6);
    const invoked=vi.fn(),echo=vi.fn();w.events.on('invoke',invoked);w.events.on('summonImpact',e=>{if(e.echo)echo(e);});w.startWave();w.wolves=[target()];w.mechanics.spirits.forEach(s=>{s.x=-10;s.z=4;s.cooldown=0;});
    expect(w.invoke([{ x: -7, z: 4 }, { x: -5, z: 4 }])).toBe(true);
    for(let n=0;n<57;n++)w.tick(1/60);expect(invoked).toHaveBeenCalledOnce();expect(echo).toHaveBeenCalledTimes(2);expect(w.combatTotals.companion).toBeGreaterThan(0);
  });
  it('does not apply dormant focus until a slayer opportunity is acquired', () => {
    const w = run('spirit', 'twins'); learn(w, 'slayer-focus');
    expect(w.mechanics.beginCast(false).ticket!.power).toBe(1); expect(w.build.progress).toBe(0);
    learn(w, 'opportunity-three'); w.startWave(); for (let n = 0; n < 120; n++) w.tick(1 / 60);
    expect(w.mechanics.beginCast(false).ticket!.power).toBe(1);
    const stroke = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
    expect(w.quoteStroke(stroke, 1.2)!.stroke.multiplier).toBeCloseTo(2.6); expect(w.build.progress).toBe(1);
    const victim = target(); w.wolves = [victim]; w.invoke(stroke, 1.2);
    expect(w.slayerTechniques.openings.has(victim.id)).toBe(true);
  });
  it('adds elemental utility to the actual hand-drawn shape, retains its state and keeps drawing after ancient slots fill', () => {
    const w = run(); learn(w, 'array-density'); expect(w.availableMainSlot).toBeUndefined();
    learn(w, 'opportunity-living'); expect(w.mainPlacementCost).toBe(0);
    expect(w.draw(shape())).toBe(true); const main = w.wards[0]!, control = run('array', 'twinArray'); control.draw(shape());
    expect(main.power.multiplier).toBeCloseTo(control.wards[0]!.power.multiplier); expect(wardArea(main)).toBeCloseTo(18);
    const geometry = JSON.stringify(main.regions); main.health = 40; main.pulse = .6; main.charge = .4;
    learn(w, 'opportunity-fivefold'); expect(w.wards[0]).toBe(main); expect(main.health).toBe(40); expect(main.pulse).toBe(.6); expect(main.charge).toBe(.4);
    expect(JSON.stringify(main.regions)).toBe(geometry); expect(w.mechanics.spirits).toHaveLength(0);
    learn(w, 'opportunity-twinArray'); expect(w.availableMainSlot).toBe(1); expect(w.mainPlacementCost).toBe(0);
    expect(w.draw(shape(3))).toBe(true); expect(w.spirit).toBe(100); expect(w.mechanics.spirits).toHaveLength(0);
    expect(w.wards[1]!.power.multiplier / main.power.multiplier).toBeCloseTo(.65);
    expect(w.draw(shape(3, 13))).toBe(true); expect(w.wards[2]!.mainSlot).toBeUndefined(); expect(w.spirit).toBe(86);
    expect(w.mechanics.spirits).toHaveLength(0);
    w.startWave(); expect(w.moveMain(main.id, { x: -6, z: 13 })).toBe(true); expect(w.spirit).toBe(76);
  });
  it('attaches a newly obtained ancient opportunity to an existing freehand ward without redrawing or refunding it', () => {
    const w = run('spirit', 'twins'); expect(w.draw(shape())).toBe(true); const ward = w.wards[0]!, points = ward.points;
    expect(ward.mainSlot).toBeUndefined(); expect(w.spirit).toBe(86); ward.health = 30;
    learn(w, 'opportunity-fivefold'); expect(w.wards[0]).toBe(ward); expect(ward.points).toBe(points); expect(ward.mainSlot).toBe(0);
    expect(ward.health).toBe(30); expect(w.spirit).toBe(86); expect(w.mechanics.spirits.map(s=>s.role)).toEqual(['main','twin']);
    w.startWave(); w.wolves = [target()];for(const spirit of w.mechanics.spirits){spirit.x=w.wolves[0]!.x-2;spirit.z=w.wolves[0]!.z;} for(let n=0;n<36;n++)w.tick(1/60);expect(w.combatTotals.companion).toBeGreaterThan(0);
  });
  it.each(Object.keys(BOONS) as Boon[])('acquires %s only once and clears it on restart', boon => {
    const w = boon === 'scar' ? run('spirit', 'twins') : run();
    w.phase = 'rest'; w.build.rollOffers(100); w.chooseUpgrade('opportunity-invalid'); expect(w.build.gained).toHaveLength(0);
    learn(w, `opportunity-${boon}`); expect(w.build.has(boon)).toBe(true); expect(w.build.gained).toEqual([boon]);
    const pets = w.mechanics.spirits.length; w.chooseUpgrade(`opportunity-${boon}`); expect(w.mechanics.spirits).toHaveLength(pets);
    for (let n = 0; n < 100; n++) expect(w.build.rollOffers(100).some(r => r.boon === boon)).toBe(false);
    expect(w.build.affinities).toEqual(['metal']); expect(w.build.roots).toEqual(ELEMENTS);
    w.reset(); expect(w.build.gained).toHaveLength(0); expect(w.build.has(boon)).toBe(false); expect(w.mechanics.spirits).toHaveLength(0);
  });
});
