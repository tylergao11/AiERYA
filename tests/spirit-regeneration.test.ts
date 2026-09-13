import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import type { Fate } from '../src/game/roguelike';

const line = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
function battle(fate: Fate = 'slayer', debt = false) {
  const w = new World({ roguelike: true });
  w.chooseDestiny({ serial: 1, fate, roots: ['metal'], tier: debt ? 'unusual' : 'ordinary',
    boon: debt ? 'debt' : fate === 'slayer' ? 'three' : fate === 'spirit' ? 'twins' : 'fivefold' });
  w.startWave(); w.spirit = 0;
  vi.spyOn(w.assault, 'tick').mockImplementation(() => {});
  return w;
}
const advance = (w: World, seconds: number, frames = 60) => {
  for (let n = 0; n < seconds * frames; n++) w.tick(1 / frames);
};

describe('natural spirit recovery in roguelike combat', () => {
  it.each([['slayer', 3], ['array', 3], ['spirit', 3]] as const)('%s can cast again from zero without kills', (fate, rate) => {
    const w = battle(fate);
    expect(w.invoke(line)).toBe(false);
    w.tick(1);
    expect(w.kills).toBe(0); expect(w.spirit).toBeCloseTo(rate);
    expect(w.ledger.earned).toBeCloseTo(rate); expect(w.invoke(line)).toBe(true);
    expect(w.spirit).toBeCloseTo(w.ledger.earned - w.ledger.spent);
  });
  it('uses elapsed simulation time and caps both recovery and extra income at 100', () => {
    const a = battle(), b = battle();
    advance(a, 2); advance(b, 2, 10);
    expect(a.spirit).toBeCloseTo(6); expect(b.spirit).toBeCloseTo(a.spirit);
    a.spirit = 99; const earned = a.ledger.earned; advance(a, 1);
    expect(a.spirit).toBe(100); expect(a.ledger.earned - earned).toBeCloseTo(1);
    const saved = a.ledger.earned; a.replenishSpirit(75); advance(a, 1);
    expect(a.spirit).toBe(100); expect(a.ledger.earned).toBe(saved);
  });
  it.each(['slayer', 'array', 'spirit'] as const)('%s keeps a fixed cap for modifiers and restored balances', fate => {
    const w = battle(fate);
    w.stats.add({ id: 'old-capacity-bonus', stat: 'capacity', add: 60, multiply: 2 });
    expect(w.capacity).toBe(100);
    w.spirit = 175; expect(w.spirit).toBe(100);
    w.spirit += 30; expect(w.spirit).toBe(100);
    for (const value of [NaN, Infinity, -Infinity]) { w.spirit = value; w.replenishSpirit(value); }
    expect(w.spirit).toBe(100); expect(w.ledger.earned).toBe(0);
    w.spirit = 99; advance(w, 1); expect(w.spirit).toBe(100); expect(w.ledger.earned).toBeCloseTo(1);
    w.reset(); expect(w.spirit).toBe(100); expect(w.capacity).toBe(100);
  });
  it.each(['destiny', 'prepare', 'rest', 'won', 'lost'] as const)('does not bank passive income during %s', phase => {
    const w = battle(); w.phase = phase; advance(w, 2);
    expect(w.spirit).toBe(0); expect(w.ledger.earned).toBe(0);
  });
  it('holds recovery during time stop and resumes afterward without catch-up', () => {
    const w = battle(); expect(w.startUltimate()).toBe(true);
    w.tick(1); expect(w.spirit).toBe(0); w.tick(3); expect(w.spirit).toBe(0);
    expect(w.ultimate.active).toBe(false); advance(w, 1);
    expect(w.spirit).toBeCloseTo(3); expect(w.ledger.earned).toBeCloseTo(3);
  });
  it('repays negative spirit and honors stat modifiers', () => {
    const w = battle('slayer', true); w.spirit = -6;
    w.stats.add({ id: 'recovery-bonus', stat: 'regen', multiply: 1.35 });
    advance(w, 1); expect(w.spirit).toBeCloseTo(-1.95); expect(w.ledger.earned).toBeCloseTo(4.05);
  });
  it('ignores invalid elapsed time and resets pending recovery notifications', () => {
    const w = battle(); const recovered = vi.fn(); w.events.on('spiritRecovered', recovered);
    for (const dt of [0, -1, NaN, Infinity]) w.tick(dt);
    expect(w.spirit).toBe(0); expect(w.ledger.earned).toBe(0);
    w.tick(.5); w.reset(); w.startWave(); w.tick(1);
    expect(w.ledger.earned).toBe(0); expect(recovered).not.toHaveBeenCalled();
  });
});
