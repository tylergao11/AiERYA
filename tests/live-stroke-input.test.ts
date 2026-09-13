import {afterEach,describe,expect,it,vi} from 'vitest';
import {World} from '../src/game/world';
import {DrawingInput} from '../src/ui/input';
import type {SceneView} from '../src/render/view';
import type {GameInterface} from '../src/ui/interface';

afterEach(()=>vi.unstubAllGlobals());
function setup(fate:'slayer'|'array'|'spirit'='slayer',living=false){
  vi.stubGlobal('window',new EventTarget());
  const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate,boon:living?'living':fate==='slayer'?'three':fate==='array'?'fivefold':'twins',tier:living?'unusual':'ordinary',roots:['metal']});
  if(living)w.place([{x:-8,z:2},{x:-4,z:2},{x:-4,z:6},{x:-8,z:6},{x:-8,z:2}]);
  w.startWave();
  const canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn()}),view={canvas,preview:vi.fn(),previewRemoval:vi.fn(),pick:(x:number,y:number)=>({x:x/20,z:y/20})} as unknown as SceneView;
  const ui={blocked:false,removing:false,strokePreview:null} as GameInterface;let time=0;
  const input=new DrawingInput(w,view,ui,()=>time),cast=vi.fn(),perform=vi.spyOn(w,'invoke');w.events.on('invoke',cast);
  const send=(type:string,x=-8,z=4,id=1)=>canvas.dispatchEvent(Object.assign(new Event(type),{button:0,pointerId:id,clientX:x*20,clientY:z*20}));
  const hold=(ms:number)=>{time+=ms;input.flushPreview();};
  return{w,ui,view,input,send,hold,cast,perform,dispose:()=>input.dispose()};
}
describe('live battle strokes',()=>{
  it.each(['slayer','array','spirit'] as const)('casts %s before release and never replays the same path on pointer-up',fate=>{
    const f=setup(fate);try{
      f.send('pointerdown');f.send('pointermove',-4);expect(f.perform).not.toHaveBeenCalled();f.input.flushPreview();
      expect(f.perform).toHaveBeenCalledOnce();const spent=f.w.spirit;expect(spent).toBeLessThan(100);
      f.hold(1500);f.send('pointerup',-4);expect(f.perform).toHaveBeenCalledOnce();expect(f.w.spirit).toBe(spent);
    }finally{f.dispose();}
  });
  it('coalesces events within a frame and pays only for fresh contiguous segments',()=>{
    const f=setup();try{
      f.send('pointerdown');for(const x of [-7.5,-7,-6.5,-6])f.send('pointermove',x);
      f.input.flushPreview();expect(f.cast).toHaveBeenCalledOnce();expect(f.w.spirit).toBeCloseTo(98.5);
      f.send('pointermove',-4);f.input.flushPreview();expect(f.cast).toHaveBeenCalledTimes(2);expect(f.w.spirit).toBeCloseTo(97);
      expect(f.cast.mock.calls[0]![0].points[0]).toEqual({x:-8,z:4});expect(f.cast.mock.calls[1]![0].points[0]).toEqual({x:-6,z:4});
      f.send('pointerup',-4);expect(f.cast).toHaveBeenCalledTimes(2);expect(f.w.spirit).toBeCloseTo(97);
    }finally{f.dispose();}
  });
  it('spends a held charge once, then keeps all continued movement uncharged',()=>{
    const f=setup();try{
      f.send('pointerdown');f.hold(1200);expect(f.ui.strokePreview?.charge).toBe(3);expect(f.w.spirit).toBe(100);
      f.send('pointermove',-4);f.input.flushPreview();expect(f.cast.mock.calls[0]![0].charge).toBe(3);expect(f.w.spirit).toBeCloseTo(92.2);
      f.hold(1800);f.send('pointermove',0);f.input.flushPreview();expect(f.cast.mock.calls[1]![0].charge).toBe(0);expect(f.w.spirit).toBeCloseTo(89.2);
      f.send('pointerup',0);expect(f.cast).toHaveBeenCalledTimes(2);
    }finally{f.dispose();}
  });
  it('moving first never becomes a heavy cut, even without intervening preview frames',()=>{
    const f=setup();try{
      f.send('pointerdown');f.send('pointermove',-6);f.hold(1600);f.send('pointermove',-4);f.hold(1600);f.send('pointerup',-4);
      expect(f.cast.mock.calls.map(([e])=>e.charge)).toEqual([0,0]);expect(f.w.spirit).toBeCloseTo(97);
    }finally{f.dispose();}
  });
  it('allows slight holding jitter but requires a deliberate swipe to release charge',()=>{
    const f=setup();try{
      f.send('pointerdown');f.send('pointermove',-7.85);f.hold(1300);expect(f.ui.strokePreview?.charge).toBe(3);expect(f.cast).not.toHaveBeenCalled();
      f.send('pointerup',-7.85);expect(f.cast).not.toHaveBeenCalled();expect(f.w.spirit).toBe(100);
    }finally{f.dispose();}
  });
  it.each(['pointercancel','lostpointercapture'])('discards pending movement on %s without refunding already released cuts',event=>{
    const f=setup();try{
      f.send('pointerdown');f.send('pointermove',-6);f.input.flushPreview();const paid=f.w.spirit;
      f.send('pointermove',-4);f.send(event,-4);f.input.flushPreview();f.send('pointerup',-4);
      expect(f.cast).toHaveBeenCalledOnce();expect(f.w.spirit).toBe(paid);expect(f.ui.strokePreview).toBeNull();
    }finally{f.dispose();}
  });
  it('does not replay an unaffordable stroke after income arrives while the finger is stationary',()=>{
    const f=setup();try{
      f.w.spirit=0;f.send('pointerdown');f.send('pointermove',-4);f.input.flushPreview();expect(f.cast).not.toHaveBeenCalled();
      f.w.replenishSpirit(10);f.hold(1500);f.send('pointerup',-4);expect(f.cast).not.toHaveBeenCalled();expect(f.w.spirit).toBe(10);
    }finally{f.dispose();}
  });
  it('reserves a main-array drag for one paid relocation at release',()=>{
    const f=setup('array',true);try{
      const ward=f.w.wards[0]!,old={x:ward.x,z:ward.z},before=f.w.spirit,move=vi.spyOn(f.w,'moveMain');
      f.send('pointerdown',old.x,old.z);f.send('pointermove',old.x+4,old.z);f.input.flushPreview();
      expect(move).not.toHaveBeenCalled();expect(f.cast).not.toHaveBeenCalled();expect(f.w.spirit).toBe(before);
      f.send('pointerup',old.x+4,old.z);expect(move).toHaveBeenCalledOnce();expect(f.cast).not.toHaveBeenCalled();expect(f.w.spirit).toBe(before-10);
    }finally{f.dispose();}
  });
});
