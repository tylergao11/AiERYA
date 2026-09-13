import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { helpPanel } from '../src/ui/help-panel';

const loop = [{x:-8,z:2},{x:-4,z:2},{x:-4,z:6},{x:-8,z:6},{x:-8,z:2}];
function ready(array = false) {
  const w = new World({roguelike:true});
  w.chooseDestiny({serial:1,fate:array?'array':'spirit',boon:array?'living':'twins',tier:array?'unusual':'ordinary',roots:['earth']});
  return w;
}

describe('double preparation spending', () => {
  it('quotes and pays 28 for the same 14-investment formation', () => {
    const w=ready(), placed=vi.fn(); w.events.on('ward',placed);
    const plan=w.previewPlacement(loop); expect(plan.ok).toBe(true);
    if(!plan.ok)throw Error(plan.message);
    expect(w.wardCost).toBe(28); expect(plan.cost).toBe(28); expect(plan.power.investment).toBe(14);
    expect(w.place(loop)).toBe(true); expect(w.spirit).toBe(72); expect(w.ledger.spent).toBe(28);
    expect(w.wards[0]!.power).toEqual(plan.power); expect(w.wards[0]!.paidCost).toBe(28);
    expect(placed).toHaveBeenCalledWith(expect.objectContaining({cost:28}));
    expect(w.wardRefund(w.wards[0]!.id)).toBeCloseTo(22.4);
  });
  it('blocks unaffordable preparation before committing a formation', () => {
    const w=ready(); w.spirit=27;
    expect(w.previewPlacement(loop)).toMatchObject({ok:false,reason:'energy',message:expect.stringContaining('28')});
    expect(w.place(loop)).toBe(false); expect(w.wards).toHaveLength(0); expect(w.spirit).toBe(27); expect(w.ledger.spent).toBe(0);
    w.spirit=28; expect(w.place(loop)).toBe(true); expect(w.spirit).toBe(0);
  });
  it('doubles customized investment and applies price modifiers before the multiplier', () => {
    const w=ready(); expect(w.place(loop,20)).toBe(true);
    expect(w.spirit).toBe(60); expect(w.wards[0]!.power.investment).toBe(20);
    const discounted=ready(); discounted.stats.add({id:'price',stat:'wardCost',multiply:.5});
    expect(discounted.wardCost).toBe(14); expect(discounted.place(loop)).toBe(true); expect(discounted.spirit).toBe(86);
  });
  it('preserves free gifts and charges their paid replacements at double cost', () => {
    const w=ready(true); expect(w.mainPlacementCost).toBe(0);
    expect(w.previewPlacement(loop)).toMatchObject({ok:true,cost:0});
    expect(w.place(loop)).toBe(true); expect(w.spirit).toBe(100); expect(w.wardRefund(w.wards[0]!.id)).toBe(0);
    w.dismissWard(w.wards[0]!.id); expect(w.mainPlacementCost).toBe(28);
    expect(w.place(loop)).toBe(true); expect(w.spirit).toBe(72);
  });
  it('charges 60 for the same repair and rejects 59 before changing health', () => {
    const w=ready(), repaired=vi.fn(); w.events.on('campRepaired',repaired); w.health=60; w.spirit=59;
    expect(w.repairCost).toBe(60); expect(w.repairCamp()).toBe(false); expect(w.health).toBe(60);
    w.spirit=100; expect(w.repairCamp()).toBe(true); expect(w.health).toBe(80); expect(w.spirit).toBe(40);
    expect(w.ledger.spent).toBe(60); expect(repaired).toHaveBeenCalledWith({amount:20,cost:60});
    expect(w.notice).toContain('支出 60');
  });
  it('keeps preparation movement free and battle movement and casting at original prices', () => {
    const w=ready(true); w.place(loop); const ward=w.wards[0]!;
    expect(w.moveMain(ward.id,{x:-3,z:0})).toBe(true); expect(w.spirit).toBe(100);
    w.startWave(); expect(w.moveMain(ward.id,{x:-6,z:4})).toBe(true); expect(w.spirit).toBe(90);
    w.selected='metal'; expect(w.invoke([{x:8,z:0},{x:12,z:0}])).toBe(true); expect(w.spirit).toBe(87);
  });
  it('shows the new prices in the handbook', () => {
    const html=helpPanel(); expect(html).toContain('布阵花 28'); expect(html).toContain('花 60 灵力修营');
  });
});
