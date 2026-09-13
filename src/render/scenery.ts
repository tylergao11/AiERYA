import { CAMP, createNaturalSources } from '../game/terrain';
import { RIVER } from '../game/map';
import { flame, glow, line, oval, shape } from './ink';
import { toArt } from './projection';
import type { ArtAssets } from './assets';
import { WaterSurface } from './water';
import { STATE_MOTION, type ElementState } from './element-state';
import { RIVER_LAYER, sceneryLayers } from './scenery-cache';

export class SceneryPainter {
  private readonly water = new WaterSurface(RIVER, 87314, true);
  private readonly waterLayer = document.createElement('canvas');
  private readonly mask: HTMLCanvasElement;
  private readonly waterContext: CanvasRenderingContext2D;
  private readonly staticLayer: HTMLCanvasElement;
  private waterTime = 0;
  private lastWaterTime = -1;
  private paintedWaterTime = -1;
  private paintedWaterState: ElementState | null = null;
  constructor(assets: ArtAssets) {
    const layers=sceneryLayers(assets.landscape,this.water.path,c=>this.resources(c));
    this.mask=layers.mask;this.staticLayer=layers.plate;
    this.waterLayer.width=RIVER_LAYER.width;this.waterLayer.height=RIVER_LAYER.height;
    this.waterContext = this.waterLayer.getContext('2d')!;
  }
  background(c: CanvasRenderingContext2D): void { c.drawImage(this.staticLayer, 0, 0); }
  river(c: CanvasRenderingContext2D, time: number, state: ElementState = 'normal'): void {
    if (time < this.lastWaterTime) this.waterTime = 0;
    this.waterTime += Math.max(0, this.lastWaterTime < 0 ? 0 : time - this.lastWaterTime) * STATE_MOTION[state]; this.lastWaterTime = time;
    if(this.paintedWaterTime<0 || time<this.paintedWaterTime || time-this.paintedWaterTime>=1/30-1e-6 || state!==this.paintedWaterState){
      const layer=this.waterContext,b=RIVER_LAYER;layer.clearRect(0,0,b.width,b.height);
      layer.save();layer.translate(-b.x,-b.y);this.water.paint(layer,this.waterTime,1,state==='weakened'?.05:state==='enhanced'?.9:.55,state);layer.restore();
      layer.globalCompositeOperation='destination-in';layer.drawImage(this.mask,0,0);layer.globalCompositeOperation='source-over';
      this.paintedWaterTime=time;this.paintedWaterState=state;
    }
    c.drawImage(this.waterLayer,RIVER_LAYER.x,RIVER_LAYER.y);
  }
  camp(c: CanvasRenderingContext2D, time: number, health: number, firePower = 1, impact = 0): void {
    const p = toArt(CAMP);
    p.x += Math.sin((0.45 - impact) * 52) * impact * 7;
    if (health > 0 && firePower > 0) {
      c.save(); c.globalCompositeOperation = 'screen'; glow(c, p.x, p.y - 7, 105, '#f49c48', (0.12 + Math.sin(time * 6.1) * 0.015) * firePower); c.restore();
      for (let i = 0; i < 3; i++) flame(c, p.x + (i - 1) * 11, p.y - 5, [32, 50, 37][i]! * firePower, time, i * 3.7);
      for (let i = 0; i < 7; i++) {
        const t = (time * 0.6 + i * 0.417) % 2, x = p.x + Math.sin(i * 2.7 + t * 2) * 12;
        c.save(); c.globalAlpha = Math.sin(t / 2 * Math.PI) * 0.8; c.fillStyle = i % 2 ? '#ffb465' : '#f1dda4'; c.fillRect(x, p.y - 30 - t * 38, 1.4, 3.1); c.restore();
      }
    } else {
      oval(c, p.x, p.y - 6, 19, 7, '#122024ab');
      if (health > 0) for (let i = 0; i < 3; i++) { const t = (time * 0.5 + i / 3) % 1; c.save(); c.globalAlpha *= Math.sin(t * Math.PI) * 0.28; oval(c, p.x - 8 + i * 7 + t * 6, p.y - 12 - t * 23, 4 + t * 6, 3 + t * 5, '#c2c7b5'); c.restore(); }
    }
  }
  air(c: CanvasRenderingContext2D, time: number): void {
    for (let i = 0; i < 8; i++) {
      const x = 100 + i * 180 + Math.sin(time * 0.25 + i * 5) * 12, y = 160 + Math.cos(i * 5) * 35 + (time * 7 + i * 49) % 95;
      c.save(); c.globalAlpha = 0.35; c.translate(x, y); c.rotate(Math.sin(time + i) * 0.5);
      shape(c, [-3, 0, 0, -2, 5, 0, 1, 2], '#7c9372', '#173138', 0.7); c.restore();
    }
  }
  dispose(): void { this.waterLayer.width = this.waterLayer.height = 0; }
  private resources(c: CanvasRenderingContext2D): void {
    const iron = toArt(createNaturalSources().find(r => r.element === 'metal')!);
    c.save(); c.translate(iron.x, iron.y); oval(c, 0, 2, 17, 5, '#1b25274d');
    line(c, [{ x: -14, y: 5 }, { x: 13, y: -9 }], '#20272a', 6);
    line(c, [{ x: -14, y: 5 }, { x: 13, y: -9 }], '#847153', 3);
    shape(c, [4, -16, 7, -5, 18, 1, 23, -11, 15, -10, 12, -17], '#b1b9ae', '#182934', 1.6);
    line(c, [{ x: 18, y: 0 }, { x: 22, y: -10 }], '#e9dbb1', 1.2); c.restore();
  }
}
