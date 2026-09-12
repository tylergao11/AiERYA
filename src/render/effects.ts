import { clamp, random } from '../core/math';
import type { Element, Hit } from '../game/contracts';
import type { World } from '../game/world';
import { CAMP } from '../game/terrain';
import { COLORS, flame, INK, line, oval, shape } from './ink';
import { toArt, type Pixel } from './projection';

interface Particle extends Pixel { vx: number; vy: number; age: number; life: number; size: number; angle: number; spin: number; element: Element; kind: 'ember' | 'leaf' | 'drop' | 'chip' }
interface Impact { p: Pixel; age: number; life: number; element: Element; strength: number; angle: number; seed: number }
interface Trace { points: Pixel[]; element: Element; age: number; life: number; combo: boolean }
interface Gather { start: Pixel; end: Pixel; age: number; color: string }
interface Scorch { p: Pixel; age: number; size: number; seed: number }

/** Events create bounded visual objects. Their lifetimes never drive game damage. */
export class EffectPainter {
  private particles: Particle[] = [];
  private impacts: Impact[] = [];
  private traces: Trace[] = [];
  private gathers: Gather[] = [];
  private scars: Scorch[] = [];
  private readonly off: (() => void)[];
  private readonly rng = random(772933);
  private readonly budget = 650;
  constructor(world: World) {
    this.off = [
      world.events.on('hit', hit => this.hit(hit)),
      world.events.on('death', ({ wolf, element }) => this.spray(toArt(wolf), element, 12, 0.65)),
      world.events.on('gather', ({ resource }) => { if (this.gathers.length < 12) this.gathers.push({ start: toArt(resource), end: toArt(CAMP), age: 0, color: COLORS[resource.element] }); }),
      world.events.on('ward', ({ ward }) => { this.spray(toArt(ward), ward.element, 20, 1); }),
      world.events.on('wardRemoved', ({ at, element }) => this.spray(toArt(at), element, 14, 0.75)),
      world.events.on('pulse', ({ ward, targets }) => { if (ward.element === 'metal') for (const id of targets) { const wolf = world.wolves.find(w => w.id === id); if (wolf && this.traces.length < 24) this.traces.push({ points: [toArt(ward), toArt(wolf)], element: 'metal', age: 0, life: 0.25, combo: false }); } }),
      world.events.on('invoke', ({ points, element, source, combo }) => {
        if (this.traces.length < 24) this.traces.push({ points: points.map(p => toArt(p)), element, combo, age: 0, life: element === 'water' ? 1 : 0.7 });
        this.hit({ ...source, element, direction: { x: 1, z: 0 }, strength: combo ? 1.65 : 1.15 });
      }),
      world.events.on('reset', () => this.clear()),
    ];
  }
  get count(): number { return this.particles.length; }
  get objects(): number { return this.impacts.length + this.traces.length + this.gathers.length + this.scars.length; }
  private hit(hit: Hit): void {
    if (this.impacts.length >= 48 || hit.strength < 0.1) return;
    const p = toArt(hit); p.y -= hit.target ? 16 : 2;
    this.impacts.push({ p, age: 0, life: hit.element === 'fire' ? 1.25 : 0.65, element: hit.element, strength: hit.strength, angle: Math.atan2(hit.direction.z * 0.65, hit.direction.x), seed: this.rng() * 20 });
    this.spray(p, hit.element, Math.ceil(12 + hit.strength * 13), hit.strength);
    if (hit.element === 'fire' && this.scars.length < 32) this.scars.push({ p: toArt(hit), age: 0, size: 10 + hit.strength * 18, seed: this.rng() * 30 });
  }
  private spray(p: Pixel, element: Element, count: number, strength: number): void {
    const n = Math.min(count, this.budget - this.particles.length);
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, speed = (28 + this.rng() * 100) * strength;
      this.particles.push({ ...p, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.7 - 30, age: 0, life: 0.45 + this.rng() * 0.65, size: 1.2 + this.rng() * (element === 'wood' ? 4 : 2), angle: a, spin: (this.rng() - 0.5) * 9, element, kind: element === 'wood' ? 'leaf' : element === 'water' ? 'drop' : element === 'earth' ? 'chip' : 'ember' });
    }
  }
  update(dt: number): void {
    for (const particle of this.particles) { particle.age += dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += (particle.kind === 'ember' ? -7 : 75) * dt; particle.vx *= Math.exp(-dt * 1.4); particle.angle += particle.spin * dt; }
    this.particles = this.particles.filter(p => p.age < p.life);
    for (const group of [this.impacts, this.traces, this.gathers, this.scars]) for (const item of group) item.age += dt;
    this.impacts = this.impacts.filter(p => p.age < p.life); this.traces = this.traces.filter(p => p.age < p.life); this.gathers = this.gathers.filter(p => p.age < 1.35); this.scars = this.scars.filter(p => p.age < 5);
  }
  ground(c: CanvasRenderingContext2D): void {
    for (const scar of this.scars) {
      c.save(); c.globalAlpha = Math.min(0.5, (5 - scar.age) * 0.18); c.translate(scar.p.x, scar.p.y);
      const path = Array.from({ length: 18 }, (_, i) => { const a = i / 18 * Math.PI * 2, r = scar.size * (0.8 + Math.sin(i * 4.13 + scar.seed) * 0.16); return [Math.cos(a) * r, Math.sin(a) * r * 0.55]; }).flat();
      shape(c, path, '#13242a', '#111b24', 1); c.restore();
    }
  }
  paint(c: CanvasRenderingContext2D, time: number): void {
    for (const trace of this.traces) this.trace(c, trace, time);
    for (const impact of this.impacts) this.impact(c, impact, time);
    for (const particle of this.particles) {
      const t = particle.age / particle.life; c.save(); c.globalAlpha = Math.min(1, (1 - t) * 3); c.translate(particle.x, particle.y); c.rotate(particle.angle);
      const color = COLORS[particle.element], s = particle.size;
      if (particle.kind === 'leaf') shape(c, [-s, 0, 0, -s * 0.7, s * 1.7, -s * 0.2, s * 0.6, s * 0.7], color, '#24452d', 0.75);
      else if (particle.kind === 'chip') shape(c, [-s, -s, s * 0.8, -s * 0.5, s, s, -s * 0.3, s * 0.7], '#bba381', '#303637', 1);
      else if (particle.kind === 'drop') { c.fillStyle = '#a8e0d8'; c.beginPath(); c.ellipse(0, 0, s * 0.5, s * 1.6, 0, 0, Math.PI * 2); c.fill(); }
      else { c.strokeStyle = t < 0.25 ? '#fff0bf' : color; c.lineWidth = s * 0.7; c.beginPath(); c.moveTo(-s * 2, 0); c.lineTo(s, 0); c.stroke(); }
      c.restore();
    }
    for (const gather of this.gathers) {
      for (let i = 0; i < 9; i++) {
        const t = clamp(gather.age * 1.15 - i * 0.037, 0, 1), x = gather.start.x * (1 - t) + gather.end.x * t, y = gather.start.y * (1 - t) + gather.end.y * t - Math.sin(t * Math.PI) * 70;
        c.save(); c.globalAlpha = Math.sin(t * Math.PI); oval(c, x, y, 2.6 - i * 0.13, 1.8, gather.color); c.restore();
      }
    }
  }
  private impact(c: CanvasRenderingContext2D, impact: Impact, time: number): void {
    const t = impact.age / impact.life, p = impact.p, size = 18 + impact.strength * 22, color = COLORS[impact.element];
    c.save();
    if (t < 0.2) {
      c.translate(p.x, p.y); c.rotate(impact.angle); const r = size * Math.sin(t / 0.2 * Math.PI) * 1.2;
      shape(c, [-r, 0, -r * 0.3, -r * 0.18, -r * 0.4, -r * 0.6, r * 0.1, -r * 0.25, r * 0.8, -r * 0.65, r * 0.5, -r * 0.08, r * 1.5, 0, r * 0.35, r * 0.15, r * 0.4, r * 0.5, -r * 0.1, r * 0.2], '#fff0be', '#cf6d41', 1.2);
    }
    c.restore();
    if (impact.element === 'fire') {
      c.save(); c.globalAlpha = Math.min(1, (1 - t) * 2);
      if (t > 0.23) for (let i = 0; i < 3; i++) {
        const x = p.x + Math.cos(i * 2.3 + impact.seed) * size * 0.28, y = p.y - size * t * 0.8;
        oval(c, x, y, size * (0.13 + t * 0.24), size * (0.16 + t * 0.22), '#26343c55');
      }
      if (t < 0.8) for (let i = 0; i < 4; i++) flame(c, p.x + (i - 1.5) * size * 0.24, p.y + Math.sin(i + impact.seed) * 5, size * Math.sin(Math.min(1, t / 0.8) * Math.PI) * (0.5 + i % 2 * 0.4), time, impact.seed + i);
      c.restore();
    } else if (impact.element === 'water') {
      c.save(); c.translate(p.x, p.y); c.scale(1, 0.55); c.globalAlpha = (1 - t) * 0.7;
      c.strokeStyle = color; c.lineWidth = 3 * (1 - t); c.beginPath(); c.arc(0, 0, size * (0.4 + t), 0.1, Math.PI * 1.7); c.stroke(); c.restore();
    }
  }
  private trace(c: CanvasRenderingContext2D, trace: Trace, time: number): void {
    const t = trace.age / trace.life, color = COLORS[trace.element], points = trace.points;
    c.save(); c.globalAlpha = Math.pow(1 - t, 1.4);
    line(c, points, INK + '99', trace.element === 'water' ? 15 : 8);
    line(c, points, color + 'ab', trace.element === 'water' ? 10 : trace.element === 'fire' ? 5 : 2.5);
    line(c, points, '#fff1c0', 1.1);
    if (trace.element === 'fire') for (let i = 0; i < points.length; i += 4) { const p = points[i]!; flame(c, p.x, p.y, (trace.combo ? 44 : 28) * Math.sin(t * Math.PI), time, i); }
    if (trace.element === 'wood') for (let i = 0; i < points.length; i += 5) { const p = points[i]!; shape(c, [p.x - 2, p.y, p.x + 7, p.y - 12, p.x + 10, p.y - 4, p.x + 4, p.y + 2], '#9eb877', '#203b2d', 1); }
    c.restore();
  }
  clear(): void { this.particles = []; this.impacts = []; this.traces = []; this.gathers = []; this.scars = []; }
  dispose(): void { this.off.forEach(off => off()); this.clear(); }
}
