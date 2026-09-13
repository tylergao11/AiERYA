import { describe, expect, it, vi } from 'vitest';
import { area, inside, type Point } from '../src/core/math';
import { GENERATES, OVERCOMES, planCombatStroke } from '../src/game/combat';
import { abilities } from '../src/game/content';
import { SPELLS } from '../src/game/combat';
import { ELEMENTS, type Element, type Wolf } from '../src/game/contracts';
import { normalizeLoop } from '../src/game/strokes';
import { buildable, createNaturalSources } from '../src/game/terrain';
import { World } from '../src/game/world';

const points = (pairs: number[][]): Point[] => pairs.map(([x, z]) => ({ x: x!, z: z! }));
const square = points([[-8, 2], [-4, 2], [-4, 6], [-8, 6], [-8, 2]]);
const slash = points([[-8, 4], [-4, 4]]);
const wolf = (aura: Element | null = null): Wolf => ({
  id: 999, x: -6, z: 4, hp: 1000, maxHp: 1000, speed: 0, heading: 0, action: 'run', age: 0,
  attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0,
  aura, auraTime: aura ? 5 : 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null,
});
const battle = (element: Element = 'fire') => { const w = new World(); w.selected = element; w.startWave(); return w; };
const advance = (w: World, seconds: number) => { for (let t = 0; t < Math.round(seconds * 60); t++) w.tick(1 / 60); };

describe('one spirit pool and simulation time', () => {
  it('recovers by elapsed battle time rather than frame count and caps at capacity', () => {
    const a = battle(), b = battle(); a.spirit = b.spirit = 10;
    advance(a, 2); for (let i = 0; i < 20; i++) b.tick(0.1);
    expect(a.spirit).toBeCloseTo(16); expect(b.spirit).toBeCloseTo(16);
    a.spirit = 99; advance(a, 1); expect(a.spirit).toBe(100);
  });
  it.each(['prepare', 'rest', 'won', 'lost'] as const)('does not recover during %s', phase => {
    const w = new World(); w.phase = phase; w.spirit = 10; advance(w, 2); expect(w.spirit).toBe(10);
  });
  it('does not advance recovery for zero, negative or nonfinite time', () => {
    const w = battle(); w.spirit = 10;
    for (const dt of [0, -1, NaN, Infinity]) w.tick(dt);
    expect(w.spirit).toBe(10); expect(w.time).toBe(0);
  });
  it('emits only actual recovered spirit and resets all recovery state', () => {
    const w = battle(), recovered = vi.fn(); w.events.on('spiritRecovered', recovered);
    advance(w, 1); expect(recovered).not.toHaveBeenCalled();
    w.spirit = 99; advance(w, 1.1);
    expect(recovered.mock.calls.reduce((sum, [event]) => sum + event.amount, 0)).toBeCloseTo(1);
    w.stats.add({ id: 'regen', stat: 'regen', multiply: 2 }); expect(w.regeneration).toBe(6);
    w.reset(); expect(w.spirit).toBe(100); expect(w.regeneration).toBe(3); });
  it('lets all five elements consume the same pool without any source contact', () => {
    const w = battle(); w.spirit = 60;
    for (const element of ELEMENTS) { w.selected = element; expect(w.draw(slash)).toBe(true); }
    expect(w.spirit).toBe(0); expect(w.draw(slash)).toBe(false); expect(w.wards).toHaveLength(0);
  });
  it('routes combat loops to spells without invoking formation or companion creation', () => {
    const w = battle(), plan = vi.fn(() => []); w.formationEffects.add({ id: 'pets', plan });
    expect(w.place(square)).toBe(false); expect(w.draw(square)).toBe(true);
    expect(plan).not.toHaveBeenCalled(); expect(w.wards).toHaveLength(0); expect(w.companions).toHaveLength(0);
    expect(w.spirit).toBe(52);
  });
  it('charges once and damages each target once even on a repeated stroke', () => {
    const w = battle('metal'), target = wolf(), cast = vi.fn(); w.wolves = [target]; w.events.on('invoke', cast);
    expect(w.draw([...slash, ...slash, ...slash])).toBe(true);
    expect(target.maxHp - target.hp).toBeCloseTo(SPELLS.metal.damage * 4); expect(w.spirit).toBe(40); expect(cast).toHaveBeenCalledTimes(1);
    expect(w.draw(slash)).toBe(true); expect(w.spirit).toBe(28); expect(cast).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid input and insufficient spirit without free damage or cooldown', () => {
    const w = battle(), target = wolf(); w.wolves = [target]; w.spirit = 7;
    expect(w.draw(slash)).toBe(false); expect(target.hp).toBe(1000);
    w.spirit = 100;
    for (const path of [[], [{ x: NaN, z: 4 }], points([[-6, 4], [-6.01, 4]])]) expect(w.draw(path)).toBe(false);
    expect(w.spirit).toBe(100);
  });
  it('returns to preparation after choosing an upgrade without giving free spirit', () => {
    const w = battle(); w.phase = 'rest'; w.spirit = 30;
    w.startWave(); expect(w.phase).toBe('rest');
    w.chooseUpgrade('clear-mind'); expect(w.phase).toBe('prepare'); expect(w.spirit).toBe(30);
    expect(w.regeneration).toBeCloseTo(4.05); expect(w.place(square)).toBe(true);
    w.startWave(); expect(w.phase).toBe('battle'); expect(w.wave).toBe(2);
  });
});

