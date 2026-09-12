export interface ArtAssets { landscape: HTMLImageElement; wolves: HTMLImageElement; mage: HTMLImageElement; fire: HTMLImageElement }

async function image(src: string): Promise<HTMLImageElement> {
  const result = new Image(); result.decoding = 'async'; result.src = src; await result.decode(); return result;
}
export async function loadArt(): Promise<ArtAssets> {
  const [landscape, wolves, mage, fire] = await Promise.all([image('/art/forest-valley.png'), image('/art/wolf-atlas.png'), image('/art/mage.png'), image('/art/fire-atlas.png')]);
  return { landscape, wolves, mage, fire };
}
