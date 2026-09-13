import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import type { Phase } from '../src/game/contracts';
import { wolfClear, wolfSegmentClear } from '../src/game/wolf-collision';
import { pickWard } from '../src/render/ward-selection';

const loop = (x = -6, z = 4) => [{ x:x-2,z:z-2 }, { x:x+2,z:z-2 }, { x:x+2,z:z+2 }, { x:x-2,z:z+2 }, { x:x-2,z:z-2 }];
function gifted(): World {
  const w = new World({ roguelike: true });
  expect(w.chooseDestiny({ serial:1,fate:'array',boon:'fivefold',roots:['earth'],tier:'ordinary' })).toBe(true);
  expect(w.place(loop())).toBe(true); return w;
}

describe('targeted formation removal', () => {
  it('removes an older selected ward, keeps the others and refunds exactly once', () => {
    const w = new World(); w.place(loop()); w.place(loop(2));
    const [a,b] = w.wards, removed = vi.fn(); w.events.on('wardRemoved', removed);
    expect(w.dismissWard(a!.id)).toBe(true); expect(w.wards).toEqual([b]); expect(w.spirit).toBeCloseTo(83.2);
    expect(removed).toHaveBeenCalledWith(expect.objectContaining({ id:a!.id,reason:'dismissed' }));
    expect(w.dismissWard(a!.id)).toBe(false); expect(w.spirit).toBeCloseTo(83.2); expect(removed).toHaveBeenCalledOnce();
  });
  it('salvages recorded payment in proportion to remaining durability', () => {
    const w = new World(); w.selected = 'earth'; w.place(loop(), 25);
    const a=w.wards[0]!; a.health=1; a.power={...a.power, investment:500,multiplier:8};
    const refund=20/a.maxHealth;expect(w.wardRefund(a.id)).toBeCloseTo(refund); expect(w.dismissWard(a.id)).toBe(true); expect(w.spirit).toBeCloseTo(75+refund);
  });
  it.each([false, true])('caps the refund and never reclaims it twice (roguelike %s)', roguelike => {
    const w=new World({roguelike});
    if (roguelike) w.chooseDestiny({serial:1,fate:'spirit',boon:'twins',roots:['earth'],tier:'ordinary'});
    w.place(loop()); const id=w.wards[0]!.id; w.spirit=98;
    w.dismissWard(id); expect(w.spirit).toBe(100); expect(w.notice).toContain('回收残值 2');
    expect(w.ledger.salvaged).toBe(roguelike ? 2 : 0);
    w.spirit=80; w.dismissWard(id); expect(w.spirit).toBe(80);
  });
  it('removes owner companions and immediately reopens the solid wall footprint in battle', () => {
    const w=new World(); w.selected='earth';
    w.formationEffects.add({id:'baby',plan:()=>[{kind:'guardian',attack:{damage:2,interval:1,range:4}}]});
    w.place(loop()); w.place(loop(4)); const [a,b]=w.wards;
    const aPet=w.companions[0]!,bPet=w.companions[1]!, callback=vi.fn(); w.events.on('companionRemoved',callback);
    const from={x:-10,z:4},to={x:-2,z:4};
    expect(wolfClear({x:-6,z:4},.62,w.wards)).toBe(false); expect(wolfSegmentClear(from,to,.62,w.wards)).toBe(false);
    w.startWave(); const rebuild=vi.spyOn(w.navigation,'rebuild'); w.dismissWard(a!.id);
    expect(w.companions).toEqual([bPet]); expect(callback).toHaveBeenCalledWith(expect.objectContaining({id:aPet.id,wardId:a!.id,reason:'dismissed'}));
    expect(wolfClear({x:-6,z:4},.62,w.wards)).toBe(true); expect(wolfSegmentClear(from,to,.62,w.wards)).toBe(true);
    expect(rebuild).toHaveBeenCalledWith(w.camp,[b]); expect(w.spirit).toBeCloseTo(83.2);
  });
  it('consumes the one-time gift when dismissed and charges its replacement', () => {
    const w=gifted(),a=w.wards[0]!; a.health/=2; w.spirit=30;
    expect(a.paidCost).toBe(0); expect(w.wardRefund(a.id)).toBe(0); expect(w.mechanics.spirits).toHaveLength(0);
    w.dismissWard(a.id); expect(w.spirit).toBe(30); expect(w.mechanics.spirits).toHaveLength(0);
    expect(w.place(loop())).toBe(true); expect(w.spirit).toBe(16); expect(w.wards[0]!.paidCost).toBe(14);
    w.dismissWard(w.wards[0]!.id); expect(w.spirit).toBeCloseTo(27.2);
  });
  it('charges a refunded paid main again instead of granting a free restoration', () => {
    const w=gifted(); const gift=w.wards.shift()!; w.mechanics.wardRemoved(gift.id);
    // Simulate a consumed gift slot after the first wall has been destroyed.
    expect(w.place(loop(),20)).toBe(true); expect(w.wards[0]!.paidCost).toBe(20); expect(w.spirit).toBe(80);
    w.dismissWard(w.wards[0]!.id); expect(w.spirit).toBe(96);
    expect(w.place(loop())).toBe(true); expect(w.spirit).toBe(82); expect(w.wards[0]!.paidCost).toBe(14);
  });
  it.each<Phase>(['destiny','rest','won','lost'])('does not remove wards during %s', phase => {
    const w=new World(); w.place(loop()); const id=w.wards[0]!.id; w.phase=phase;
    expect(w.dismissWard(id)).toBe(false); expect(w.wards).toHaveLength(1); expect(w.spirit).toBe(86);
  });
  it('does not change formations while the ultimate is recording or releasing', () => {
    const w=new World(); w.place(loop()); const id=w.wards[0]!.id; w.startWave(); w.startUltimate();
    expect(w.dismissWard(id)).toBe(false); w.tick(3); expect(w.dismissWard(id)).toBe(false);
    expect(w.wards).toHaveLength(1); expect(w.spirit).toBe(86);
  });
  it('selects a raised wall by its visible top or face, and misses empty terrain', () => {
    const w=new World(); w.selected='earth'; w.place(loop()); const a=w.wards[0]!; a.age=1;
    expect(pickWard({x:-6,z:1},w.wards)).toBe(a); // Above its ground footprint, on the raised top.
    expect(pickWard({x:-6,z:5},w.wards)).toBe(a); // Visible front face below the roof.
    expect(pickWard({x:0,z:4},w.wards)).toBeUndefined();
  });
  it('does not select excluded holes or the gap between clipped pieces', () => {
    const w=new World(); w.place(loop()); const a=w.wards[0]!;
    a.regions=[[a.points,loop(-6,4).map(p=>({x:-6+(p.x+6)/2,z:4+(p.z-4)/2}))]];
    expect(pickWard({x:-6,z:4},[a])).toBeUndefined();
    expect(pickWard({x:-7.5,z:4},[a])).toBe(a);
    a.regions=[[loop(-6)],[loop(3)]];
    expect(pickWard({x:-1,z:4},[a])).toBeUndefined(); expect(pickWard({x:3,z:4},[a])).toBe(a);
  });
});
