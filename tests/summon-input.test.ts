import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawingInput } from '../src/ui/input';
import { World } from '../src/game/world';
import type { SceneView } from '../src/render/view';
import type { GameInterface } from '../src/ui/interface';
import type { Wolf } from '../src/game/contracts';
import { Camera2D } from '../src/render/projection';
import { SummonCloseup } from '../src/render/summon-closeup';

afterEach(()=>vi.unstubAllGlobals());
function setup(){
  vi.stubGlobal('window',new EventTarget());
  const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['fire']});world.startWave();
  const target:Wolf={id:999,x:-1,z:4,hp:100,maxHp:100,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null};world.wolves=[target];
  const canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn(),getBoundingClientRect:()=>({left:0,top:0})});
  const input=new DrawingInput(world,{canvas,preview:vi.fn(),previewRemoval:vi.fn(),pick:(x:number,y:number)=>({x:-6+(x-100)/20,z:4+(y-100)/20}),project:()=>({x:200,y:40})}as unknown as SceneView,{blocked:false}as GameInterface);
  const send=(type:string,x:number,y:number)=>canvas.dispatchEvent(Object.assign(new Event(type),{button:0,pointerId:1,clientX:x,clientY:y}));
  return {world,input,send};
}
describe('summoner touch input',()=>{
  it('selects the visible body and tolerates a little finger drift without charging',()=>{
    const {world,input,send}=setup();try{send('pointerdown',200,40);send('pointermove',206,44);send('pointerup',208,44);expect(world.mechanics.commands.targetId).toBe(999);expect(world.spirit).toBe(100);}finally{input.dispose();}
  });
  it('uses screen travel to distinguish a real swipe, even when the pointer comes back',()=>{
    const {world,input,send}=setup();try{send('pointerdown',150,100);send('pointermove',190,100);send('pointerup',150,100);expect(world.spirit).toBeLessThan(100);expect(world.mechanics.commands.amount(world.mechanics.spirits[0]!.id)).toBeGreaterThan(0);expect(world.wolves[0]!.hp).toBe(100);}finally{input.dispose();}
  });
  it('cancels an interrupted gesture without issuing a command or spending mana',()=>{
    const {world,input,send}=setup();try{send('pointerdown',150,100);send('pointermove',190,100);send('pointercancel',190,100);send('pointerup',200,100);expect(world.spirit).toBe(100);expect(world.mechanics.commands.targetId).toBeNull();expect(world.mechanics.commands.rally).toBeNull();}finally{input.dispose();}
  });
});

function closeupInput(outsideAfterReturn=false){
  vi.stubGlobal('window',new EventTarget());vi.stubGlobal('matchMedia',()=>({matches:false}));
  const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['water']});world.startWave();
  const s=world.mechanics.spirits[0]!;Object.assign(s,{x:-5,z:10});world.mechanics.spirits.splice(1);
  const enemy={id:990,x:8,z:10,action:'run',hp:100,maxHp:100} as Wolf;world.wolves=[enemy];
  const camera=new Camera2D();camera.resize(390,844);const base=camera.project(enemy,.8),shot=new SummonCloseup(world);
  world.events.emit('summonOrder',{kind:'union',at:enemy,element:'water',spiritIds:[s.id],pure:true});
  world.events.emit('summonImpact',{from:s,at:enemy,spiritId:s.id,targetId:enemy.id,element:'water',radius:3.5,strength:2.8,union:true,echo:false});shot.update(.2,camera);
  const visible=camera.project(enemy,.8),canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn(),getBoundingClientRect:()=>({left:0,top:0})});
  const view={canvas,get closeupActive(){return shot.active;},beginStroke:()=>{shot.cancel();camera.focus(null);},pick:(x:number,y:number)=>outsideAfterReturn&&!shot.active?null:camera.unproject(x,y),project:(p:{x:number;z:number},height=0)=>camera.project(p,height),preview:vi.fn(),previewRemoval:vi.fn()} as unknown as SceneView;
  const input=new DrawingInput(world,view,{blocked:false,removing:false} as GameInterface),send=(type:string,x=visible.x,y=visible.y)=>canvas.dispatchEvent(Object.assign(new Event(type),{button:0,pointerId:1,clientX:x,clientY:y}));
  return {world,enemy,camera,input,shot,send,visible,base,dispose:()=>{input.dispose();shot.dispose();}};
}
describe('summoner intent survives the automatic camera return',()=>{
  it.each([false,true])('commands the wolf actually touched, even if the returned view has no ground there (%s)',outside=>{
    const f=closeupInput(outside);try{
      expect(Math.hypot(f.visible.x-f.base.x,f.visible.y-f.base.y)).toBeGreaterThan(22);
      f.send('pointerdown');expect(f.shot.active).toBe(false);f.input.flushPreview();
      f.enemy.x+=2;f.send('pointerup',f.visible.x+3,f.visible.y+2);
      expect(f.world.mechanics.commands.targetId).toBe(f.enemy.id);expect(f.world.spirit).toBe(100);
    }finally{f.dispose();}
  });
  it('rallies to the ground seen before the closeup returns',()=>{
    const f=closeupInput();try{
      const ground={x:-3,z:13},p=f.camera.project(ground),command=vi.spyOn(f.world.mechanics.commands,'command');
      f.send('pointerdown',p.x,p.y);f.send('pointerup',p.x,p.y);
      expect(command).toHaveBeenCalledWith(expect.objectContaining({x:expect.closeTo(ground.x),z:expect.closeTo(ground.z)}),undefined);
      expect(f.world.mechanics.commands.rally?.x).toBeCloseTo(ground.x);expect(f.world.spirit).toBe(100);
    }finally{f.dispose();}
  });
  it('uses only restored-view coordinates when the touch becomes a stroke',()=>{
    const f=closeupInput();try{
      const draw=vi.spyOn(f.world,'invoke'),command=vi.spyOn(f.world.mechanics.commands,'command');
      f.send('pointerdown');const normal=f.camera.unproject(f.visible.x,f.visible.y);
      f.send('pointermove',f.visible.x-60,f.visible.y+15);f.send('pointerup',f.visible.x-65,f.visible.y+15);
      expect(command).not.toHaveBeenCalled();expect(draw).toHaveBeenCalledOnce();
      expect(draw.mock.calls[0]![0][0]).toEqual(normal);expect(normal.x).not.toBeCloseTo(f.enemy.x);
    }finally{f.dispose();}
  });
  it('clears a cancelled touch without issuing a command',()=>{
    const f=closeupInput();try{
      const command=vi.spyOn(f.world.mechanics.commands,'command');f.send('pointerdown');f.send('pointercancel');f.send('pointerup');expect(command).not.toHaveBeenCalled();
    }finally{f.dispose();}
  });
  it('never revives a target that dies after being touched in the closeup',()=>{
    const f=closeupInput();try{
      f.send('pointerdown');f.enemy.action='dead';f.send('pointerup');
      expect(f.world.mechanics.commands.targetId).toBeNull();
    }finally{f.dispose();}
  });
});
