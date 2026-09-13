import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import type { Wolf } from '../src/game/contracts';

const line = (length = 4) => [{ x: -6 - length / 2, z: 4 }, { x: -6 + length / 2, z: 4 }];
const victim = (): Wolf => ({ id: 900, x: -6, z: 4, hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0, attack: 0, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
function ready() {
  const w = new World({ roguelike: true }); w.chooseDestiny({ serial: 1, fate: 'slayer', roots: ['metal'], boon: 'debt', tier: 'unusual' });
  w.startWave(); w.selected = 'metal'; w.wolves = [victim()]; return w;
}
describe('borrowed-force rush keeps the debt route active with a positive wallet', () => {
  it('a paid full charge arms exactly one stronger quick stroke while still paying its normal price', () => {
    const w = ready(); w.invoke(line(), 1.2); expect(w.spirit).toBeGreaterThan(0);
    expect(w.slayerTechniques.rush?.investment).toBeCloseTo(.78);
    const quote = w.quoteStroke(line())!; expect(quote.cost).toBe(3); expect(quote.stroke.multiplier).toBeCloseTo(1.6);
    const before = w.wolves[0]!.hp, mana = w.spirit, events = vi.fn(); w.events.on('slayerStrike', events);
    w.invoke(line()); expect(before - w.wolves[0]!.hp).toBeCloseTo(42 * 1.2 * 1.6); expect(mana - w.spirit).toBe(3);
    expect(events.mock.calls[0]![0].rush).toBeCloseTo(.6); expect(w.slayerTechniques.rush).toBeNull();
    expect(w.quoteStroke(line())!.stroke.multiplier).toBe(1);
  });
  it('tiny pursuit has proportional damage and a huge follow-up cannot borrow more than the prior heavy paid for', () => {
    const w = ready(); w.invoke(line(), 1.2);
    expect(w.quoteStroke(line(.4))!.stroke.multiplier).toBeCloseTo(.16);
    expect(w.quoteStroke(line(.4))!.cost).toBeCloseTo(.3);
    const large = w.quoteStroke(line(32))!; expect(large.stroke.rush).toBeCloseTo(.78); expect(large.stroke.multiplier).toBeCloseTo(4.39); // Long paths retain their existing concentration loss.
    expect(w.quoteStroke(line(), .8)!.stroke.rush).toBe(0);
  });
  it('preview and an unaffordable stroke preserve the bank, while an actual empty quick stroke spends it', () => {
    const w = ready(); w.invoke(line(), 1.2); const bank = structuredClone(w.slayerTechniques.rush);
    for (let n = 0; n < 100; n++) w.quoteStroke(line()); expect(w.slayerTechniques.rush).toEqual(bank);
    w.spirit = -36; expect(w.invoke(line())).toBe(false); expect(w.slayerTechniques.rush).toEqual(bank);
    w.spirit = 3; w.wolves = []; expect(w.invoke(line())).toBe(true); expect(w.slayerTechniques.rush).toBeNull();
  });
  it('empty heavy strokes, free ultimate strokes and derived echoes cannot produce another bank', () => {
    const w = ready(); w.wolves = []; w.invoke(line(), 1.2); expect(w.slayerTechniques.rush).toBeNull();
    w.wolves = [victim()]; const stroke = w.quoteStroke(line(), 1.2)!.stroke;
    w.castRogueStroke(stroke, 'metal', { kind: 'derived' }); expect(w.slayerTechniques.rush).toBeNull();
    w.castRogueStroke(stroke, 'metal', w.mechanics.beginCast(false, 0, stroke.investment, 3)); expect(w.slayerTechniques.rush).toBeNull();
  });
  it('the follow-up remains available under debt, but expires and clears on reset', () => {
    const w = ready(); w.spirit = 1; expect(w.invoke(line(), 1.2)).toBe(true); expect(w.spirit).toBeLessThan(0); expect(w.slayerTechniques.rush).not.toBeNull();
    w.slayerTechniques.tick(2.21); expect(w.slayerTechniques.rush).toBeNull();
    w.spirit = 100; w.invoke(line(), 1.2); w.reset(); expect(w.slayerTechniques.rush).toBeNull();
  });
});
describe('armored enemies counter repeated metal while retaining a fire opening', () => {
  it('blocks metal stagger, reports the actual deflection, and opens to a fire-metal combination', () => {
    const w = ready(), wolf = w.wolves[0]!; wolf.kind = 'elite'; wolf.eliteSkill = 'guard';
    const blocked = vi.fn(), hits = vi.fn(); w.events.on('slayerGuarded', blocked); w.events.on('slayerStrike', hits);
    w.invoke(line()); const resisted = 10000 - wolf.hp;
    expect(resisted).toBeCloseTo(42 * 1.2 * .02); expect(wolf.motion?.pose).not.toBe('stagger');
    expect(blocked).toHaveBeenCalledOnce(); expect(hits.mock.calls[0]![0].guarded).toBe(1);
    w.selected = 'fire'; w.invoke(line()); expect(w.enemyAbilities.armored(wolf)).toBe(false);
    w.selected = 'metal'; const hp = wolf.hp; w.invoke(line()); expect(hp - wolf.hp).toBeGreaterThan(resisted * 30);
    expect(blocked).toHaveBeenCalledOnce();
  });
  it('still applies the armor to side cuts, while leaving actual ward damage rules alone', () => {
    const w = ready(), wolf = w.wolves[0]!; wolf.kind = 'elite'; wolf.eliteSkill = 'guard';
    w.hitRogue(wolf, 100, 'metal', { kind: 'derived' }); expect(10000 - wolf.hp).toBeCloseTo(2.4);
    const hp = wolf.hp; w.hitRogue(wolf, 100, 'metal', { kind: 'array' }); expect(hp - wolf.hp).toBeCloseTo(120);
  });
});
