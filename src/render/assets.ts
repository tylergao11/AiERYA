export interface ArtAssets { landscape: HTMLImageElement; boundary: HTMLImageElement; wolves: HTMLImageElement; wolfTiers: HTMLImageElement; mage: HTMLImageElement; fire: HTMLImageElement; formations: HTMLImageElement; metal: HTMLImageElement; spirits: HTMLImageElement; ancestor: HTMLImageElement; spiritWalk: HTMLImageElement; spiritEffects: HTMLImageElement; spiritGround:HTMLImageElement; arraySpells: HTMLImageElement }

import { loadImage as image } from '../core/resource-loader';
let artPromise: Promise<ArtAssets> | undefined;
export function loadArt(): Promise<ArtAssets> {
  return artPromise ??= decodeArt().catch(error => { artPromise = undefined; throw error; });
}
async function decodeArt(): Promise<ArtAssets> {
  const paths: Record<keyof ArtAssets, string> = {
    landscape: './art/forest-valley.webp', boundary: './art/ui/cinnabar-boundary.webp',
    wolves: './art/wolf-atlas.webp', wolfTiers: './art/wolf-tiers-atlas.webp', mage: './art/mage-cast-atlas.webp',
    fire: './art/fire-atlas.webp', formations: './art/formation-atlas.webp', metal: './art/metal-atlas.webp',
    spirits: './art/element-spirit-atlas.webp', ancestor: './art/ancestor-beast-atlas.webp', spiritWalk: './art/spirit-walk-atlas.webp',
    spiritEffects: './art/spirit-effects-atlas.webp', spiritGround: './art/spirit-ground-atlas-v2.webp', arraySpells: './art/array-spells-atlas.webp',
  };
  const keys = Object.keys(paths) as (keyof ArtAssets)[], result = {} as ArtAssets;
  let cursor = 0;
  // Bound large sprite decodes so opening playback and font decoding keep time on mobile.
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < keys.length) { const key = keys[cursor++]!; result[key] = await image(paths[key]); }
  }));
  return result;
}
