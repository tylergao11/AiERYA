import { afterEach, describe, expect, it, vi } from 'vitest';
import { summonFieldRect } from '../src/ui/summon-view';
import { ART, Camera2D } from '../src/render/projection';
import { CLEARING } from '../src/game/map';
import { World } from '../src/game/world';
import { DrawingInput } from '../src/ui/input';
import { SlayerNavigation } from '../src/ui/slayer-navigation';
import type { SceneView } from '../src/render/view';
import type { GameInterface } from '../src/ui/interface';
import type { Wolf } from '../src/game/contracts';
import type { Point } from '../src/core/math';

afterEach(()=>vi.unstubAllGlobals());
const field=summonFieldRect(390,844,[{edge:'top',top:170,bottom:270},{edge:'bottom',top:670,bottom:800}])!;
function camera(){const c=new Camera2D();c.resize(390,844);c.navigate(field);return c;}
function inputFixture(){
  vi.stubGlobal('window',new EventTarget());const world=new World({roguelike:true});
  world.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['fire']});world.startWave();
  const wolf:Wolf={id:9761,x:0,z:7,hp:1000,maxHp:1000,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null};world.wolves=[wolf];
  const c=camera(),canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn(),getBoundingClientRect:()=>({left:0,top:0})}) as unknown as HTMLCanvasElement;
  let input:DrawingInput;
  const nav=new SlayerNavigation(canvas,{enabled:()=>true,cancelStroke:()=>input.cancel(),pan:(x,y)=>c.panBy(x,y)});
  input=new DrawingInput(world,{canvas,preview:vi.fn(),previewRemoval:vi.fn(),beginStroke:()=>c.focus(null),project:(p:Point,h?:number)=>c.project(p,h),pick:(x:number,y:number)=>c.unproject(x,y)} as unknown as SceneView,{blocked:false} as GameInterface);
  const send=(type:string,id:number,x:number,y:number)=>canvas.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{button:0,pointerId:id,pointerType:'touch',clientX:x,clientY:y}));
  return {world,wolf,c,send,dispose:()=>{nav.dispose();input.dispose();}};
}

describe('summoner portrait battlefield and its command coordinates',()=>{
  it('uses the space between actual UI bounds and refuses a viewport hidden behind controls',()=>{
    expect(field).toEqual({x:0,y:278,width:390,height:384});
    expect(summonFieldRect(390,844,[{edge:'top',top:170,bottom:600},{edge:'bottom',top:650,bottom:800}])).toBeNull();
    expect(summonFieldRect(NaN,844,[])).toBeNull();
  });
  it('enlarges bodies while keeping every clearing edge reachable and inside the illustration',()=>{
    const c=camera();expect(c.scale/(390/ART.width)).toBeCloseTo(1.85);
    for(const point of CLEARING){
      let p=c.project(point);c.panBy(field.width/2-p.x,field.y+field.height/2-p.y);p=c.project(point);
      expect(p.x).toBeGreaterThanOrEqual(-1e-8);expect(p.x).toBeLessThanOrEqual(field.width+1e-8);
      expect(p.y).toBeGreaterThanOrEqual(field.y-1e-8);expect(p.y).toBeLessThanOrEqual(field.y+field.height+1e-8);
      const restored=c.unproject(p.x,p.y);expect(restored.x).toBeCloseTo(point.x,8);expect(restored.z).toBeCloseTo(point.z,8);
      expect(c.offsetX+ART.width*c.scale).toBeGreaterThanOrEqual(field.width);expect(c.offsetY+ART.height*c.scale).toBeGreaterThanOrEqual(field.y+field.height);
    }
  });
  it('restores whole-field view and preserves the chosen close view through temporary framing',()=>{
    const c=camera();c.panBy(45,-24);const base=[c.scale,c.offsetX,c.offsetY];
    c.focus({x:0,z:7},1.6,1,2);c.focus(null);expect([c.scale,c.offsetX,c.offsetY]).toEqual(base);
    c.navigate(null);expect(c.viewport).toBeNull();expect(c.scale).toBeCloseTo(390/ART.width);
  });
  it('gives both fingers to navigation, then targets the body at its new screen position for free',()=>{
    const f=inputFixture();try{
      const p=f.c.project(f.wolf,.8);f.send('pointerdown',1,p.x,p.y);f.send('pointerdown',2,p.x+36,p.y+20);f.send('pointermove',2,p.x+90,p.y+44);
      f.send('pointerup',2,p.x+90,p.y+44);f.send('pointerup',1,p.x,p.y);
      expect(f.world.spirit).toBe(100);expect(f.world.mechanics.commands.targetId).toBeNull();expect(f.world.mechanics.commands.rally).toBeNull();
      const moved=f.c.project(f.wolf,.8);f.send('pointerdown',3,moved.x,moved.y);f.send('pointerup',3,moved.x+2,moved.y+1);
      expect(f.world.mechanics.commands.targetId).toBe(f.wolf.id);expect(f.world.spirit).toBe(100);
    }finally{f.dispose();}
  });
  it('uses the enlarged coordinates for paid strokes and retains summon-only damage rules',()=>{
    const f=inputFixture();try{
      const a=f.c.project({x:1,z:8}),b=f.c.project({x:5,z:8});
      f.send('pointerdown',1,a.x,a.y);f.send('pointermove',1,(a.x+b.x)/2,a.y);f.send('pointerup',1,b.x,b.y);
      expect(f.world.spirit).toBeLessThan(100);expect(f.world.mechanics.commands.amount(f.world.mechanics.spirits[0]!.id)).toBeGreaterThan(0);expect(f.wolf.hp).toBe(1000);
    }finally{f.dispose();}
  });
});
