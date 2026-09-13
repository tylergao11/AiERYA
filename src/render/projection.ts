import { clamp, type Point } from '../core/math';
import { MAP } from '../game/map';

export const ART = MAP;
export interface Pixel { x: number; y: number }
export interface ViewportRect extends Pixel { width: number; height: number }
export const toArt = (point: Point, height = 0): Pixel => ({ x: ART.x + point.x * ART.unitX, y: ART.y + point.z * ART.unitY - height * 25 });

/** Single invertible projection shared by drawing, targeting and resource labels. */
export class Camera2D {
  width = 1;
  height = 1;
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  private zoom = 1;
  private navigation: { rect: ViewportRect; zoom: number; center: Pixel } | null = null;
  get viewport(): Readonly<ViewportRect> | null { return this.navigation?.rect ?? null; }
  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.scale = Math.min(width / ART.width, height / ART.height) * this.zoom;
    this.offsetX = (width - ART.width * this.scale) / 2;
    this.offsetY = (height - ART.height * this.scale) / 2;
    if (this.navigation) {
      const n=this.navigation,r=n.rect;
      r.x=clamp(r.x,0,Math.max(0,width-1)); r.y=clamp(r.y,0,Math.max(0,height-1));
      r.width=clamp(r.width,1,width-r.x); r.height=clamp(r.height,1,height-r.y);
      this.scale=Math.max(this.scale*n.zoom,r.width/ART.width,r.height/ART.height);
      this.offsetX=r.x+r.width/2-n.center.x*this.scale;
      this.offsetY=r.y+r.height/2-n.center.y*this.scale;
      this.constrain();
      n.center={x:(r.x+r.width/2-this.offsetX)/this.scale,y:(r.y+r.height/2-this.offsetY)/this.scale};
    }
  }
  /** Optional user navigation is separate from a temporary attack close-up. */
  navigate(rect: ViewportRect | null, magnification = 1.85): void {
    if (!rect || ![rect.x,rect.y,rect.width,rect.height,magnification].every(Number.isFinite) || rect.width<=0 || rect.height<=0) this.navigation=null;
    else this.navigation={rect:{...rect},zoom:clamp(magnification,1,2.4),center:this.navigation?.center ?? {x:ART.width/2,y:ART.height/2}};
    this.resize(this.width,this.height);
  }
  panBy(dx: number, dy: number): void {
    if (!this.navigation || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.focus(null);
    this.navigation.center.x-=dx/this.scale; this.navigation.center.y-=dy/this.scale;
    this.resize(this.width,this.height);
  }
  private constrain(): void {
    const r=this.viewport ?? {x:0,y:0,width:this.width,height:this.height};
    const gapX=r.width-ART.width*this.scale,gapY=r.height-ART.height*this.scale;
    this.offsetX=clamp(this.offsetX,r.x+Math.min(0,gapX),r.x+Math.max(0,gapX));
    this.offsetY=clamp(this.offsetY,r.y+Math.min(0,gapY),r.y+Math.max(0,gapY));
  }
  changeZoom(delta: number): void { this.zoom = clamp(this.zoom - delta * 0.0005, 0.88, 1.6); this.resize(this.width, this.height); }
  /** Temporary focus shares the same transform as rendering, projection and pointer picking. */
  focus(point: Point | null, multiplier = 1, pan = 0, maximum = 1.5): void {
    this.resize(this.width, this.height);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const p = toArt(point, .8), x = p.x * this.scale + this.offsetX, y = p.y * this.scale + this.offsetY;
    // Larger portrait framing is opt-in; existing camera owners retain their limit.
    const limit=Number.isFinite(maximum)?clamp(maximum,1,2):1.5;
    this.scale *= Number.isFinite(multiplier) ? clamp(multiplier, 1, limit) : 1;
    const strength = Number.isFinite(pan) ? clamp(pan, 0, 1) : 0;
    const r=this.viewport ?? {x:0,y:0,width:this.width,height:this.height};
    this.offsetX = x + (r.x+r.width*.5 - x) * strength - p.x * this.scale;
    this.offsetY = y + (r.y+r.height*.48 - y) * strength - p.y * this.scale;
    this.constrain();
  }
  project(point: Point, height = 0): Pixel & { visible: boolean } {
    const p = toArt(point, height), x = p.x * this.scale + this.offsetX, y = p.y * this.scale + this.offsetY;
    const r=this.viewport;
    return { x, y, visible: r ? x>r.x && x<r.x+r.width && y>r.y && y<r.y+r.height : x > 12 && x < this.width - 12 && y > 30 && y < this.height - 50 };
  }
  unproject(x: number, y: number): Point {
    return { x: ((x - this.offsetX) / this.scale - ART.x) / ART.unitX, z: ((y - this.offsetY) / this.scale - ART.y) / ART.unitY };
  }
  apply(context: CanvasRenderingContext2D, ratio: number): void { context.setTransform(this.scale * ratio, 0, 0, this.scale * ratio, this.offsetX * ratio, this.offsetY * ratio); }
}
