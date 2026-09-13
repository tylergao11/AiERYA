import { clamp, type Point } from '../core/math';
import type { World } from '../game/world';
import type { Camera2D } from './projection';

export const SLAYER_CLOSEUP = { heavySeconds: .46, pureSeconds: .68, enterSeconds: .1, holdSeconds: .08, desktopZoom: 1.46, mobileZoom: 1.28 } as const;
interface Shot { at: Point; fromAt: Point; age: number; duration: number; priority: number; fromZoom: number; fromWeight: number }
const smooth = (t: number) => { const p = clamp(t, 0, 1); return p * p * (3 - 2 * p); };

/** A single interruptible visual shot. It never changes the simulation clock or input cost. */
export class SlayerCloseup {
  private shot: Shot | null = null;
  private weight = 0;
  private zoom = 1;
  private focus: Point = { x: 0, z: 0 };
  private readonly off: (() => void)[];
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private readonly world: World) {
    this.off = [world.events.on('slayerStrike', e => {
      if (e.level === 3 && e.kills >= 3 && e.hits > 0 && e.investment >= 1) this.start(e.at, 1);
    }), world.events.on('slayerFinisher', e => {
      if ((e.hits ?? 0) > (e.guarded ?? 0)) this.start(e.at, 2);
    }),
    world.events.on('phase', () => this.cancel()), world.events.on('reset', () => this.cancel()),
    world.events.on('ultimate', () => this.cancel())];
  }
  get active(): boolean { return this.shot !== null; }
  private start(at: Point, priority: number): void {
    if (!this.world.build.is('slayer') || this.world.phase !== 'battle' || this.world.ultimate.active || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return;
    // A stronger finisher can take over once; repeated procs cannot prolong the shot.
    if (this.shot && this.shot.priority >= priority) return;
    this.shot = { at: { ...at }, fromAt: this.active ? { ...this.focus } : { ...at }, age: 0, duration: priority === 2 ? SLAYER_CLOSEUP.pureSeconds : SLAYER_CLOSEUP.heavySeconds, priority, fromZoom: this.zoom, fromWeight: this.weight };
  }
  update(dt: number, camera: Camera2D, interrupted = false): void {
    if (interrupted || this.world.phase !== 'battle' || this.world.ultimate.active) this.cancel();
    const shot = this.shot;
    if (!shot) { camera.focus(null); return; }
    if (Number.isFinite(dt) && dt > 0) shot.age += dt;
    if (shot.age >= shot.duration) { this.cancel(); camera.focus(null); return; }
    const peak = Math.min(camera.width, camera.height) <= 600 ? SLAYER_CLOSEUP.mobileZoom : SLAYER_CLOSEUP.desktopZoom;
    const maxZoom = 1 + (peak - 1) * (shot.priority === 2 ? 1 : .55);
    const enter = smooth(shot.age / SLAYER_CLOSEUP.enterSeconds);
    const fade = 1 - smooth((shot.age - SLAYER_CLOSEUP.enterSeconds - SLAYER_CLOSEUP.holdSeconds) / (shot.duration - SLAYER_CLOSEUP.enterSeconds - SLAYER_CLOSEUP.holdSeconds));
    this.weight = (shot.fromWeight + (1 - shot.fromWeight) * enter) * fade;
    this.zoom = this.reduced.matches ? 1 : 1 + (shot.fromZoom - 1 + (maxZoom - shot.fromZoom) * enter) * fade;
    this.focus = { x: shot.fromAt.x + (shot.at.x - shot.fromAt.x) * enter, z: shot.fromAt.z + (shot.at.z - shot.fromAt.z) * enter };
    camera.focus(this.focus, this.zoom, this.reduced.matches ? 0 : this.weight * .52);
  }
  paint(c: CanvasRenderingContext2D, camera: Camera2D, ratio: number): void {
    if (!this.shot || this.weight <= 0) return;
    const at = camera.project(this.focus, .8), radius = Math.max(80, Math.min(camera.width, camera.height) * .38);
    c.save(); c.setTransform(ratio, 0, 0, ratio, 0, 0);
    const shade = c.createRadialGradient(at.x, at.y, radius * .24, at.x, at.y, radius * 1.8);
    const alpha = this.weight * (this.reduced.matches ? .17 : .5);
    shade.addColorStop(0, 'rgba(5,15,19,0)'); shade.addColorStop(.46, `rgba(5,15,19,${alpha * .3})`); shade.addColorStop(1, `rgba(5,15,19,${alpha})`);
    c.fillStyle = shade; c.fillRect(0, 0, camera.width, camera.height);
    c.restore();
  }
  cancel(): void { this.shot = null; this.weight = 0; this.zoom = 1; }
  dispose(): void { this.off.forEach(off => off()); this.cancel(); }
}
