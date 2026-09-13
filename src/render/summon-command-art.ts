import { clamp } from '../core/math';
import type { GameEvents } from '../game/contracts';
import type { RunSpirit } from '../game/rogue-combat';
import type { World } from '../game/world';
import { wolfAnchors } from './actor-anchors';
import { COLORS, glow, line, oval, shape } from './ink';
import { toArt, type Pixel } from './projection';
import { paintSpiritMaterial } from './spirit-material';

type Order = GameEvents['summonOrder'] & { age: number };
interface TargetMark { id: number; at: Pixel; scale: number; lift: number; top: number; age: number; hit: number; dying: number | null }
const paid = (e: Order) => e.kind === 'infuse' || e.kind === 'union';

/** Command acknowledgements attach to live bodies; only the actual simulation selects targets. */
export class SummonCommandArt {
  private orders: Order[] = [];
  private mark: TargetMark | null = null;
  private readonly off: (() => void)[];
  constructor(private readonly world: World, private readonly receiver: (s: RunSpirit) => Pixel) {
    this.off = [world.events.on('summonOrder', e => {
      if(world.mechanics.commands.stormOnly && world.ultimate.active)return;
      // A new instruction replaces old click rings; paid transfers may finish their short flight.
      this.orders = this.orders.filter(paid).slice(-3);
      this.orders.push({ ...e, at: { ...e.at }, points: e.points?.map(p => ({ ...p })), spiritIds: [...e.spiritIds], age: 0 });
      this.syncTarget(true);
    }), world.events.on('damage', e => {
      if (e.source === 'companion' && !e.ongoing && this.mark?.id === e.targetId && this.mark.dying === null) this.mark.hit = 1;
    }), world.events.on('death', e => {
      if (this.mark?.id === e.wolf.id) { this.mark.at = toArt(e.wolf); this.mark.dying = 0; this.mark.hit = 0; }
    }), world.events.on('reset', () => this.clear()), world.events.on('phase', e => { if (e.phase !== 'battle') this.clear(); })];
  }
  get entries(): readonly Order[] { return this.orders; }
  get target(): Readonly<TargetMark> | null { return this.mark; }
  recipientPoints(order: Order): Pixel[] {
    return this.world.mechanics.spirits.filter(s => order.spiritIds.includes(s.id)).map(s => this.receiver(s));
  }
  private syncTarget(restart = false): void {
    const cmd = this.world.mechanics.commands;
    const wolf = this.world.wolves.find(w => w.id === cmd.targetId && w.action !== 'dead');
    if (!cmd.active || this.world.phase !== 'battle') { this.mark = null; return; }
    if (!wolf) {
      if (this.mark?.dying === null) this.mark = null;
      return;
    }
    const a = wolfAnchors(wolf), old = this.mark?.id === wolf.id ? this.mark : null;
    this.mark = { id: wolf.id, at: a.ground, scale: a.scale, lift: a.lift, top: (wolf.kind && wolf.kind !== 'normal' ? 115 : 78) * a.scale,
      age: restart ? 0 : old?.age ?? 0, hit: old?.hit ?? 0, dying: null };
  }
  update(dt: number): void {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.orders = this.orders.filter(e => { e.age += step; return e.age < (e.kind === 'union' ? 1.05 : .6); });
    this.syncTarget();
    if (this.mark) {
      this.mark.age += step; this.mark.hit = Math.max(0, this.mark.hit - step / .16);
      if (this.mark.dying !== null) { this.mark.dying += step; if (this.mark.dying >= .24) this.mark = null; }
    }
  }
  ground(c: CanvasRenderingContext2D): void {
    if (this.mark) {
      const m = this.mark, open = (1 - clamp(m.age / .22, 0, 1)) ** 3, end = (m.dying ?? 0) / .24;
      c.save(); c.translate(m.at.x, m.at.y); c.globalAlpha *= 1 - end;
      const rx = (52 + open * 18 + end * 12 - m.hit * 5) * m.scale, ry = rx * .31;
      for (const [color, width] of [['#182922dc', 5], [m.hit > .1 ? '#f2deaf' : '#c7b78c', 2.1]] as const) {
        c.strokeStyle = color; c.lineWidth = width;
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, a + .12, a + 1.04 - end * .5); c.stroke(); }
      }
      c.restore();
    }
    const cmd = this.world.mechanics.commands;
    if (cmd.rally && cmd.active && this.world.phase === 'battle') {
      const p = toArt(cmd.rally), troops = cmd.troops.filter(s => s.wardId === undefined);
      const arrived = troops.length > 0 && troops.every(s => cmd.rallied(s.id));
      c.save(); c.globalAlpha *= arrived ? .43 : .85;
      const path = [{ x: p.x - 20, y: p.y }, { x: p.x, y: p.y - 10 }, { x: p.x + 20, y: p.y }, { x: p.x, y: p.y + 10 }, { x: p.x - 20, y: p.y }];
      line(c, path, '#142722cc', 5); line(c, path, '#a8c6b5', 1.7);
      if (arrived) line(c, [{ x: p.x - 5, y: p.y }, { x: p.x - 1, y: p.y + 3 }, { x: p.x + 6, y: p.y - 3 }], '#bdd0b4', 1.7);
      else for (let n = 0; n < Math.min(5, troops.length); n++) oval(c, p.x + (n - (Math.min(5, troops.length) - 1) / 2) * 7, p.y + 19, 1.8, 1.5, cmd.rallied(troops[n]!.id) ? '#bed1b6' : '#697d71');
      c.restore();
    }
  }
  paint(c: CanvasRenderingContext2D): void {
    for (const e of this.orders) this.order(c, e);
    const m = this.mark; if (!m || m.dying !== null) return;
    const open = (1 - clamp(m.age / .22, 0, 1)) ** 3, y = m.at.y - m.top - m.lift - open * 13 + m.hit * 3;
    c.save(); c.translate(m.at.x, y);
    shape(c, [-15, -9, 0, -2, 15, -9, 9, 0, 0, 6, -9, 0], m.hit > .1 ? '#f2deaf' : '#d4c097', '#172921', 2.2);
    c.restore();
  }
  private order(c: CanvasRenderingContext2D, e: Order): void {
    const p = toArt(e.at), color = e.element ? COLORS[e.element] : '#c2ceb0';
    c.save();
    if (paid(e)) {
      const q = clamp(e.age / .28, 0, 1), flight = 1 - clamp((e.age - .22) / .12, 0, 1), settle = clamp((e.age - .25) / .24, 0, 1);
      for (const to of this.recipientPoints(e)) {
        const mid = { x: (p.x + to.x) / 2, y: Math.min(p.y, to.y) - 38 };
        if (flight > 0) {
          c.globalAlpha = flight * .22; c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(mid.x, mid.y, to.x, to.y); c.strokeStyle = color; c.lineWidth = e.kind === 'union' ? 2 : 1; c.stroke();
          const x = (1-q)**2*p.x+2*(1-q)*q*mid.x+q*q*to.x, y = (1-q)**2*p.y+2*(1-q)*q*mid.y+q*q*to.y;
          c.globalAlpha = flight; glow(c,x,y,e.kind==='union'?12:8,color,.42); oval(c,x,y,3,2,color);
        }
        if (e.element && e.age >= .25 && settle < 1) {
          c.globalAlpha = Math.sin(settle * Math.PI) * .65;
          paintSpiritMaterial(c, e.element, 0, to.x, to.y, 46 + settle * 20, 30 + settle * 12, -.25, 1);
        }
      }
      // The shared battle label layer draws the order once, clear of damage and bodies.
    } else {
      // A brief directional acknowledgement replaces expanding circles at abandoned targets.
      const fade = Math.max(0, 1 - e.age / .34);
      for (const to of this.recipientPoints(e)) {
        const a = Math.atan2(p.y-to.y,p.x-to.x), reach = 12 + e.age*24;
        c.save(); c.globalAlpha = fade*.65; c.translate(to.x+Math.cos(a)*reach,to.y+Math.sin(a)*reach); c.rotate(a);
        shape(c, [5,0,-4,-3,-1,0,-4,3], color, '#20372c', .8); c.restore();
      }
    }
    c.restore();
  }
  clear(): void { this.orders = []; this.mark = null; }
  dispose(): void { this.off.forEach(off => off()); this.clear(); }
}
