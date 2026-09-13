import { ART } from './projection';

export const RIVER_LAYER = { x:1080, y:155, width:ART.width-1080, height:ART.height-155 } as const;
export interface SceneryLayers { plate: HTMLCanvasElement; mask: HTMLCanvasElement }
const cache = new WeakMap<HTMLImageElement, SceneryLayers>();

/** Immutable source art is shared by the game and every opening-preview scene. */
export function sceneryLayers(landscape: HTMLImageElement, river: Path2D, resources: (c:CanvasRenderingContext2D)=>void): SceneryLayers {
  const existing=cache.get(landscape);if(existing)return existing;
  const plate=document.createElement('canvas');plate.width=ART.width;plate.height=ART.height;
  const context=plate.getContext('2d')!;context.drawImage(landscape,0,0,ART.width,ART.height);
  // Read pixels once on a small scratch canvas; keep the repeatedly drawn plate
  // GPU-backed instead of marking it willReadFrequently for the entire run.
  const scratch=document.createElement('canvas'),b=RIVER_LAYER;scratch.width=b.width;scratch.height=b.height;
  const sampleContext=scratch.getContext('2d',{willReadFrequently:true})!;
  sampleContext.drawImage(plate,b.x,b.y,b.width,b.height,0,0,b.width,b.height);
  const pixels=sampleContext.getImageData(0,0,b.width,b.height),sample=((850-b.y)*b.width+1260-b.x)*4;
  const red=pixels.data[sample]!,green=pixels.data[sample+1]!,blue=pixels.data[sample+2]!;
  const mask=document.createElement('canvas');mask.width=b.width;mask.height=b.height;
  const maskContext=mask.getContext('2d')!;
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
    const i=(y*b.width+x)*4,r=pixels.data[i]!,g=pixels.data[i+1]!,v=pixels.data[i+2]!;
    const match=x>0&&y>0&&v>r*1.5&&g>r*1.25&&(r-red)**2+(g-green)**2+(v-blue)**2<34**2;
    pixels.data[i+3]=match&&maskContext.isPointInPath(river,x+b.x,y+b.y)?255:0;
  }
  maskContext.putImageData(pixels,0,0);scratch.width=scratch.height=0;resources(context);
  const layers={plate,mask};cache.set(landscape,layers);return layers;
}