describe('five generating and five overcoming relations', () => {
  it.each(ELEMENTS)('%s aura nourishes its generated element', source => {
    const selected = GENERATES[source], w = battle(selected), target = wolf(source), reaction = vi.fn();
    w.wolves = [target]; w.events.on('reaction', reaction); w.draw(slash);
    expect(target.maxHp - target.hp).toBeCloseTo(SPELLS[selected].damage * 1.5);
    expect(reaction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'generate', from: source, to: selected, targetId: 999 }));
    expect(target.aura).toBe(selected);
  });
  it.each(ELEMENTS)('%s overcomes its target aura with the corresponding tactical reaction', selected => {
    const source = OVERCOMES[selected], w = battle(selected), target = wolf(source);
    if (source === 'fire') { target.burning = 2; target.burnDps = 8; }
    if (source === 'wood') target.rooted = 1;
    if (source === 'water') { target.wet = 2; target.slowAmount = 0.52; }
    w.wolves = [target]; w.draw(slash);
    expect(target.maxHp - target.hp).toBeCloseTo(({ water: 26, wood: 15.5, fire: 13, metal: 52, earth: 8.75 }[selected]));
    if (source === 'fire') expect(target.burnDps).toBe(0);
    if (source === 'wood') expect(target.rooted).toBe(0);
    if (source === 'water') expect(target.slowAmount).toBe(0);
  });
  it.each(ELEMENTS)('%s nourishes the corresponding ward for a finite duration', selected => {
    const w = new World(); w.selected = GENERATES[selected]; w.place(square); const ward = w.wards[0]!;
    ward.health = ward.maxHealth - 1; w.selected = selected; w.startWave(); w.draw(slash);
    expect(ward.empowered).toBe(4);
    if (ward.element === 'earth') expect(ward.health).toBe(ward.maxHealth);
    advance(w, 4.1); expect(ward.empowered).toBe(0);
  });
  it('actually strengthens a ward attack and its companion without stacking repeated buffs', () => {
    const w = new World(); w.selected = 'metal';
    w.formationEffects.add({ id: 'pet', plan: () => [{ kind: 'test', attack: { damage: 10, interval: 1, range: 10 } }] });
    w.place(square); w.startWave(); w.selected = 'earth'; w.draw(slash);
    w.draw(slash);
    const target = wolf(); w.wolves = [target]; w.wards[0]!.pulse = 0; w.tick(0.01);
    expect(target.maxHp - target.hp).toBeCloseTo((abilities.metal.damage + 10) * 1.35 * w.wards[0]!.power.multiplier);
  });
  it('triggers an existing ward against enemies away from the stroke without friendly damage', () => {
    const w = new World(); w.selected = 'metal'; w.place(square); const ward = w.wards[0]!;
    w.startWave(); w.selected = 'fire'; const target = wolf(); target.z = 4.8; w.wolves = [target];
    w.draw(points([[-8, 2], [-4, 2]]));
    expect(target.maxHp - target.hp).toBeCloseTo(6 * ward.power.multiplier);
    expect(ward.health).toBe(ward.maxHealth); expect(w.wards).toHaveLength(1);
  });
  it('expires aura without stale reactions', () => {
    const w = battle('fire'), target = wolf('wood'); target.auraTime = 0.01; w.wolves = [target];
    w.tick(0.02); w.draw(slash); expect(target.maxHp - target.hp).toBeCloseTo(SPELLS.fire.damage);
  });
  it('supports natural terrain bonuses without switching the selected spell', () => {
    const w = battle('fire'), source = createNaturalSources().find(s => s.element === 'wood')!;
    const target = wolf(); target.x = source.x; target.z = source.z; w.wolves = [target];
    w.draw([{ x: source.x - 2, z: source.z }, { x: source.x + 2, z: source.z }]);
    expect(target.maxHp - target.hp).toBeCloseTo(SPELLS.fire.damage * 1.5); expect(target.aura).toBe('fire');
  });
  it('dilutes oversized circles and long strokes instead of granting free full-map attacks', () => {
    const loop = planCombatStroke(points([[-8, 0], [0, 0], [0, 8], [-8, 8], [-8, 0]]))!;
    const long = planCombatStroke(points([[-20, 0], [12, 0]]))!;
    expect(loop.multiplier / loop.investment!).toBe(0.25);
    expect(long.multiplier / long.investment!).toBe(0.5);
    const w = battle('metal'), target = wolf(); w.wolves = [target]; w.draw(square);
    expect(target.hp).toBeCloseTo(1000 - SPELLS.metal.damage * 4);
  });
});

