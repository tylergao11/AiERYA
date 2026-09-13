import { area, inside, random, resample, segmentDistance, type Point } from '../core/math';
import { INK, line, shape } from './ink';
import { toArt, type Pixel } from './projection';
import type { ElementState } from './element-state';

interface Current extends Pixel { dx: number; dy: number; length: number; speed: number; phase: number; bend: number }

/** One painted, animated water material for rivers AND arbitrarily shaped formations. */
export class WaterSurface {
  readonly path = new Path2D();
  private readonly boundary: Pixel[];
  private readonly currents: Current[] = [];
  private readonly shore: Pixel[];
  private readonly washes: Path2D[] = [];
  private readonly bounds: { x: number; y: number; width: number; height: number };

  constructor(points: readonly Point[], seed: number, private readonly natural = false, holes: readonly (readonly Point[])[] = []) {
    const rng = random(seed), pixels = points.map(point => toArt(point)); this.boundary = pixels;
    this.path.moveTo(pixels[0]!.x, pixels[0]!.y); for (const p of pixels.slice(1)) this.path.lineTo(p.x, p.y); this.path.closePath();
    for (const hole of holes) {
      const contour = hole.map(p => toArt(p)); this.path.moveTo(contour[0]!.x, contour[0]!.y);
      for (const p of contour.slice(1)) this.path.lineTo(p.x, p.y); this.path.closePath();
    }
    const x = Math.min(...pixels.map(p => p.x)), y = Math.min(...pixels.map(p => p.y));
    this.bounds = { x, y, width: Math.max(...pixels.map(p => p.x)) - x, height: Math.max(...pixels.map(p => p.y)) - y };
    this.shore = [points, ...holes].flatMap(ring => resample([...ring, ring[0]!], 0.72)).map(p => toArt(p));
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
    const count = Math.min(550, Math.max(25, Math.ceil((area(points) - holes.reduce((sum, hole) => sum + area(hole), 0)) * 2.1)));
    for (let i = 0; i < count * 12 && this.currents.length < count; i++) {
      const point = { x: minX + rng() * (maxX - minX), z: minZ + rng() * (maxZ - minZ) };
      if (!inside(point, points) || holes.some(hole => inside(point, hole))) continue;
      let nearest = 0, distance = Infinity;
      for (let j = 0; j < points.length; j++) { const d = segmentDistance(point, points[j]!, points[(j + 1) % points.length]!); if (d < distance) { distance = d; nearest = j; } }
      const start = pixels[nearest]!, end = pixels[(nearest + 1) % pixels.length]!, length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
      let dx = (end.x - start.x) / length, dy = (end.y - start.y) / length;
      if (dy < -0.1 || Math.abs(dy) < 0.1 && dx < 0) { dx *= -1; dy *= -1; }
      this.currents.push({ ...toArt(point), dx, dy, length: 9 + rng() * 28, speed: 0.4 + rng() * 0.55, phase: rng() * 5, bend: (rng() - 0.5) * 18 });
    }
    for (let i = 0; i < this.currents.length; i += 7) {
      const p = this.currents[i]!, wash = new Path2D();
      wash.ellipse(p.x, p.y, 18 + p.length, 4 + i % 11, Math.atan2(p.dy, p.dx), 0, Math.PI * 2); this.washes.push(wash);
    }
  }

