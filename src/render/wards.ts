import { inside, random, resample } from '../core/math';
import type { Ward } from '../game/contracts';
import { COLORS, flame, INK, line, oval, shape } from './ink';
import { toArt, type Pixel } from './projection';
import { WaterSurface } from './water';

export interface PaintedObject { z: number; draw(c: CanvasRenderingContext2D): void }
interface WardArt { path: Path2D; points: Pixel[]; anchors: Pixel[]; dots: Pixel[]; flames: Pixel[]; water?: WaterSurface }

export class WardPainter {
  private readonly cache = new Map<number, WardArt>();
  private prepare(ward: Ward): WardArt {
    let art = this.cache.get(ward.id); if (art) return art;
    const points = ward.points.map(p => toArt(p)), path = new Path2D(); path.moveTo(points[0]!.x, points[0]!.y);
    points.slice(1).forEach(p => path.lineTo(p.x, p.y)); path.closePath();
    const dots: Pixel[] = [], flames: Pixel[] = [], rng = random(ward.id * 1351);
    for (let i = 0; i < 420; i++) { const p = { x: ward.x + (rng() - 0.5) * ward.radius * 2, z: ward.z + (rng() - 0.5) * ward.radius * 2 }; if (inside(p, ward.points)) { const pixel = toArt(p); dots.push(pixel); if (flames.length < 15 && flames.every(f => Math.hypot(f.x - pixel.x, (f.y - pixel.y) * 1.3) > 35)) flames.push(pixel); } }
    art = { path, points, anchors: resample([...ward.points, ward.points[0]!], ward.element === 'earth' ? 0.8 : 1.65).map(p => toArt(p)), dots, flames, ...(ward.element === 'water' ? { water: new WaterSurface(ward.points, ward.id * 718) } : {}) }; this.cache.set(ward.id, art); return art;
  }
  ground(c: CanvasRenderingContext2D, wards: readonly Ward[], time: number): void {
    const live = new Set(wards.map(w => w.id)); for (const id of this.cache.keys()) if (!live.has(id)) this.cache.delete(id);
    for (const ward of wards) {
      const art = this.prepare(ward), p = toArt(ward), grow = Math.min(1, ward.age * 2.8), color = COLORS[ward.element];
      if (art.water) { art.water.paint(c, time, grow); this.sigils(c, art, grow * (0.35 + ward.charge * 0.55)); continue; }
      c.save(); c.globalAlpha = grow; c.fillStyle = { fire: '#3120259c', wood: '#2d412b5c', water: '#2c758691', earth: '#69594450', metal: '#6a6a6745' }[ward.element]; c.fill(art.path);
      c.save(); c.clip(art.path);
      for (let i = 0; i < art.dots.length; i++) { const dot = art.dots[i]!; c.fillStyle = i % 3 ? INK + '66' : color + '44'; oval(c, dot.x, dot.y, 1.4 + i % 3, 0.75, c.fillStyle); }
      c.restore();
      c.setLineDash(ward.element === 'fire' ? [13, 6, 3, 7] : []); c.lineWidth = 4; c.strokeStyle = '#0b192a9c'; c.stroke(art.path);
      c.lineWidth = 1.6; c.strokeStyle = color + 'aa'; c.stroke(art.path); c.setLineDash([]);
      if (ward.element === 'fire') { for (let i = 0; i < art.dots.length; i += 3) { const dot = art.dots[i]!; c.fillStyle = i % 2 ? '#d9734577' : '#f3aa6477'; c.fillRect(dot.x, dot.y, 2.6, 1.2); } }
      // Inlaid ink marks make the drawn region part of the ground surface.
      c.save(); c.translate(p.x, p.y); c.scale(1, 0.64); c.rotate(time * 0.025);
      c.strokeStyle = color + (ward.charge >= 1 ? 'c0' : '55'); c.lineWidth = 1.2;
      c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 5; i++) { c.rotate(Math.PI * 2 / 5); c.beginPath(); c.moveTo(17, -3); c.lineTo(22, 0); c.lineTo(17, 3); c.stroke(); }
      c.restore(); c.restore();
    }
  }
  objects(wards: readonly Ward[], time: number): PaintedObject[] {
    const result: PaintedObject[] = [];
    for (const ward of wards) {
      const art = this.prepare(ward), grow = Math.min(1, ward.age * 2.5);
      for (let i = 0; i < art.anchors.length; i++) {
        const p = art.anchors[i]!, next = art.anchors[(i + 1) % art.anchors.length]!;
        if (ward.element === 'fire') continue;
        if (ward.element === 'water' || ward.element === 'metal') continue;
        result.push({ z: p.y, draw: c => {
          c.save(); c.translate(p.x, p.y); c.scale(1, grow);
          if (ward.element === 'earth') {
            oval(c, 1, 2, 13, 5, '#10202baa');
            shape(c, [-13, 1, -9, -14, -1, -20 - i % 5, 9, -16, 14, -2, 5, 5], '#736f60', INK, 2.2);
            shape(c, [-13, 1, -9, -14, 0, -8, 5, 5], '#4b5554', INK, 1);
            line(c, [{ x: -8, y: -14 }, { x: -1, y: -19 - i % 5 }, { x: 8, y: -15 }], '#b9b092', 1.4);
          } else if (ward.element === 'wood') {
            const dx = next.x - p.x, dy = next.y - p.y;
            c.beginPath(); c.moveTo(-3, 2); c.bezierCurveTo(dx * 0.3, dy - 17, dx * 0.7, dy + 6, dx, dy);
            c.lineWidth = 7; c.strokeStyle = '#152824'; c.stroke(); c.lineWidth = 3.8; c.strokeStyle = '#708257'; c.stroke();
            shape(c, [-1, -4, -10, -18, -17, -16, -12, -9], '#799f69', '#18352a', 1);
            shape(c, [0, -5, 5, -20, 11, -17, 10, -11], '#a5b774', '#18352a', 1);
          } else flame(c, 0, 0, 20 + i % 3 * 4, time, ward.id + i);
          c.restore();
        } });
      }
      if (ward.element === 'fire') for (let i = 0; i < art.flames.length; i++) {
        const p = art.flames[i]!;
        result.push({ z: p.y, draw: c => { c.save(); c.globalAlpha = grow; oval(c, p.x, p.y + 2, 14, 4, '#ed9a4e44'); flame(c, p.x, p.y, (30 + i % 3 * 9) * grow, time, ward.id + i * 2.7); c.restore(); } });
      }
      if (ward.element === 'metal') {
        const p = toArt(ward);
        result.push({ z: p.y, draw: c => {
          for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + time * 0.23, x = p.x + Math.cos(a) * 24, y = p.y + Math.sin(a) * 14 - 14 - Math.sin(time * 2 + i) * 2;
            c.save(); c.translate(x, y); c.rotate(Math.sin(a) * 0.3); c.globalAlpha = grow;
            shape(c, [-4, 8, -3, -16, 1, -24, 4, -15, 3, 8, 0, 12], '#c7ccbf', '#19252c', 1.6);
            shape(c, [0, -22, 4, -15, 3, 8, 0, 12], '#f5de99', INK, 0); c.restore();
          }
        } });
      }
    }
    return result;
  }
  private sigils(c: CanvasRenderingContext2D, art: WardArt, opacity: number): void {
    c.save(); c.globalAlpha = opacity;
    for (let i = 0; i < art.anchors.length; i += Math.max(1, Math.floor(art.anchors.length / 3))) {
      const p = art.anchors[i]!; c.strokeStyle = '#cfe9dd'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(p.x, p.y, 5, 3.3, 0, 0, Math.PI * 2); c.stroke(); oval(c, p.x, p.y, 1.3, 1, '#d5ead9');
    }
    c.restore();
  }
  clear(): void { this.cache.clear(); }
}
