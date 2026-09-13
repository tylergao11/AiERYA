import type { GameEvents } from '../game/contracts';
import type { World } from '../game/world';
import { COLORS, line, shape } from './ink';
import { ART, toArt, type ViewportRect } from './projection';
import { paintStroke, strokeGeometry, strokePoint, type StrokeGeometry } from './stroke';
import type { CombatStroke } from '../game/combat';
import { paintSlayerImpact, paintOpeningImpact, paintReturnImpact, blade } from './slayer-blade';
import { clamp } from '../core/math';
import { slayerDetailScale } from './slayer-readability';
import { slayerReturnWindow, returnWindowLabel, returnGestureLabel, type SlayerReturnGesture } from '../game/slayer-return-window';
import { strokeCaptionOffset } from './slayer-charge';

type Impact = GameEvents['slayerStrike'] & { age: number; life: number; angle: number; pure?: boolean; blocked?: boolean; opening?: boolean; returning?: boolean };
interface Trail { geometry: StrokeGeometry; age: number; life: number; element: GameEvents['invoke']['element']; level: number; returning?: boolean; weight?: number }
/** Slayer-owned art: converging steel, rebound ink and visible follow-up openings. */
export class SlayerVfx {
  private impacts: Impact[] = [];
  private trails: Trail[] = [];
  private savedStroke?: CombatStroke;
  private savedGeometry?: StrokeGeometry;
  private readonly off: (() => void)[];
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  get reducedMotion(): boolean { return this.reduced.matches; }
  get objectCount(): number { return this.impacts.length + this.trails.length; }
  constructor(private readonly world: World) {
    this.off = [world.events.on('slayerStrike', e => {
      if (!e.hits || !e.level && !e.kills && !e.rush && !e.openings?.length) return;
      if (e.guarded === e.hits && !e.kills) return;
      const direction = e.direction ?? { x: 1, z: 0 };
      if (e.openings?.length) {
        const contacts: typeof e.openings[number][] = [];
        for (const at of e.openings) {
          if (contacts.length >= 8) break;
          if (contacts.some(p => Math.hypot((p.x-at.x)*ART.unitX,(p.z-at.z)*ART.unitY) < 50)) continue;
          contacts.push(at);
          if (this.impacts.length >= 8) this.impacts.shift();
          this.impacts.push({ ...e, at, openings: undefined, opening: true, age: 0, life: .38, angle: Math.atan2(direction.z * ART.unitY, direction.x * ART.unitX) });
        }
        return;
      }
      if (this.impacts.length >= 8) this.impacts.shift();
      this.impacts.push({ ...e, age: 0, life: e.level >= 2 ? .55 : e.rush ? .36 : .24, angle: Math.atan2(direction.z * ART.unitY, direction.x * ART.unitX) });
    }), world.events.on('slayerGuarded', e => {
      if (this.impacts.some(v => v.blocked && Math.hypot(v.at.x - e.at.x, v.at.z - e.at.z) < 2 && v.age < .12)) return;
      if (this.impacts.length >= 8) this.impacts.shift();
      this.impacts.push({ at: e.at, element: 'metal', age: 0, life: .48, angle: 0, level: 0, hits: 1, kills: 0, investment: Math.min(1, e.amount / 30), combo: 0, tier: 0, burst: 0, blocked: true });
    }), world.events.on('slayerFinisher', e => {
      // The cast already has a blade trail; reserve the impact bloom for actual contact.
      if ((e.hits ?? 0) <= (e.guarded ?? 0)) return;
      if (this.impacts.length >= 8) this.impacts.shift();
      const direction = e.direction ?? { x: 0, z: 1 };
      this.impacts.push({ ...e, age: 0, life: .8, angle: Math.atan2(direction.z * ART.unitY, direction.x * ART.unitX), level: 3, hits: 1, kills: 0, investment: 1, combo: 0, tier: 0, burst: 1, pure: true });
    }), world.events.on('slayerReturn',e=>{
      if(e.points.length>=2){
        if(this.trails.length>=6)this.trails.shift();
        this.trails.push({geometry:strokeGeometry(e.points.map(p=>toArt(p))),age:0,life:.38,element:e.element,level:1,returning:true,weight:Math.min(1,e.investment)});
      }
      const contacts:typeof e.contacts[number][]=[];
      for(const at of e.contacts){
        if(contacts.length>=8)break;
        if(contacts.some(p=>Math.hypot((p.x-at.x)*ART.unitX,(p.z-at.z)*ART.unitY)<50))continue;
        contacts.push(at);if(this.impacts.length>=8)this.impacts.shift();
        this.impacts.push({...e,at,level:1,kills:0,combo:0,tier:0,burst:0,age:0,life:.32,returning:true,angle:Math.atan2(e.direction.z*ART.unitY,e.direction.x*ART.unitX)});
      }
    }), world.events.on('invoke', e => {
      if (!world.build.is('slayer') || (e.charge ?? 0) < 2 || e.points.length < 2) return;
      if (this.trails.length >= 6) this.trails.shift();
      this.trails.push({ geometry: strokeGeometry(e.points.map(p => toArt(p))), age: 0, life: .48, element: e.element, level: e.charge! });
    }), world.events.on('phase', () => this.clear()), world.events.on('reset', () => this.clear())];
  }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.impacts = this.impacts.filter(e => { e.age += dt; return e.age < e.life; });
    this.trails = this.trails.filter(e => { e.age += dt; return e.age < e.life; });
  }
  ground(c: CanvasRenderingContext2D, cameraScale = 1, captionBounds?: ViewportRect, gesture: SlayerReturnGesture | null = null): void {
    if (!this.reduced.matches) for (const e of this.impacts) {
      if (e.level < 2 || e.age < .06) continue;
      const at = toArt(e.at), t = e.age / e.life;
      c.save(); c.translate(at.x, at.y); c.globalAlpha *= (1 - t) * .32 * Math.min(1, e.investment);
      for (let i = 0; i < 8; i++) {
        const a = i * 2.399, r = (e.pure ? 125 : 65) * (.3 + Math.sqrt(t));
        c.save(); c.translate(Math.cos(a) * r, Math.sin(a) * r * .45); c.rotate(a);
        shape(c, [-16, 2, -4, -6, 14, -2, 5, 5, -11, 6], '#1a2522', '#1a2522', 0); c.restore();
      }
      c.restore();
    }
    const saved = this.world.slayerTechniques.returnCut;
    const window = slayerReturnWindow(this.world);
    if (!saved || !window) { this.savedStroke = undefined; this.savedGeometry = undefined; return; }
    if (saved.stroke !== this.savedStroke) { this.savedStroke = saved.stroke; this.savedGeometry = strokeGeometry(saved.stroke.points.map(p => toArt(p))); }
    c.save(); c.globalAlpha *= Math.min(window.state === 'ready' ? .6 : .3, saved.remaining);
    paintStroke(c, this.savedGeometry!, saved.element, this.world.time, 0, 1, true, saved.stroke.width, 1);
    c.restore();
    const at = toArt(saved.stroke.points.at(-1)!);
    const detail = slayerDetailScale(cameraScale);
    c.save(); c.globalAlpha *= Math.min(1, saved.remaining * 3);
    const linked=gesture?.mode==='remote'||gesture?.mode==='overlap';
    const tint = linked || !gesture && window.state === 'ready' ? '#e1edcd' : gesture?.mode==='guarded' || window.state === 'guarded' ? '#edb894' : '#bac4b3';
    c.fillStyle = tint; c.font = `bold ${17 * detail}px KaiTi, serif`; c.textAlign = 'center';
    c.strokeStyle = '#10201e'; c.lineWidth = 3 * detail;
    const label = gesture ? returnGestureLabel(gesture) : returnWindowLabel(window);
    const caption = strokeCaptionOffset(label.length * 17 * detail * cameraScale, 24 * detail * cameraScale, captionBounds);
    c.strokeText(label, at.x + caption.x / cameraScale, at.y + caption.y / cameraScale);
    c.fillText(label, at.x + caption.x / cameraScale, at.y + caption.y / cameraScale);
    // Small foot brackets identify current occupants; no particles or pulsing per enemy.
    if (window.state === 'ready') for (const contact of gesture?.mode==='remote'?gesture.contacts:window.contacts) {
      const p = toArt(contact), size = Math.min(1.5, detail);
      c.save(); c.translate(p.x, p.y); c.scale(size, size);
      for (const side of [-1, 1]) {
        const edge = [{ x: side * 14, y: -3 }, { x: side * 21, y: 1 }, { x: side * 14, y: 5 }];
        line(c, edge, '#172522', 4); line(c, edge, tint, 1.8);
      }
      c.restore();
    }
    if(gesture){
      const p=toArt(gesture.at),size=Math.min(1.6,detail);c.save();c.translate(p.x,p.y);c.scale(size,size);
      shape(c,[-11,0,0,-8,11,0,0,8],'#172822',tint,1.8);
      if(linked){line(c,[{x:-5,y:0},{x:0,y:4},{x:5,y:-3}],tint,1.5);}
      c.restore();
      if(linked)for(const t of [.2,.5,.8]){
        const p=strokePoint(this.savedGeometry!,this.savedGeometry!.length*t);
        c.save();c.translate(p.x,p.y);c.rotate(p.angle+Math.PI);c.scale(size,size);c.globalAlpha*=.65;
        line(c,[{x:-5,y:-3},{x:0,y:0},{x:-5,y:3}],tint,1.5);c.restore();
      }
    }
    c.restore();
  }
  paint(c: CanvasRenderingContext2D, cameraScale = 1): void {
    const detail = slayerDetailScale(cameraScale);
    let guardLabels = 0;
    for (const trail of this.trails) {
      const t = trail.age / trail.life;
      c.save(); c.globalAlpha *= Math.pow(1 - t, 1.6) * (this.reduced.matches ? .4 : .9) * (trail.weight??1);
      const tint = COLORS[trail.element];
      if(trail.returning){c.save();c.globalAlpha*=.45;}
      line(c, trail.geometry.points, '#102023', trail.returning?8:9 + trail.level * 2);
      line(c, trail.geometry.points, trail.returning?'#bbd8bb':tint, trail.returning?4:5 + trail.level);
      line(c, trail.geometry.points, '#fff5d9', (trail.returning?1.7:2.5) * Math.min(1.6, detail));
      if(trail.returning)c.restore();
      if (!this.reduced.matches) {
        const p = strokePoint(trail.geometry, trail.geometry.length * clamp(trail.age / .16, 0, 1));
        c.translate(p.x, p.y); c.rotate(p.angle); blade(c, trail.returning?82:68 + trail.level * 15, trail.returning?7:13, '#fff6df');
      }
      c.restore();
    }
    for (const wolf of this.world.wolves) if (wolf.action !== 'dead' && this.world.slayerTechniques.openings.has(wolf.id)) {
      const p = toArt(wolf, 1.8); c.save(); c.translate(p.x, p.y); c.scale(Math.min(1.4, detail), Math.min(1.4, detail));
      for(const side of [-1,1]) {
        const edge=[{x:side*10,y:-5},{x:side*3,y:1},{x:side*8,y:9}];
        line(c,edge,'#172522',4);line(c,edge,'#f2c591',2);
      }
      c.restore();
    }
    for (const e of this.impacts) {
      const p = toArt(e.at, e.opening ? 1.8 : .8);
      c.save(); c.translate(p.x, p.y); c.globalAlpha *= Math.min(1, e.investment);
      if (e.opening) {
        const size = Math.min(1.4, detail); c.scale(size, size);
        paintOpeningImpact(c, e.age, e.life, e.angle, this.reduced.matches); c.restore(); continue;
      }
      if(e.returning){
        const size=Math.min(1.4,detail);c.scale(size,size);
        paintReturnImpact(c,e.age,e.life,e.angle,this.reduced.matches);c.restore();continue;
      }
      if (e.blocked) {
        const guardScale = Math.min(1.6, detail); c.scale(guardScale, guardScale);
        c.globalAlpha *= 1 - e.age / e.life; c.strokeStyle = '#b8d3d6'; c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, 24, -.9, Math.PI + .9); c.stroke();
        line(c, [{ x: -17, y: -17 }, { x: -30, y: -28 }], '#e9dbb9', 2);
        line(c, [{ x: 17, y: -17 }, { x: 30, y: -28 }], '#e9dbb9', 2);
        if (detail <= 1.4 || guardLabels++ === 0) {
          const labelScale = detail / guardScale;
          c.font = `bold ${17 * labelScale}px KaiTi,serif`; c.textAlign = 'center'; c.fillStyle = '#e6dbc5';
          c.strokeStyle = '#10201e'; c.lineWidth = 3 * labelScale; c.strokeText('弹刀 · 火破', 0, -40 * labelScale); c.fillText('弹刀 · 火破', 0, -40 * labelScale);
        }
        c.restore(); continue;
      }
      if (e.rush && !this.reduced.matches) {
        c.save(); c.rotate(e.angle); c.globalAlpha *= .55 * (1 - e.age / e.life); c.translate(-10, -14);
        blade(c, 180, 16, '#ed956e'); c.restore();
      }
      paintSlayerImpact(c, e.age, e.life, e.angle, e.rush ? Math.max(2, e.level) : e.level, e.kills, COLORS[e.element], !!e.pure, this.reduced.matches); c.restore();
    }
  }
  private clear(): void { this.impacts = []; this.trails = []; this.savedStroke = undefined; this.savedGeometry = undefined; }
  dispose(): void { this.off.forEach(off => off()); this.clear(); }
}