  paint(c: CanvasRenderingContext2D, time: number, reveal = 1, power = 0.55, state: ElementState = 'normal'): void {
    c.save(); const opacity = c.globalAlpha * reveal; c.globalAlpha = opacity;
    if (!this.natural) { c.strokeStyle = '#222d2ddd'; c.lineWidth = 10; c.stroke(this.path); c.strokeStyle = '#a69e7688'; c.lineWidth = 6; c.stroke(this.path); }
    c.save(); c.clip(this.path, 'evenodd');
    const b = this.bounds, fill = c.createLinearGradient(b.x, b.y, b.x + b.width * 0.5, b.y + b.height);
    const tones = state === 'weakened' ? ['#404f52', '#687977', '#526764', '#35494d'] : state === 'enhanced' ? ['#235668', '#438c96', '#286f7e', '#1d465b'] : ['#244757', '#3c6878', '#315b6c', '#1c3a4a'];
    fill.addColorStop(0, tones[0]!); fill.addColorStop(0.45, tones[1]!); fill.addColorStop(0.72, tones[2]!); fill.addColorStop(1, tones[3]!);
    c.fillStyle = fill; c.fillRect(b.x - 1, b.y - 1, b.width + 2, b.height + 2);
    for (let i = 0; i < this.washes.length; i++) { c.globalAlpha = opacity * 0.12; c.fillStyle = i % 3 ? '#819b82' : '#122f42'; c.fill(this.washes[i]!); }
    c.globalAlpha = opacity;
    c.strokeStyle = '#0c293caa'; c.lineWidth = 12; c.stroke(this.path);
    for (let i = 0; i < this.currents.length; i++) {
      const mark = this.currents[i]!, t = (time * mark.speed * (0.8 + power * 0.4) + mark.phase) % 5, advance = (t - 2.5) * 12;
      const x = mark.x + mark.dx * advance, y = mark.y + mark.dy * advance, alpha = Math.sin(t / 5 * Math.PI);
      c.globalAlpha = opacity * alpha * (i % 4 ? 0.2 : 0.58) * (0.45 + power) * (state === 'weakened' ? 0.3 : 1);
      c.strokeStyle = i % 5 ? '#c3e0dc' : '#edf1d6'; c.lineWidth = i % 4 ? 1.2 : 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - mark.dx * mark.length, y - mark.dy * mark.length);
      c.bezierCurveTo(x - mark.dx * mark.length * 0.4 + mark.dy * mark.bend, y - mark.dy * mark.length * 0.4 - mark.dx * mark.bend, x - mark.dy * mark.bend, y + mark.dx * mark.bend, x + mark.dx * mark.length * 0.5, y + mark.dy * mark.length * 0.5); c.stroke();
      if (i % (state === 'enhanced' ? 3 : 4) === 0 && state !== 'weakened') {
        c.globalAlpha *= 0.2; c.lineWidth = 8 + i % 7; c.stroke();
        c.globalAlpha = opacity * alpha * (0.18 + power * 0.4); c.lineWidth = 1;
        c.beginPath(); c.ellipse(x, y, 5 + i % 6, 2.5, Math.atan2(mark.dy, mark.dx), 0.25, Math.PI * 1.5); c.stroke();
      }
    }
    c.globalAlpha = opacity * (state === 'weakened' ? 0.3 : 1); c.strokeStyle = state === 'enhanced' ? '#daf0dbbb' : '#b6d7ce80'; c.lineWidth = state === 'enhanced' ? 3.5 : 2.2; c.setLineDash([13, 3, 2, 7, 17, 11]); c.lineDashOffset = -time * 5; c.stroke(this.path); c.setLineDash([]);
    for (let i = 0; i < this.shore.length - 1; i += 2) {
      const p = this.shore[i]!, q = this.shore[i + 1]!, sway = Math.sin(time * 1.5 + i * 2.2) * 3;
      c.globalAlpha = opacity * (0.28 + Math.sin(time + i) * 0.12) * (state === 'weakened' ? 0.2 : 1); c.strokeStyle = '#d0e4dc'; c.lineWidth = state === 'enhanced' ? 4.5 : 3.5;
      c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo((p.x + q.x) / 2 + sway, (p.y + q.y) / 2 + 4, q.x, q.y); c.stroke();
    }
    c.restore();
    // Small banks and pebbles are tied to the actual contour, not a circular decal.
    if (!this.natural) for (let i = 0; i < this.shore.length; i += 4) {
      const p = this.shore[i]!, size = 0.6 + i % 5 * 0.12;
      c.save(); c.translate(p.x, p.y); c.scale(size, size);
      shape(c, [-6, 1, -5, -4, 0, -7, 6, -3, 8, 1, 2, 4], '#566a68', INK, 1);
      line(c, [{ x: -4, y: -4 }, { x: 0, y: -6 }, { x: 5, y: -3 }], '#a0b0a1', 1);
      if (i % 12 === 0) {
        c.strokeStyle = '#6e8b74'; c.lineWidth = 1.7; c.beginPath(); c.moveTo(1, 0); c.quadraticCurveTo(-9, -10, -8, -17); c.moveTo(2, 0); c.quadraticCurveTo(6, -14, 12, -16); c.moveTo(0, 0); c.quadraticCurveTo(0, -9, 3, -13); c.stroke();
      }
      c.restore();
    }
    c.restore();
  }
  get contour(): readonly Pixel[] { return this.boundary; }
}
