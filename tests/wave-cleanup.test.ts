import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { upgrades } from '../src/game/content';
import { wolfFrame } from '../src/render/wolf-frame';
import { CAMPAIGN_WAVES, encounter } from '../src/game/encounters';

const loop = [{x:-8,z:2},{x:-4,z:2},{x:-4,z:6},{x:-8,z:6},{x:-8,z:2}];

/** Let the real spawner/phase logic run; kill each arrival through resolved combat. */
function finishWave(world: World): void {
  world.startWave();
  for (let frame=0;frame<3600 && world.phase==='battle';frame++) {
    world.tick(1/30);
    for (const wolf of [...world.wolves]) if (wolf.action!=='dead') world.hitRogue(wolf,100000,'metal',{kind:'manual'});
  }
  expect(world.phase).not.toBe('battle');
}

describe('wave boundary cleanup', () => {
  it('clears the final corpse before wave rewards and never carries it into the next layout or final victory', () => {
    const world=new World(),death=vi.fn(),snapshots:{wave:number;enemies:number}[]=[];
    world.events.on('death',death);
    world.events.on('phase',({phase})=>{if(phase==='rest'||phase==='won')snapshots.push({wave:world.wave,enemies:world.wolves.length});});
    for (let wave=1;wave<=CAMPAIGN_WAVES;wave++) {
      finishWave(world);
      expect(world.phase).toBe(wave===CAMPAIGN_WAVES?'won':'rest');
      expect(world.wolves).toEqual([]);
      const kills=world.kills,damage=world.combatTotals.spell;
      world.tick(10); expect(world.wolves).toEqual([]); expect(world.kills).toBe(kills); expect(world.combatTotals.spell).toBe(damage);
      if(wave<CAMPAIGN_WAVES){world.chooseUpgrade(upgrades[0]!.id);expect(world.phase).toBe('prepare');expect(world.wolves).toEqual([]);}
    }
    expect(snapshots).toEqual(Array.from({length:CAMPAIGN_WAVES},(_,i)=>({wave:i+1,enemies:0})));
    const total=Array.from({length:CAMPAIGN_WAVES},(_,i)=>encounter(i+1).count).reduce((a,b)=>a+b,0);
    expect(death.mock.calls.filter(([e])=>!e.wolf.summoned)).toHaveLength(total);
    expect(world.kills).toBeGreaterThanOrEqual(total);expect(death).toHaveBeenCalledTimes(world.kills);
  });
  it('still plays and expires corpses normally while the wave is ongoing', () => {
    const world=new World();world.startWave();world.tick(1.21);
    const wolf=world.wolves[0]!;world.hitRogue(wolf,100000,'metal',{kind:'manual'});world.tick(.3);
    expect(world.phase).toBe('battle');expect(world.wolves).toContain(wolf);expect(wolfFrame(wolf)).toEqual({row:2,column:1});
    world.tick(1.9);expect(world.wolves).not.toContain(wolf);expect(world.phase).toBe('battle');
  });
  it('keeps formations, their damage, paid investment and persistent companions while dropping target references', () => {
    const world=new World({roguelike:true});
    world.build.beginPair([{serial:1,fate:'array',boon:'fivefold',roots:['earth'],tier:'ordinary'},{serial:2,fate:'spirit',boon:'mimic',roots:['wood'],tier:'ordinary'}]);world.phase='prepare';world.mechanics.initialize();
    world.formationEffects.add({id:'guard',plan:()=>[{kind:'guardian',attack:{damage:1,interval:1,range:5}}]});
    world.place(loop);const ward=world.wards[0]!,pet=world.companions[0]!,spirit=world.mechanics.spirits[0]!;
    ward.health/=2;const health=ward.health;
    finishWave(world);
    expect(world.wolves).toEqual([]);expect(world.wards).toEqual([ward]);expect(ward.health).toBeGreaterThan(0);expect(ward.health).toBeLessThan(health);expect(ward.paidCost).toBe(0);
    const remaining=ward.health;world.tick(30);expect(ward.health).toBe(remaining);
    expect(world.companions).toEqual([pet]);expect(pet.targetId).toBeNull();
    expect(world.mechanics.spirits).toEqual([spirit]);expect(spirit.targetId).toBeNull();
  });
  it('also clears enemies on defeat without granting extra kills or death rewards', () => {
    const world=new World(),death=vi.fn();world.events.on('death',death);world.startWave();world.tick(1.21);
    expect(world.wolves).toHaveLength(1);world.health=0;world.tick(1/60);
    expect(world.phase).toBe('lost');expect(world.wolves).toEqual([]);expect(world.kills).toBe(0);expect(death).not.toHaveBeenCalled();
  });
});
