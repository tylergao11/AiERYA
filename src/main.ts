import './ui/style.css';
import { World } from './game/world';
import { SceneView } from './render/view';
import { GameInterface } from './ui/interface';
import { DrawingInput } from './ui/input';
import { Soundscape } from './ui/audio';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!, host = document.querySelector<HTMLElement>('#interface')!;
const loader = document.createElement('div'); loader.className = 'loader';
loader.innerHTML = '<span class="seal">阵</span><h2>山野 · 阵火</h2><p>林风入夜，借火为阵</p><div class="load-line"></div><p class="load-status">正在铺开山林与溪流…</p>';
document.querySelector('#game')!.append(loader);

async function start(): Promise<void> {
  let view: SceneView | null = null;
  try {
    const world = new World(); view = new SceneView(canvas, world);
    loader.querySelector('.load-status')!.textContent = '笔墨成林，正在点亮营火…';
    await view.load();
    const scene = view, ui = new GameInterface(host, world, scene), input = new DrawingInput(world, scene, ui), audio = new Soundscape(world);
    let frame = 0, last = performance.now(), accumulator = 0, uiTime = 0, alive = true;
    const resize = () => { scene.resize(); ui.update(); };
    const visibility = () => { last = performance.now(); accumulator = 0; audio.pause(document.hidden || ui.paused); input.cancel(); };
    const unlock = () => { void audio.unlock().catch(() => {}); };
    ui.onPause = paused => { input.cancel(); accumulator = 0; audio.pause(paused); }; ui.onSound = muted => { audio.mute(muted); unlock(); };
    document.addEventListener('pointerdown', unlock); document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility); window.addEventListener('resize', resize);
    const measurements: number[] = [];
    function loop(now: number): void {
      if (!alive) return;
      const elapsed = Math.min(0.065, (now - last) / 1000); last = now;
      const dt = document.hidden || ui.paused ? 0 : elapsed;
      accumulator += dt;
      while (accumulator >= 1 / 60) { world.tick(1 / 60); accumulator -= 1 / 60; }
      scene.render(dt); uiTime += elapsed;
      if (uiTime > 0.08) { ui.update(); uiTime = 0; }
      if (import.meta.env.DEV && dt > 0) { measurements.push(elapsed * 1000); if (measurements.length > 240) measurements.shift(); }
      frame = requestAnimationFrame(loop);
    }
    const dispose = () => { alive = false; cancelAnimationFrame(frame); input.dispose(); ui.dispose(); audio.dispose(); scene.dispose(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
    if (import.meta.env.DEV) {
      Object.assign(window, { __forest: { world, view: scene, ui, measurements, dispose } });
      import.meta.hot?.dispose(dispose);
    }
    ui.update(); frame = requestAnimationFrame(loop); ui.reveal(); loader.classList.add('leaving');
    window.setTimeout(() => loader.remove(), 700);
  } catch (error) {
    view?.dispose(); console.error('Forest initialization failed', error);
    loader.innerHTML = '<span class="seal">阵</span><h2>山林尚未展开</h2><p>画面资源未能载入，请重试。</p><button class="primary" id="retry">重新载入</button>';
    loader.querySelector('#retry')!.addEventListener('click', () => location.reload());
  }
}
void start();
