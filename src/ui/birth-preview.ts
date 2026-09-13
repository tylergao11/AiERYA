import { SceneView } from '../render/view';
import type { Destiny } from '../game/roguelike';
import { BirthDemoSimulation } from './birth-demo-simulation';
import type { Camera2D } from '../render/projection';

/** One canvas and one 30 fps loop for the opening panel. */
export class BirthPreview {
  private readonly canvas = document.createElement('canvas');
  private readonly resizeObserver = new ResizeObserver(() => this.resize());
  private simulation?: BirthDemoSimulation;
  private view?: SceneView;
  private frame = 0;
  private last = 0;
  private disposed = false;
  private ready = false;
  private pausedAtEnd = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private caption?: HTMLElement;
  private serial = -1;
  constructor() {
    this.canvas.setAttribute('aria-label', '当前天赋战斗效果演示'); this.canvas.setAttribute('role', 'img');
    this.resizeObserver.observe(this.canvas);
    this.frame = requestAnimationFrame(this.loop);
  }
  mount(host: HTMLElement, destiny: Destiny): void {
    host.prepend(this.canvas); this.caption = host.querySelector<HTMLElement>('.birth-demo-caption')!;
    if (this.serial !== destiny.serial) {
      this.serial = destiny.serial; this.view?.dispose(); this.ready = false; this.pausedAtEnd = false;
      this.simulation = new BirthDemoSimulation(destiny); this.view = new SceneView(this.canvas, this.simulation.world, this.frameCamera);
      const view = this.view;
      this.caption.textContent = '';
      void view.load().then(() => { if (this.disposed || this.view !== view) return; this.ready = true; this.resize(); this.replay(); }).catch(() => {
        if (!this.disposed && this.view === view && this.caption) this.caption.textContent = '演示未能载入，点击重播重试';
      });
    }
    this.resize(); this.last = 0;
  }
  replay(): void { if (!this.ready) { this.serial = -1; return; } this.simulation?.restart(); this.view?.preview([]); this.pausedAtEnd = false; this.last = 0; }
  private resize(): void {
    if (!this.view || !this.canvas.isConnected) return;
    this.view.resize();
    this.frameCamera(this.view.camera);
    this.view.render(0);
  }
  private readonly frameCamera = (camera: Camera2D): void => {
    camera.scale = Math.min(camera.width / 750, camera.height / 350);
    camera.offsetX = camera.width / 2 - 575 * camera.scale;
    camera.offsetY = camera.height / 2 - 342 * camera.scale;
  };
  private readonly loop = (now: number): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (!this.ready || !this.view || !this.simulation || !this.canvas.isConnected || document.hidden || this.pausedAtEnd) { this.last = 0; return; }
    if (!this.last) { this.last = now; return; }
    if (now - this.last < 1000 / 30) return;
    const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    if (this.simulation.elapsed > 4.8) { if (this.reduced.matches) { this.pausedAtEnd = true; return; } this.replay(); }
    this.simulation.tick(dt);
    const t = this.simulation.elapsed;
    this.view.preview(t > .4 && t < .85 ? this.simulation.stroke : []);
    this.view.render(dt);
  };
  dispose(): void { this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); this.view?.dispose(); this.canvas.remove(); }
}
