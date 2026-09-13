import type { RunSpirit } from '../game/rogue-combat';
import { spiritRestriction, type SpiritRestriction } from '../game/spirit-restrictions';
import type { World } from '../game/world';
import { COLORS, line, shape } from './ink';
import type { Pixel } from './projection';
import { paintSpiritMaterial } from './spirit-material';

interface RestrictionArt { state: SpiritRestriction | null; age: number; weight: number }
/** A small seal closes the casting point, then peels away when the actual restriction ends. */
export class SpiritRestrictionArt {
  private readonly entries = new Map<number, RestrictionArt>();
  get(id: number): Readonly<RestrictionArt> | undefined { return this.entries.get(id); }
  update(world: World, dt: number): void {
    if (world.phase !== 'battle') { this.clear(); return; }
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0, live = new Set(world.mechanics.spirits.map(s => s.id));
    for (const id of this.entries.keys()) if (!live.has(id)) this.entries.delete(id);
    for (const s of world.mechanics.spirits) {
      const state = spiritRestriction(world, s);
      let e = this.entries.get(s.id); if (!e && !state) continue;
      if (!e) { e = { state, age: 0, weight: 0 }; this.entries.set(s.id, e); }
      if (state !== e.state) { e.state = state; e.age = 0; }
      e.age += step; e.weight += ((state ? 1 : 0) - e.weight) * Math.min(1, step * (state ? 14 : 10));
      if (!state && e.age >= .36) this.entries.delete(s.id);
    }
  }
  paint(c: CanvasRenderingContext2D, spirit: RunSpirit, source: Pixel): void {
    const e = this.entries.get(spirit.id); if (!e) return;
    c.save(); c.translate(source.x, source.y + 12);
    if (e.state) {
      const enter = Math.min(1, e.age / .16), span = 30 + (1 - enter) * 19;
      c.globalAlpha *= e.weight;
      for (const n of [-1, 1]) {
        const points = [{ x: -span, y: n * 7 - 5 }, { x: -8, y: n * 3 }, { x: span, y: n * 7 + 5 }];
        line(c, points, '#182b2bdd', 5); line(c, points, '#9f8e96', 1.7);
      }
      shape(c, [-13,-17,13,-17,13,17,-13,17], '#283332eb', '#ae9798', 1.4);
      c.font = 'bold 22px KaiTi,serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#c2afb0'; c.fillText(e.state === 'silenced' ? '封' : '压', 0, 1);
    } else {
      const t = Math.min(1, e.age / .36), fade = 1 - t;
      c.globalAlpha *= fade * .65;
      for (const sign of [-1, 1]) { c.save(); c.translate(sign * (12 + t * 24), t * 12); c.rotate(sign * t * .6); line(c, [{x:0,y:-13},{x:0,y:12}], '#ac9a9e', 2.5); c.restore(); }
      paintSpiritMaterial(c, spirit.element, 0, 0, -7, 38 + t * 24, 26 + t * 18, -.2, Math.sin(t * Math.PI));
      for (let n = 0; n < 3; n++) line(c, [{x:(n-1)*12,y:-5-t*22},{x:(n-1)*14,y:-11-t*26}], COLORS[spirit.element], 1.3);
    }
    c.restore();
  }
  clear(): void { this.entries.clear(); }
}
