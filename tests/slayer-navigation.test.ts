import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { Camera2D } from '../src/render/projection';
import { SlayerNavigation } from '../src/ui/slayer-navigation';
import { DrawingInput } from '../src/ui/input';
import type { SceneView } from '../src/render/view';
import type { GameInterface } from '../src/ui/interface';
import type { Wolf } from '../src/game/contracts';

afterEach(()=>vi.unstubAllGlobals());
function fixture(){
  vi.stubGlobal('window',new EventTarget());
  const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'slayer',tier:'ordinary',boon:'three',roots:['metal']});world.startWave();world.selected='metal';
  const wolf:Wolf={id:9900,x:-6,z:4,kind:'normal',hp:10000,maxHp:10000,speed:0,heading:0,action:'run',age:0,attack:0,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null};world.wolves=[wolf];
  const c=new Camera2D();c.resize(320,568);c.navigate({x:0,y:184,width:320,height:200});
  const canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn()}) as unknown as HTMLCanvasElement;
  let input:DrawingInput,enabled=true,now=0;
  const nav=new SlayerNavigation(canvas,{enabled:()=>enabled,cancelStroke:()=>input.cancel(),pan:(x,y)=>c.panBy(x,y)});
  input=new DrawingInput(world,{canvas,pick:(x:number,y:number)=>c.unproject(x,y),preview:vi.fn(),previewRemoval:vi.fn()} as unknown as SceneView,{blocked:false} as GameInterface,()=>now);
  const send=(type:string,id:number,x:number,y:number,mouse=false)=>canvas.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{pointerId:id,pointerType:mouse?'mouse':'touch',button:0,shiftKey:mouse,clientX:x,clientY:y}));
  const cast=vi.fn();world.events.on('invoke',cast);
  const draw=()=>{const p=c.project(wolf);send('pointerdown',8,p.x-6,p.y);send('pointerup',8,p.x+6,p.y);};
  return {world,wolf,c,nav,send,cast,draw,hold:(ms:number)=>{now+=ms;},disable:()=>{enabled=false;},dispose:()=>{nav.dispose();input.dispose();}};
}
describe('portrait navigation hands over a held blade without casting it',()=>{
  it('cancels a full charge when a second finger arrives and consumes both releases',()=>{
    const f=fixture();try{
      f.send('pointerdown',1,110,280);f.hold(1300);f.send('pointermove',1,120,280);
      f.send('pointerdown',2,190,280);const before=f.c.offsetX;f.send('pointermove',1,135,288);f.send('pointermove',2,205,288);
      expect(f.nav.active).toBe(true);expect(f.c.offsetX).toBeGreaterThan(before);
      f.send('pointerup',2,205,288);f.send('pointermove',1,155,290);f.send('pointerup',1,155,290);
      expect(f.nav.active).toBe(false);expect(f.cast).not.toHaveBeenCalled();expect(f.world.spirit).toBe(100);expect(f.wolf.hp).toBe(10000);
      f.draw();expect(f.cast).toHaveBeenCalledOnce();expect(f.world.spirit).toBeLessThan(100);expect(f.wolf.hp).toBeLessThan(10000);
    }finally{f.dispose();}
  });
  it.each(['pointercancel','lostpointercapture'])('a cancelled contact (%s) never turns the remaining finger into a blade',type=>{
    const f=fixture();try{
      f.send('pointerdown',1,110,280);f.send('pointerdown',2,190,280);f.send(type,2,190,280);
      f.send('pointermove',1,150,300);f.send('pointerup',1,150,300);
      expect(f.cast).not.toHaveBeenCalled();expect(f.world.spirit).toBe(100);expect(f.nav.active).toBe(false);
      f.draw();expect(f.cast).toHaveBeenCalledOnce();
    }finally{f.dispose();}
  });
  it('stops a blocked navigation and ignores its delayed releases',()=>{
    const f=fixture();try{
      f.send('pointerdown',1,110,280);f.send('pointerdown',2,190,280);const x=f.c.offsetX;
      f.disable();f.send('pointermove',1,150,300);f.send('pointerup',2,190,280);f.send('pointerup',1,150,300);
      expect(f.c.offsetX).toBe(x);expect(f.cast).not.toHaveBeenCalled();expect(f.nav.active).toBe(false);
    }finally{f.dispose();}
  });
  it('supports Shift-drag without spending mana and single-finger down-to-up charging still works',()=>{
    const f=fixture();try{
      const before=f.c.offsetX;f.send('pointerdown',1,110,280,true);f.send('pointermove',1,160,280,true);f.send('pointerup',1,160,280,true);
      expect(f.c.offsetX).toBeGreaterThan(before);expect(f.cast).not.toHaveBeenCalled();
      const p=f.c.project(f.wolf);f.send('pointerdown',8,p.x-6,p.y);f.hold(1200);f.send('pointerup',8,p.x+6,p.y);
      expect(f.cast).toHaveBeenCalledOnce();expect(f.cast.mock.calls[0]![0].charge).toBe(3);expect(f.world.spirit).toBeLessThan(96);
    }finally{f.dispose();}
  });
});
