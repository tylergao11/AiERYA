export const UI_ART = ['scroll-surface', 'paper', 'cinnabar', 'elements', 'talent-paintings', 'faction-paintings', 'rewards', 'handbook-paintings', 'reward-martial-paintings', 'reward-spirit-paintings', 'reward-mystic-paintings', 'reward-elements-paintings', 'destiny-progress-paintings', 'array-support-paintings'] as const;
import { assetUrl, loadImage } from '../core/resource-loader';
let ready: Promise<void> | undefined;
const retained: HTMLImageElement[] = [];

/** Decode once during the opening, never on the first tap of a skill/menu. */
export function loadUiArt(progress?: (loaded: number, total: number) => void): Promise<void> {
  // CSS variables are substituted in the consuming stylesheet: pin their URL to
  // the game document before a repository subdirectory can change the base.
  document.documentElement.style.setProperty('--paper-image', `url("${assetUrl('./art/ui/paper.webp')}")`);
  document.documentElement.style.setProperty('--scroll-surface', `url("${assetUrl('./art/ui/scroll-surface.webp')}")`);
  return ready ??= (async () => {
    let cursor = 0, loaded = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < UI_ART.length) {
        const asset = UI_ART[cursor++]!;
        const image = await loadImage(`./art/ui/${asset}.webp`);
        retained.push(image); progress?.(++loaded, UI_ART.length);
      }
    }));
    await document.fonts.load('24px "Jianghu Brush"');
  })().catch(error => { ready = undefined; retained.length = 0; throw error; });
}
