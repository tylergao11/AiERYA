import type { Element } from '../game/contracts';

type Rect = [number, number, number, number];
const columns: Record<Element, number> = { metal: 0, wood: 1, water: 2, fire: 3, earth: 4 };
let atlas: HTMLImageElement | undefined;
let frames: Rect[] = [];

/** Bound the black-matte material once; original pixels are used directly by screen blending. */
export function registerSpiritMaterial(image: HTMLImageElement): void {
  if (atlas === image) return;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) return;
  c.drawImage(image, 0, 0);
  const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
  frames = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
    // Calibrated gutters keep the tall contact roots out of the projectile row.
    const xs=[0,309,623,932,1237,1536],ys=[0,300,640,1024];
    const left=Math.round(xs[col]!*canvas.width/1536),right=Math.round(xs[col+1]!*canvas.width/1536);
    const top=Math.round(ys[row]!*canvas.height/1024),bottom=Math.round(ys[row+1]!*canvas.height/1024);
    let x0 = right, x1 = left, y0 = bottom, y1 = top;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const pixel=(y*canvas.width+x)*4;
      if (data[pixel+3]! < 28 || Math.max(data[pixel]!,data[pixel+1]!,data[pixel+2]!)<36) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 < x0) frames.push([left, top, right-left, bottom-top]);
    else { x0 = Math.max(left, x0-2); y0 = Math.max(top, y0-2); frames.push([x0,y0,Math.min(right,x1+3)-x0,Math.min(bottom,y1+3)-y0]); }
  }
  atlas = image;
}

/** Direction, growth and fading animate material, without inventing damage or hit areas. */
export function paintSpiritMaterial(c: CanvasRenderingContext2D, element: Element, layer: 0 | 1 | 2,
  x: number, y: number, width: number, height: number, angle = 0, alpha = 1): boolean {
  const rect = frames[layer * 5 + columns[element]];
  if (!atlas || !rect || width <= 0 || height <= 0) return false;
  c.save(); c.translate(x,y); c.rotate(angle); c.globalAlpha *= Math.max(0, alpha);
  c.globalCompositeOperation='screen';
  c.drawImage(atlas, ...rect, -width/2, -height/2, width, height); c.restore();
  return true;
}
