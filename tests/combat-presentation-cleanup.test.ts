import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { EffectPainter } from '../src/render/effects';
import { ReactionArt } from '../src/render/reaction-art';
import { CombatFeedback } from '../src/render/combat-feedback';
import { SceneFeedback } from '../src/render/scene-feedback';
import type { GameEvents } from '../src/game/contracts';

function textCanvas() {
  return { save: vi.fn(), restore: vi.fn(), measureText: (s: string) => ({ width: s.length * 9 }), strokeText: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D;
}
const strike: GameEvents['invoke'] = { points: [{ x: -8, z: 4 }, { x: -4, z: 4 }], element: 'fire', source: { x: -8, z: 4 }, combo: false, charge: 3 };

describe('rendered combat settles before a paused wave result', () => {
  it.each(['rest', 'won', 'lost'] as const)('drops particles, reaction bursts and damage text immediately on %s', phase => {
    const world = new World(), effects = new EffectPainter(world, (_ward, p) => p), reactions = new ReactionArt(world), feedback = new CombatFeedback(world), scene = new SceneFeedback(world);
    try {
      world.events.emit('invoke', strike);
      world.events.emit('steam', { at: { x: -6, z: 4 }, radius: 3, targets: [] });
      world.events.emit('damage', { at: { x: -6, z: 4 }, targetId: 123, amount: 48, source: 'spell', element: 'fire', ongoing: false });
      world.events.emit('campHit', { amount: 5 }); expect(scene.impact).toBeGreaterThan(0);
      expect(effects.count).toBeGreaterThan(0); expect(effects.objects).toBeGreaterThan(0); expect(reactions.marks.length).toBeGreaterThan(0);
      const before = textCanvas(); feedback.paint(before); expect(before.fillText).toHaveBeenCalled();
      world.events.emit('phase', { phase });
      // No simulation/render time is advanced: the real main loop pauses here.
      expect(effects.count).toBe(0); expect(effects.objects).toBe(0); expect(reactions.marks).toHaveLength(0);
      expect(scene.impact).toBe(0);
      const after = textCanvas(); feedback.paint(after); expect(after.fillText).not.toHaveBeenCalled();
    } finally { effects.dispose(); reactions.dispose(); feedback.dispose(); scene.dispose(); }
  });
  it('retains the existing formation contour for a later withdrawal', () => {
    const world = new World(), effects = new EffectPainter(world, (_ward, p) => p);
    world.selected = 'earth'; expect(world.place([{ x: -8, z: 2 }, { x: -4, z: 2 }, { x: -4, z: 6 }, { x: -8, z: 6 }, { x: -8, z: 2 }])).toBe(true);
    const ward = world.wards[0]!, original = { hp: ward.health, cost: ward.paidCost };
    const contour = vi.spyOn(effects as unknown as { contourBurst(points: unknown[], element: string, strength: number): void }, 'contourBurst');
    try {
      world.events.emit('phase', { phase: 'rest' }); expect(effects.count).toBe(0);
      world.events.emit('wardRemoved', { id: ward.id, at: ward, element: 'earth', reason: 'dismissed' });
      expect(contour).toHaveBeenCalledOnce(); expect(contour.mock.calls[0]![0].length).toBeGreaterThan(3);
      expect(world.wards).toEqual([ward]); expect({ hp: ward.health, cost: ward.paidCost }).toEqual(original);
    } finally { effects.dispose(); }
  });
});
