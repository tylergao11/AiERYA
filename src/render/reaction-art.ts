import { clamp } from '../core/math';
import type { GameEvents } from '../game/contracts';
import type { World } from '../game/world';
import { flame, line, oval, shape } from './ink';
import { ART, toArt, type Pixel } from './projection';

export type ReactionKind = GameEvents['reactionEffect']['effect'] | 'steam';
export interface ReactionVisual { effect: ReactionKind; p: Pixel; radius: number; targets: Pixel[]; age: number; seed: number }
export const REACTION_LIFE: Record<ReactionKind, number> = { spread: 0.9, guard: 1, chain: 0.42, vortex: 1.1, roots: 0.85, rupture: 0.9, mud: 0.85, expose: 0.8, cut: 0.5, steam: 1.1 };

/** The pool snapshots resolved contacts. It never owns damage, targets or persistent terrain. */
export class ReactionArt {
  readonly marks: ReactionVisual[] = [];
  private serial = 0;
  private readonly off: (() => void)[];
  constructor(private readonly world: World) {
    this.off = [world.events.on('reactionEffect', e => this.add(e.effect, toArt(e.at), e.radius, e.targets.map(p => toArt(p)))),
      world.events.on('steam', e => this.add('steam', toArt(e.at), e.radius, [])),
      world.events.on('phase', ({ phase }) => { if (phase !== 'battle') this.clear(); }), world.events.on('reset', () => this.clear())];
  }
  add(effect: ReactionKind, p: Pixel, radius: number, targets: readonly Pixel[]): void {
    const duplicate = this.marks.find(m => m.effect === effect && m.age < 0.075 && Math.hypot(m.p.x - p.x, m.p.y - p.y) < 8);
    if (duplicate) { duplicate.radius = Math.max(radius, duplicate.radius); return; }
    if (this.marks.length >= 18) this.marks.splice(this.marks.findIndex(m => m.effect !== 'steam') >= 0 ? this.marks.findIndex(m => m.effect !== 'steam') : 0, 1);
    this.marks.push({ effect, p: { ...p }, radius, targets: targets.slice(0, 6).map(p => ({ ...p })), age: 0, seed: this.serial++ * 2.39996 });
  }
  update(dt: number): void {
    for (let i = this.marks.length - 1; i >= 0; i--) { const m = this.marks[i]!; m.age += dt; if (m.age >= REACTION_LIFE[m.effect]) this.marks.splice(i, 1); }
  }
  ground(c: CanvasRenderingContext2D): void {
    for (const zone of this.world.reactionEffects.zones) {
      const p = toArt(zone.at), rx = zone.radius * ART.unitX, ry = zone.radius * ART.unitY;
      c.save(); c.globalAlpha = Math.min(1, zone.remaining * 1.8);
      // The wet silhouette stays inside the actual circular rule boundary.
      c.beginPath(); c.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); c.clip();
      oval(c, p.x, p.y, rx, ry, '#5e514780');
      for (let i = 0; i < 15; i++) {
        const a = i * 2.4 + zone.id, r = Math.sqrt((i + 0.5) / 15), x = p.x + Math.cos(a) * rx * r, y = p.y + Math.sin(a) * ry * r;
        oval(c, x, y, 9 + i % 4 * 5, 4 + i % 3 * 2, i % 2 ? '#2f555765' : '#8c7b5665');
        line(c, [{ x: x - 7, y }, { x, y: y - 2 }, { x: x + 5, y: y - 1 }], '#bab29288', 1.1);
      }
      c.restore();
    }
    for (const m of this.marks) {
      const t = m.age / REACTION_LIFE[m.effect], rx = m.radius * ART.unitX, ry = m.radius * ART.unitY;
      c.save(); c.globalAlpha = (1 - t) * Math.min(1, t * 16);
      if (m.effect === 'steam' || m.effect === 'vortex') {
        const inward = m.effect === 'vortex';
        for (let i = 0; i < 4; i++) {
          const phase = inward ? 1 - ((t + i * 0.19) % 1) : clamp(t * 2.8 - i * 0.12, 0, 1);
          c.strokeStyle = i % 2 ? '#719f9b' : '#c8d6c4'; c.lineWidth = (1 - t) * (i ? 1.4 : 3.5);
          c.beginPath(); c.ellipse(m.p.x, m.p.y, rx * phase, ry * phase, 0, m.seed + i * 1.7 + t, m.seed + i * 1.7 + t + 1.8); c.stroke();
        }
      }
      if (m.effect === 'roots' || m.effect === 'rupture') {
        for (const target of m.targets) this.root(c, m.p, target, clamp(t * 3, 0, 1), m.seed);
      }
      if (m.effect === 'guard' || m.effect === 'rupture' || m.effect === 'mud') {
        for (let i = 0; i < 8; i++) {
          const a = i * 2.4 + m.seed, r = (m.effect === 'guard' ? 0.8 - t * 0.5 : t * 0.8) * rx;
          const x = m.p.x + Math.cos(a) * r, y = m.p.y + Math.sin(a) * r * 0.64;
          line(c, [{ x, y }, { x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 6 }, { x: x + Math.cos(a + 0.3) * 19, y: y + Math.sin(a + 0.3) * 10 }], '#342e2980', 2.2);
          if (m.effect === 'guard') { oval(c, x, y, 7, 3, '#baa57866'); line(c, [{ x: x - 4, y }, { x: x + 4, y: y - 3 }], '#dfc495', 1); }
        }
      }
      c.restore();
    }
  }
  paint(c: CanvasRenderingContext2D, time: number): void {
    const density = Math.max(0.5, 1 - this.marks.length * 0.025);
    for (const m of this.marks) {
      const t = m.age / REACTION_LIFE[m.effect];
      c.save(); c.globalAlpha = Math.min(1, t * 22) * (1 - t) * density;
      if (m.effect === 'steam') this.steam(c, m, t);
      else if (m.effect === 'vortex') {
        // Separate moving ribbons and droplets leave the wolves visible between the flows.
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4 + t * 5, radius = (1 - (t * 1.1 + i * 0.13) % 1) * m.radius;
          const x = m.p.x + Math.cos(a) * radius * ART.unitX, y = m.p.y + Math.sin(a) * radius * ART.unitY;
          c.beginPath(); c.moveTo(x - Math.sin(a) * 12, y + Math.cos(a) * 6); c.quadraticCurveTo(x, y - 8, x + Math.sin(a) * 8, y - Math.cos(a) * 5);
          c.strokeStyle = '#b7ded1'; c.lineWidth = 2.5; c.stroke(); oval(c, x + 5, y - 5, 1.2, 2.3, '#d4e7d6');
        }
      } else if (m.effect === 'spread') {
        for (const target of m.targets) {
          const travel = clamp(t * 3.5, 0, 1), x = m.p.x + (target.x - m.p.x) * travel, y = m.p.y + (target.y - m.p.y) * travel - Math.sin(travel * Math.PI) * 22;
          flame(c, x, y - 10, 18 + Math.sin(travel * Math.PI) * 8, time, m.seed);
          for (let i = 0; i < 4; i++) { const trail = Math.max(0, travel - i * 0.04); oval(c, m.p.x + (target.x - m.p.x) * trail, m.p.y + (target.y - m.p.y) * trail - Math.sin(trail * Math.PI) * 22 - 12, 1.8 - i * 0.3, 1, '#f4bb77'); }
        }
        if (!m.targets.length) flame(c, m.p.x, m.p.y, 28 * Math.sin(t * Math.PI), time, m.seed);
      } else if (m.effect === 'chain') {
        for (const target of m.targets) {
          const a = { x: m.p.x, y: m.p.y - 19 }, b = { x: target.x, y: target.y - 24 }, progress = clamp(t * 5, 0, 1);
          const end = { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
          line(c, [a, end], '#273a41', 5); line(c, [a, end], '#eee0a8', 1.8);
          this.splinters(c, end, t, m.seed, true);
        }
      } else if (m.effect === 'cut') {
        for (const target of m.targets.length ? m.targets : [m.p]) {
          const r = 25 * (0.5 + t); shape(c, [target.x - r, target.y + 6, target.x + r, target.y - 35, target.x + r * 0.45, target.y - 18], '#ebdeb7', '#465349', 1);
          this.splinters(c, target, t, m.seed, false);
        }
      } else if (m.effect === 'expose') {
        for (const target of m.targets.length ? m.targets : [m.p]) {
          const y = target.y - 24;
          line(c, [{ x: target.x - 16, y: y - 10 }, { x: target.x - 3, y }, { x: target.x + 3, y: y - 5 }, { x: target.x + 14, y: y + 8 }], '#332b28', 5);
          line(c, [{ x: target.x - 16, y: y - 10 }, { x: target.x - 3, y }, { x: target.x + 3, y: y - 5 }, { x: target.x + 14, y: y + 8 }], '#f0a161', 2);
          for (let i = 0; i < 4; i++) oval(c, target.x + (i - 1.5) * 7, y + t * 24 + i * 2, 1.2, 2.2, '#ecc285');
        }
      } else {
        const rocky = m.effect === 'rupture' || m.effect === 'guard' || m.effect === 'mud';
        for (const target of m.targets.length ? m.targets : [m.p]) {
          if (rocky) this.splinters(c, target, t, m.seed, false, true);
          else for (let i = 0; i < 4; i++) {
            const x = target.x + Math.sin(m.seed + i * 2) * 20, y = target.y - Math.sin(t * Math.PI) * 24;
            shape(c, [x - 5,y,x,y - 5,x + 6,y - 2,x + 1,y + 3], '#8dac68', '#344834', 1);
          }
        }
      }
      c.restore();
    }
  }
  private steam(c: CanvasRenderingContext2D, m: ReactionVisual, t: number): void {
    const rx = m.radius * ART.unitX, ry = m.radius * ART.unitY, expansion = Math.min(1, t * 3.5);
    if (t < 0.13) { c.save(); c.globalAlpha *= (1 - t / 0.13) * 0.45; oval(c, m.p.x, m.p.y - 8, 15 + expansion * rx * 0.45, 8 + expansion * ry * 0.4, '#f2e6c8'); c.restore(); }
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + m.seed, x = m.p.x + Math.cos(a) * rx * expansion * 0.74, y = m.p.y + Math.sin(a) * ry * expansion * 0.65 - t * (25 + i % 3 * 7);
      const size = (8 + i % 3 * 3) * (0.6 + t * 1.5);
      c.save(); c.globalAlpha *= 0.36 * Math.sin(Math.min(1, t * 3) * Math.PI / 2);
      c.beginPath(); c.moveTo(x - size, y);
      c.bezierCurveTo(x - size * 1.5,y - size,x - size * 0.3,y - size * 1.5,x,y - size);
      c.bezierCurveTo(x + size,y - size * 1.7,x + size * 1.6,y - size * 0.2,x + size,y + size * 0.2);
      c.quadraticCurveTo(x,y + size * 0.5,x - size,y); c.fillStyle = i % 2 ? '#cee0d3' : '#8fafaa'; c.fill();
      c.strokeStyle = '#dfe5cf'; c.lineWidth = 0.8; c.stroke(); c.restore();
    }
    for (let i = 0; i < 12; i++) {
      const a = i * 2.399 + m.seed, r = rx * (0.25 + t * 0.75), x = m.p.x + Math.cos(a) * r, y = m.p.y + Math.sin(a) * r * 0.64 - Math.sin(t * Math.PI) * (18 + i % 4 * 6);
      oval(c, x, y, 1.2, 2.5, t < 0.22 && i % 3 === 0 ? '#eeb879' : '#c2ded1');
    }
  }
  private root(c: CanvasRenderingContext2D, a: Pixel, b: Pixel, progress: number, seed: number): void {
    const x = a.x + (b.x - a.x) * progress, y = a.y + (b.y - a.y) * progress;
    c.beginPath(); c.moveTo(a.x, a.y); c.bezierCurveTo(a.x + (b.x - a.x) * 0.3, a.y + 12 * Math.sin(seed), x - 12, y - 8, x, y);
    c.strokeStyle = '#27352b'; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#9d8961'; c.lineWidth = 3; c.stroke();
    line(c, [{ x, y }, { x: x + 5, y: y - 7 }, { x: x + 12, y: y - 9 }], '#9d8961', 2);
  }
  private splinters(c: CanvasRenderingContext2D, p: Pixel, t: number, seed: number, metal: boolean, rock = false): void {
    for (let i = 0; i < 5; i++) {
      const a = seed + i * 2.4, x = p.x + Math.cos(a) * t * 37, y = p.y - 8 + Math.sin(a) * t * 18 - Math.sin(t * Math.PI) * 21;
      c.save(); c.translate(x, y); c.rotate(a + t * 5);
      shape(c, rock ? [-4,-2,1,-4,5,0,2,3,-3,2] : [-6,0,3,-1.3,6,0,-2,1.3], metal ? '#e0d4ae' : rock ? '#a18d70' : '#b19965', metal ? '#57605a' : '#443d31', 0.8); c.restore();
    }
  }
  clear(): void { this.marks.length = 0; this.serial = 0; }
  dispose(): void { this.off.forEach(off => off()); this.clear(); }
}
