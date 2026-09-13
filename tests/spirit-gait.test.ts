import { describe, expect, it } from 'vitest';
import type { RunSpirit } from '../src/game/rogue-combat';
import { SpiritPoses } from '../src/render/spirit-pose';
import { spiritStrideLength, spiritWalkFrame } from '../src/render/spirit-gait';

const actor=(element:'wood'|'earth'='earth',size=1):RunSpirit=>({id:1,role:'array',x:0,z:0,element,size,power:1,age:1,cooldown:0,targetId:null,cast:0,energy:0});
function walk(element:'wood'|'earth',fps:number,size=1,seconds=1){
  const spirit=actor(element,size),poses=new SpiritPoses();poses.update([spirit],0,()=>undefined);
  for(let i=0;i<fps*seconds;i++){spirit.x+=3.8/fps;poses.update([spirit],1/fps,()=>undefined);}
  return {spirit,poses,pose:poses.get(spirit)};
}

describe('ground spirit gait registration and cadence',()=>{
  it('uses a heavy earth gait and a quicker deer gait at the same actual speed',()=>{
    const earth=walk('earth',60),wood=walk('wood',60),beast=walk('earth',60,1.75);
    expect(earth.pose.stride/4).toBeGreaterThan(.9);expect(earth.pose.stride/4).toBeLessThan(1.2);
    expect(wood.pose.stride).toBeGreaterThan(earth.pose.stride);expect(beast.pose.stride).toBeLessThan(earth.pose.stride);
    expect(earth.spirit.x).toBeCloseTo(wood.spirit.x);expect(earth.spirit.x).toBeCloseTo(beast.spirit.x);
  });
  it('ties foot phase to distance consistently at 30, 60 and 120 FPS',()=>{
    const cycles=[30,60,120].map(fps=>walk('earth',fps,1,3).pose.stride);
    expect(cycles[0]).toBeCloseTo(cycles[1]!,9);expect(cycles[1]).toBeCloseTo(cycles[2]!,9);
  });
  it('does not plant between render frames when simulation updates at 60 Hz',()=>{
    const phases=[30,60,120].map(fps=>{
      const s=actor(),poses=new SpiritPoses();poses.update([s],0,()=>undefined);let previousTick=0;
      for(let frame=1;frame<=fps*2;frame++){
        const tick=Math.floor(frame*60/fps);s.x+=(tick-previousTick)*3.8/60;previousTick=tick;
        poses.update([s],1/fps,()=>undefined);
      }
      return poses.get(s).stride;
    });
    expect(phases[0]).toBeCloseTo(phases[1]!,9);expect(phases[1]).toBeCloseTo(phases[2]!,9);
  });
  it('keeps its side while travelling vertically with small alternating path corrections',()=>{
    const s=actor(),poses=new SpiritPoses();poses.update([s],0,()=>undefined);
    for(let i=0;i<60;i++){
      s.x+=i%2?.006:-.006;s.z+=.09;poses.update([s],1/60,()=>undefined);
      expect(poses.get(s).facing).toBe(1);
    }
    for(let i=0;i<12;i++){s.x-=.06;poses.update([s],1/60,()=>undefined);}
    expect(poses.get(s).facing).toBe(-1);
  });
  it('plants the last step and remains settled while the simulation is stopped',()=>{
    const {poses,pose,spirit}=walk('earth',60),before=structuredClone(spirit);
    for(let i=0;i<45;i++)poses.update([spirit],1/60,()=>undefined);
    expect(pose.walkWeight).toBeLessThan(.001);expect(pose.stride%2).toBe(0);const planted=pose.stride;
    for(let i=0;i<60;i++)poses.update([spirit],1/60,()=>undefined);
    expect(pose.stride).toBe(planted);expect(spirit).toEqual(before);
  });
  it('does not turn a relocation into a rapid burst of walking frames',()=>{
    const spirit=actor(),poses=new SpiritPoses();poses.update([spirit],0,()=>undefined);spirit.x=20;poses.update([spirit],1/60,()=>undefined);
    expect(poses.get(spirit).stride).toBe(0);expect(poses.get(spirit).walkWeight).toBe(0);
  });
  it('gives a larger evolved body a longer step instead of faster leg flicker',()=>{
    expect(spiritStrideLength(actor('earth',2.36))).toBeGreaterThan(spiritStrideLength(actor('earth',1.75)));
  });
  it.each([['earth',false],['wood',false],['earth',true]] as const)('%s beast=%s keeps every drawn foot on zero and head at the registered height',(element,beast)=>{
    for(let i=0;i<4;i++){
      const f=spiritWalkFrame(element,beast,i);
      expect(f.dy+(f.foot-f.sy)*f.unit).toBeCloseTo(0,9);
      expect(f.dy+(f.head-f.sy)*f.unit).toBeCloseTo(-f.height,9);
      expect(f.sx+f.sw).toBeLessThanOrEqual(1448);expect(f.sy+f.sh).toBeLessThanOrEqual(1086);
    }
  });
});
