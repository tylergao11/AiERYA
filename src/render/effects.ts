import { clamp, random } from '../core/math';
import type { Element, Hit, Ward } from '../game/contracts';
import type { World } from '../game/world';
import { COLORS, flame, glow, line, oval, shape } from './ink';
import { toArt, type Pixel } from './projection';
import { wolfAnchors } from './actor-anchors';
import { paintStroke, strokeGeometry, type StrokeGeometry } from './stroke';
import { wardContours } from '../game/ward-geometry';
import { MAGE } from '../game/terrain';

interface Particle extends Pixel { vx: number; vy: number; age: number; life: number; size: number; angle: number; spin: number; element: Element; kind: 'ember' | 'leaf' | 'drop' | 'chip' | 'shard' }
interface Impact { p: Pixel; age: number; life: number; element: Element; strength: number; angle: number; seed: number }
interface Trace { geometry: StrokeGeometry; element: Element; age: number; life: number; width?: number; charge?: number }
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
  private readonly wardStates = new Map<number, { points: Pixel[]; health: number }>();
  private readonly rootedTargets = new Map<number, Pixel>();
  constructor(private readonly world: World, private readonly attackSource: (ward: Ward, target: Pixel) => Pixel) {
    this.off = [
      world.events.on('hit', hit => this.hit(hit)),
      world.events.on('death', ({ wolf, element }) => this.spray(toArt(wolf), element, 12, 0.65)),
      world.events.on('spiritRecovered', ({ at }) => {
        for (let i = 0; i < 2 && this.gathers.length < 12; i++) {
          const angle = this.rng() * Math.PI * 2;
          const slayer = world.build.is('slayer'), spread = slayer ? .6 : 3;
          this.gathers.push({ start: toArt({ x: at.x + Math.cos(angle) * spread, z: at.z + Math.sin(angle) * spread }, 0.5), end: toArt(slayer ? MAGE : at, 2.3), age: 0, color: slayer ? '#ffe2a2' : '#d7e9ce' });
        }
      }),
      world.events.on('reaction', ({ at, result, kind }) => this.spray(toArt(at, 0.5), result, kind === 'generate' ? 4 : 6, 0.4)),
      world.events.on('ward', ({ ward }) => { const points = wardContours(ward).flat().map(p => toArt(p)); this.wardStates.set(ward.id, { points, health: ward.health }); this.contourBurst(points, ward.element, 0.35); }),
      world.events.on('wardMoved', ({ ward }) => { this.wardStates.set(ward.id, { points: wardContours(ward).flat().map(p => toArt(p)), health: ward.health }); }),
      world.events.on('wardRemoved', ({ id, at, element, reason }) => { const state = this.wardStates.get(id); if (reason !== 'reset') this.contourBurst(state?.points ?? [toArt(at)], element, reason === 'destroyed' ? 0.7 : 0.35); this.wardStates.delete(id); }),
      world.events.on('pulse', ({ ward, targets }) => { if (ward.element === 'metal') for (const id of targets) { const wolf = world.wolves.find(w => w.id === id); if (wolf && this.traces.length < 24) { const target = wolfAnchors(wolf).body; this.traces.push({ geometry: strokeGeometry([this.attackSource(ward, target), target]), element: 'metal', age: 0, life: 0.18 }); } } }),
      world.events.on('invoke', ({ points, element, width, charge = 0 }) => {
        if (this.traces.length < 24) this.traces.push({ geometry: strokeGeometry(points.map(p => toArt(p))), element, width, charge, age: 0, life: { metal: 0.3, wood: 0.7, water: 0.9, fire: 0.75, earth: 0.65 }[element] + charge * .07 });
        const first = points[0]!, last = points.at(-1)!, length = Math.hypot(last.x - first.x, last.z - first.z) || 1;
        this.spray(toArt(last), element, 6 + charge * 4, 0.45 + charge * .2, Math.atan2((last.z - first.z) / length, (last.x - first.x) / length));
      }),
      world.events.on('phase', ({ phase }) => { if (phase !== 'battle') this.clearCombat(); }),
      world.events.on('reset', () => this.clear()),
    ];
  }
  get count(): number { return this.particles.length; }
  get objects(): number { return this.impacts.length + this.traces.length + this.gathers.length + this.scars.length; }
  private hit(hit: Hit): void {
    if (this.impacts.length >= 48 || hit.strength <= 0) return;
    // Summons own painted contact VFX; retain debris without a second generic starburst.
    if(hit.source==='companion'){this.spray(toArt(hit,.5),hit.element,5,.35);return;}
    const wolf = this.world.wolves.find(w => w.id === hit.target);
    const p = wolf && (hit.element === 'fire' || hit.element === 'metal') ? wolfAnchors(wolf).body : toArt(hit);
    const strength = clamp(hit.strength, 0.15, 2), angle = Math.atan2(hit.direction.z * 0.65, hit.direction.x);
    const recent = this.impacts.find(i => i.element === hit.element && i.age < 0.07 && Math.hypot(i.p.x - p.x, i.p.y - p.y) < 16);
    if (recent) { recent.strength = Math.max(recent.strength, strength); return; }
    this.impacts.push({ p, age: 0, life: hit.element === 'fire' ? 1.05 : hit.element === 'metal' ? 0.32 : 0.65, element: hit.element, strength, angle, seed: this.rng() * 20 });
    this.spray(p, hit.element, Math.ceil(8 + strength * 10), strength, angle);
    if (hit.element === 'fire' && this.scars.length < 32) this.scars.push({ p: toArt(hit), age: 0, size: 10 + strength * 18, seed: this.rng() * 30 });
  }
  private contourBurst(points: Pixel[], element: Element, strength: number): void {
    const stride = Math.max(1, Math.ceil(points.length / 20));
    for (let i = 0; i < points.length; i += stride) this.spray(points[i]!, element, 2, strength);
  }
  private spray(p: Pixel, element: Element, count: number, strength: number, direction?: number): void {
    const n = Math.min(count, this.budget - this.particles.length);
    for (let i = 0; i < n; i++) {
      const a = direction === undefined ? this.rng() * Math.PI * 2 : direction + (this.rng() - 0.5) * 2.2, speed = (28 + this.rng() * 100) * strength;
      this.particles.push({ ...p, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.7 - 30, age: 0, life: 0.35 + this.rng() * 0.6, size: 1.2 + this.rng() * (element === 'wood' ? 3 : 2), angle: a, spin: (this.rng() - 0.5) * 9, element, kind: element === 'wood' ? 'leaf' : element === 'water' ? 'drop' : element === 'earth' ? 'chip' : element === 'metal' ? 'shard' : 'ember' });
    }
  }
  update(dt: number): void {
    const live = new Set(this.world.wolves.map(wolf => wolf.id));
    for (const [id, at] of this.rootedTargets) if (!live.has(id)) { this.spray(at, 'wood', 3, 0.2); this.rootedTargets.delete(id); }
    for (const wolf of this.world.wolves) {
      if (wolf.rooted > 0 && wolf.action !== 'dead') this.rootedTargets.set(wolf.id, toArt(wolf));
      else if (this.rootedTargets.has(wolf.id)) { this.spray(toArt(wolf), 'wood', 3, 0.2); this.rootedTargets.delete(wolf.id); }
    }
    for (const ward of this.world.wards) {
      const previous = this.wardStates.get(ward.id);
      if (previous && ward.element === 'earth' && ward.health < previous.health) {
        const nearest = this.world.wolves.find(w => w.action !== 'dead' && previous.points.some(p => Math.hypot(toArt(w).x - p.x, toArt(w).y - p.y) < 30));
        if (nearest) this.hit({ ...nearest, element: 'earth', direction: { x: 0, z: 1 }, strength: 0.3 });
      }
      if (previous) previous.health = ward.health;
    }
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
    for (const trace of this.traces) paintStroke(c, trace.geometry, trace.element, time, trace.age, trace.life, false, trace.width, trace.charge);
    for (const impact of this.impacts) this.impact(c, impact, time);
    c.save(); c.globalAlpha *= Math.max(0.45, 1 - this.particles.length / 950);
    for (const particle of this.particles) {
      const t = particle.age / particle.life; c.save(); c.globalAlpha *= Math.min(1, (1 - t) * 3); c.translate(particle.x, particle.y); c.rotate(particle.angle);
      const color = COLORS[particle.element], s = particle.size;
      if (particle.kind === 'leaf') shape(c, [-s, 0, 0, -s * 0.7, s * 1.7, -s * 0.2, s * 0.6, s * 0.7], color, '#24452d', 0.75);
      else if (particle.kind === 'chip') shape(c, [-s, -s, s * 0.8, -s * 0.5, s, s, -s * 0.3, s * 0.7], '#bba381', '#303637', 1);
      else if (particle.kind === 'shard') shape(c, [-s * 2, 0, s, -s * 0.4, s * 2, 0, 0, s * 0.5], '#d3d8c6', '#4b5854', 0.5);
      else if (particle.kind === 'drop') { c.fillStyle = '#a8e0d8'; c.beginPath(); c.ellipse(0, 0, s * 0.5, s * 1.6, 0, 0, Math.PI * 2); c.fill(); }
      else { c.strokeStyle = t < 0.25 ? '#fff0bf' : color; c.lineWidth = s * 0.7; c.beginPath(); c.moveTo(-s * 2, 0); c.lineTo(s, 0); c.stroke(); }
      c.restore();
    }
    c.restore();
    for (const gather of this.gathers) {
      for (let i = 0; i < 9; i++) {
        const t = clamp(gather.age * 1.15 - i * 0.037, 0, 1), x = gather.start.x * (1 - t) + gather.end.x * t, y = gather.start.y * (1 - t) + gather.end.y * t - Math.sin(t * Math.PI) * 70;
        c.save(); c.globalAlpha = Math.sin(t * Math.PI); oval(c, x, y, 2.6 - i * 0.13, 1.8, gather.color); c.restore();
      }
    }
  }
  private impact(c: CanvasRenderingContext2D, impact: Impact, time: number): void {
    const t = impact.age / impact.life, p = impact.p, size = 18 + impact.strength * 22;
    c.save(); c.globalAlpha = Math.min(1, (1 - t) * 2);
    if (impact.element === 'metal') {
      c.translate(p.x, p.y); c.rotate(impact.angle);
      const r = size * (0.55 + t * 0.7);
      shape(c, [-r, 1, r * 0.75, -5 * (1 - t), r * 1.6, -2, r * 0.25, 3 * (1 - t)], '#f0e5bf', '#5a6666', 0.7);
      line(c, [{ x: -6, y: -size * 0.35 }, { x: 1, y: 2 }, { x: 7, y: size * 0.25 }], '#c8d6ca', 1.7 * (1 - t));
    } else if (impact.element === 'fire') {
      if (t < 0.18) {
      c.save();
      c.translate(p.x, p.y); c.rotate(impact.angle); const r = size * Math.sin(t / 0.2 * Math.PI) * 1.2;
      shape(c, [-r, 0, -r * 0.3, -r * 0.18, -r * 0.4, -r * 0.6, r * 0.1, -r * 0.25, r * 0.8, -r * 0.65, r * 0.5, -r * 0.08, r * 1.5, 0, r * 0.35, r * 0.15, r * 0.4, r * 0.5, -r * 0.1, r * 0.2], '#fff0be', '#cf6d41', 1.2);
      c.restore();
      }
      glow(c, p.x, p.y - 8, size * 1.3, '#ee7430', Math.pow(1 - t, 3) * 0.22);
      if (t > 0.23) for (let i = 0; i < 3; i++) {
        const x = p.x + Math.cos(i * 2.3 + impact.seed) * size * 0.28 + t * 9, y = p.y - size * t * 0.8;
        oval(c, x, y, size * (0.13 + t * 0.24), size * (0.16 + t * 0.22), '#26343c55');
      }
      if (t < 0.8) for (let i = 0; i < 4; i++) flame(c, p.x + (i - 1.5) * size * 0.24, p.y + Math.sin(i + impact.seed) * 5, size * Math.sin(Math.min(1, t / 0.8) * Math.PI) * (0.5 + i % 2 * 0.4), time, impact.seed + i);
    } else if (impact.element === 'water') {
      c.translate(p.x, p.y);
      for (let i = 0; i < 3; i++) {
        const r = size * (0.2 + t * 0.7 + i * 0.17);
        c.strokeStyle = i === 0 ? '#c3ddd1' : '#79aaa8'; c.lineWidth = (2.8 - i * 0.5) * (1 - t); c.beginPath(); c.ellipse(0, i * 2, r, r * 0.34, 0, i * 1.8, i * 1.8 + 2.7); c.stroke();
      }
      if (t < 0.7) for (let i = 0; i < 5; i++) {
        const x = (i - 2) * size * 0.2, h = size * Math.sin(t / 0.7 * Math.PI) * (0.28 + i % 2 * 0.2);
        shape(c, [x - 4, 1, x - 5, -h * 0.6, x, -h, x + 2, -h * 0.6, x + 8, 3], '#80b9b3aa', '#b4d8cb', 0.6);
      }
    } else if (impact.element === 'wood') {
      c.translate(p.x, p.y);
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * size * 0.35, rise = Math.sin(Math.min(1, t / 0.8) * Math.PI) * size * 0.65;
        c.beginPath(); c.moveTo(x - 10, 5); c.bezierCurveTo(x - 2, -rise, x + 12, -rise * 0.6, x + 8, -4);
        c.strokeStyle = '#253329'; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#a18c5b'; c.lineWidth = 2.5; c.stroke();
      }
    } else {
      c.translate(p.x, p.y);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + impact.seed, r = size * (0.2 + t * 0.6);
        line(c, [{ x: 0, y: 0 }, { x: Math.cos(a) * r * 0.5, y: Math.sin(a) * r * 0.3 }, { x: Math.cos(a + 0.2) * r, y: Math.sin(a + 0.2) * r * 0.55 }], '#423e30', 1.6 * (1 - t));
        oval(c, Math.cos(a) * r, Math.sin(a) * r * 0.3 - t * 8, 4 + t * 8, 3 + t * 4, '#aa977a30');
      }
    }
    c.restore();
  }
  private clearCombat(): void { this.particles = []; this.impacts = []; this.traces = []; this.gathers = []; this.scars = []; this.rootedTargets.clear(); }
  clear(): void { this.clearCombat(); this.wardStates.clear(); }
  dispose(): void { this.off.forEach(off => off()); this.clear(); }
}
