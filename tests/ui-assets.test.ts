import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirstRunGuide } from '../src/ui/first-run-guide';
import { helpPanel } from '../src/ui/help-panel';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('illustrated UI preparation', () => {
  it('shares decoded world art and bounds large sprite work including the illustrated boundary', async () => {
    let active = 0, peak = 0;
    const loaded: string[] = [];
    vi.stubGlobal('Image', class { src = ''; decoding = ''; async decode() { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; loaded.push(this.src); } });
    const { loadArt } = await import('../src/render/assets');
    const first = loadArt(); expect(loadArt()).toBe(first);
    const assets = await first;
    expect(peak).toBe(3); expect(loaded).toHaveLength(14);
    expect(assets.boundary.src).toBe('/art/ui/cinnabar-boundary.webp');
    expect(new Set(loaded).size).toBe(14);
    await loadArt(); expect(loaded).toHaveLength(14);
  });
  it('coalesces requests and limits image decoding to three before releasing the UI', async () => {
    let active = 0, peak = 0, count = 0;
    vi.stubGlobal('Image', class { src = ''; decoding = ''; async decode() { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; count++; } });
    const font = vi.fn(async () => []); vi.stubGlobal('document', { fonts: { load: font } });
    const { loadUiArt, UI_ART } = await import('../src/ui/ui-assets');
    const progress = vi.fn(), first = loadUiArt(progress);
    expect(loadUiArt()).toBe(first); await first;
    expect(peak).toBe(3); expect(count).toBe(UI_ART.length);
    expect(progress).toHaveBeenLastCalledWith(UI_ART.length, UI_ART.length); expect(font).toHaveBeenCalledOnce();
    await loadUiArt(); expect(count).toBe(UI_ART.length);
  });
  it('allows retry after a failed image decode', async () => {
    let broken = true;
    vi.stubGlobal('Image', class { src = ''; decoding = ''; async decode() { if (broken) throw new Error('offline'); } });
    vi.stubGlobal('document', { fonts: { load: async () => [] } });
    const { loadUiArt } = await import('../src/ui/ui-assets');
    await expect(loadUiArt()).rejects.toThrow('offline'); broken = false;
    await expect(loadUiArt()).resolves.toBeUndefined();
  });
});
describe('optional first-run handbook invitation', () => {
  it('remembers opening the handbook without forcing another introduction', () => {
    const data = new Map<string,string>(); vi.stubGlobal('localStorage', { getItem: (k:string) => data.get(k), setItem: (k:string,v:string) => data.set(k,v) });
    const invite = new FirstRunGuide(); expect(invite.visible).toBe(true);
    invite.dismiss(); expect(invite.visible).toBe(false); expect(new FirstRunGuide().visible).toBe(false);
  });
  it('still dismisses the invitation when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    const invite = new FirstRunGuide(); invite.dismiss(); expect(invite.visible).toBe(false);
  });
  it('presents touch chapters and keeps diagrams separate from optional mechanics', () => {
    const basics = helpPanel(), spirits = helpPanel('spirits'), reactions = helpPanel('reactions');
    expect(basics.match(/data-action="help-chapter"/g)).toHaveLength(4);
    expect(basics.match(/class="handbook-painting"/g)).toHaveLength(3);
    expect(basics).not.toMatch(/键盘|空格|按 Q|鼠标/);
    expect(basics).toContain('灵力上限 100');
    expect(basics).not.toMatch(/不会被截断|灵资提高自然恢复上限|继续积存/);
    expect(spirits).toContain('<details open');
    expect(reactions).toContain('reaction-guide');
    expect(reactions).not.toContain('class="handbook-painting"');
  });
});
