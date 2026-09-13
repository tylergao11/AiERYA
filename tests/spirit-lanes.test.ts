import { describe, expect, it } from 'vitest';
import type { RunSpirit } from '../src/game/rogue-combat';
import { spiritLanes } from '../src/render/spirit-lanes';
import { SpiritPoses } from '../src/render/spirit-pose';

const pet = (id: number, element: RunSpirit['element'], z: number): RunSpirit => ({ id, element, x: -6, z, role: 'main', age: 2, cooldown: 1, targetId: 99, cast: 0, energy: 0, size: 1, power: 1 });

describe('painted companion separation without movement or combat changes', () => {
  it('separates tall flyers even when their feet are more than four world units apart', () => {
    const pets = [pet(1, 'fire', 5.7), pet(2, 'water', 10.1)], before = structuredClone(pets);
    const lanes = spiritLanes(pets);
    expect(lanes.get(1)).toBeLessThan(-60); expect(lanes.get(2)).toBeGreaterThan(60);
    expect(pets).toEqual(before);
    const poses = new SpiritPoses(); poses.update(pets, .05, () => undefined);
    expect(poses.get(pets[0]!).spread).toBeLessThan(0); expect(Math.abs(poses.get(pets[0]!).spread)).toBeLessThan(60);
  });
  it('keeps grounded bodies planted and clears separation after flyers move apart', () => {
    const a = pet(1, 'earth', 8), b = pet(2, 'fire', 8), poses = new SpiritPoses();
    expect(spiritLanes([a, b]).get(a.id)).toBe(0); poses.update([a, b], .2, () => undefined);
    expect(poses.get(b).spread).toBeGreaterThan(0); b.x = 10;
    for (let i = 0; i < 30; i++) poses.update([a, b], 1 / 60, () => undefined);
    expect(poses.get(b).spread).toBeLessThan(3);
  });
  it('bounds dense formations and keeps ordering stable when entity iteration changes', () => {
    const pets = ['fire', 'water', 'metal', 'fire', 'water'].map((e, i) => pet(i + 1, e as RunSpirit['element'], 8));
    const a = spiritLanes(pets), b = spiritLanes([...pets].reverse());
    for (const [id, shift] of a) { expect(Math.abs(shift)).toBeLessThanOrEqual(84); expect(shift).toBe(b.get(id)); }
  });
});
