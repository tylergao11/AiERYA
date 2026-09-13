import { describe, expect, it } from 'vitest';
import { BirthDemoSimulation } from '../src/ui/birth-demo-simulation';
import { birthPool } from '../src/game/birth-draft';
import { destinyBoons, destinyName } from '../src/game/roguelike';

describe('each talent has its own real combat demonstration', () => {
  const definitions = [...new Map(birthPool().map(({ destiny }) => { const d = { ...destiny, serial: 1 }; return [destinyName(d), d] as const; })).values()];
  it.each(definitions)('$fate / $boon / $tier produces damage and its defining effect', destiny => {
    const demo = new BirthDemoSimulation(destiny), w = demo.world;
    const casts: string[] = [], echoes:string[]=[], rushes:number[]=[]; w.events.on('invoke', e => casts.push(e.element));w.events.on('summonImpact',e=>{if(e.echo)echoes.push(e.element);});w.events.on('slayerStrike',e=>{if(e.rush)rushes.push(e.rush);});
    const oldWardX = w.wards[0]?.x;
    for (let i = 0; i < 4.5 * 60; i++) demo.tick(1 / 60);
    expect(Object.values(w.combatTotals).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(w.wolves.every(wolf => wolf.id >= 10000)).toBe(true);
    for (const boon of destinyBoons(destiny)) {
      if (boon === 'three') expect(casts.length).toBeGreaterThanOrEqual(6);
      if (boon === 'scar') { expect(w.mechanics.scar).not.toBeNull(); expect(demo.caption).toContain('交叉'); }
      if (boon === 'debt') { expect(demo.caption).toContain('狂书'); expect(rushes.length).toBeGreaterThan(0); expect(w.spirit).toBeGreaterThan(0); }
      if (boon === 'twinArray') expect(w.wards.filter(w=>w.mainSlot!==undefined)).toHaveLength(2);
      if (boon === 'fivefold') { expect(w.mechanics.spirits).toHaveLength(0); expect(demo.caption).toContain('双辅'); };
      if (boon === 'living') { expect(w.wards[0]!.x).not.toBe(oldWardX); expect(demo.caption).toContain('落地'); }
      if (boon === 'twins') expect(w.mechanics.spirits.some(s => s.role === 'twin')).toBe(true);
      if (boon === 'mimic') {expect(echoes).toContain('fire');expect(casts).toHaveLength(0);}
      if (boon === 'beast') { expect(w.mechanics.beastEvolved).toBe(true); expect(demo.caption).toContain('蜕变'); }
    }
    demo.restart(); expect(demo.elapsed).toBe(0); expect(w.kills).toBe(0); expect(w.wards.length).toBe(destiny.fate === 'array' ? destinyBoons(destiny).includes('living') ? 1 : 3 : 0);
  });
});
