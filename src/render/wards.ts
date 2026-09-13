import { clamp } from '../core/math';
import type { Ward, WardRemovalReason } from '../game/contracts';
import { COLORS, flame, glow, line, oval, shape } from './ink';
import { toArt, type Pixel } from './projection';
import { WaterSurface } from './water';
import { layoutWard, visualPower, type WardLayout, type WardNode } from './ward-layout';
import { elementState, STATE_MOTION, type ElementState } from './element-state';
import { wardRegions } from '../game/ward-geometry';
import { EarthWallMesh } from './earth-wall';

export interface PaintedObject { z: number; draw(c: CanvasRenderingContext2D): void }
interface WardArt extends WardLayout {
  ward: Ward;
  path: Path2D;
  floor: HTMLCanvasElement;
  water?: WaterSurface[];
  waterPaintAt: number;
  earth?: EarthWallMesh;
  power: number;
  pulseAt: number;
  state: ElementState;
  materialTime: number;
  lastTime: number;
  removedAt?: number;
  reason?: WardRemovalReason;
}

/** Owns only pictures and short-lived removal ghosts; it never mutates a Ward. */
export class WardPainter {
  private readonly cache = new Map<number, WardArt>();
  private frame: WardArt[] = [];
  private atlas: HTMLImageElement | null = null;
  private metal: HTMLImageElement | null = null;
  setAtlas(atlas: HTMLImageElement, metal: HTMLImageElement): void { this.atlas = atlas; this.metal = metal; }
  pulse(ward: Ward, time: number): void { this.prepare(ward).pulseAt = time; }
  retire(id: number, time: number, reason: WardRemovalReason): void {
    const art = this.cache.get(id); if (!art || reason === 'reset' || reason === 'evolved') { this.invalidate(id); return; }
    art.ward = { ...art.ward }; art.removedAt = time; art.reason = reason;
    const ghosts = [...this.cache.values()].filter(value => value.removedAt !== undefined);
    if (ghosts.length > 6) this.invalidate(ghosts[0]!.ward.id);
  }
  attackSource(ward: Ward, target: Pixel): Pixel {
    const nodes = this.prepare(ward).nodes.slice(0, 5);
    const node = nodes.reduce<WardNode | undefined>((best, p) => !best || Math.hypot(p.x - target.x, p.y - target.y) < Math.hypot(best.x - target.x, best.y - target.y) ? p : best, undefined);
    return node ? { x: node.x, y: node.y - (64 + visualPower(ward) * 22) * 0.58 } : toArt(ward);
  }
  private prepare(ward: Ward): WardArt {
    let art = this.cache.get(ward.id);
    if (art) { art.ward = ward; return art; }
    const layout = layoutWard(ward), path = new Path2D();
    for (const contour of layout.contours) {
      path.moveTo(contour[0]!.x, contour[0]!.y);
      for (const p of contour.slice(1)) path.lineTo(p.x, p.y);
      path.closePath();
    }
    const floor = document.createElement('canvas'); floor.width = layout.bounds.width; floor.height = layout.bounds.height;
    art = { ...layout, ward, path, floor, power: visualPower(ward), pulseAt: -100, state: elementState(ward), materialTime: 0, lastTime: -1, waterPaintAt: -Infinity,
      ...(ward.element === 'earth' ? { earth: new EarthWallMesh(ward) } : {}),
      ...(ward.element === 'water' ? { water: wardRegions(ward).map((region, i) => new WaterSurface(region[0]!, ward.id * 718 + i, false, region.slice(1))) } : {}) };
    this.paintFloor(art); this.cache.set(ward.id, art); return art;
  }
  invalidate(id: number): void { const art = this.cache.get(id); if (art) art.floor.width = 0; this.cache.delete(id); }
  private paintFloor(art: WardArt): void {
    // Water reuses the existing ground texture, including split regions and holes.
    if (art.water) { art.waterPaintAt = -Infinity; return; }
    const c = art.floor.getContext('2d')!, { bounds: b, ward, power, state } = art;
    c.clearRect(0, 0, b.width, b.height); c.save(); c.translate(-b.x, -b.y);
    if (ward.element === 'earth') {
      c.translate(4, 7); c.fillStyle = '#24292065'; c.fill(art.path, 'evenodd');
      c.lineJoin = 'round'; c.strokeStyle = '#302c2260'; c.lineWidth = 22; c.stroke(art.path);
      c.restore(); return;
    }
    c.save(); c.clip(art.path, 'evenodd');
    c.fillStyle = { fire: '#382b326f', wood: '#333b255b', water: '#264551', earth: '#806b4522', metal: '#59574635' }[ward.element]; c.fill(art.path, 'evenodd');
    if (state === 'weakened') { c.fillStyle = '#60726c32'; c.fill(art.path, 'evenodd'); }
    const palette = { fire: ['#211c22', '#775443', '#b77744'], wood: ['#2b352a', '#706449', '#88916b'], water: ['#315869', '#456c75', '#639288'], earth: ['#544d3b', '#9c8864', '#c0a884'], metal: ['#374545', '#888579', '#b2b4a4'] }[ward.element];
    for (let i = 0; i < art.grains.length; i++) {
      const p = art.grains[i]!; c.globalAlpha = i % 7 ? 0.28 : 0.13;
      oval(c, p.x, p.y, i % 7 ? 1 + i % 3 : 9 + i % 19, i % 7 ? 0.65 : 3 + i % 7, palette[i % 3]!);
    }
    c.globalAlpha = 1;
    if (ward.element === 'wood' || ward.element === 'metal') for (let i = 0; i < art.links.length; i++) {
      const [a, z] = art.links[i]!;
      c.beginPath(); c.moveTo(a.x, a.y);
      if (ward.element === 'wood') c.bezierCurveTo(a.x + 17, a.y - 14, z.x - 23, z.y + 10, z.x, z.y);
      else { c.lineTo(a.x + (z.x - a.x) * 0.42, z.y); c.lineTo(z.x, z.y); }
      c.strokeStyle = '#18221ddd'; c.lineWidth = ward.element === 'wood' ? 7 + power * 3 : 3; c.stroke();
      c.strokeStyle = ward.element === 'wood' ? state === 'weakened' ? '#6d6250' : '#7b6544' : state === 'enhanced' ? '#d6d4a699' : '#9f998177'; c.lineWidth = ward.element === 'wood' ? 3.2 + power * 1.5 : 1; c.stroke();
      if (ward.element === 'wood') {
        c.strokeStyle = '#b1986244'; c.lineWidth = 0.8; c.stroke();
        for (let j = 1; j < 4; j++) {
          const t = j / 4, x = a.x + (z.x - a.x) * t, y = a.y + (z.y - a.y) * t, side = (i + j) % 2 ? 1 : -1;
          c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + side * 12, y - 6, x + side * 19, y - 13); c.strokeStyle = '#67583e'; c.lineWidth = 1.5; c.stroke();
        }
      }
    }
    if (ward.element === 'fire') for (let n = 0; n < art.nodes.length; n++) {
      const p = art.nodes[n]!;
      oval(c, p.x, p.y + 1, 23 * p.size, 10 * p.size, '#181e2380');
      glow(c, p.x, p.y, 28 * p.size, '#33272b', 0.25);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.256 + n; line(c, [{ x: p.x + Math.cos(a) * 4, y: p.y + Math.sin(a) * 3 }, { x: p.x + Math.cos(a) * 17, y: p.y + Math.sin(a) * 8 }], '#a15f3777', 1.2);
      }
    }
    c.restore();
    c.lineJoin = 'round'; c.strokeStyle = { fire: '#80574155', wood: '#4b503a88', water: '#314855', earth: '#403e33', metal: '#928b7055' }[ward.element];
    c.lineWidth = 3; c.stroke(art.path);
    c.restore();
  }
  ground(c: CanvasRenderingContext2D, wards: readonly Ward[], time: number): void {
    const live = new Set(wards.map(w => w.id));
    for (const [id, art] of this.cache) if (!live.has(id) && (art.removedAt === undefined || time - art.removedAt > 0.75)) { art.floor.width = 0; this.cache.delete(id); }
    this.frame = [...wards.map(ward => this.prepare(ward)), ...[...this.cache.values()].filter(art => art.removedAt !== undefined)];
    for (const art of this.frame) {
      const ward = art.ward, power = visualPower(ward), opacity = this.opacity(art, time), grow = clamp(ward.age / 0.6, 0, 1);
      const state = elementState(ward);
      const elapsed = art.lastTime < 0 ? 0 : Math.max(0, time - art.lastTime); art.materialTime += elapsed * STATE_MOTION[state]; art.lastTime = time;
      if (power !== art.power || state !== art.state) { art.power = power; art.state = state; this.paintFloor(art); }
      c.save(); c.globalAlpha *= opacity;
      if (art.water && (time < art.waterPaintAt || time - art.waterPaintAt >= 1 / 30 - 0.0001)) {
        const layer = art.floor.getContext('2d')!, b = art.bounds;
        layer.clearRect(0, 0, b.width, b.height); layer.save(); layer.translate(-b.x, -b.y);
        for (const water of art.water) water.paint(layer, art.materialTime, 1, power, state);
        layer.restore(); art.waterPaintAt = time;
      }
      c.globalAlpha *= 0.4 + grow * 0.6; c.drawImage(art.floor, art.bounds.x, art.bounds.y);
      if (ward.element === 'earth') { c.restore(); continue; }
      c.save(); c.clip(art.path, 'evenodd');
      if (ward.element === 'fire' && ward.suppressed <= 0) for (let i = 0; i < this.fireCount(art); i++) {
        const p = art.nodes[i]!; glow(c, p.x, p.y - 4, 27 + power * 18, '#ec7a32', (0.07 + power * 0.12) * (0.9 + Math.sin(time * 6 + i * 4) * 0.1));
      }
      const flash = clamp(1 - (time - art.pulseAt) / 0.4, 0, 1);
      if (flash > 0) { c.globalAlpha *= flash * 0.22; c.strokeStyle = COLORS[ward.element]; c.lineWidth = 3; for (const link of art.links) line(c, link, COLORS[ward.element], 2); }
      c.restore();
      this.stateGround(c, art, time);
      if (grow < 1) {
        const total = art.points.reduce((sum, p, i) => { const q = art.points[(i + 1) % art.points.length]!; return sum + Math.hypot(p.x - q.x, p.y - q.y); }, 0);
        c.strokeStyle = COLORS[ward.element]; c.lineWidth = 2.3; c.setLineDash([total, total]); c.lineDashOffset = total * (1 - grow); c.stroke(art.path); c.setLineDash([]);
      }
      this.sigils(c, art, time); c.restore();
    }
  }
  objects(_wards: readonly Ward[], time: number): PaintedObject[] {
    const result: PaintedObject[] = [];
    for (const art of this.frame) {
      const ward = art.ward, power = art.power, opacity = this.opacity(art, time), state = art.state, motion = art.materialTime;
      if (ward.element === 'water') continue;
      if (ward.element === 'earth') {
        const mesh = art.earth!;
        for (const part of mesh.parts) result.push({ z: part.z, draw: c => mesh.paint(c, part, ward, opacity) });
        continue;
      }
      const points: readonly Pixel[] = art.nodes.slice(0, ward.element === 'metal' ? 5 : ward.element === 'fire' ? this.fireCount(art) : 9);
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!, node = art.nodes[i];
        result.push({ z: p.y, draw: c => {
          c.save(); c.globalAlpha *= opacity; c.translate(p.x, p.y);
          const grow = clamp((ward.age - i / Math.max(1, points.length) * 0.18) / 0.48, 0, 1);
          const emerge = 1 - Math.pow(1 - grow, 3), sink = art.removedAt === undefined ? 0 : (1 - opacity) * 5;
          c.translate(0, sink);
          if (ward.element === 'fire') {
            if (state === 'weakened') {
              oval(c, 0, 0, 10, 3, '#7e898166'); oval(c, -3, -1, 3, 1, '#aa704655');
              const drift = (time * 0.6 + i * 0.47) % 1; c.globalAlpha *= Math.sin(drift * Math.PI) * 0.32;
              oval(c, drift * 8, -7 - drift * 18, 3 + drift * 7, 2 + drift * 4, '#b2bdb4'); c.restore(); return;
            }
            const size = (34 + power * 38) * (node?.size ?? 1) * emerge * Math.sqrt(opacity) * (state === 'enhanced' ? 1.2 : 1);
            flame(c, 0, 0, size, motion, ward.id + i * 2.7);
            if (i % 3 === 0 || state === 'enhanced') flame(c, 10, -1, size * (0.4 + power * 0.15), motion, i + 10);
            const t = (time * 0.7 + i * 0.31) % 1;
            c.globalAlpha *= Math.sin(t * Math.PI) * (0.35 + power * 0.4); oval(c, Math.sin(i * 9 + t * 3) * 9, -14 - t * size, 0.85, 1.7, '#f7c983');
          } else if (this.atlas) {
            const row = ward.element === 'metal' ? 0 : 1;
            const variant = node?.variant ?? (i * 7 + ward.id) % 4;
            const size = ward.element === 'wood' ? Math.min((69 + power * 19) * (node?.size ?? 1), Math.max(22, (node?.clearance ?? 20) * 3.5)) : 64 + power * 22;
            // Reveal structures from beneath the ground instead of stretching a half-height sprite.
            c.beginPath(); c.rect(-160, -260, 320, 265); c.clip();
            if (ward.element === 'wood') c.rotate(Math.sin(motion * 1.3 + i * 3) * (state === 'enhanced' ? 0.022 : 0.012));
            // The painted rows have different heights; anchor each at its own ground contact.
            const atlas = ward.element === 'metal' ? this.metal! : this.atlas;
            const band = [[0, 1], [0.417, 0.732], [0.732, 1]][row]!;
            const cw = atlas.naturalWidth / 4, sy = band[0]! * atlas.naturalHeight, ch = (band[1]! - band[0]!) * atlas.naturalHeight;
            const height = ward.element === 'metal' ? size * (0.98 + i % 3 * 0.13) : size * ch / cw;
            const width = height * cw / ch;
            c.translate(0, height * 0.92 * (1 - emerge));
            if (state === 'weakened') c.filter = 'saturate(.28) brightness(.72)';
            c.drawImage(atlas, variant * cw, sy, cw, ch, -width / 2, -height * 0.94, width, height); c.filter = 'none';
            if (ward.element === 'wood' && state !== 'normal') {
              for (let leaf = 0; leaf < 3; leaf++) {
                const x = (leaf - 1) * size * 0.19, y = -height * 0.45 + Math.sin(motion * 2 + leaf) * 2;
                if (state === 'enhanced') {
                  c.save(); c.translate(x, y + Math.sin(i * 7 + leaf * 3) * 4); c.rotate((leaf - 1) * 0.4 + Math.sin(i) * 0.2);
                  c.strokeStyle = '#637847'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(0, 8); c.quadraticCurveTo(3, 1, 1, -5); c.stroke();
                  c.beginPath(); c.moveTo(1, -1); c.quadraticCurveTo(-7, -2, -5, -8); c.quadraticCurveTo(2, -7, 1, -1); c.fillStyle = leaf % 2 ? '#8faa70' : '#9bb882'; c.fill();
                  c.beginPath(); c.moveTo(2, 2); c.quadraticCurveTo(2, -4, 8, -4); c.quadraticCurveTo(8, 1, 2, 2); c.fillStyle = '#78905b'; c.fill(); c.restore();
                }
                else { const fall = (time * 0.45 + leaf * 0.3 + i) % 1; c.save(); c.globalAlpha *= Math.sin(fall * Math.PI); shape(c, [x, y + fall * 23, x + 4, y + 4 + fall * 23, x + 8, y + 2 + fall * 23, x + 3, y - 2 + fall * 23], '#9c8861', '#504e3d', 0.6); c.restore(); }
              }
            }
            if (ward.element === 'metal') {
              const shine = state === 'weakened' ? 0 : Math.pow(Math.max(0, Math.sin(motion * 1.7 + i * 2.7)), state === 'enhanced' ? 4 : 12) * (0.35 + power * 0.45);
              if (state === 'enhanced') { c.save(); c.globalAlpha *= 0.8; line(c, [{ x: -1, y: -height * 0.2 }, { x: 0, y: -height * 0.7 }, { x: width * 0.14, y: -height * 0.88 }], '#e6d99d', 1.5); c.restore(); }
              c.globalAlpha *= shine; line(c, [{ x: -4, y: -size * 0.35 }, { x: 3, y: -size * 0.44 }], '#fff2bd', 1.4);
            }
          }
          c.restore();
        } });
      }
    }
    return result;
  }
  private fireCount(art: WardArt): number { return Math.max(1, Math.ceil(art.nodes.length * (0.65 + art.power * 0.35))); }
  private stateGround(c: CanvasRenderingContext2D, art: WardArt, time: number): void {
    if (art.state === 'normal') return;
    c.save(); c.clip(art.path, 'evenodd');
    if (art.state === 'enhanced') {
      const paths = art.ward.element === 'earth' ? art.edge.filter((_, i) => i % 3 === 0).map((p, i) => [p, art.edge[(i * 3 + 2) % art.edge.length]!] as [Pixel, Pixel]) : art.links;
      for (let i = 0; i < paths.length; i++) {
        const [a, b] = paths[i]!, t = (art.materialTime * 0.8 + i * 0.29) % 1;
        c.globalAlpha = Math.sin(t * Math.PI) * 0.65 * this.opacity(art, time);
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        line(c, [{ x, y }, { x: x + (b.x - a.x) * 0.12, y: y + (b.y - a.y) * 0.12 }], COLORS[art.ward.element], art.ward.element === 'earth' ? 3 : 1.7);
      }
    } else if (art.ward.element === 'earth' || art.ward.element === 'metal') for (let i = 0; i < art.edge.length; i += 6) {
      const p = art.edge[i]!, drift = (time * 0.55 + i * 0.12) % 1; c.globalAlpha = Math.sin(drift * Math.PI) * 0.35 * this.opacity(art, time);
      oval(c, p.x + drift * 9, p.y - drift * 6, 4 + drift * 5, 2 + drift * 2, '#afa58c');
    }
    c.restore();
  }
  private opacity(art: WardArt, time: number): number { return art.removedAt === undefined ? 1 : clamp(1 - (time - art.removedAt) / 0.75, 0, 1); }
  private sigils(c: CanvasRenderingContext2D, art: WardArt, time: number): void {
    const grow = clamp(art.ward.age / 0.6, 0, 1), flash = clamp(1 - (time - art.pulseAt) / 0.4, 0, 1);
    c.save(); c.globalAlpha *= grow * (art.state === 'weakened' ? 0.27 : art.state === 'enhanced' ? 0.9 : 0.22 + art.ward.charge * 0.43 + flash * 0.25);
    const stride = Math.max(1, Math.ceil(art.edge.length / 3));
    for (let i = 0; i < art.edge.length; i += stride) {
      const p = art.edge[i]!; c.save(); c.translate(p.x, p.y); c.scale(1, 0.6);
      line(c, [{ x: -7, y: 0 }, { x: 0, y: -7 }, { x: 7, y: 0 }, { x: 0, y: 7 }], COLORS[art.ward.element], 1.5, true);
      line(c, [{ x: -3, y: -2 }, { x: 3, y: 2 }], '#e6dbac', 1); c.restore();
      if (art.state !== 'normal') {
        c.save(); c.translate(p.x, p.y - 12); line(c, [{ x: -3, y: 0 }, { x: 3, y: 0 }], art.state === 'enhanced' ? '#eee4b7' : '#afb8ac', 1.8);
        if (art.state === 'enhanced') line(c, [{ x: 0, y: -3 }, { x: 0, y: 3 }], '#eee4b7', 1.8); c.restore();
      }
    }
    c.restore();
  }
  clear(): void { for (const art of this.cache.values()) art.floor.width = 0; this.cache.clear(); this.frame = []; }
}
