import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { DrawingInput } from '../src/ui/input';
import type { GameInterface } from '../src/ui/interface';
import type { SceneView } from '../src/render/view';
import { ELEMENTS } from '../src/game/contracts';

const shape = [{x:-8,z:2},{x:-4,z:2},{x:-4,z:6},{x:-8,z:6},{x:-8,z:2}];
function slayer() {
  const w = new World({roguelike:true});
  expect(w.chooseDestiny({serial:1,fate:'slayer',boon:'scar',tier:'ordinary',roots:['metal']})).toBe(true);
  return w;
}
afterEach(() => vi.unstubAllGlobals());

describe('slayer preparation controls', () => {
  it('rejects selection, placement previews and final drawings without spending spirit', () => {
    const w=slayer(), selected=w.selected, spirit=w.spirit;
    expect(w.preparationLocked).toBe(true);
    for (const element of ELEMENTS) expect(w.selectElement(element)).toBe(false);
    expect(w.selected).toBe(selected);
    expect(w.previewPlacement(shape)).toMatchObject({ok:false,reason:'fate'});
    expect(w.draw(shape)).toBe(false); expect(w.wards).toHaveLength(0); expect(w.spirit).toBe(spirit);
    expect(w.build.roots).toEqual(ELEMENTS);
  });
  it('ignores pointer gestures and number keys while preparing, then restores battle input', () => {
    const keyboard=new EventTarget(); vi.stubGlobal('window',keyboard); vi.stubGlobal('HTMLElement',class {});
    const w=slayer(),canvas=Object.assign(new EventTarget(),{setPointerCapture:vi.fn()}),preview=vi.fn();
    const draw=vi.spyOn(w,'invoke'),pick=vi.fn((x:number,z:number)=>({x:x/20,z:z/20}));
    const ui={blocked:false,removing:false,setRemoval:vi.fn()} as unknown as GameInterface;
    const input=new DrawingInput(w,{canvas,pick,preview,previewRemoval:vi.fn()} as unknown as SceneView,ui);
    const send=(type:string,x:number)=>canvas.dispatchEvent(Object.assign(new Event(type),{button:0,pointerId:1,clientX:x*20,clientY:80}));
    const key=()=>keyboard.dispatchEvent(Object.assign(new Event('keydown'),{key:'1',code:'Digit1'}));
    try {
      const selected=w.selected;
      key();send('pointerdown',-7);send('pointermove',-5);input.flushPreview();send('pointerup',-5);
      expect(w.selected).toBe(selected);expect(canvas.setPointerCapture).not.toHaveBeenCalled();expect(pick).not.toHaveBeenCalled();expect(preview).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();
      w.startWave();expect(w.preparationLocked).toBe(false);
      for(const e of ELEMENTS)expect(w.selectElement(e)).toBe(true);
      key();expect(w.selected).toBe('wood');
      send('pointerdown',-7);send('pointerup',-5);expect(draw).toHaveBeenCalledOnce();expect(w.spirit).toBeLessThan(w.capacity);
      w.phase='prepare'; expect(w.preparationLocked).toBe(true);
    } finally {input.dispose();}
  });
  it('keeps preparation usable for a mixed fate and after earning another route', () => {
    const w=slayer(), original=w.build.destiny!;
    expect(w.build.beginPair([original,{serial:2,fate:'array',boon:'fivefold',tier:'ordinary',roots:['earth']}])).toBe(true);
    w.mechanics.initialize();
    expect(w.preparationLocked).toBe(false);expect(w.selectElement('earth')).toBe(true);expect(w.draw(shape)).toBe(true);
    const pivot=slayer();pivot.phase='rest';
    for(let n=0;n<1000&&!pivot.build.offers.some(r=>r.id==='opportunity-twins');n++)pivot.build.rollOffers(100);
    expect(pivot.build.offers.some(r=>r.id==='opportunity-twins')).toBe(true);pivot.chooseUpgrade('opportunity-twins');
    expect(pivot.phase).toBe('prepare');expect(pivot.preparationLocked).toBe(false);expect(pivot.selectElement('water')).toBe(true);expect(pivot.draw(shape)).toBe(true);
  });
  it('reset removes the previous lock and a new formation fate can draw normally', () => {
    const w=slayer(); w.reset(); expect(w.preparationLocked).toBe(false);
    w.chooseDestiny({serial:2,fate:'array',boon:'fivefold',tier:'ordinary',roots:['earth']});
    expect(w.preparationLocked).toBe(false);expect(w.draw(shape)).toBe(true);
  });
});
