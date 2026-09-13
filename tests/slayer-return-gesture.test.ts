import { describe, expect, it, vi } from 'vitest';
import { random, segmentsIntersect } from '../src/core/math';
import { World } from '../src/game/world';
import type { Wolf } from '../src/game/contracts';
import { returnCrossing } from '../src/game/slayer-return-crossing';
import { slayerReturnGesture } from '../src/game/slayer-return-window';

const line=[{x:-12,z:4},{x:0,z:4}], cross=[{x:-10,z:2},{x:-10,z:8}];
const victim=(id:number,x=-2,z=4):Wolf=>({id,x,z,hp:10000,maxHp:10000,speed:0,heading:0,action:'run',age:0,attack:0,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
function setup(){
  const w=new World({roguelike:true,random:random(42167)});
  w.chooseDestiny({serial:1,fate:'slayer',roots:['metal'],boon:'three',tier:'ordinary'});w.phase='rest';
  for(let i=0;i<600;i++)if(w.build.rollOffers(w.health).some(r=>r.id==='slayer-return')){w.chooseUpgrade('slayer-return');break;}
  expect(w.build.level('slayer-return')).toBe(1);w.startWave();w.selected='metal';w.wolves=[victim(900)];
  expect(w.invoke(line,.8)).toBe(true);w.mechanics.tick(.4);return w;
}
describe('deliberate remote return gestures',()=>{
  it('extends a quick cut to a second, distant group through an empty part of the old line',()=>{
    const w=setup();w.wolves[0]!.hp=14;w.wolves.push({...victim(901,-10,8),hp:14});
    const quote=w.quoteStroke(cross)!,before=w.spirit,print=w.slayerTechniques.returnCut;
    const cue=slayerReturnGesture(w,quote)!;
    expect(cue.mode).toBe('remote');expect(cue.remote).toBe(1);expect(cue.at).toEqual({x:-10,z:4});
    expect(w.spirit).toBe(before);expect(w.slayerTechniques.returnCut).toBe(print);expect(w.kills).toBe(0);
    const returns=vi.fn(),damage=vi.fn();w.events.on('slayerReturn',returns);w.events.on('damage',damage);
    expect(w.invoke(cross)).toBe(true);expect(w.wolves[1]!.action).toBe('dead');expect(w.wolves[0]!.hp).toBe(14);
    w.mechanics.tick(.1);
    expect(w.kills).toBe(2);expect(returns.mock.calls[0]![0].hits).toBe(1);
    expect(damage.mock.calls.filter(([e])=>e.returning).map(([e])=>e.targetId)).toEqual([900]);
    expect(slayerReturnGesture(w,quote)).toBeNull();
  });
  it('identifies overlap instead of promising extra targets or predicting a kill',()=>{
    const w=setup(),input=[{x:-2,z:2},{x:-2,z:8}];
    const cue=slayerReturnGesture(w,w.quoteStroke(input))!;
    expect(cue.mode).toBe('overlap');expect(cue.remote).toBe(0);
    w.wolves[0]!.hp=14;expect(slayerReturnGesture(w,w.quoteStroke(input))!.mode).toBe('overlap');
    const returns=vi.fn();w.events.on('slayerReturn',returns);w.invoke(input);w.mechanics.tick(.1);
    expect(returns.mock.calls[0]![0].hits).toBe(0);
  });
  it('never previews a paid quick trigger for heavy, unaffordable, free, or stop-time strokes',()=>{
    const w=setup(),quote=w.quoteStroke(cross)!;
    expect(slayerReturnGesture(w,w.quoteStroke(cross,.8))!.mode).toBe('heavy');
    w.spirit=0;expect(slayerReturnGesture(w,quote)!.mode).toBe('unaffordable');
    w.spirit=quote.cost-1e-10;expect(slayerReturnGesture(w,quote)!.mode).toBe('unaffordable');expect(w.invoke(cross)).toBe(false);
    expect(slayerReturnGesture(w,{...quote,cost:0})!.mode).toBe('unpaid');
    w.spirit=100;w.ultimate.start();expect(slayerReturnGesture(w,quote)!.mode).toBe('unpaid');
    expect(w.slayerTechniques.returnCut).not.toBeNull();
  });
  it('keeps the original metal guard and empty-line outcomes visible',()=>{
    const w=setup();w.wolves=[{...victim(900),eliteSkill:'guard'}];w.selected='fire';
    expect(slayerReturnGesture(w,w.quoteStroke(cross))!.mode).toBe('guarded');
    w.wolves=[];expect(slayerReturnGesture(w,w.quoteStroke(cross))!.mode).toBe('empty');
    expect(slayerReturnGesture(w,w.quoteStroke([{x:4,z:2},{x:4,z:8}]))).toBeNull();
    w.slayerTechniques.tick(3);expect(slayerReturnGesture(w,w.quoteStroke(cross))).toBeNull();
  });
  it('matches the previous crossing rule for endpoints, overlaps, misses and random lines',()=>{
    expect(returnCrossing([{x:0,z:2},{x:0,z:4}],line)).toEqual({x:0,z:4});
    expect(returnCrossing([{x:-8,z:4},{x:-4,z:4}],line)).toEqual({x:-8,z:4});
    expect(returnCrossing([{x:-8,z:4.01},{x:-4,z:4.01}],line)).toBeNull();
    const rng=random(9231);
    for(let n=0;n<300;n++){
      const points=Array.from({length:4},()=>({x:rng()*50-25,z:rng()*50-25}));
      expect(!!returnCrossing(points.slice(0,2),points.slice(2))).toBe(segmentsIntersect(points[0]!,points[1]!,points[2]!,points[3]!));
    }
  });
});
