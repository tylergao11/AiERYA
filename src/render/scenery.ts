import { CAMP, createResources } from '../game/terrain';
import { RIVER } from '../game/map';
import { flame, glow, line, oval, shape } from './ink';
import { ART, toArt } from './projection';
import type { ArtAssets } from './assets';
import { WaterSurface } from './water';

export class SceneryPainter {
  private readonly water = new WaterSurface(RIVER, 87314, true);
  private readonly waterLayer = document.createElement('canvas');
  private readonly mask = document.createElement('canvas');
  private readonly waterContext: CanvasRenderingContext2D;
  private readonly staticLayer = document.createElement('canvas');
  constructor(assets: ArtAssets) {
    for (const canvas of [this.waterLayer, this.mask, this.staticLayer]) { canvas.width = ART.width; canvas.height = ART.height; }
    this.waterContext = this.waterLayer.getContext('2d')!;
    const staticContext = this.staticLayer.getContext('2d', { willReadFrequently: true })!;
    staticContext.drawImage(assets.landscape, 0, 0, ART.width, ART.height);
    const pixels = staticContext.getImageData(0, 0, ART.width, ART.height), maskContext = this.mask.getContext('2d')!;
    const sample = (Math.round(850) * ART.width + Math.round(1260)) * 4;
    const base = [pixels.data[sample]!, pixels.data[sample + 1]!, pixels.data[sample + 2]!];
    // The scenery plate has flat unlit riverbeds. Their mask preserves painted
    // rocks and overhanging plants while the shared water layer animates below.
    for (let y = 0; y < ART.height; y++) for (let x = 0; x < ART.width; x++) {
      const i = (y * ART.width + x) * 4, r = pixels.data[i]!, g = pixels.data[i + 1]!, b = pixels.data[i + 2]!;
      const match = x > 1080 && y > 155 && b > r * 1.5 && g > r * 1.25 && Math.hypot(r - base[0]!, g - base[1]!, b - base[2]!) < 34;
      pixels.data[i + 3] = match && maskContext.isPointInPath(this.water.path, x, y) ? 255 : 0;
    }
    maskContext.putImageData(pixels, 0, 0);
    this.resources(staticContext);
  }
  background(c: CanvasRenderingContext2D): void { c.drawImage(this.staticLayer, 0, 0); }
  river(c: CanvasRenderingContext2D, time: number): void {
    const layer = this.waterContext; layer.clearRect(0, 0, ART.width, ART.height); this.water.paint(layer, time);
    layer.globalCompositeOperation = 'destination-in'; layer.drawImage(this.mask, 0, 0); layer.globalCompositeOperation = 'source-over';
    c.drawImage(this.waterLayer, 0, 0);
  }
  camp(c: CanvasRenderingContext2D, time: number, health: number): void {
    const p = toArt(CAMP);
    if (health > 0) {
      c.save(); c.globalCompositeOperation = 'screen'; glow(c, p.x, p.y - 7, 105, '#f49c48', 0.12 + Math.sin(time * 6.1) * 0.015); c.restore();
      for (let i = 0; i < 3; i++) flame(c, p.x + (i - 1) * 11, p.y - 5, [32, 50, 37][i]!, time, i * 3.7);
      for (let i = 0; i < 7; i++) {
        const t = (time * 0.6 + i * 0.417) % 2, x = p.x + Math.sin(i * 2.7 + t * 2) * 12;
        c.save(); c.globalAlpha = Math.sin(t / 2 * Math.PI) * 0.8; c.fillStyle = i % 2 ? '#ffb465' : '#f1dda4'; c.fillRect(x, p.y - 30 - t * 38, 1.4, 3.1); c.restore();
      }
    } else oval(c, p.x, p.y - 6, 19, 7, '#122024ab');
  }
  air(c: CanvasRenderingContext2D, time: number): void {
    for (let i = 0; i < 8; i++) {
      const x = 100 + i * 180 + Math.sin(time * 0.25 + i * 5) * 12, y = 160 + Math.cos(i * 5) * 35 + (time * 7 + i * 49) % 95;
      c.save(); c.globalAlpha = 0.35; c.translate(x, y); c.rotate(Math.sin(time + i) * 0.5);
      shape(c, [-3, 0, 0, -2, 5, 0, 1, 2], '#7c9372', '#173138', 0.7); c.restore();
    }
  }
  dispose(): void { this.waterLayer.width = this.mask.width = this.staticLayer.width = 0; }
  private resources(c: CanvasRenderingContext2D): void {
    const iron = toArt(createResources().find(r => r.element === 'metal')!);
    c.save(); c.translate(iron.x, iron.y); oval(c, 0, 2, 17, 5, '#1b25274d');
    line(c, [{ x: -14, y: 5 }, { x: 13, y: -9 }], '#20272a', 6);
    line(c, [{ x: -14, y: 5 }, { x: 13, y: -9 }], '#847153', 3);
    shape(c, [4, -16, 7, -5, 18, 1, 23, -11, 15, -10, 12, -17], '#b1b9ae', '#182934', 1.6);
    line(c, [{ x: 18, y: 0 }, { x: 22, y: -10 }], '#e9dbb1', 1.2); c.restore();
  }
}
