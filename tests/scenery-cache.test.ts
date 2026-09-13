import { afterEach,describe,expect,it,vi } from 'vitest';
import { RIVER_LAYER,sceneryLayers } from '../src/render/scenery-cache';

afterEach(()=>vi.unstubAllGlobals());
describe('shared scenery resources',()=>{
  it('decodes the river mask once per source image and keeps the reusable plate GPU-backed',()=>{
    const contexts:{getContext:ReturnType<typeof vi.fn>;width:number;height:number}[]=[];
    vi.stubGlobal('document',{createElement:()=>{
      const context={drawImage:vi.fn(),getImageData:(_x:number,_y:number,w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:vi.fn(),isPointInPath:()=>false};
      const canvas={width:0,height:0,getContext:vi.fn(()=>context)};contexts.push(canvas);return canvas;
    }});
    const image={} as HTMLImageElement,river={} as Path2D,resources=vi.fn();
    const a=sceneryLayers(image,river,resources),b=sceneryLayers(image,river,resources);
    expect(a).toBe(b);expect(resources).toHaveBeenCalledOnce();expect(contexts).toHaveLength(3);
    expect(contexts[0]!.getContext).toHaveBeenCalledWith('2d');
    expect(contexts[1]).toMatchObject({width:0,height:0});
    expect(a.plate).toMatchObject({width:1600,height:1000});expect(a.mask).toMatchObject({width:520,height:845});
    expect(RIVER_LAYER.width*RIVER_LAYER.height/(1600*1000)).toBeLessThan(.28);
    expect(sceneryLayers({} as HTMLImageElement,river,resources)).not.toBe(a);
  });
});
