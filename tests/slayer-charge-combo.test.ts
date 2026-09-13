import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { chargeLevel, CHARGE } from '../src/game/charge';
import { SLAYER_COMBO, SlayerCombo } from '../src/game/slayer-combo';
import { planCombatStroke } from '../src/game/combat';
import type { Wolf } from '../src/game/contracts';
import { DrawingInput } from '../src/ui/input';
import type { SceneView } from '../src/render/view';
import type { GameInterface } from '../src/ui/interface';
import { SceneImpact } from '../src/render/impact-motion';
import { ECONOMY } from '../src/game/economy';

const price = (units: number) => Math.round(ECONOMY.strokePrice * units * 100) / 100;

const line = (length = 4) => [{ x: -6 - length / 2, z: 4 }, { x: -6 + length / 2, z: 4 }];
const wolf = (id = 900, z = 4): Wolf => ({ id, x: -6, z, hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0, attack: 0, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
function ready(fate: 'slayer' | 'spirit' = 'slayer') {
  const w = new World({ roguelike: true });
  expect(w.chooseDestiny({ serial: 1, fate, roots: ['metal'], tier: 'ordinary', boon: fate === 'slayer' ? 'three' : 'mimic' })).toBe(true);
  w.startWave(); w.selected = 'metal'; w.wolves = [wolf()]; return w;
}
afterEach(() => vi.unstubAllGlobals());

describe('slayer paid charge', () => {
  it.each([[0, 0, 1, 1], [.4, 1, 1.4, 1.4], [.8, 2, 1.9, 1.9], [1.2, 3, 2.6, 2.6]])('charges %s seconds into tier %s with matching price and damage', (seconds, level, units, power) => {
    const w = ready(), quote = w.quoteStroke(line(), seconds)!;
    const cost = price(units);
    expect(quote.cost).toBe(cost); expect(quote.stroke.charge).toBe(level);
    expect(quote.stroke.width).toBeCloseTo(1.5 * CHARGE.width[level]!);
    expect(w.invoke(line(), seconds)).toBe(true);
    expect(w.spirit).toBe(100 - cost); expect(10000 - w.wolves[0]!.hp).toBeCloseTo(42 * 1.2 * power);
  });
  it('tiny heavy strokes pay for the extra energy; no free full-damage floor', () => {
    const w = ready(); expect(w.strokeCost(line(.4), 1.2)).toBe(price(1.7));
    w.invoke(line(.4), 1.2); expect(10000 - w.wolves[0]!.hp).toBeCloseTo(42 * 1.2 * 1.7);
  });
  it.each([[2, 2, 1.9], [1.2, 0, 1]])('downgrades to the affordable tier with %s standard investments', (available, tier, units) => {
    const w = ready(), mana = price(available), cost = price(units); w.spirit = mana;
    const quote = w.quoteStroke(line(), 1.2)!;
    expect(quote.limited).toBe(true); expect(quote.stroke.charge).toBe(tier); expect(quote.cost).toBe(cost);
    w.invoke(line(), 1.2); expect(w.spirit).toBe(mana - cost);
  });
  it('rejects an unaffordable base cast without consuming stored momentum', () => {
    const w = ready(); w.slayerCombo.hit(4, 4, 0); w.spirit = price(.2);
    expect(w.invoke(line(), 1.2)).toBe(false); expect(w.spirit).toBe(price(.2)); expect(w.slayerCombo.momentum).toBe(1);
  });
  it('leaves non-slayer casts uncharged and rejects non-finite charge times', () => {
    const w = ready('spirit'); expect(w.quoteStroke(line(), 1.2)!.stroke.charge).toBe(0); expect(w.strokeCost(line(), 1.2)).toBe(price(1));
    for (const t of [NaN, Infinity, -1]) expect(chargeLevel(t)).toBe(0);
  });
  it('widens actual AOE and records all distinct targets once, without recounting echoes', () => {
    const w = ready(); w.wolves = [wolf(900, 4), wolf(901, 6), wolf(902, 6.6), wolf(903, 6.8)];
    const hit = vi.fn(); w.events.on('slayerStrike', hit);
    w.invoke(line(), 1.2);
    expect(hit).toHaveBeenCalledOnce(); expect(hit.mock.calls[0]![0].hits).toBe(3);
    expect(w.wolves[2]!.hp).toBeLessThan(10000); expect(w.wolves[3]!.hp).toBe(10000);
    const count = w.slayerCombo.score;
    w.tick(.25); expect(hit).toHaveBeenCalledOnce(); expect(w.slayerCombo.score).toBe(count);
  });
  it('adds bounded hit-stop only to hits, never locks the next stroke, and resumes on time', () => {
    const w = ready(); w.invoke(line(), 1.2); w.tick(.03); expect(w.time).toBe(0);
    expect(w.invoke(line(.4))).toBe(true); w.tick(.07); expect(w.time).toBeCloseTo(.035);
    const miss = ready(); miss.wolves = []; miss.invoke(line(), 1.2); miss.tick(.1); expect(miss.time).toBe(.1);
    w.reset(); w.tick(.1); expect(w.time).toBe(.1); expect(w.slayerCombo.count).toBe(0);
  });
  it('ultimate preserves charged width, doubles its damage once, and cannot farm free momentum', () => {
    const w = ready(); w.spirit = 0; w.startUltimate(); w.queueUltimateStroke(line(), 'metal', 1.2);
    expect(w.ultimate.strokes[0]!.stroke.width).toBeCloseTo(2.625);
    w.tick(3); w.tick(.28); expect(10000 - w.wolves[0]!.hp).toBeCloseTo(42 * 1.2 * 2.6 * 2);
    expect(w.slayerCombo.momentum).toBe(0); expect(w.slayerCombo.count).toBe(0); expect(w.spirit).toBe(0);
    w.tick(.57); w.tick(.1); expect(w.time).toBe(.1);
  });
});

describe('paid combo and finisher', () => {
  it('fractional strokes cannot score full combos or renew the full window', () => {
    const c = new SlayerCombo(); c.hit(.1, 1, 0); expect(c.count).toBe(0); expect(c.remaining).toBeCloseTo(.32);
    for (let i = 0; i < 9; i++) c.hit(.1, 1, 0);
    expect(c.count).toBe(1); expect(c.momentum).toBeCloseTo(.25 / 3);
    c.tick(.33); expect(c.count).toBe(0); expect(c.momentum).toBe(0);
  });
  it('rewards connected pack hits, caps the bank and expires both meter and momentum', () => {
    const c = new SlayerCombo(); for (let i = 0; i < 10; i++) c.hit(1, 4, 0);
    expect(c.count).toBe(40); expect(c.tier).toBe(3); expect(c.momentum).toBe(SLAYER_COMBO.bankCap);
    expect(c.finisher(1.9, 2, true)).toBeCloseTo(.95); expect(c.finisher(3, 3, true)).toBe(1.2);
    expect(c.finisher(3, 3, false)).toBe(0); expect(c.finisher(3, 1, true)).toBe(0);
    c.hit(0, 100, 3); c.hit(8, 0, 0); expect(c.count).toBe(40);
    c.tick(3.21); expect(c.count).toBe(0); expect(c.momentum).toBe(0);
  });
  it('a paid AOE hit credits the entire group to the visible combo', () => {
    const c = new SlayerCombo(); c.hit(1, 24, 0); expect(c.count).toBe(24); expect(c.tier).toBe(2);
  });
  it('successful manual hits bank energy that the next heavy strike spends once, even on a miss', () => {
    const w = ready(); w.wolves = [wolf(), wolf(901), wolf(902)];
    for (let i = 0; i < 4; i++) w.invoke(line());
    expect(w.slayerCombo.momentum).toBe(1); expect(w.slayerCombo.count).toBe(12);
    const before = w.wolves[0]!.hp, quote = w.quoteStroke(line(), 1.2)!;
    expect(quote.cost).toBe(price(2.6)); expect(quote.stroke.burst).toBe(1); expect(quote.stroke.multiplier).toBeCloseTo(3.6);
    w.invoke(line(), 1.2); expect(before - w.wolves[0]!.hp).toBeCloseTo(42 * 1.2 * 3.6); expect(w.slayerCombo.momentum).toBe(0);
    w.slayerCombo.hit(1, 3, 0); w.wolves = []; w.invoke(line(), .8); expect(w.slayerCombo.momentum).toBe(0);
  });
  it('cleans combo and charge across loss and restart', () => {
    const w = ready(); w.invoke(line()); w.health = 0; w.tick(.1);
    expect(w.phase).toBe('lost'); expect(w.slayerCombo.score).toBe(0); expect(w.slayerCombo.momentum).toBe(0);
  });
});

describe('hold input and hit feedback', () => {
  function inputCase() {
    vi.stubGlobal('window', new EventTarget());
    const world = ready(), canvas = Object.assign(new EventTarget(), { setPointerCapture: vi.fn() });
    const view = { canvas, preview: vi.fn(), previewRemoval: vi.fn(), pick: (x: number, z: number) => ({ x:x/20, z:z/20 }) } as unknown as SceneView;
    let milliseconds = 0;
    const ui = { blocked: false, removing: false } as GameInterface, input = new DrawingInput(world, view, ui, () => milliseconds);
    const advance = (seconds: number, preview = true) => { milliseconds += seconds * 1000; if (preview) input.flushPreview(); };
    const send = (type: string, x = -8) => canvas.dispatchEvent(Object.assign(new Event(type), { button: 0, pointerId: 1, clientX: x*20, clientY: 80 }));
    return { world, view, ui, input, send, advance };
  }
  it('charges only while stationary and releases the held tier on the first swipe frame', () => {
    const { world, ui, input, send, advance } = inputCase();
    try {
      send('pointerdown'); advance(.4); expect(ui.strokePreview?.charge).toBe(1); expect(world.spirit).toBe(100);
      advance(.4); expect(ui.strokePreview?.charge).toBe(2);
      advance(.4); expect(ui.strokePreview?.charge).toBe(3);
      send('pointermove', -4); input.flushPreview();expect(world.spirit).toBeCloseTo(100-price(2.6));
      send('pointerup', -4); expect(world.spirit).toBeCloseTo(100 - price(2.6)); expect(ui.strokePreview).toBeNull();
    } finally { input.dispose(); }
  });
  it('does not promise or sound full charge while a stationary finger cannot afford it', () => {
    const { world, view, ui, input, send, advance } = inputCase();
    world.spirit = 1;
    const cues = vi.fn(), casts = vi.fn(); world.events.on('chargeReady', cues); world.events.on('invoke', casts);
    try {
      send('pointerdown'); advance(1.2);
      expect(ui.strokePreview?.charge).toBe(0); expect(ui.strokePreview?.limited).toBe(true);
      expect(vi.mocked(view.preview).mock.calls.at(-1)![3]).toMatchObject({ level: 0, cost: null, limited: true });
      expect(cues).not.toHaveBeenCalled(); expect(world.spirit).toBe(1);
      send('pointerup', -7.6);
      expect(casts).toHaveBeenCalledOnce(); expect(casts.mock.calls[0]![0].charge).toBe(0);
      expect(world.spirit).toBeCloseTo(.7);
    } finally { input.dispose(); }
  });
  it('marks an unaffordable base stroke instead of announcing a charge it cannot release', () => {
    const { world, view, ui, input, send, advance } = inputCase();
    world.spirit = .1; const cues = vi.fn(), casts=vi.fn(); world.events.on('chargeReady', cues);world.events.on('invoke',casts);
    try {
      send('pointerdown'); advance(1.2);
      expect(vi.mocked(view.preview).mock.calls.at(-1)![3]).toMatchObject({ level: 0, cost: null, limited: true, unaffordable: true });
      expect(ui.strokePreview).toMatchObject({ unaffordable: true }); expect(cues).not.toHaveBeenCalled();
      send('pointermove',-4);input.flushPreview();send('pointerup', -4); expect(world.spirit).toBe(.1);expect(casts).not.toHaveBeenCalled();
    } finally { input.dispose(); }
  });
  it('updates a held charge when kill income arrives and only cues the newly affordable level', () => {
    const { world, ui, input, send, advance } = inputCase();
    world.spirit = 1; const cues = vi.fn(); world.events.on('chargeReady', cues);
    try {
      send('pointerdown'); advance(1.2);
      expect(ui.strokePreview?.charge).toBe(0); expect(cues).not.toHaveBeenCalled();
      world.replenishSpirit(10); advance(.1);
      expect(ui.strokePreview).toMatchObject({ charge: 3, limited: false, unaffordable: false });
      expect(cues).toHaveBeenCalledOnce(); expect(cues.mock.calls[0]![0].level).toBe(3);
      advance(.2); expect(cues).toHaveBeenCalledOnce(); expect(world.spirit).toBe(11);
      send('pointerup', -4); expect(world.spirit).toBeCloseTo(3.2);
    } finally { input.dispose(); }
  });
  it('keeps a free stopped-time charge available with an empty wallet', () => {
    const { world, ui, input, send, advance } = inputCase();
    world.spirit = 0; world.startUltimate(); const cues = vi.fn(); world.events.on('chargeReady', cues);
    try {
      send('pointerdown'); advance(1.2);
      expect(ui.strokePreview).toMatchObject({ charge: 3, limited: false, unaffordable: false });
      send('pointerup', -4);
      expect(world.ultimate.strokes).toHaveLength(1); expect(world.ultimate.strokes[0]!.stroke.charge).toBe(3);
      expect(cues).toHaveBeenCalledOnce(); expect(world.spirit).toBe(0);
    } finally { input.dispose(); }
  });
  it('includes the real debt allowance in charge feedback and release payment', () => {
    const { world, ui, input, send, advance } = inputCase();
    world.reset(); world.chooseDestiny({serial:2,fate:'slayer',roots:['metal'],tier:'unusual',boon:'debt'}); world.startWave(); world.spirit=-28;
    try {
      send('pointerdown'); advance(1.2);
      expect(ui.strokePreview).toMatchObject({ charge: 3, limited: false, unaffordable: false });
      send('pointerup', -4); expect(world.spirit).toBeCloseTo(-35.8);
    } finally { input.dispose(); }
  });
  it('uses the held time at first movement even without a preview frame, and excludes later travel time', () => {
    const { world, input, send, advance } = inputCase();
    try { send('pointerdown'); advance(.8,false);send('pointermove', -4); advance(1.2, false); send('pointerup', -4); expect(world.spirit).toBeCloseTo(100 - price(1.9)); }
    finally { input.dispose(); }
  });
  it('quick swipes stay instant and cancellation discards held energy', () => {
    const { world, input, send, advance } = inputCase();
    try {
      send('pointerdown'); advance(1.2); send('pointercancel'); send('pointerup', -4); expect(world.spirit).toBe(100);
      send('pointerdown'); send('pointermove', -4); advance(.05); send('pointerup', -4); expect(world.spirit).toBeCloseTo(100 - price(1));
    } finally { input.dispose(); }
  });
  it('advances enemies during charging and stops charging during a pause', () => {
    const { world, input, ui, send, advance } = inputCase();
    try {
      send('pointerdown'); world.tick(.5); advance(.5); expect(world.time).toBe(.5); expect(ui.strokePreview?.charge).toBe(1);
      Object.assign(ui, { blocked: true }); advance(2); expect(ui.strokePreview?.charge).toBe(1);
      input.cancel(); send('pointerup', -4); expect(world.spirit).toBe(100);
    } finally { input.dispose(); }
  });
  it('heavy hits shake more than light hits, stop shaking during aim, and respect reduced motion', () => {
    const vibrate = vi.fn(); vi.stubGlobal('navigator', { vibrate });
    const reduced = { matches: false }; vi.stubGlobal('matchMedia', () => reduced);
    const light = ready(), heavy = ready(), a = new SceneImpact(light), b = new SceneImpact(heavy);
    try {
      light.invoke(line()); heavy.invoke(line(), 1.2);
      expect(Math.abs(b.update(.016, false).x)).toBeGreaterThan(Math.abs(a.update(.016, false).x) * 2);
      expect(b.update(.016, true)).toEqual({ x: 0, y: 0 });
      expect(vibrate).toHaveBeenCalled(); vibrate.mockClear(); reduced.matches = true;
      heavy.invoke(line(), 1.2); expect(b.update(.016, false)).toEqual({ x: 0, y: 0 }); expect(vibrate).not.toHaveBeenCalled();
    } finally { a.dispose(); b.dispose(); }
  });
  it('misses and derived echoes do not produce heavy screen impulses or vibration', () => {
    vi.stubGlobal('navigator', { vibrate: vi.fn() }); vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const w = ready(), impact = new SceneImpact(w), strikes = vi.fn(); w.events.on('slayerStrike', strikes);
    try {
      w.wolves = []; w.invoke(line(), 1.2); expect(impact.update(.016, false)).toEqual({ x: 0, y: 0 }); expect(navigator.vibrate).not.toHaveBeenCalled();
      w.castRogueStroke({ ...planCombatStroke(line())!, charge: 3 }, 'metal', { kind: 'derived' }); expect(strikes).toHaveBeenCalledOnce();
    } finally { impact.dispose(); }
  });
  it('the set finisher gets a second bounded impact only on actual contact, and clears at a wave boundary', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const w = ready(), impact = new SceneImpact(w);
    try {
      w.events.emit('slayerFinisher', { at: { x: -6, z: 4 }, element: 'metal', hits: 0 }); expect(impact.update(.016, false)).toEqual({ x: 0, y: 0 });
      w.events.emit('slayerFinisher', { at: { x: -6, z: 4 }, element: 'metal', hits: 4 });
      expect(Math.abs(impact.update(.016, false).x)).toBeGreaterThan(6);
      w.events.emit('phase', { phase: 'rest' }); expect(impact.update(.016, false)).toEqual({ x: 0, y: 0 });
    } finally { impact.dispose(); }
  });
});
