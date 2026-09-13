import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../src/game/contracts';
import { SummonImpactBuffer } from '../src/render/summon-impact-buffer';

function hit(spiritId = 1, overrides: Partial<GameEvents['summonImpact']> = {}): GameEvents['summonImpact'] {
  return { at: { x: 1, z: 7 }, from: { x: -4, z: 7 }, spiritId, targetId: 20, element: 'fire', radius: 3.5, strength: 2.8, union: true, echo: false, ...overrides };
}

describe('clustered summon contacts remain attributable and readable', () => {
  it('gives coordination priority over its own contact layers while preserving other pets and full unions',()=>{
    const buffer=new SummonImpactBuffer(),normal=hit(1,{union:false});
    buffer.add(normal,false,false);buffer.add(hit(3,{union:false}),false,false);buffer.add(hit(2),false,false);
    buffer.feature({kind:'seal',at:normal.at,from:normal.from,spiritId:1,targetId:20,element:'fire',toElement:'water'});
    buffer.add(hit(1,{union:false,element:'water'}),false,false);
    expect(buffer.entries.map(e=>!!e.accent)).toEqual([true,false,false,true]);
    buffer.update(.09);buffer.add(normal,false,false);expect(buffer.entries.at(-1)!.accent).toBe(false);
    buffer.feature({kind:'seal',at:normal.at,from:normal.from,spiritId:1,targetId:20,element:'fire'});buffer.clear();buffer.add(normal,false,false);expect(buffer.entries[0]!.accent).toBe(false);
  });
  it('keeps one crest and three distinct contacts for a tightly grouped volley', () => {
    const buffer = new SummonImpactBuffer(), events = [hit(1), hit(2), hit(3)], snapshot = structuredClone(events);
    for (const event of events) buffer.add(event, false, false);
    expect(buffer.entries.map(e => e.spiritId)).toEqual([1, 2, 3]);
    expect(buffer.entries.filter(e => !e.accent)).toHaveLength(1);
    buffer.update(.3); expect(buffer.entries.map(e => e.spiritId)).toEqual([1]);
    buffer.update(1); expect(buffer.entries).toHaveLength(0); expect(events).toEqual(snapshot);
  });
  it('gives different targets, elements and a later strike their own featured contact', () => {
    const buffer = new SummonImpactBuffer(); buffer.add(hit(), false, false);
    buffer.add(hit(2, { targetId: 21 }), false, false);
    buffer.add(hit(3, { element: 'water' }), false, false);
    buffer.add(hit(4, { at: { x: 4, z: 7 } }), false, false);
    buffer.update(.31); buffer.add(hit(1), false, false);
    expect(buffer.entries.every(e => !e.accent)).toBe(true);
  });
  it('deduplicates only the same caster and target, excluding echoes', () => {
    const buffer = new SummonImpactBuffer(), event = hit(); buffer.add(event, false, false);
    expect(buffer.hasNativeDuplicate(event.at, 1, 20)).toBe(true);
    expect(buffer.hasNativeDuplicate(event.at, 2, 20)).toBe(false);
    expect(buffer.hasNativeDuplicate(event.at, 1, 21)).toBe(false);
    buffer.update(.09); expect(buffer.hasNativeDuplicate(event.at, 1, 20)).toBe(false);
    buffer.clear(); buffer.add(hit(1, { echo: true }), false, false);
    expect(buffer.hasNativeDuplicate(event.at, 1, 20)).toBe(false);
  });
  it('bounds an echo flood while protecting the primary crest and snapshots positions', () => {
    const buffer = new SummonImpactBuffer(), event = hit(); buffer.add(event, true, true);
    event.at.x = 99;
    for (let i = 0; i < 300; i++) buffer.add(hit(i + 2, { union: false, echo: true }), false, false);
    expect(buffer.entries).toHaveLength(48);
    expect(buffer.entries[0]).toMatchObject({ spiritId: 1, at: { x: 1, z: 7 }, ancestor: true });
    buffer.clear(); expect(buffer.entries).toHaveLength(0);
  });
});
