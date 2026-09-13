import {describe,it,expect} from 'vitest';
import {earthGait,earthFootContact} from '../src/render/earth-gait';
import {spiritWalkContact} from '../src/render/spirit-gait';

describe('stone guard alternates identifiable left and right legs',()=>{
  it('puts the right foot ahead first and the left foot ahead half a cycle later',()=>{
    const a=earthGait(0),b=earthGait(2);
    expect(a.right.foot.x-a.left.foot.x).toBeGreaterThan(25);
    expect(b.left.foot.x-b.right.foot.x).toBeGreaterThan(25);
    expect(a.right.hip).toEqual(b.right.hip);expect(a.left.hip).toEqual(b.left.hip);
  });
  it('raises the left foot past a planted right leg, then exchanges their roles',()=>{
    const a=earthGait(1),b=earthGait(3);
    expect(a.right.planted).toBe(true);expect(a.right.lift).toBe(0);expect(a.left.lift).toBeGreaterThan(10);
    expect(b.left.planted).toBe(true);expect(b.left.lift).toBe(0);expect(b.right.lift).toBeGreaterThan(10);
  });
  it('keeps one support foot down and both leg segments connected throughout a cycle',()=>{
    for(let i=0;i<120;i++){
      const gait=earthGait(i/30);expect(gait.left.planted||gait.right.planted).toBe(true);
      for(const leg of [gait.left,gait.right]){
        expect(Math.hypot(leg.knee.x-leg.hip.x,leg.knee.y-leg.hip.y)).toBeCloseTo(25,7);
        expect(Math.hypot(leg.knee.x-leg.ankle.x,leg.knee.y-leg.ankle.y)).toBeCloseTo(25,7);
        expect(leg.foot.y).toBeLessThanOrEqual(0);
      }
    }
  });
  it('lands each foot at the same place used by its dust and sound contact',()=>{
    expect(spiritWalkContact('earth',false,1)).toEqual(earthGait(2).left.foot);
    expect(spiritWalkContact('earth',false,-1)).toEqual(earthGait(0).right.foot);
    expect(earthFootContact(1).y).not.toBe(earthFootContact(-1).y);
    expect(earthGait(4)).toEqual(earthGait(0));
  });
});
