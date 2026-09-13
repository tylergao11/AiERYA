import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { DrawingInput } from '../src/ui/input';
import type { SceneView } from '../src/render/view';
import type { GameInterface } from '../src/ui/interface';
import { pickWard } from '../src/render/ward-selection';

afterEach(() => vi.unstubAllGlobals());

function removalInput() {
  vi.stubGlobal('window', new EventTarget());
  const world=new World(),canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn()});
  world.place([{x:-8,z:2},{x:-4,z:2},{x:-4,z:6},{x:-8,z:6},{x:-8,z:2}]);
  const cast=vi.fn(); world.events.on('invoke',cast); world.startWave();
  const view={canvas,preview:vi.fn(),previewRemoval:vi.fn(),pick:(x:number,z:number)=>({x,z}),pickWard:(x:number,z:number)=>pickWard({x,z},world.wards)} as unknown as SceneView;
  const ui={blocked:false,removing:true} as GameInterface;
  const input=new DrawingInput(world,view,ui);
  const send=(type:string,x=-6,z=4)=>canvas.dispatchEvent(Object.assign(new Event(type),{button:0,pointerId:1,clientX:x,clientY:z}));
  return {world,ui,input,send,cast};
}

describe('formation removal gestures', () => {
  it('a targeted click removes the ward without also casting or drawing', () => {
    const {world,input,send,cast}=removalInput();
    try { send('pointerdown');send('pointerup');expect(world.wards).toHaveLength(0);expect(world.spirit).toBeCloseTo(97.2);expect(cast).not.toHaveBeenCalled(); }
    finally {input.dispose();}
  });
  it('an empty click or dragging out and back does not accidentally remove or cast', () => {
    const {world,input,send,cast}=removalInput();
    try {
      send('pointerdown',3);send('pointerup',3);
      send('pointerdown');send('pointermove',15);send('pointermove');send('pointerup');
      expect(world.wards).toHaveLength(1);expect(world.spirit).toBe(86);expect(cast).not.toHaveBeenCalled();
    } finally {input.dispose();}
  });
  it('cancels a held removal when leaving removal mode or starting the ultimate', () => {
    const {world,ui,input,send,cast}=removalInput();
    try {
      send('pointerdown');ui.removing=false;ui.onRemovalChange();send('pointerup');
      ui.removing=true;send('pointerdown');world.startUltimate();send('pointerup');
      expect(world.wards).toHaveLength(1);expect(world.ultimate.strokes).toHaveLength(0);expect(cast).not.toHaveBeenCalled();
    } finally {input.dispose();}
  });
});

