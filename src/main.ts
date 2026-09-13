import './ui/style.css';
import './ui/roguelike.css';
import './ui/ultimate.css';
import './ui/removal.css';
import './ui/birth.css';
import './ui/polish.css';
import './ui/mobile.css';
import './ui/ink-theme.css';
import './ui/slayer.css';
import './ui/array.css';
import './ui/opening.css';
import './ui/manuscript.css';
import './ui/audio-settings.css';
import { World } from './game/world';
import { SceneView } from './render/view';
import { GameInterface } from './ui/interface';
import { DrawingInput } from './ui/input';
import { Soundscape } from './ui/audio';
import { performancePanel } from './core/frame-monitor';
import { FrameGate } from './core/frame-gate';
import { playOpening } from './ui/opening';
import { audioShouldPause } from './audio/pause-policy';
import { ForestAudio } from './audio/forest-audio';
import { AudioSettings } from './ui/audio-settings';
import { loadUiArt } from './ui/ui-assets';
import { lockPageZoom } from './ui/page-zoom';
import { AudioMixer } from './audio/mixer';
import { preloadCombatAudio } from './audio/loading';
import { readAudioPreferences } from './audio/preferences';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!, host = document.querySelector<HTMLElement>('#interface')!;
const unlockPageZoom = lockPageZoom();
if (import.meta.hot) import.meta.hot.dispose(unlockPageZoom);
const loader = document.createElement('div'); loader.className = 'loader';
loader.innerHTML = '<span class="seal">阵</span><h2>山野 · 阵火</h2><div class="load-line" aria-hidden="true"></div><p class="load-status" role="status">正在展开山林…</p>';
document.querySelector('#game')!.append(loader);

