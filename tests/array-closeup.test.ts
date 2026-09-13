import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import type { ArrayEvent } from '../src/game/array-momentum';
import { ArrayCloseup, ARRAY_CLOSEUP } from '../src/render/array-closeup';
import { SlayerCloseup } from '../src/render/slayer-closeup';
import { Camera2D } from '../src/render/projection';
import { DrawingInput } from '../src/ui/input';
import type { SceneView } from '../src/render/view';
import type { GameInterface } from '../src/ui/interface';

afterEach(()=>vi.unstubAllGlobals());
const at={x:0,z:5};
const release: ArrayEvent={kind:'release',at,element:'fire',style:'fire',energy:100,label:'焚阵燎原',targets:[{x:1,z:5}],radius:2.3};
function setup(width=1280,height=720,reduced=false){
  vi.stubGlobal('matchMedia',()=>({matches:reduced}));
  const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'array',tier:'ordinary',boon:'fivefold',roots:['fire']});world.startWave();
  const camera=new Camera2D();camera.resize(width,height);const closeup=new ArrayCloseup(world);
  return {world,camera,closeup,emit:(e:Partial<ArrayEvent>={})=>world.events.emit('arrayEffect',{...release,...e})};
}

describe('array special-move camera',()=>{
  it('pushes into a real strong release and restores the exact user-selected zoom',()=>{
    const {world,camera,closeup,emit}=setup();camera.changeZoom(-220);
    const before={scale:camera.scale,x:camera.offsetX,y:camera.offsetY},state=[world.time,world.spirit,world.health,world.kills];
    emit();closeup.update(.12,camera);expect(camera.scale/before.scale).toBeGreaterThan(1.2);
    closeup.update(1,camera);expect(closeup.active).toBe(false);expect({scale:camera.scale,x:camera.offsetX,y:camera.offsetY}).toEqual(before);
    expect([world.time,world.spirit,world.health,world.kills]).toEqual(state);closeup.dispose();
  });
  it('frames simultaneous harmony sources together, and snapshots their positions',()=>{
    const {camera,closeup,emit}=setup(),source={x:-13,z:5};
    emit({at:source});emit({kind:'harmony',at:{x:13,z:5},energy:40,label:'纯阵合鸣'});source.x=100;
    closeup.update(.12,camera);
    const a=camera.project({x:-13,z:5}),b=camera.project({x:13,z:5});
    expect(a.x).toBeGreaterThan(60);expect(b.x).toBeLessThan(camera.width-60);
    closeup.update(.73,camera);expect(closeup.active).toBe(true);closeup.update(.3,camera);expect(closeup.active).toBe(false);closeup.dispose();
  });
  it('skips weak native releases, idle effects, empty hits and ordinary echoes',()=>{
    const {camera,closeup,emit}=setup(),base=camera.scale;
    for(const e of [{energy:24},{kind:'feed' as const},{kind:'transfer' as const},{kind:'echo' as const},{targets:[]},{at:{x:NaN,z:4}}]){emit(e);closeup.update(.1,camera);expect(closeup.active).toBe(false);expect(camera.scale).toBe(base);}
    emit({energy:24,element:'water',style:'steam',label:'蒸汽破阵'});closeup.update(.12,camera);expect(closeup.active).toBe(true);closeup.dispose();
  });
  it('does not restart for repeated hits, and applies a gap before another closeup',()=>{
    const {camera,closeup,emit}=setup();emit();closeup.update(.2,camera);
    for(let i=0;i<20;i++){emit({kind:'harmony',label:'纯阵合鸣'});closeup.update(.06,camera);}
    expect(closeup.active).toBe(false);emit();expect(closeup.active).toBe(false);
    closeup.update(ARRAY_CLOSEUP.interval,camera);emit();expect(closeup.active).toBe(true);closeup.dispose();
  });
  it.each([[390,844],[844,390],[1280,720]])('keeps projection and pointer picking aligned at %s × %s', (width,height)=>{
    const {camera,closeup,emit}=setup(width,height),base=camera.scale;
    emit({at:{x:17,z:12}});closeup.update(.12,camera);
    expect(camera.scale/base).toBeLessThanOrEqual((Math.min(width,height)<=600?ARRAY_CLOSEUP.mobileZoom:ARRAY_CLOSEUP.desktopZoom)+1e-10);
    for(const point of [at,{x:-16,z:-5},{x:17,z:12}]){const p=camera.project(point),back=camera.unproject(p.x,p.y);expect(back.x).toBeCloseTo(point.x,8);expect(back.z).toBeCloseTo(point.z,8);}
    closeup.dispose();
  });
  it('interrupts for drawing, phase/reset and time-stop; reduced motion never moves the camera',()=>{
    const a=setup(),base=a.camera.scale;a.emit();a.closeup.update(.12,a.camera);a.closeup.update(0,a.camera,true);expect(a.camera.scale).toBe(base);
    for(const event of ['phase','reset','ultimate'] as const){a.world.events.emit('reset',undefined);a.emit();a.closeup.update(.12,a.camera);if(event==='phase')a.world.events.emit('phase',{phase:'rest'});else if(event==='reset')a.world.events.emit('reset',undefined);else a.world.startUltimate();a.closeup.update(0,a.camera);expect(a.closeup.active).toBe(false);expect(a.camera.scale).toBe(base);}
    a.closeup.dispose();const b=setup(1280,720,true),before={scale:b.camera.scale,x:b.camera.offsetX,y:b.camera.offsetY};b.emit();b.closeup.update(.12,b.camera);expect({scale:b.camera.scale,x:b.camera.offsetX,y:b.camera.offsetY}).toEqual(before);b.closeup.dispose();
  });
  it('yields to an existing slayer shot without resetting that camera',()=>{
    const {world,camera,closeup,emit}=setup();world.build.beginPair([{serial:1,fate:'array',tier:'ordinary',boon:'fivefold',roots:['fire']},{serial:2,fate:'slayer',tier:'ordinary',boon:'three',roots:['metal']}]);
    const slayer=new SlayerCloseup(world);emit();world.events.emit('slayerFinisher',{at,element:'metal',hits:2});slayer.update(.1,camera);expect(slayer.active).toBe(true);const focused={scale:camera.scale,x:camera.offsetX,y:camera.offsetY};
    closeup.update(.1,camera,false,slayer.active);expect(closeup.active).toBe(false);expect({scale:camera.scale,x:camera.offsetX,y:camera.offsetY}).toEqual(focused);slayer.dispose();closeup.dispose();
  });
  it('normal pointer capture loss after releasing a cast does not erase its new closeup',()=>{
    vi.stubGlobal('window',new EventTarget());const {world,camera,closeup,emit}=setup();
    const canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn()}),order:string[]=[];
    const view={canvas,beginStroke:()=>{order.push('restore');closeup.cancel();camera.focus(null);},pick:(x:number,y:number)=>{order.push('pick');return camera.unproject(x,y);},preview:()=>{closeup.cancel();camera.focus(null);},previewRemoval:vi.fn()} as unknown as SceneView;
    const input=new DrawingInput(world,view,{blocked:false,removing:false} as GameInterface),draw=vi.spyOn(world,'invoke').mockImplementation(()=>{emit();return true;});
    const a=camera.project({x:-3,z:5}),b=camera.project({x:3,z:5});
    try{for(const [type,p]of [['pointerdown',a],['pointerup',b]] as const)canvas.dispatchEvent(Object.assign(new Event(type),{button:0,pointerId:1,clientX:p.x,clientY:p.y}));expect(draw).toHaveBeenCalledOnce();expect(closeup.active).toBe(true);canvas.dispatchEvent(new Event('lostpointercapture'));expect(closeup.active).toBe(true);expect(order.slice(0,2)).toEqual(['restore','pick']);closeup.update(.12,camera);canvas.dispatchEvent(Object.assign(new Event('pointerdown'),{button:0,pointerId:2,clientX:a.x,clientY:a.y}));expect(closeup.active).toBe(false);}finally{input.dispose();closeup.dispose();}
  });
  it('removes its listeners on disposal',()=>{const {closeup,emit}=setup();closeup.dispose();emit();expect(closeup.active).toBe(false);});
});
