import { distance, type Point } from '../core/math';
import { ELEMENTS, type Element } from '../game/contracts';
import type { World } from '../game/world';
import type { SceneView } from '../render/view';
import type { GameInterface } from './interface';
import { wardContours } from '../game/ward-geometry';
import { ROGUE } from '../game/rogue-balance';
import { previewCharge, CHARGE, type ChargePreview } from '../game/charge';
import { slayerReturnGesture } from '../game/slayer-return-window';
import { COMBAT } from '../game/combat';

export class DrawingInput {
  private pointer: number | null = null;
  private points: Point[] = [];
  private drawingPhase = '';
  private drawingUltimate = false;
  private drawingElement: Element = 'fire';
  private removing = false;
  private removalTarget: number | null = null;
  private removalStart = { x: 0, y: 0 };
  private removalDragged = false;
  private previewDirty = false;
  private charging = false;
  private chargeSeconds = 0;
  private chargeStarted = 0;
  private announcedCharge = 0;
  private gestureStart = { x: 0, y: 0 };
  private gestureDistance = 0;
  private streaming = false;
  private movingWard = false;
  private closeupTap: { at: Point; targetId?: number } | null = null;
  private readonly off: (() => void)[];
  private readonly abort = new AbortController();
  constructor(private readonly world: World, private readonly view: SceneView, private readonly ui: GameInterface, private readonly now: () => number = () => performance.now()) {
    ui.onRemovalChange = this.cancel;
    ui.attachView?.(view,this.cancel);
    this.off = [world.events.on('ultimateClosing', this.finishUltimate), world.events.on('ultimate', event => { if (event.stage === 'start') this.cancel(); }), world.events.on('phase', this.cancel), world.events.on('reset', this.cancel)];
    const signal = this.abort.signal, canvas = view.canvas;
    canvas.addEventListener('pointerdown', this.down, { signal });
    canvas.addEventListener('pointermove', this.move, { signal });
    canvas.addEventListener('pointerup', this.up, { signal });
    canvas.addEventListener('pointercancel', this.cancel, { signal });
    // Normal pointerup already released the gesture before casting. Its automatic
    // capture-loss notification must not cancel the special-move camera just started.
    canvas.addEventListener('lostpointercapture', () => { if (this.pointer !== null) this.cancel(); }, { signal });
    canvas.addEventListener('pointerleave', () => { if (ui.removing) view.previewRemoval(null); }, { signal });
    canvas.addEventListener('wheel', event => { event.preventDefault(); }, { passive: false, signal });
    window.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, summary, [contenteditable="true"], [role="dialog"], dialog'))) return;
      if (event.code === 'Space') { event.preventDefault(); this.cancel(); ui.togglePause(); return; }
      if (ui.blocked) return;
      if (event.key.toLowerCase() === 'q') { event.preventDefault(); world.startUltimate(); return; }
      if (world.combatStyle === 'spirit' && world.phase === 'battle') {
        const order = (['leap','defend','repeat','heal','attack'] as const)[Number(event.key)-1];
        if (order) { this.cancel(); world.mechanics.commands.chooseOrder(order); } return;
      }
      const element = ELEMENTS[Number(event.key) - 1]; if (element && !world.preparationLocked) { ui.setRemoval(false); if (this.drawingUltimate) this.finishUltimate(); else this.cancel(); world.selectElement(element); }
      if (event.key === 'Escape') { ui.setRemoval(false); this.cancel(); }
    }, { signal });
  }
  dispose(): void { this.abort.abort(); this.off.forEach(off => off()); this.cancel(); this.ui.detachView?.(); this.ui.onRemovalChange = () => {}; }
  cancel = (): void => { this.points = []; this.pointer = null; this.closeupTap=null; this.drawingUltimate = false; this.removing = false; this.removalTarget = null; this.previewDirty=false; this.charging=false; this.chargeSeconds=0; this.streaming=false; this.movingWard=false; this.ui.strokePreview=null; this.view.preview([]); this.view.previewRemoval(null); };
  private refreshCharge(): void {
    if (this.charging) this.chargeSeconds = Math.min(CHARGE.thresholds[2], Math.max(0, (this.now() - this.chargeStarted) / 1000));
  }
  private swipeIntent(travel = this.gestureDistance): boolean {
    // Screen-space tolerance distinguishes a deliberate swipe from a held
    // finger's jitter, independently of camera zoom and world coordinates.
    return travel > (this.world.swordActive ? 4 : this.world.combatStyle === 'spirit' ? 10 : 0);
  }
  private noteTravel(event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
    this.gestureDistance = Math.max(this.gestureDistance, Math.hypot(event.clientX-this.gestureStart.x,event.clientY-this.gestureStart.y));
    if (this.charging && this.swipeIntent()) { this.refreshCharge(); this.charging = false; }
  }
  private get liveBattleStroke(): boolean { return this.world.phase === 'battle' && this.world.combatStyle !== 'spirit' && !this.drawingUltimate && !this.movingWard; }
  private flushLiveStroke(): boolean {
    if (!this.liveBattleStroke || !this.swipeIntent() || !this.world.quoteStroke(this.points,this.chargeSeconds)) return false;
    // Orders and array releases need a meaningful segment, not a new command
    // every animation frame. Slayers retain immediate continuous cuts.
    const minimum = this.world.swordActive ? COMBAT.unitLength : this.world.build.is('array') ? COMBAT.unitLength * 2 : 0;
    if(minimum && this.points.slice(1).reduce((length,p,i)=>length+distance(p,this.points[i]!),0)<minimum)return false;
    const points=this.points, charge=this.chargeSeconds, last=points.at(-1)!;
    // Coalesce new movement samples into one release per preview frame.
    // The stored charge belongs to the first released cut, never every segment.
    this.points=[last];this.streaming=true;this.charging=false;this.chargeSeconds=0;
    this.ui.strokePreview=null;
    this.world.invoke(points,charge);
    if(this.pointer!==null)this.view.preview(this.points);
    return true;
  }
  flushPreview(_dt = 0): void {
    if(this.ui.blocked || this.world.phase!==this.drawingPhase || this.pointer===null || !this.points.length)return;
    if (this.charging) { this.refreshCharge(); this.previewDirty = true; }
    if (!this.previewDirty) return;
    this.previewDirty=false;
    if (this.world.combatStyle === 'spirit' && !this.world.ultimate.active && this.world.phase === 'battle') { this.ui.strokePreview = null; this.view.preview([]); return; }
    if (this.flushLiveStroke()) return;
    if (this.world.phase === 'battle') {
      const quote = this.world.quoteStroke(this.points,this.chargeSeconds), stroke = quote?.stroke;
      const moving = !this.world.ultimate.active && !stroke?.loop && this.world.build.has('living') && this.world.wards.some(w => w.mainSlot !== undefined && distance(w, this.points[0]!) < 1.6);
      const effectiveSeconds = this.world.effectiveChargeSeconds(this.chargeSeconds);
      const charge: ChargePreview | null = this.charging || this.chargeSeconds>0 ? {...previewCharge(quote,effectiveSeconds,this.world.spellCost,Math.max(0,this.world.spirit-this.world.mechanics.debtFloor),!this.world.spellCost||this.world.ultimate.active),holding:this.charging} : null;
      if (charge && !charge.unaffordable && charge.level > this.announcedCharge) { this.announcedCharge = charge.level; this.world.events.emit('chargeReady', { level: charge.level }); }
      const returning = moving ? null : slayerReturnGesture(this.world,quote);
      this.view.preview(this.points,false,[],charge,returning);
      this.ui.strokePreview = moving ? { cost: ROGUE.array.moveCost, power: 1, moving: true } : stroke ? { cost: quote!.cost, power: stroke.multiplier, charge: charge?.level, limited: charge?.limited, unaffordable: charge?.unaffordable, returning } : charge ? {cost:0,power:0,charge:charge.level,limited:charge.limited,unaffordable:charge.unaffordable,charging:true} : null; return;
    }
    const plan = this.world.previewPlacement(this.points);
    this.view.preview(plan.ok ? [...plan.points, plan.points[0]!] : this.points, plan.ok, plan.ok ? wardContours(plan) : []);
  }
  private readonly finishUltimate = (): void => {
    this.refreshCharge();
    if (this.drawingUltimate && this.pointer !== null) this.world.queueUltimateStroke(this.points, this.drawingElement, this.chargeSeconds);
    this.cancel();
  };
  private readonly down = (event: PointerEvent): void => {
    if (event.button !== 0 || this.pointer !== null || this.ui.blocked || ['destiny', 'won', 'lost', 'rest'].includes(this.world.phase)) return;
    if (this.world.ultimate.stage === 'release' || this.world.preparationLocked) return;
    this.closeupTap=null;
    if(this.view.closeupActive && this.world.mechanics.commands.active && this.world.phase==='battle' && !this.world.ultimate.active && !this.ui.removing){
      // Keep a tap attached to what the player saw before the temporary camera returns.
      const target=this.targetAt(event),at=target?{x:target.x,z:target.z}:this.view.pick(event.clientX,event.clientY);
      if(at)this.closeupTap={at:{...at},targetId:target?.id};
    }
    this.view.beginStroke?.();
    const point = this.view.pick(event.clientX, event.clientY); if (!point && !this.closeupTap) return;
    this.pointer = event.pointerId; this.points = point?[point]:[]; this.drawingPhase = this.world.phase; this.view.canvas.setPointerCapture(event.pointerId);
    this.gestureStart = { x: event.clientX, y: event.clientY }; this.gestureDistance = 0;
    this.streaming=false;this.movingWard=false;
    if (this.ui.removing) {
      this.removing = true; this.removalDragged = false; this.removalStart = { x: event.clientX, y: event.clientY };
      this.removalTarget = this.view.pickWard(event.clientX, event.clientY)?.id ?? null; this.view.previewRemoval(this.removalTarget); return;
    }
    this.drawingElement = this.world.selected; this.drawingUltimate = this.world.ultimate.stage === 'drawing';
    this.movingWard = this.world.combatStyle === 'array' && !this.drawingUltimate && this.world.build.has('living') && !!point && this.world.wards.some(w=>w.mainSlot!==undefined&&distance(w,point)<1.6);
    this.charging = this.world.phase==='battle' && this.world.swordActive && !this.movingWard;
    this.chargeStarted=this.now();this.chargeSeconds=0;this.announcedCharge=0;this.previewDirty=true;
  };
  private readonly move = (event: PointerEvent): void => {
    if (this.ui.removing && !this.ui.blocked) {
      if (this.removing && event.pointerId === this.pointer && Math.hypot(event.clientX - this.removalStart.x, event.clientY - this.removalStart.y) > 12) this.removalDragged = true;
      this.view.previewRemoval(this.world.canDismissWard ? this.view.pickWard(event.clientX, event.clientY)?.id ?? null : null); return;
    }
    if (event.pointerId !== this.pointer || this.ui.blocked) return;
    this.noteTravel(event);
    if (this.world.phase !== this.drawingPhase) { this.cancel(); return; }
    const point = this.view.pick(event.clientX, event.clientY),last=this.points.at(-1); if (!point || last && distance(point,last) < 0.18 || this.points.length >= 600) return;
    this.points.push(point);
    this.previewDirty=true;
  };
  private readonly up = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return;
    if (this.removing) {
      const target = this.removalTarget, dragged = this.removalDragged || Math.hypot(event.clientX - this.removalStart.x, event.clientY - this.removalStart.y) > 12;
      const same = target !== null && this.view.pickWard(event.clientX, event.clientY)?.id === target;
      this.cancel();
      if (this.ui.blocked || !this.ui.removing || this.world.phase !== this.drawingPhase || dragged) return;
      if (same) this.world.dismissWard(target);
      else this.world.notice = '点击阵法内部即可撤阵 · Esc 或选择五行退出';
      return;
    }
    const end = this.view.pick(event.clientX, event.clientY);
    const last=this.points.at(-1);
    if (end && (!last || distance(end,last) > 1e-6) && this.points.length < 601) this.points.push(end);
    this.noteTravel(event);this.refreshCharge();
    const travel = Math.max(this.gestureDistance, Math.hypot(event.clientX - this.gestureStart.x, event.clientY - this.gestureStart.y));
    const slayerCut = this.world.swordActive && (travel > 4 || this.world.effectiveChargeSeconds(this.chargeSeconds) >= CHARGE.thresholds[0]);
    const tap = !this.streaming && this.world.mechanics.commands.active && this.world.phase === 'battle' && !this.drawingUltimate && travel <= 10 && !slayerCut;
    const live=this.liveBattleStroke, swipe=this.swipeIntent(travel);
    const points = this.points, ultimate = this.drawingUltimate, element = this.drawingElement, chargeSeconds=this.chargeSeconds,closeupTap=this.closeupTap; this.cancel();
    if (this.ui.blocked || this.world.phase !== this.drawingPhase) return;
    if (!ultimate && this.world.phase === 'battle' && this.world.combatStyle === 'spirit' && end) {
      this.world.mechanics.commands.tap(closeupTap?.at ?? end, this.targetAt(event)); return;
    }
    if (tap && (closeupTap || end)) {
      const target=closeupTap?this.world.wolves.find(w=>w.id===closeupTap.targetId&&w.action!=='dead'):this.targetAt(event);
      this.world.mechanics.commands.command(closeupTap?.at??end!,target); return;
    }
    if (ultimate) { this.world.queueUltimateStroke(points,element,chargeSeconds); return; }
    if (live) { if(swipe && points.length>=2)this.world.invoke(points,chargeSeconds);return; }
    if (points.length >= 2) this.world.draw(points,chargeSeconds);
  };
  private targetAt(event:Pick<PointerEvent,'clientX'|'clientY'>){
    if(typeof this.view.project!=='function')return undefined;
    const rect=this.view.canvas.getBoundingClientRect();
    return this.world.wolves.filter(w=>w.action!=='dead').map(w=>{
      const p=this.view.project(w,.8);
      return {wolf:w,distance:Math.hypot(p.x+rect.left-event.clientX,p.y+rect.top-event.clientY)};
    }).filter(v=>v.distance<=22).sort((a,b)=>a.distance-b.distance)[0]?.wolf;
  }
}
