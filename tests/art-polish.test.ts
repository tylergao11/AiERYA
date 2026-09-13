import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import type { Wolf } from '../src/game/contracts';
import { ReactionArt, REACTION_LIFE } from '../src/render/reaction-art';
import { mageFrame, wolfAnchors } from '../src/render/actor-anchors';
import { layoutCombatLabels, type CombatLabel } from '../src/render/combat-labels';
import { SceneFeedback } from '../src/render/scene-feedback';

describe('art polish stays outside simulation rules', () => {
  it('snapshots contacts and lets all ten effects expire without changing game state', () => {
    const w = new World(), painter = new ReactionArt(w), before = JSON.stringify({ health: w.health, spirit: w.spirit, wards: w.wards, wolves: w.wolves });
    for (const effect of Object.keys(REACTION_LIFE) as (keyof typeof REACTION_LIFE)[]) {
      const at = { x: 100, y: 100 }, target = { x: 120, y: 140 }; painter.add(effect, at, 3.2, [target]); at.x = target.x = 999;
    }
    expect(painter.marks).toHaveLength(10); expect(painter.marks.every(m => m.p.x === 100 && m.targets[0]!.x === 120)).toBe(true);
    painter.update(2); expect(painter.marks).toHaveLength(0);
    expect(JSON.stringify({ health: w.health, spirit: w.spirit, wards: w.wards, wolves: w.wolves })).toBe(before); painter.dispose();
  });
  it('bounds bursts, merges immediate duplicate steam and clears on reset/dispose', () => {
    const w = new World(), painter = new ReactionArt(w);
    w.events.emit('steam', { at: { x: 0, z: 0 }, radius: 2, targets: [] }); w.events.emit('steam', { at: { x: 0, z: 0 }, radius: 3, targets: [] });
    expect(painter.marks).toHaveLength(1); expect(painter.marks[0]!.radius).toBe(3);
    for (let i = 0; i < 50; i++) painter.add('cut', { x: i * 40, y: 200 }, 2, []);
    expect(painter.marks.length).toBeLessThanOrEqual(18); w.reset(); expect(painter.marks).toHaveLength(0);
    painter.dispose(); w.events.emit('steam', { at: { x: 0, z: 0 }, radius: 3, targets: [] }); expect(painter.marks).toHaveLength(0);
  });
  it('keeps ground anchored while attached materials rise with the wolf', () => {
    const wolf = { x: 2, z: 3, kind: 'elite', action: 'run', motion: { lift: 60 } } as Wolf;
    const air = wolfAnchors(wolf); wolf.motion!.lift = 0; const landed = wolfAnchors(wolf);
    expect(air.ground).toEqual(landed.ground); expect(landed.body.y - air.body.y).toBe(60);
    wolf.action = 'dead'; wolf.motion!.lift = 60; expect(wolfAnchors(wolf).lift).toBe(0);
  });
  it('separates drawing anticipation, accepted release and idle frames', () => {
    expect(mageFrame(0, 0)).toBe(0); expect(mageFrame(0, 0.05)).toBe(1); expect(mageFrame(0, 2)).toBe(3);
    expect(mageFrame(1, 0)).toBe(4); expect(mageFrame(0.01, 0)).toBe(7); expect(mageFrame(0, 0)).toBe(0);
  });
  it('reserves body space and bounds text overlap while retaining high-priority reactions', () => {
    const labels: CombatLabel[] = Array.from({ length: 50 }, (_, i) => ({ p: { x: 400, y: 350 }, text: `hit${i}`, color: '#fff', alpha: 1, size: 14, priority: i === 49 ? 3 : 1, width: 50 }));
    const result = layoutCombatLabels(labels, [{ x: 370, y: 330, width: 60, height: 35 }]);
    expect(result.length).toBeLessThanOrEqual(24); expect(result[0]!.text).toBe('hit49');
    for (const a of result) for (const b of result) if (a !== b) expect(Math.abs(a.p.x - b.p.x) >= 56 || Math.abs(a.p.y - b.p.y) >= 20).toBe(true);
  });
  it('camp feedback is local, expires and resets without damage authority', () => {
    const w = new World(), feedback = new SceneFeedback(w); w.events.emit('campHit', { amount: 5 });
    expect(feedback.impact).toBeGreaterThan(0); expect(w.health).toBe(100);
    feedback.update(1); expect(feedback.impact).toBe(0); w.events.emit('campHit', { amount: 5 }); w.reset(); expect(feedback.impact).toBe(0); feedback.dispose();
  });
});
