import { describe, expect, it } from 'vitest';
import { SpiritPoses, ancestorFrame, spiritAttackRow, spiritActionMotion } from '../src/render/spirit-pose';
import type { RunSpirit } from '../src/game/rogue-combat';
import type { GameEvents } from '../src/game/contracts';
import { SpiritArt } from '../src/render/spirit-art';
import type { World } from '../src/game/world';

const pet = (): RunSpirit => ({ id: 1, role: 'main', element: 'earth', x: 3, z: 4, power: 1, age: 0, cooldown: 0, targetId: null, cast: 0, energy: 0, size: 1.75 });

describe('spirit illustration motion follows gameplay without changing it', () => {
  it.each(['earth','wood'] as const)('%s keeps its walking anchor when starting and finishing a strike',element=>{
    const s={...pet(),element,size:1,age:2},world={build:{has:()=>false},mechanics:{spirits:[s]},wolves:[]} as unknown as World;
    const art=new SpiritArt(world),sheet={} as HTMLImageElement;art.setAssets({spirits:sheet,ancestor:sheet,spiritWalk:sheet});art.update(0);
    const resting=art.source(s),before=structuredClone(s);
    art.poses.attack(s,{stage:'windup',spiritId:s.id,targetId:10,at:s,to:{x:s.x+1,z:s.z},element,style:'melee',duration:.16,heavy:element==='earth'});
    expect(art.source(s)).toEqual(resting);
    const pose=art.poses.get(s);pose.elapsed=.16;const contact=art.source(s);expect(contact.x).toBeGreaterThan(resting.x+10);
    pose.elapsed=pose.windup+pose.recovery;expect(art.source(s)).toEqual(resting);expect(s).toEqual(before);
    art.clear();
  });
  it('reveals and breathes in preparation while the simulation companion age is stopped', () => {
    const s = pet(), poses = new SpiritPoses();
    poses.update([s], .2, () => undefined); poses.update([s], .2, () => undefined);
    expect(poses.get(s).age).toBeCloseTo(.4); expect(s.age).toBe(0);
  });
  it('starts one action on a fresh cast, settles to idle and can cast again', () => {
    const s = pet(), poses = new SpiritPoses(); poses.update([s], .01, () => undefined);
    expect(ancestorFrame(poses.get(s).elapsed)).toBe(0);
    s.cast = .4; poses.update([s], .01, () => undefined); expect(ancestorFrame(poses.get(s).elapsed)).toBe(1);
    s.cast = .2; poses.update([s], .2, () => undefined); expect(ancestorFrame(poses.get(s).elapsed)).toBe(2); expect(spiritAttackRow(poses.get(s).elapsed)).toBe(1);
    s.cast = 0; poses.update([s], .5, () => undefined); expect(ancestorFrame(poses.get(s).elapsed)).toBe(0);
    s.cast = .4; poses.update([s], .01, () => undefined); expect(poses.get(s).elapsed).toBe(0);
  });
  it('faces the target without flickering near its center and keeps the entity unchanged', () => {
    const s = pet(), poses = new SpiritPoses(); s.targetId = 22; const before = structuredClone(s);
    poses.update([s], .1, () => -8); expect(poses.get(s).facing).toBe(-1);
    poses.update([s], .1, () => 3.1); expect(poses.get(s).facing).toBe(-1);
    poses.update([s], .1, () => 10); expect(poses.get(s).facing).toBe(1); expect(s).toEqual(before);
  });
  it('smooths evolution and forgets removed entities rather than retaining old action clocks', () => {
    const s = pet(), poses = new SpiritPoses(); poses.update([s], .1, () => undefined);
    s.size = 2.36; poses.update([s], .03, () => undefined); expect(poses.get(s).growth).toBeGreaterThan(1.75); expect(poses.get(s).growth).toBeLessThan(s.size);
    poses.update([], .1, () => undefined); s.size = 1; expect(poses.get(s).growth).toBe(1); poses.clear(); expect(poses.get(s).elapsed).toBe(1);
  });
  it('reaches the strongest pose at actual contact instead of lunging after damage',()=>{
    for(const [windup,recovery] of [[.16,.22],[.18,.28],[.2,.22]]){
      expect(spiritActionMotion(windup!*.5,windup!,recovery!).pull).toBeGreaterThan(.8);
      expect(spiritActionMotion(windup!,windup!,recovery!).strike).toBe(1);
      expect(spiritActionMotion(windup!+.03,windup!,recovery!).strike).toBe(1);
      expect(spiritActionMotion(windup!+recovery!,windup!,recovery!)).toEqual({pull:0,strike:0,active:false});
    }
  });
  it('follows launch and contact events but lets delayed echoes leave the body alone',()=>{
    const s=pet(),poses=new SpiritPoses();s.cast=.46;s.targetId=10;
    const event:GameEvents['spiritAttack']={stage:'windup',spiritId:s.id,targetId:10,at:s,to:{x:5,z:4},element:'earth',style:'melee',duration:.18,heavy:true,union:true};
    poses.attack(s,event);poses.update([s],.05,()=>5);
    expect(poses.get(s).elapsed).toBeCloseTo(.05);expect(poses.get(s).force).toBe(1.2);
    poses.attack(s,{...event,stage:'impact'});expect(poses.get(s).elapsed).toBe(.18);
    poses.update([s],.12,()=>5);const elapsed=poses.get(s).elapsed;
    poses.attack(s,{...event,echo:true});expect(poses.get(s).elapsed).toBe(elapsed);
  });
  it('holds the attack direction through contact and turns smoothly after recovery',()=>{
    const s=pet(),poses=new SpiritPoses();s.cast=.46;s.targetId=10;
    poses.attack(s,{stage:'windup',spiritId:s.id,targetId:10,at:s,to:{x:6,z:4},element:'earth',style:'melee',duration:.18,heavy:true});
    poses.update([s],.1,()=>-8);expect(poses.get(s).facing).toBe(1);
    poses.update([s],.2,()=>-8);expect(poses.get(s).facing).toBe(-1);expect(poses.get(s).heading).toBeGreaterThan(-1);
    expect(poses.get(s).heading).toBeLessThan(1);
  });
  it('cancels an abandoned cast on retreat and keeps the dust direction tied to travel',()=>{
    const s=pet(),poses=new SpiritPoses();poses.update([s],.01,()=>undefined);s.cast=.46;poses.update([s],.01,()=>undefined);
    s.cast=0;s.x-=.1;s.z+=.05;const before=structuredClone(s);poses.update([s],.02,()=>undefined);
    expect(poses.get(s).elapsed).toBe(1);expect(poses.get(s).vx).toBeLessThan(0);expect(poses.get(s).vz).toBeGreaterThan(0);
    expect(poses.get(s).stride).toBeGreaterThan(0);expect(s).toEqual(before);
  });
  it('places the dragon and phoenix charge at their mouths and mirrors the same anchor',()=>{
    for(const element of ['water','fire'] as const){
      const s={...pet(),element,size:1,age:2};
      const world={build:{has:()=>false},mechanics:{spirits:[s]},wolves:[]} as unknown as World;
      const art=new SpiritArt(world);art.update(.01);const feet=art.anchor(s),right=art.source(s);
      expect(right.y).toBeLessThan(feet.y-125);expect(right.x).toBeGreaterThan(feet.x+45);
      const pose=art.poses.get(s);pose.facing=-1;pose.heading=-1;
      const left=art.source(s);expect(left.y).toBeCloseTo(right.y);expect(left.x-feet.x).toBeCloseTo(feet.x-right.x);
      s.cast=.42;art.poses.attack(s,{stage:'windup',spiritId:s.id,targetId:10,at:s,to:{x:8,z:4},element,style:'ranged',duration:.2,heavy:false});
      art.poses.attack(s,{stage:'launch',spiritId:s.id,targetId:10,at:s,to:{x:8,z:4},element,style:'ranged',duration:.24,heavy:false});
      pose.heading=1;const shot=art.source(s);expect(shot.y).toBeGreaterThan(right.y+20);expect(shot.y).toBeLessThan(feet.y-70);
    }
  });
});
