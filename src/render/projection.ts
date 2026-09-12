import { clamp, type Point } from '../core/math';
import { MAP } from '../game/map';

export const ART = MAP;
export interface Pixel { x: number; y: number }
export const toArt = (point: Point, height = 0): Pixel => ({ x: ART.x + point.x * ART.unitX, y: ART.y + point.z * ART.unitY - height * 25 });

/** Single invertible projection shared by drawing, targeting and resource labels. */
export class Camera2D {
  width = 1;
  height = 1;
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  private zoom = 1;
  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.scale = Math.min(width / ART.width, height / ART.height) * this.zoom;
    this.offsetX = (width - ART.width * this.scale) / 2;
    this.offsetY = (height - ART.height * this.scale) / 2;
  }
  changeZoom(delta: number): void { this.zoom = clamp(this.zoom - delta * 0.0005, 0.88, 1.6); this.resize(this.width, this.height); }
  project(point: Point, height = 0): Pixel & { visible: boolean } {
    const p = toArt(point, height), x = p.x * this.scale + this.offsetX, y = p.y * this.scale + this.offsetY;
    return { x, y, visible: x > 12 && x < this.width - 12 && y > 30 && y < this.height - 50 };
  }
  unproject(x: number, y: number): Point {
    return { x: ((x - this.offsetX) / this.scale - ART.x) / ART.unitX, z: ((y - this.offsetY) / this.scale - ART.y) / ART.unitY };
  }
  apply(context: CanvasRenderingContext2D, ratio: number): void { context.setTransform(this.scale * ratio, 0, 0, this.scale * ratio, this.offsetX * ratio, this.offsetY * ratio); }
}
