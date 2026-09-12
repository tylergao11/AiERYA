import { distance, type Point } from '../core/math';
import { CAMP, MAGE } from '../game/terrain';
import type { World } from '../game/world';
import { ActorPainter } from './actors';
import { loadArt } from './assets';
import { EffectPainter } from './effects';
import { COLORS, line, oval, registerFlames } from './ink';
import { ART, Camera2D, toArt } from './projection';
import { SceneryPainter } from './scenery';
import { WardPainter, type PaintedObject } from './wards';

export class SceneView {
  readonly camera = new Camera2D();
  readonly effects: EffectPainter;
  private readonly c: CanvasRenderingContext2D;
  private readonly ratio = Math.min(devicePixelRatio || 1, 2);
  private scenery: SceneryPainter | null = null;
  private actors: ActorPainter | null = null;
  private readonly wards = new WardPainter();
  private readonly off: (() => void)[];
  private stroke: readonly Point[] = [];
  private closed = false;
  private casting = 0;
  private disposed = false;
  constructor(readonly canvas: HTMLCanvasElement, private readonly world: World) {
    const context = canvas.getContext('2d', { alpha: false }); if (!context) throw new Error('Canvas 2D unavailable'); this.c = context;
    this.effects = new EffectPainter(world);
    this.off = [world.events.on('gather', () => { this.casting = 1; }), world.events.on('invoke', () => { this.casting = 1; }), world.events.on('reset', () => { this.wards.clear(); this.actors?.clear(); this.preview([]); })];
    this.resize();
  }
  async load(): Promise<void> { const assets = await loadArt(); if (this.disposed) return; registerFlames(this.c, assets.fire); this.scenery = new SceneryPainter(assets); this.actors = new ActorPainter(assets); this.render(0); }
  resize(): void { const rect = this.canvas.getBoundingClientRect(); this.camera.resize(rect.width, rect.height); this.canvas.width = Math.round(rect.width * this.ratio); this.canvas.height = Math.round(rect.height * this.ratio); }
  changeZoom(delta: number): void { this.camera.changeZoom(delta); }
  project(point: Point, height = 0): ReturnType<Camera2D['project']> { return this.camera.project(point, height); }
  pick(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect(), point = this.camera.unproject(clientX - rect.left, clientY - rect.top);
    return Math.abs(point.x) < 30 && Math.abs(point.z) < 25 ? point : null;
  }
  preview(points: readonly Point[], closed = false): void { this.stroke = points; this.closed = closed; }
  render(dt: number): void {
    if (!this.scenery || !this.actors || this.disposed) return;
    const c = this.c, time = this.world.time; this.casting = Math.max(0, this.casting - dt * 1.8); this.effects.update(dt);
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#081720'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.camera.apply(c, this.ratio); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    this.scenery.background(c); this.scenery.river(c, time); this.effects.ground(c); this.wards.ground(c, this.world.wards, time);
    const objects: PaintedObject[] = this.wards.objects(this.world.wards, time);
    objects.push({ z: toArt(CAMP).y, draw: c => this.scenery!.camp(c, time, this.world.health) });
    objects.push({ z: toArt(MAGE).y, draw: c => this.actors!.mage(c, time, this.casting) });
    for (const wolf of this.world.wolves) objects.push({ z: toArt(wolf).y, draw: c => this.actors!.wolf(c, wolf, time) });
    objects.sort((a, b) => a.z - b.z); for (const object of objects) object.draw(c);
    this.actors.prune(this.world.wolves); this.effects.paint(c, time); this.scenery.air(c, time);
    if (this.stroke.length > 1) {
      const points = this.stroke.map(p => toArt(p)), color = this.closed ? '#fff0b7' : COLORS[this.world.selected];
      line(c, points, '#0b1425bd', 6); line(c, points, color, 2.4);
      const start = points[0]!; oval(c, start.x, start.y, this.closed ? 5 : 3.5, this.closed ? 3.5 : 2.5, color);
      if (this.world.mode === 'ward' && this.stroke.length > 8 && distance(this.stroke[0]!, this.stroke.at(-1)!) < 1.4) line(c, [points.at(-1)!, start], color, 1.5);
    }
    // Frame only the outside of the illustration; the playfield keeps its colors.
    const vignette = c.createRadialGradient(ART.width / 2, ART.height / 2, 500, ART.width / 2, ART.height / 2, 920); vignette.addColorStop(0, '#06121c00'); vignette.addColorStop(1, '#06121c88'); c.fillStyle = vignette; c.fillRect(0, 0, ART.width, ART.height);
  }
  dispose(): void { this.disposed = true; this.off.forEach(off => off()); this.effects.dispose(); this.wards.clear(); this.actors?.clear(); this.scenery?.dispose(); this.scenery = null; this.actors = null; }
}
