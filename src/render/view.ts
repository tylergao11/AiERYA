import { paintElementTraces } from './element-traces';
import { type Point } from '../core/math';
import { CAMP, MAGE } from '../game/terrain';
import type { World } from '../game/world';
import { ActorPainter } from './actors';
import { loadArt } from './assets';
import { EffectPainter } from './effects';
import { COLORS, line, oval, registerFlames } from './ink';
import { ART, Camera2D, toArt, type ViewportRect } from './projection';
import { SceneryPainter } from './scenery';
import { WardPainter, type PaintedObject } from './wards';
import { paintStroke, strokeGeometry, type StrokeGeometry } from './stroke';
import { elementState } from './element-state';
import { planCombatStroke } from '../game/combat';
import type { SlayerReturnGesture } from '../game/slayer-return-window';
import { CombatFeedback } from './combat-feedback';
import { wardContains } from '../game/ward-geometry';
import { ReactionArt } from './reaction-art';
import { SceneFeedback } from './scene-feedback';
import { RoguePainter } from './rogue';
import { ArrayPainter } from './array-momentum';
import { UltimatePainter } from './ultimate';
import type { Ward } from '../game/contracts';
import { wardContours } from '../game/ward-geometry';
import { pickWard, wardSelectionHeight } from './ward-selection';
import { canvasResolution } from './resolution';
import { SceneImpact } from './impact-motion';
import { EnemyTelegraphs } from './enemy-telegraphs';
import type { ChargePreview } from '../game/charge';
import { paintCharge, strokeCaptionOffset } from './slayer-charge';
import { paintCommandStroke } from './summon';
import { SlayerVfx } from './slayer-vfx';
import { paintWardDurability } from './ward-durability';
import { SlayerCloseup } from './slayer-closeup';
import { ArrayCloseup } from './array-closeup';
import { SummonCloseup } from './summon-closeup';
import { EffectTextBudget } from './effect-text-budget';

