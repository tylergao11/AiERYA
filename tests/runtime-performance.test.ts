import { describe,expect,it } from 'vitest';
import { FrameGate } from '../src/core/frame-gate';
import { FrameMonitor } from '../src/core/frame-monitor';
import { canvasResolution } from '../src/render/resolution';

describe('runtime frame pacing and resolution budgets',()=>{
  it.each([60,90,120,144,165])('runs about 60 frames and preserves elapsed time on a %s Hz display',hz=>{
    const gate=new FrameGate();let frames=0,elapsed=0;
    for(let i=0;i<=hz*5;i++){const dt=gate.take(i*1000/hz);if(dt!==null){frames++;elapsed+=dt;}}
    expect(frames).toBeGreaterThanOrEqual(298);expect(frames).toBeLessThanOrEqual(302);expect(elapsed).toBeGreaterThan(4970);expect(elapsed).toBeLessThanOrEqual(5001);
  });
  it('drops stale frame deadlines after a stall and forgets hidden-tab time on resume',()=>{
    const gate=new FrameGate();gate.take(0);expect(gate.take(500)).toBe(500);expect(gate.take(501)).toBeNull();
    gate.reset();expect(gate.take(100000)).toBe(0);expect(gate.take(100017)).toBe(17);
  });
  it('keeps long-frame evidence instead of hiding it behind the simulation clamp',()=>{
    const monitor=new FrameMonitor();for(const elapsed of [16,16,16,100])monitor.add({elapsed,simulation:2,render:3,ui:1,painted:false});
    expect(monitor.summary()).toMatchObject({p95:100,slow:1,paintFps:0,render:3});expect(monitor.summary().fps).toBeCloseTo(4000/148);
  });
  it.each([[390,844,3],[844,390,3],[320,568,2],[667,375,3],[1440,900,3]])('bounds mobile backing pixels for %s × %s @ %s', (w,h,dpr)=>{
    const r=canvasResolution(w,h,dpr,true);expect(r.ratio).toBeLessThanOrEqual(1.5);expect(r.width*r.height).toBeLessThanOrEqual(1_500_000);expect(Math.max(r.width,r.height)).toBeLessThanOrEqual(2560);
    expect(r.width/r.height).toBeCloseTo(w/h,2);
  });
  it('limits large desktop surfaces and re-evaluates pixel density after rotation',()=>{
    const large=canvasResolution(3840,2160,2,false);expect(large.width*large.height).toBeLessThanOrEqual(3_000_000);
    const portrait=canvasResolution(390,844,3,true),landscape=canvasResolution(844,390,3,true);
    expect(portrait.width).toBe(landscape.height);expect(portrait.height).toBe(landscape.width);
    expect(canvasResolution(390,844,1,true).ratio).toBe(1);
  });
});
