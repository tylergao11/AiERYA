import { afterEach, describe, expect, it, vi } from 'vitest';
import { playOpening } from '../src/ui/opening';
import { AUDIO_PREFERENCES_KEY } from '../src/audio/preferences';

class Element extends EventTarget {
  hidden = false; inert = false; isConnected = true; innerHTML = ''; className = '';
  dataset: Record<string, string> = {}; style: Record<string, string> = {};
  children: Element[] = []; attributes = new Map<string, string>();
  selectors = new Map<string, Element>();
  currentTime = 0; duration = 9.4; muted = false; defaultMuted = false; playsInline = false; volume = 1; src = '';
  play = vi.fn(() => Promise.resolve()); pause = vi.fn(); load = vi.fn();
  focus = vi.fn(() => { document.activeElement = this; });
  remove = vi.fn(() => { this.isConnected = false; });
  animate = vi.fn((_frames: unknown, _options?: { duration?: number; easing?: string; fill?: string }) => ({ finished: Promise.resolve() }));
  append(node: Element) { this.children.push(node); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { this.attributes.delete(key); if (key === 'src') this.src = ''; }
  querySelector(selector: string) { return this.selectors.get(selector); }
}
const document = Object.assign(new EventTarget(), { activeElement: new Element(), hidden: false, createElement: vi.fn() });
function setup(saved?: object) {
  vi.useFakeTimers(); document.hidden = false; document.activeElement = new Element();
  const parent = new Element(), sibling = new Element(), overlay = new Element(); parent.children.push(sibling);
  for (const selector of ['video', 'audio', '.opening-entry', '.opening-enter', '.opening-controls', '.opening-skip', '.opening-play', '.opening-progress', '.opening-progress span']) {
    const element = new Element(); element.hidden = ['video', '.opening-controls', '.opening-play', '.opening-progress'].includes(selector);
    overlay.selectors.set(selector, element);
  }
  document.createElement.mockReturnValue(overlay);
  const data = new Map<string, string>(saved ? [[AUDIO_PREFERENCES_KEY, JSON.stringify(saved)]] : []);
  vi.stubGlobal('HTMLElement', Element); vi.stubGlobal('document', document);
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key), setItem: (key: string, value: string) => data.set(key, value) });
  vi.stubGlobal('window', { setInterval, matchMedia: () => ({ matches: false }) });
  const handle = playOpening(parent as unknown as HTMLElement), get = (s: string) => overlay.selectors.get(s)!;
  return { handle, overlay, sibling, data, get, click: (s = '.opening-enter') => get(s).dispatchEvent(new Event('click')) };
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('entry gesture and audible opening', () => {
  it('waits indefinitely at the entry page without playing or timing out', async () => {
    const f = setup(), done = vi.fn(); void f.handle.finished.then(done);
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.get('video').play).not.toHaveBeenCalled(); expect(f.get('audio').play).not.toHaveBeenCalled();
    expect(f.overlay.dataset.stage).toBe('entry'); expect(done).not.toHaveBeenCalled();
    expect(f.sibling.inert).toBe(true); f.handle.dispose(); await f.handle.finished;
  });
  it('starts both unmuted media inside the click, including after saved zero volume', async () => {
    const f = setup({ muted: true, master: 0, music: 0, effects: 0 }); f.click();
    expect(f.get('audio').play).toHaveBeenCalledOnce(); expect(f.get('video').play).toHaveBeenCalledOnce();
    expect(f.get('video').muted).toBe(false); expect(f.get('video').defaultMuted).toBe(false);
    expect(f.get('video').volume).toBeCloseTo(.68); expect(f.get('audio').volume).toBeGreaterThan(0);
    expect(f.overlay.dataset.stage).toBe('starting'); expect(f.get('.opening-entry').hidden).toBe(false);
    f.get('video').dispatchEvent(new Event('playing')); await Promise.resolve();
    expect(f.overlay.dataset.stage).toBe('film'); expect(f.get('.opening-entry').animate).toHaveBeenCalledOnce(); expect(f.get('.opening-entry').hidden).toBe(true);
    expect(f.get('video').hidden).toBe(false); expect(f.overlay.innerHTML).not.toContain('有声重播');
    expect(JSON.parse(f.data.get(AUDIO_PREFERENCES_KEY)!).muted).toBe(false);
    f.click(); expect(f.get('video').play).toHaveBeenCalledOnce(); f.handle.dispose(); await f.handle.finished;
  });
  it.each(['ended', 'skipped'] as const)('releases media, timers and the underlying UI when %s', async reason => {
    const f = setup(); f.click();
    if (reason === 'ended') f.get('video').dispatchEvent(new Event('ended')); else f.click('.opening-skip');
    await expect(f.handle.finished).resolves.toBe(reason);
    expect(f.sibling.inert).toBe(false); expect(f.overlay.remove).toHaveBeenCalledOnce();
    for (const media of [f.get('video'), f.get('audio')]) { expect(media.pause).toHaveBeenCalled(); expect(media.load).toHaveBeenCalledOnce(); }
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not skip the entry gate when the preloaded film is unavailable', async () => {
    const f = setup(), done = vi.fn(); void f.handle.finished.then(done);
    f.get('video').dispatchEvent(new Event('error')); await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    f.click(); await expect(f.handle.finished).resolves.toBe('unavailable');
  });
  it('offers an audible resume after rejection without replaying or silently timing out', async () => {
    const f = setup(); f.get('video').play.mockRejectedValueOnce(new Error('blocked')); f.click(); await Promise.resolve();
    expect(f.get('.opening-play').hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(12000); expect(f.overlay.remove).not.toHaveBeenCalled();
    f.get('video').currentTime = 2; f.click('.opening-play'); await Promise.resolve();
    expect(f.get('video').currentTime).toBe(2); expect(f.get('video').muted).toBe(false);
    expect(f.get('.opening-play').hidden).toBe(true); f.handle.dispose(); await f.handle.finished;
  });
  it('pauses in the background and only resumes a film already started', async () => {
    const f = setup(); document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    expect(f.get('video').play).not.toHaveBeenCalled(); f.click();
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(12000); expect(f.overlay.remove).not.toHaveBeenCalled();
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    expect(f.get('video').play).toHaveBeenCalledTimes(2); f.handle.dispose(); await f.handle.finished;
  });
  it('lets Escape skip only after entering and isolates the entry keyboard focus', async () => {
    const f = setup(); const key = (value: string) => f.overlay.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: value }));
    key('Tab'); expect(f.get('.opening-enter').focus).toHaveBeenCalled();
    key('Escape'); expect(f.overlay.remove).not.toHaveBeenCalled(); f.click(); key('Escape');
    await expect(f.handle.finished).resolves.toBe('skipped');
  });
  it('only abandons a stalled film after the user has entered', async () => {
    const f = setup(); f.click(); await vi.advanceTimersByTimeAsync(8000);
    await expect(f.handle.finished).resolves.toBe('unavailable');
  });
  it('keeps explicit entry for reduced motion and uses a shorter cover dissolve', async () => {
    const f = setup(); vi.stubGlobal('window', { setInterval, matchMedia: () => ({ matches: true }) });
    expect(f.get('video').play).not.toHaveBeenCalled(); f.click();
    expect(f.get('.opening-entry').hidden).toBe(false);
    f.get('video').dispatchEvent(new Event('playing')); await Promise.resolve();
    expect(f.get('.opening-entry').animate.mock.calls[0]?.[1]).toMatchObject({ duration: 120 });
    f.get('video').dispatchEvent(new Event('ended')); await expect(f.handle.finished).resolves.toBe('ended');
  });
});