export class SceneView {
  readonly camera = new Camera2D();
  readonly effects: EffectPainter;
  private readonly combatFeedback: CombatFeedback;
  private readonly reactions: ReactionArt;
  private readonly sceneFeedback: SceneFeedback;
  private readonly impact: SceneImpact;
  private readonly enemyTelegraphs: EnemyTelegraphs;
  private readonly rogue: RoguePainter;
  private readonly arrays: ArrayPainter;
  private readonly slayer: SlayerVfx;
  private readonly closeup: SlayerCloseup;
  private readonly arrayCloseup: ArrayCloseup;
  private readonly summonCloseup: SummonCloseup;
  private readonly ultimate: UltimatePainter;
  private readonly c: CanvasRenderingContext2D;
  private ratio = 1;
  private quality = 1;
  private budgetFrames = 0;
  private renderBudget = 0;
  private resizeTexture = false;
  private vignette: CanvasGradient | null = null;
  private scenery: SceneryPainter | null = null;
  private boundary: HTMLImageElement | null = null;
  private actors: ActorPainter | null = null;
  private readonly wards = new WardPainter();
  private readonly off: (() => void)[];
  private stroke: readonly Point[] = [];
  private previewCharge: ChargePreview | null = null;
  private brush: StrokeGeometry | null = null;
  private sideBrushes: StrokeGeometry[] = [];
  private returnGesture: SlayerReturnGesture | null = null;
  private closed = false;
  private previewContours: readonly (readonly Point[])[] = [];
  private removalId: number | null = null;
  private casting = 0;
  private tracingSeconds = 0;
  private chargeVisualTime = 0;
  private disposed = false;
  constructor(readonly canvas: HTMLCanvasElement, private readonly world: World, private readonly frameCamera?: (camera: Camera2D) => void) {
    const context = canvas.getContext('2d', { alpha: false }); if (!context) throw new Error('Canvas 2D unavailable'); this.c = context;
    this.effects = new EffectPainter(world, (ward, target) => this.wards.attackSource(ward, target));
    const textBudget = new EffectTextBudget();
    this.combatFeedback = new CombatFeedback(world,textBudget);
    this.reactions = new ReactionArt(world); this.sceneFeedback = new SceneFeedback(world);
    this.impact = new SceneImpact(world);
    this.enemyTelegraphs = new EnemyTelegraphs(world);
    this.rogue = new RoguePainter(world,textBudget);
    this.arrays = new ArrayPainter(world);
    this.slayer = new SlayerVfx(world);
    this.closeup = new SlayerCloseup(world);
    this.arrayCloseup = new ArrayCloseup(world);
    this.summonCloseup = new SummonCloseup(world);
    this.ultimate = new UltimatePainter(world.ultimate);
    this.off = [world.events.on('reaction', ({ wardId }) => { const ward = world.wards.find(w => w.id === wardId); if (ward) this.wards.pulse(ward, world.time); }),
      world.events.on('invoke', ({ source }) => { this.casting = 1; for (const ward of world.wards) if (wardContains(source, ward)) this.wards.pulse(ward, world.time); }),
      world.events.on('pulse', ({ ward }) => this.wards.pulse(ward, world.time)),
      world.events.on('ward', () => { this.casting = 1; }),
      world.events.on('arrayEffect', e => { if(e.kind==='release'||e.kind==='harmony')this.casting=1; }),
      world.events.on('summonOrder', e => { if(e.kind==='infuse'||e.kind==='union')this.casting=1; }),
      world.events.on('wardRemoved', ({ id, reason }) => this.wards.retire(id, world.time, reason)),
      world.events.on('wardMoved', ({ ward }) => this.wards.invalidate(ward.id)),
      world.events.on('reset', () => { this.wards.clear(); this.actors?.clear(); this.preview([]); this.casting = 0; this.tracingSeconds = 0; })];
    this.resize();
  }
  async load(): Promise<void> { const assets = await loadArt(); if (this.disposed) return; this.boundary = assets.boundary; registerFlames(this.c, assets.fire); this.wards.setAtlas(assets.formations, assets.metal); this.rogue.setAssets(assets); this.arrays.setAtlas(assets.arraySpells); this.scenery = new SceneryPainter(assets); this.actors = new ActorPainter(assets); this.render(0); }
  resize(): void {
    this.closeup.cancel();
    this.arrayCloseup.cancel();
    this.summonCloseup.cancel();
    const rect=this.canvas.getBoundingClientRect();this.camera.resize(rect.width,rect.height);
    const resolution=canvasResolution(rect.width,rect.height,devicePixelRatio,Math.min(rect.width,rect.height)<=600 || matchMedia('(pointer: coarse)').matches);
    this.applyResolution(resolution);
    this.vignette=null;
  }
  private applyResolution(resolution: ReturnType<typeof canvasResolution>): void {
    this.ratio=resolution.ratio*this.quality;
    resolution.width=Math.max(1,Math.floor(resolution.width*this.quality));
    resolution.height=Math.max(1,Math.floor(resolution.height*this.quality));
    if(this.canvas.width!==resolution.width)this.canvas.width=resolution.width;
    if(this.canvas.height!==resolution.height)this.canvas.height=resolution.height;
    this.resizeTexture=false;
  }
  reportRenderCost(milliseconds: number): void {
    this.renderBudget+=milliseconds;
    if(++this.budgetFrames<90)return;
    if(this.renderBudget/this.budgetFrames>20 && this.quality>.65){this.quality=Math.max(.65,this.quality*.85);this.resizeTexture=true;}
    this.budgetFrames=0;this.renderBudget=0;
  }
  /** Dedicated illustrated lacquer panels fill only the area outside the map.
   * The atlas's outer thirds contain the two paintings; its centre is unused. */
  private paintBoundary(): void {
    if (!this.boundary) return;
    const c = this.c, image = this.boundary, cell = image.width / 3;
    const { width, height, offsetX, offsetY, scale } = this.camera;
    const window=this.camera.viewport;
    const left = window?.x ?? Math.max(0, Math.min(width, offsetX));
    const right = window ? width-window.x-window.width : Math.max(0, Math.min(width, width - offsetX - ART.width * scale));
    const top = window?.y ?? Math.max(0, Math.min(height, offsetY));
    const bottom = window ? height-window.y-window.height : Math.max(0, Math.min(height, height - offsetY - ART.height * scale));
    c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    if (left) c.drawImage(image, 0, 0, cell, image.height, 0, 0, left, height);
    if (right) c.drawImage(image, cell * 2, 0, cell, image.height, width - right, 0, right, height);
    // Rotated book edges also cover a portrait or letterboxed preview without repeating scenery.
    if (top) { c.save(); c.translate(width, 0); c.rotate(Math.PI / 2); c.drawImage(image, 0, 0, cell, image.height, 0, 0, top, width); c.restore(); }
    if (bottom) { c.save(); c.translate(0, height); c.rotate(-Math.PI / 2); c.drawImage(image, cell * 2, 0, cell, image.height, 0, 0, bottom, width); c.restore(); }
  }
  changeZoom(delta: number): void { this.closeup.cancel(); this.arrayCloseup.cancel(); this.summonCloseup.cancel(); this.camera.changeZoom(delta); this.vignette=null; }
  navigate(rect: ViewportRect | null): void { this.beginStroke(); this.camera.navigate(rect); this.vignette=null; this.render(0); }
  panBy(dx:number,dy:number): void { this.closeup.cancel(); this.arrayCloseup.cancel(); this.summonCloseup.cancel(); this.camera.panBy(dx,dy); }
  get closeupActive(): boolean { return this.closeup.active || this.arrayCloseup.active || this.summonCloseup.active; }
  get drawingActive():boolean {return this.stroke.length>0;}
  beginStroke(): void {
    const focused = this.closeupActive;
    this.closeup.cancel(); this.arrayCloseup.cancel(); this.summonCloseup.cancel(); this.camera.focus(null);
    // Restore the normal frame before the first coordinate of the next gesture is picked.
    if (focused) this.render(0);
  }
  project(point: Point, height = 0): ReturnType<Camera2D['project']> { return this.camera.project(point, height); }
  private captionBounds(point: Point): ViewportRect {
    const c=this.camera,p=c.project(point),x=Math.max(0,c.offsetX),y=Math.max(0,c.offsetY);
    const r=c.viewport??{x,y,width:Math.min(c.width,c.offsetX+ART.width*c.scale)-x,height:Math.min(c.height,c.offsetY+ART.height*c.scale)-y};
    return {x:r.x-p.x,y:r.y-p.y,width:r.width,height:r.height};
  }
  pick(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect(), x = clientX - rect.left, y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const window=this.camera.viewport;
    if(window&&(x<window.x||y<window.y||x>window.x+window.width||y>window.y+window.height))return null;
    const point = this.camera.unproject(x, y), art = toArt(point);
    return art.x >= 0 && art.x <= ART.width && art.y >= 0 && art.y <= ART.height ? point : null;
  }
  pickWard(clientX: number, clientY: number): Ward | undefined {
    const point = this.pick(clientX, clientY);
    return point ? pickWard(point, this.world.wards) : undefined;
  }
  previewRemoval(id: number | null): void { this.removalId = id; }
  preview(points: readonly Point[], closed = false, contours: readonly (readonly Point[])[] = [], charge: ChargePreview | null = null, returning: SlayerReturnGesture | null = null): void {
    if (!points.length) { this.closeup.cancel(); this.arrayCloseup.cancel(); this.summonCloseup.cancel(); this.camera.focus(null); }
    this.stroke = points; this.closed = closed;
    this.previewCharge = charge;
    this.returnGesture = points.length ? returning : null;
    this.previewContours = contours;
    if (points.length < 2) this.tracingSeconds = 0;
    if (!points.length) this.chargeVisualTime = 0;
    const battle = this.world.phase === 'battle' ? planCombatStroke(points) : null;
    this.brush = points.length > 1 ? strokeGeometry((battle?.points ?? points).map(p => toArt(p))) : null;
    this.sideBrushes = battle && this.world.build.has('three') ? this.world.mechanics.sideStrokes(battle).map(side=>strokeGeometry(side.points.map(p=>toArt(p)))) : [];
  }
  render(dt: number): void {
    if (!this.scenery || !this.actors || this.disposed) return;
    if(this.resizeTexture)this.applyResolution(canvasResolution(this.camera.width,this.camera.height,devicePixelRatio,Math.min(this.camera.width,this.camera.height)<=600 || matchMedia('(pointer: coarse)').matches));
    const c = this.c, time = this.world.time, effectDt = this.world.ultimate.stage === 'drawing' ? 0 : dt;
    this.closeup.update(effectDt, this.camera, this.stroke.length > 0);
    this.arrayCloseup.update(effectDt, this.camera, this.stroke.length > 0, this.closeup.active);
    this.summonCloseup.update(effectDt, this.camera, this.stroke.length > 0, this.closeup.active || this.arrayCloseup.active);
    this.frameCamera?.(this.camera);
    this.casting = Math.max(0, this.casting - effectDt * 1.8); this.effects.update(effectDt); this.combatFeedback.update(effectDt); this.reactions.update(effectDt); this.sceneFeedback.update(effectDt);
    this.rogue.update(effectDt); this.arrays.update(effectDt);
    this.slayer.update(effectDt);
    if (this.stroke.length > 1) this.tracingSeconds += dt;
    if (this.stroke.length && this.previewCharge?.holding) this.chargeVisualTime += dt;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#211a13'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.save();
    const viewport=this.camera.viewport;
    if(viewport){c.setTransform(this.ratio,0,0,this.ratio,0,0);c.beginPath();c.rect(viewport.x,viewport.y,viewport.width,viewport.height);c.clip();}
    this.camera.apply(c, this.ratio); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const shake = this.impact.update(effectDt, this.stroke.length > 0 || this.world.ultimate.stage === 'drawing');
    c.save(); c.translate(shake.x / this.camera.scale, shake.y / this.camera.scale);
    this.scenery.background(c); this.scenery.river(c, time, elementState(this.world.naturalInfluences.water)); this.effects.ground(c); this.wards.ground(c, this.world.wards, time); this.reactions.ground(c);
    const objects: PaintedObject[] = this.wards.objects(this.world.wards, time);
    paintElementTraces(c, this.world); this.arrays.ground(c, this.stroke); this.rogue.ground(c);
    const returnTip = this.world.slayerTechniques.returnCut?.stroke.points.at(-1);
    this.slayer.ground(c, this.camera.scale, returnTip ? this.captionBounds(returnTip) : undefined, this.returnGesture);
    this.enemyTelegraphs.ground(c); objects.push(...this.rogue.objects());
    objects.push({ z: toArt(CAMP).y, draw: c => this.scenery!.camp(c, time, this.world.health, this.world.naturalPower('fire'), this.sceneFeedback.impact) });
    objects.push({ z: toArt(MAGE).y, draw: c => this.actors!.mage(c, time, this.casting, Math.max(this.tracingSeconds, (this.previewCharge?.seconds ?? 0) * 1.6), this.world.selected) });
    for (const wolf of this.world.wolves) objects.push({ z: toArt(wolf).y, draw: c => this.actors!.wolf(c, wolf, time, this.camera.scale) });
    objects.sort((a, b) => a.z - b.z); for (const object of objects) object.draw(c);
    this.actors.prune(this.world.wolves); this.reactions.paint(c, time); this.effects.paint(c, time); this.scenery.air(c, time); this.sceneFeedback.paint(c, time);
    if(!this.world.mechanics.commands.active)this.combatFeedback.paint(c, this.camera.scale);
    this.rogue.paint(c,this.camera.scale);
    if(this.world.mechanics.commands.active)this.combatFeedback.paint(c,this.camera.scale,this.rogue.labelBounds());
    this.summonCloseup.paint(c, this.camera, this.ratio); this.arrayCloseup.paint(c, this.camera, this.ratio); this.arrays.eyes(c, this.stroke); this.arrays.paint(c);
    this.closeup.paint(c, this.camera, this.ratio);
    this.slayer.paint(c, this.camera.scale);
    this.enemyTelegraphs.paint(c);
    paintWardDurability(c, this.world, this.camera.scale);
    c.restore();
    if(!this.rogue.ultimate(c,this.camera,this.ratio))this.ultimate.paint(c);
    const removing = this.world.canDismissWard && this.world.wards.find(ward => ward.id === this.removalId);
    if (removing) {
      const height = wardSelectionHeight(removing), path = new Path2D();
      for (const contour of wardContours(removing)) {
        for (const [i, point] of contour.entries()) {
          const p = toArt(point); if (i === 0) path.moveTo(p.x, p.y - height); else path.lineTo(p.x, p.y - height);
        }
        path.closePath();
      }
      c.save(); c.fillStyle = '#edce812a'; c.fill(path, 'evenodd');
      c.strokeStyle = '#f2d28d'; c.lineWidth = 2 / this.camera.scale; c.stroke(path);
      const anchor = toArt(removing), refund = this.world.wardRefund(removing.id);
      c.font = '18px "Microsoft YaHei UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.lineWidth = 5; c.strokeStyle = '#182822'; c.fillStyle = '#ffdfa0';
      const text = `撤阵 · 返还 ${Number(refund.toFixed(1))} 灵力`;
      c.strokeText(text, anchor.x, anchor.y - height - 12); c.fillText(text, anchor.x, anchor.y - height - 12); c.restore();
    }
    if (this.stroke.length > 1) {
      if (this.world.phase === 'battle' && this.brush) {
        if (this.world.mechanics.commands.replacesStroke) paintCommandStroke(c,this.stroke,this.world.selected);
        else paintStroke(c, this.brush, this.world.selected, time, 0, 1, true, this.previewCharge?.width, this.previewCharge?.level);
        for (const side of this.sideBrushes) paintStroke(c, side, this.world.selected, time, 0, .5, true, this.previewCharge?.width, this.previewCharge?.level);
        const at = toArt(this.stroke.at(-1)!), cost = this.previewCharge?.cost ?? this.world.strokeCost(this.stroke);
        c.save(); c.font = `bold ${12 / this.camera.scale}px "Microsoft YaHei UI",sans-serif`; c.textAlign = 'center'; c.lineWidth = 4 / this.camera.scale; c.strokeStyle = '#10201e';
        c.fillStyle = this.world.spirit - cost < this.world.mechanics.debtFloor ? '#ff9985' : '#eee2b5';
        const label = `${cost ? `本笔 ${cost} 灵力` : this.world.ultimate.active ? '停时 · 免耗' : '轮转 · 免耗'}${this.previewCharge?.unaffordable ? ' · 灵力不足' : this.previewCharge?.limited ? ' · 已降档' : ''}`;
        const caption=strokeCaptionOffset(c.measureText(label).width*this.camera.scale,this.previewCharge?.holding?45:-25,this.captionBounds(this.stroke.at(-1)!));
        const labelX=at.x+caption.x/this.camera.scale,labelY=at.y+caption.y/this.camera.scale;
        c.strokeText(label, labelX, labelY); c.fillText(label, labelX, labelY); c.restore();
      }
      else {
      const color = this.closed ? '#c5efab' : COLORS[this.world.selected];
      for (const contour of this.previewContours.length ? this.previewContours : [this.stroke]) {
        const points = contour.map(p => toArt(p));
        line(c, points, '#0b1425bd', 6); line(c, points, color, 2.4);
        const start = points[0]!; oval(c, start.x, start.y, this.closed ? 5 : 3.5, this.closed ? 3.5 : 2.5, color);
        if (this.closed) line(c, [points.at(-1)!, start], color, 1.5);
      }
      }
    }
    if (this.stroke.length && this.previewCharge?.holding) paintCharge(c, toArt(this.stroke.at(-1)!), this.previewCharge, this.world.selected, this.camera.scale, this.chargeVisualTime, this.slayer.reducedMotion,this.captionBounds(this.stroke.at(-1)!));
    // Frame only the outside of the illustration; the playfield keeps its colors.
    if (!this.vignette) { this.vignette=c.createRadialGradient(ART.width / 2, ART.height / 2, 500, ART.width / 2, ART.height / 2, 920);this.vignette.addColorStop(0,'#06121c00');this.vignette.addColorStop(1,'#06121c88'); }
    c.fillStyle = this.vignette; c.fillRect(0, 0, ART.width, ART.height);
    c.restore();
    this.paintBoundary();
  }
  dispose(): void { this.disposed = true; this.off.forEach(off => off()); this.effects.dispose(); this.combatFeedback.dispose(); this.reactions.dispose(); this.sceneFeedback.dispose(); this.impact.dispose(); this.rogue.dispose(); this.arrays.dispose(); this.slayer.dispose(); this.closeup.dispose(); this.arrayCloseup.dispose(); this.summonCloseup.dispose(); this.wards.clear(); this.actors?.clear(); this.scenery?.dispose(); this.scenery = null; this.actors = null; this.boundary = null; }
}