describe('drawing input formation handoff', () => {
  it('coalesces many touch events into one preview while retaining the complete accepted loop', () => {
    vi.stubGlobal('window',new EventTarget());
    const canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn()}),world=new World();
    const input=new DrawingInput(world,{canvas,preview:vi.fn(),previewRemoval:vi.fn(),pick:(x:number,z:number)=>({x,z})} as unknown as SceneView,{blocked:false} as GameInterface);
    const planner=vi.spyOn(world,'previewPlacement');
    const send=(type:string,x:number,z:number)=>canvas.dispatchEvent(Object.assign(new Event(type),{button:0,pointerId:1,clientX:x,clientY:z}));
    try {
      send('pointerdown',-8,2);
      for(const [ax,az,bx,bz] of [[-8,2,-4,2],[-4,2,-4,6],[-4,6,-8,6],[-8,6,-8,2]])for(let i=1;i<=20;i++)send('pointermove',ax!+(bx!-ax!)*i/20,az!+(bz!-az!)*i/20);
      expect(planner).not.toHaveBeenCalled();input.flushPreview();expect(planner).toHaveBeenCalledOnce();input.flushPreview();expect(planner).toHaveBeenCalledOnce();
      send('pointerup',-8,2);expect(world.wards).toHaveLength(1);expect(world.wards[0]!.power.area).toBeCloseTo(16);expect(world.spirit).toBe(86);
    } finally {input.dispose();}
  });
  it('clears a held combat preview immediately when the wave ends, before another pointer event', () => {
    vi.stubGlobal('window', new EventTarget());
    const canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn()}),world=new World(),preview=vi.fn(),previewRemoval=vi.fn();
    world.startWave();
    const input=new DrawingInput(world,{canvas,preview,previewRemoval,pick:(x:number,z:number)=>({x,z})} as unknown as SceneView,{blocked:false} as GameInterface);
    const cast=vi.fn();world.events.on('invoke',cast);
    const send=(type:string,x:number)=>canvas.dispatchEvent(Object.assign(new Event(type),{button:0,pointerId:1,clientX:x,clientY:4}));
    try {
      send('pointerdown',-7);send('pointermove',-5);input.flushPreview();expect(cast).toHaveBeenCalledOnce();expect(preview.mock.calls.at(-1)![0]).toHaveLength(1);
      world.health=0;world.tick(1/60);
      expect(world.phase).toBe('lost');expect(preview).toHaveBeenLastCalledWith([]);expect(previewRemoval).toHaveBeenLastCalledWith(null);
      send('pointerup',-4);expect(cast).toHaveBeenCalledOnce();
    } finally {input.dispose();}
  });
  it('finishes the held ultimate stroke at the deadline and never recasts it on late pointer-up', () => {
    vi.stubGlobal('window', new EventTarget());
    const canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn()}),world=new World();world.startWave();world.startUltimate();
    const cast=vi.fn();world.events.on('invoke',cast);
    const input=new DrawingInput(world,{canvas,previewRemoval:vi.fn(),preview:vi.fn(),pick:(x:number,z:number)=>({x,z})} as unknown as SceneView,{blocked:false} as GameInterface);
    const send=(type:string,x:number)=>canvas.dispatchEvent(Object.assign(new Event(type),{button:0,pointerId:1,clientX:x,clientY:4}));
    try {
      send('pointerdown',-7);send('pointermove',-5);world.tick(3);
      expect(world.ultimate.strokes).toHaveLength(1);world.tick(.28);expect(cast).toHaveBeenCalledTimes(1);
      world.tick(.6);send('pointerup',-4);expect(cast).toHaveBeenCalledTimes(1);expect(world.spirit).toBe(100);
    } finally {input.dispose();}
  });
  it('casts a two-point battle swipe using the release position', () => {
    vi.stubGlobal('window', new EventTarget());
    const canvas = Object.assign(new EventTarget(), { setPointerCapture: vi.fn() });
    const world = new World(); world.startWave();
    const cast = vi.fn(); world.events.on('invoke', cast);
    const input = new DrawingInput(world, { canvas, previewRemoval: vi.fn(), preview: vi.fn(), pick: (x: number, z: number) => ({ x, z }) } as unknown as SceneView, { blocked: false } as GameInterface);
    try {
      canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0, pointerId: 1, clientX: -7, clientY: 4 }));
      canvas.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, pointerId: 1, clientX: -5, clientY: 4 }));
      expect(cast).toHaveBeenCalledTimes(1); expect(world.spirit).toBe(94); expect(world.wards).toHaveLength(0);
    } finally { input.dispose(); }
  });

  it('discards an unfinished stroke when its phase changes', () => {
    vi.stubGlobal('window', new EventTarget());
    const canvas = Object.assign(new EventTarget(), { setPointerCapture: vi.fn() });
    const world = new World();
    const input = new DrawingInput(world, { canvas, previewRemoval: vi.fn(), preview: vi.fn(), pick: (x: number, z: number) => ({ x, z }) } as unknown as SceneView, { blocked: false } as GameInterface);
    try {
      canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0, pointerId: 1, clientX: -7, clientY: 4 }));
      world.startWave();
      canvas.dispatchEvent(Object.assign(new Event('pointerup'), { button: 0, pointerId: 1, clientX: -5, clientY: 4 }));
      expect(world.spirit).toBe(100); expect(world.wards).toHaveLength(0);
    } finally { input.dispose(); }
  });

  it('uses the release coordinate to close a drawing without a final pointermove', () => {
    vi.stubGlobal('window', new EventTarget());
    const canvas = Object.assign(new EventTarget(), { setPointerCapture: vi.fn() });
    const world = new World(); world.spirit = 80;
    const preview = vi.fn();
    const view = { canvas, previewRemoval: vi.fn(), preview, pick: (x: number, z: number) => ({ x, z }) } as unknown as SceneView;
    const input = new DrawingInput(world, view, { blocked: false } as GameInterface);
    const send = (type: string, x: number, z: number) => canvas.dispatchEvent(Object.assign(new Event(type), {
      button: 0, pointerId: 1, clientX: x, clientY: z,
    }));
    try {
      send('pointerdown', -8, 1);
      for (const [x, z] of [[-2, 1], [-2, 6], [-8, 6]]) send('pointermove', x!, z!);
      input.flushPreview();
      expect(preview.mock.calls.at(-1)![1]).toBe(false);
      send('pointerup', -8, 1);
      expect(world.wards).toHaveLength(1);
    } finally { input.dispose(); }
  });

  it('does not mark a geometrically closed but unaffordable drawing as valid', () => {
    vi.stubGlobal('window', new EventTarget());
    const canvas = Object.assign(new EventTarget(), { setPointerCapture: vi.fn() });
    const world = new World(), preview = vi.fn(); world.spirit = 0;
    const input = new DrawingInput(world, { canvas, previewRemoval: vi.fn(), preview, pick: (x: number, z: number) => ({ x, z }) } as unknown as SceneView, { blocked: false } as GameInterface);
    try {
      for (const [i, [x, z]] of [[-8, 1], [-4, 1], [-4, 5], [-8, 5], [-8, 1]].entries()) {
        canvas.dispatchEvent(Object.assign(new Event(i === 0 ? 'pointerdown' : 'pointermove'), { button: 0, pointerId: 1, clientX: x, clientY: z }));
      }
      input.flushPreview(); expect(preview.mock.calls.at(-1)![1]).toBe(false); expect(world.wards).toHaveLength(0);
    } finally { input.dispose(); }
  });
});