describe('forgiving hand-drawn formations', () => {
  it('connects a near closure with a two-unit gap and previews the corrected boundary', () => {
    const w = new World(), loose = points([[-8, 2], [-4, 2], [-4, 6], [-8, 6], [-8, 4]]);
    const plan = w.previewPlacement(loose); expect(plan.ok).toBe(true);
    expect(w.place(loose)).toBe(true); expect(w.wards[0]!.power.area).toBe(16);
  });
  it('repairs a closing overshoot while preserving the dominant loop', () => {
    const path = points([[-8, 2], [-4, 2], [-4, 6], [-8, 6], [-8, 1.7], [-7.8, 2.2]]);
    const loop = normalizeLoop(path)!;
    expect(loop).not.toBeNull(); expect(area(loop)).toBeGreaterThan(15);
    expect(new World().place(path)).toBe(true);
  });
  it('handles a shaky roughly circular stroke without an exact endpoint', () => {
    const path = Array.from({ length: 60 }, (_, i) => { const a = i / 65 * Math.PI * 2, r = 2 + Math.sin(i * 2.1) * 0.08; return { x: -6 + Math.cos(a) * r, z: 4 + Math.sin(a) * r }; });
    const w = new World(); expect(w.place(path)).toBe(true); expect(w.wards[0]!.power.area).toBeGreaterThan(11);
  });
  it('allows a small overlap but rejects a duplicate formation', () => {
    const w = new World(); expect(w.place(square)).toBe(true);
    expect(w.place(square.map(p => ({ x: p.x + 3.5, z: p.z })))).toBe(true);
    const before = w.spirit; expect(w.place(square)).toBe(false); expect(w.spirit).toBe(before);
  });
  it('keeps concave cutouts after repairing a closing tail', () => {
    const loop = normalizeLoop(points([[-8, 2], [-2, 2], [-2, 7], [-4, 7], [-4, 4], [-6, 4], [-6, 7], [-8, 7], [-8, 1.9], [-7.9, 2.1]]))!;
    expect(inside({ x: -5, z: 6 }, loop)).toBe(false); expect(inside({ x: -7, z: 6 }, loop)).toBe(true);
  });
  it('clips ground-edge intrusion to an actual buildable boundary', () => {
    const w = new World();
    const path = points([[6, 27], [13, 27], [13, 32], [6, 32], [6, 27]]);
    expect(path.some(p => !buildable(p))).toBe(true);
    const plan = w.previewPlacement(path); expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.points.every(buildable)).toBe(true);
  });
});
