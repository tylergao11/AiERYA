import { DEFAULT_AUDIO, readAudioPreferences, saveAudioPreferences } from '../audio/preferences';
import { assetUrl, fetchBytes, loadImage } from '../core/resource-loader';
/** The entry gesture starts both sounds before yielding to asynchronous work.
 * Game UI/input are created only after `finished`.
 */
export type OpeningExit = 'ended' | 'skipped' | 'unavailable' | 'disposed';
export interface OpeningHandle { finished: Promise<OpeningExit>; status(text: string): void; dispose(): void }
interface OpeningOptions { ready?: Promise<unknown>; onEnter?: () => void }

export function playOpening(parent: HTMLElement, options: OpeningOptions = {}): OpeningHandle {
  const overlay = document.createElement('section');
  overlay.className = 'opening'; overlay.dataset.stage = 'entry'; overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '山野阵火起始页');
  overlay.innerHTML = `<div class="opening-entry"><img class="opening-cover" hidden crossorigin="anonymous" alt="宣纸水墨题画，山野阵火" fetchpriority="high"><h1 class="opening-title">山野阵火</h1><div class="opening-loading" role="status"><span class="opening-load-line"></span><span class="opening-load-status">载入画卷…</span><button type="button" class="opening-retry" hidden>重试</button></div><button type="button" class="opening-enter" hidden disabled>入山 <span aria-hidden="true">→</span></button></div>
    <video class="opening-film" hidden playsinline preload="auto" aria-label="落笔成阵，五行爆发，山野阵火"></video>
    <audio class="opening-enter-cue" preload="auto"></audio>
    <div class="opening-controls" hidden><button type="button" class="opening-skip">跳过开场 <span aria-hidden="true">→</span></button></div>
    <button type="button" class="opening-play" hidden>继续播放</button>
    <div class="opening-progress" hidden aria-hidden="true"><span></span></div>`;
  const video = overlay.querySelector('video')!;
  const cue = overlay.querySelector('audio')!;
  overlay.querySelector<HTMLImageElement>('.opening-cover')!.src = assetUrl('./video/opening-entry-ink.webp');
  video.poster = assetUrl('./video/opening-first-frame.jpg');
  const entry = overlay.querySelector<HTMLElement>('.opening-entry')!;
  const enter = overlay.querySelector<HTMLButtonElement>('.opening-enter')!;
  const loading = overlay.querySelector<HTMLElement>('.opening-loading')!;
  const loadStatus = overlay.querySelector<HTMLElement>('.opening-load-status')!;
  const retry = overlay.querySelector<HTMLButtonElement>('.opening-retry')!;
  const controls = overlay.querySelector<HTMLElement>('.opening-controls')!;
  const skip = overlay.querySelector<HTMLButtonElement>('.opening-skip')!;
  const play = overlay.querySelector<HTMLButtonElement>('.opening-play')!;
  const progressBar = overlay.querySelector<HTMLElement>('.opening-progress')!;
  const progress = overlay.querySelector<HTMLElement>('.opening-progress span')!;
  const previousFocus = document.activeElement;
  const siblings = [...parent.children].filter((node): node is HTMLElement => node instanceof HTMLElement).map(node => ({ node, inert: node.inert }));
  siblings.forEach(({ node }) => { node.inert = true; });
  parent.append(overlay);
  video.muted = false; video.defaultMuted = false; video.playsInline = true;
  const blobs: string[] = [];
  let settled = false, started = false, unavailable = false, resolveFinished!: (reason: OpeningExit) => void;
  let elapsedWithoutProgress = 0, previousTime = 0;
  const finished = new Promise<OpeningExit>(resolve => { resolveFinished = resolve; });
  const events = new AbortController();
  const finish = (reason: OpeningExit) => {
    if (settled) return;
    settled = true; clearInterval(watchdog); events.abort(); video.pause(); cue.pause();
    const release = () => {
      for (const media of [video, cue]) { media.removeAttribute('src'); media.load(); }
      blobs.forEach(url => URL.revokeObjectURL(url));
      overlay.remove();
      siblings.forEach(({ node, inert }) => { node.inert = inert; });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      resolveFinished(reason);
    };
    if (reason === 'disposed' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { release(); return; }
    overlay.inert = true;
    const exit = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out' });
    void exit.finished.then(release, release);
  };
  const resume = async () => {
    if (settled || !started || document.hidden) return;
    play.hidden = true;
    try { await video.play(); }
    catch { if (!settled && !document.hidden) { enter.hidden = true; play.hidden = false; play.focus({ preventScroll: true }); } }
  };
  const on = (target: EventTarget, name: string, handler: EventListener) => target.addEventListener(name, handler, { signal: events.signal });
  on(video, 'ended', () => { if (started) finish('ended'); });
  const fail = () => { unavailable = true; if(settled)return; enter.hidden=true; loading.hidden=false; loadStatus.textContent='资源未能载入'; retry.hidden=false; };
  on(retry, 'click', () => location.reload());
  on(video, 'error', () => { unavailable = true; if (started) finish('unavailable'); else fail(); });
  on(video, 'playing', () => {
    if (settled || !started || entry.hidden || overlay.dataset.stage === 'film') return;
    overlay.dataset.stage = 'film';
    loading.hidden = true; controls.hidden = false; progressBar.hidden = false;
    // Dissolve the rendered ink cover over the first decoded video frames.
    // Both images share the same contain geometry, paper and letterbox edges.
    const fade = entry.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 520,
      easing: 'ease-out', fill: 'forwards',
    });
    void fade.finished.then(() => { entry.hidden = true; }, () => { entry.hidden = true; });
  });
  on(video, 'timeupdate', () => {
    const duration = video.duration;
    progress.style.transform = `scaleX(${Number.isFinite(duration) && duration > 0 ? Math.min(1, video.currentTime / duration) : 0})`;
  });
  on(skip, 'click', () => { if (started) finish('skipped'); });
  on(enter, 'click', () => {
    if (settled || started || enter.disabled || unavailable) return;
    started = true;
    const saved = readAudioPreferences();
    const preferences = { ...saved, muted: false, master: saved.master || DEFAULT_AUDIO.master,
      music: saved.music || DEFAULT_AUDIO.music, effects: saved.effects || DEFAULT_AUDIO.effects };
    saveAudioPreferences(preferences);
    options.onEnter?.();
    cue.volume = preferences.master * preferences.effects;
    video.volume = preferences.master * preferences.music;
    video.muted = false; video.defaultMuted = false;
    // Both play() calls run inside the click handler, retaining user activation.
    void cue.play().catch(() => {});
    enter.disabled = true; entry.inert = true;
    video.hidden = false;
    overlay.dataset.stage = 'starting'; overlay.setAttribute('aria-label', '山野阵火开场短片');
    if (unavailable) finish('unavailable'); else void resume();
  });
  on(play, 'click', () => { elapsedWithoutProgress = 0; void resume(); });
  on(document, 'visibilitychange', () => {
    elapsedWithoutProgress = 0;
    if (document.hidden) { video.pause(); cue.pause(); } else void resume();
  });
  on(overlay, 'keydown', event => {
    const key = event as KeyboardEvent;
    if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); if (started) finish('skipped'); }
    if (key.key === 'Tab') {
      const buttons = started ? [...(!controls.hidden ? [skip] : []), ...(!play.hidden ? [play] : [])] : !retry.hidden ? [retry] : !enter.hidden ? [enter] : [];
      if(!buttons.length){key.preventDefault();return;}
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = (current + (key.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      key.preventDefault(); buttons[next]!.focus();
    }
  });
  // Waiting for entry or an explicit playback retry must never time out.
  const watchdog = window.setInterval(() => {
    if (!started || document.hidden || settled || !play.hidden) return;
    elapsedWithoutProgress = video.currentTime > previousTime ? 0 : elapsedWithoutProgress + 1;
    previousTime = video.currentTime;
    if (elapsedWithoutProgress >= 8) finish('unavailable');
  }, 1000);
  const media = async (target: HTMLMediaElement, path: string, type: string) => {
    const bytes = await fetchBytes(path, events.signal);
    if(settled)return;
    const url=URL.createObjectURL(new Blob([bytes],{type}));blobs.push(url);target.src=url;target.load();
  };
  // The film can begin while the scene preloads. main.ts still awaits scene
  // readiness before creating controls, so this never admits an incomplete game.
  void options.ready?.catch(error => { if (!settled) { console.error('Game resources failed', error); fail(); } });
  void Promise.all([
    loadImage('./video/opening-entry-ink.webp').then(() => { if(!settled)overlay.querySelector<HTMLImageElement>('.opening-cover')!.hidden=false; }),
    loadImage('./art/ui/cinnabar.webp'),
    media(video, './video/opening-ink-mobile.mp4', 'video/mp4'),
    media(cue, './audio/opening-enter.wav', 'audio/wav').catch(error => console.warn('Entry sound unavailable', error)),
  ]).then(() => {
    if(settled||unavailable)return;
    loading.hidden=true;enter.hidden=false;enter.disabled=false;enter.focus({preventScroll:true});
  }).catch(error => { if(!settled){console.error('Opening preload failed',error);fail();} });
  return { finished, status: text => { if(!settled&&!unavailable)loadStatus.textContent=text; }, dispose: () => finish('disposed') };
}