async function start(): Promise<void> {
  let view: SceneView | null = null;
  const mixer = new AudioMixer();
  let ready!: () => void, failed!: (reason: unknown) => void;
  const resources = new Promise<void>((resolve,reject) => { ready=resolve;failed=reject; });
  const experience = import.meta.env.DEV ? new URLSearchParams(location.search).get('experience') : null;
  const opening = playOpening(document.querySelector<HTMLElement>('#game')!, { ready:resources, onEnter:() => {
    mixer.setPreferences(readAudioPreferences());
    // Resume the SAME game context inside the first real click, before playing the film.
    void mixer.unlock().catch(error=>console.warn('Audio activation deferred',error));
  } });
  let cancelled = false;
  if (import.meta.env.DEV) import.meta.hot?.dispose(() => { cancelled = true; opening.dispose(); mixer.dispose(); });
  try {
    const world = new World({ roguelike: true }); view = new SceneView(canvas, world);
    // Optional sound loading never owns the visual entry gate. The live mixer
    // retries unavailable tracks after user activation and restores them in place.
    void mixer.preload(['forest-cues','night-theme']).catch(error => console.warn('Audio will retry after entry', error));
    void preloadCombatAudio().catch(error => console.warn('Combat audio will retry after entry', error));
    loader.querySelector('.load-status')!.textContent = '正在展开山林…';
    await Promise.all([view.load(), loadUiArt((loaded, total) => {
      loader.querySelector('.load-status')!.textContent = `展开画卷 · ${loaded} / ${total}`;
      opening.status(`载入画卷 ${loaded} / ${total}`);
    })]);
    opening.status('开场载入中…'); ready();
    if (experience) opening.dispose();
    await opening.finished;
    if (cancelled) { view.dispose(); return; }
    if (import.meta.env.DEV && experience && ['slayer','spirit','array','reward'].includes(experience)) {
      const choices = experience === 'slayer' ? ['three','scar'] : experience === 'spirit' ? ['twins','mimic'] : ['twinArray','fivefold'];
      const { boonFate } = await import('./game/roguelike');
      world.build.beginPair(choices.map((b,i) => ({serial:i+1,boon:b as import('./game/roguelike').Boon,fate:boonFate(b as import('./game/roguelike').Boon),roots:['earth'],tier:'ordinary'})));
      world.mechanics.initialize(); world.phase = 'prepare';
      if (experience === 'reward') { world.wave=1; world.build.rollOffers(80); world.phase='rest'; }
    }
    const scene = view, ui = new GameInterface(host, world), input = new DrawingInput(world, scene, ui), audio = new Soundscape(world,mixer);
    void audio.unlock().catch(error=>console.warn('Audio activation deferred',error));
    const forestAudio = new ForestAudio(world, audio.mixer, host);
    let settingsPaused = false, settingsOpen = false;
    const audioSettings = new AudioSettings(host, audio.mixer, open => {
      settingsOpen = open;
      if (open) { settingsPaused = !ui.blocked && ['battle', 'prepare'].includes(world.phase); if (settingsPaused) ui.togglePause(); }
      else if (settingsPaused) { settingsPaused = false; if (ui.paused) ui.togglePause(); }
      audio.pause(audioShouldPause(world.phase, ui.blocked, document.hidden, open));
    }, muted => { ui.muted = muted; });
    ui.onSettings = () => audioSettings.open();
    const monitor = performancePanel(canvas);
    const gate = new FrameGate();
    let frame = 0, accumulator = 0, uiTime = 0, alive = true, needsPaint = true;
    const resize = () => { input.cancel(); scene.resize(); needsPaint=true; ui.update(); };
    const frameResize = (event: MessageEvent) => {
      if (event.source === window.parent && event.origin === location.origin && event.data?.type === 'game-viewport-change') resize();
    };
    const visibility = () => {
      gate.reset(); accumulator = 0; audio.pause(audioShouldPause(world.phase, ui.blocked, document.hidden, settingsOpen)); input.cancel();
      cancelAnimationFrame(frame);
      if (!document.hidden && alive) { needsPaint=true; frame=requestAnimationFrame(loop); }
    };
    const unlock = () => { void audio.unlock().catch(() => {}); };
    ui.onPause = paused => { input.cancel(); accumulator = 0; needsPaint=true; audio.pause(audioShouldPause(world.phase, paused, document.hidden, settingsOpen)); }; ui.onSound = muted => { audio.mute(muted); unlock(); };
    document.addEventListener('pointerdown', unlock); document.addEventListener('touchend', unlock); document.addEventListener('click', unlock); document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility); window.addEventListener('resize', resize);
    window.addEventListener('message', frameResize);
    const measurements: number[] = [];
    function loop(now: number): void {
      if (!alive || document.hidden) return;
      const rawElapsed = gate.take(now);
      if (rawElapsed === null) { frame=requestAnimationFrame(loop); return; }
      const frameStart = performance.now(), elapsed = Math.min(0.065, rawElapsed / 1000);
      const waiting = ui.blocked || world.phase === 'rest' || world.phase === 'won' || world.phase === 'lost';
      const dt = waiting ? 0 : elapsed;
      accumulator += dt;
      while (accumulator >= 1 / 60) { world.tick(1 / 60); accumulator -= 1 / 60; }
      input.flushPreview(dt);
      forestAudio.update(elapsed, dt);
      const simulationEnd = performance.now();
      const painted = world.phase !== 'destiny' && (!waiting || needsPaint);
      if (painted) scene.render(dt);
      needsPaint=false;
      const renderEnd = performance.now();
      if(painted && dt>0)scene.reportRenderCost(renderEnd-simulationEnd);
      uiTime += elapsed;
      if (uiTime > (waiting ? .25 : .1)) { ui.update(); uiTime = 0; }
      monitor?.add({ elapsed: rawElapsed, simulation: simulationEnd - frameStart, render: renderEnd - simulationEnd, ui: performance.now() - renderEnd, painted });
      if (import.meta.env.DEV && dt > 0) { measurements.push(rawElapsed); if (measurements.length > 240) measurements.shift(); }
      frame = requestAnimationFrame(loop);
    }
    const dispose = () => { alive = false; cancelAnimationFrame(frame); monitor?.dispose(); audioSettings.dispose(); forestAudio.dispose(); input.dispose(); ui.dispose(); audio.dispose(); scene.dispose(); window.removeEventListener('resize', resize); window.removeEventListener('message', frameResize); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerdown', unlock); document.removeEventListener('touchend', unlock); document.removeEventListener('click', unlock); document.removeEventListener('keydown', unlock); };
    if (import.meta.env.DEV) {
      Object.assign(window, { __forest: { world, view: scene, ui, audio: audio.mixer, soundscape: audio, score: forestAudio.score, measurements, dispose } });
      import.meta.hot?.dispose(dispose);
    }
    // Loading images can span a device rotation before resize listeners exist.
    // Every entry through the film starts with the handbook, including skips.
    ui.showIntroduction();
    resize(); frame = requestAnimationFrame(loop); ui.reveal(); loader.classList.add('leaving');
    window.setTimeout(() => loader.remove(), 700);
  } catch (error) {
    // Scene loading must not dismiss the entry gate or interrupt the film.
    failed(error);
    if (cancelled) { view?.dispose(); mixer.dispose(); return; }
    mixer.dispose();
    view?.dispose(); console.error('Forest initialization failed', error);
    loader.innerHTML = '<span class="seal">阵</span><h2>山林尚未展开</h2><p>画面资源未能载入，请重试。</p><button class="primary" id="retry">重新载入</button>';
    loader.querySelector('#retry')!.addEventListener('click', () => location.reload());
  }
}
void start();
