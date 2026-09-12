import { distance, type Point } from '../core/math';
import { ELEMENTS } from '../game/contracts';
import type { World } from '../game/world';
import type { SceneView } from '../render/view';
import type { GameInterface } from './interface';

export class DrawingInput {
  private pointer: number | null = null;
  private points: Point[] = [];
  private readonly abort = new AbortController();
  constructor(private readonly world: World, private readonly view: SceneView, private readonly ui: GameInterface) {
    const signal = this.abort.signal, canvas = view.canvas;
    canvas.addEventListener('pointerdown', this.down, { signal });
    canvas.addEventListener('pointermove', this.move, { signal });
    canvas.addEventListener('pointerup', this.up, { signal });
    canvas.addEventListener('pointercancel', this.cancel, { signal });
    canvas.addEventListener('lostpointercapture', this.cancel, { signal });
    canvas.addEventListener('wheel', event => { event.preventDefault(); if (this.pointer === null) view.changeZoom(event.deltaY); }, { passive: false, signal });
    window.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(event.target.tagName))) return;
      if (event.code === 'Space') { event.preventDefault(); this.cancel(); ui.togglePause(); return; }
      if (ui.blocked) return;
      if (event.key.toLowerCase() === 'q') { this.cancel(); ui.setMode('ward'); }
      if (event.key.toLowerCase() === 'e') { this.cancel(); ui.setMode('invoke'); }
      const element = ELEMENTS[Number(event.key) - 1]; if (element) { this.cancel(); world.selected = element; }
      if (event.key === 'Escape') this.cancel();
    }, { signal });
  }
  dispose(): void { this.abort.abort(); this.cancel(); }
  cancel = (): void => { this.points = []; this.pointer = null; this.view.preview([]); };
  private readonly down = (event: PointerEvent): void => {
    if (event.button !== 0 || this.pointer !== null || this.ui.blocked || ['won', 'lost', 'rest'].includes(this.world.phase)) return;
    const point = this.view.pick(event.clientX, event.clientY); if (!point) return;
    this.pointer = event.pointerId; this.points = [point]; this.view.canvas.setPointerCapture(event.pointerId);
  };
  private readonly move = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer || this.ui.blocked) return;
    const point = this.view.pick(event.clientX, event.clientY); if (!point || distance(point, this.points.at(-1)!) < 0.18 || this.points.length >= 600) return;
    this.points.push(point); this.view.preview(this.points, this.world.mode === 'ward' && this.points.length > 8 && distance(point, this.points[0]!) < 1.4);
  };
  private readonly up = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return;
    const points = this.points; this.cancel();
    if (this.ui.blocked) return;
    if (points.length < 3) { const resource = this.world.resources.find(r => distance(r, points[0]!) < r.radius); if (resource) this.world.gather(resource.id); return; }
    if (this.world.mode === 'ward') this.world.place(points); else this.world.invoke(points);
  };
}
