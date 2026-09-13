import { assetUrl, fetchBytes } from '../core/resource-loader';

const files = new Map<string, Promise<ArrayBuffer>>();
export function audioFormats(): string[] {
  const audio = document.createElement('audio');
  return audio.canPlayType('audio/ogg; codecs="vorbis"') ? ['ogg', 'mp3'] : ['mp3'];
}
export function audioBytes(url: string): Promise<ArrayBuffer> {
  const key = assetUrl(url);
  let ready = files.get(key);
  if (!ready) { ready = fetchBytes(key).catch(error => { files.delete(key); throw error; }); files.set(key, ready); }
  return ready.then(bytes => bytes.slice(0));
}
export async function preloadCombatAudio(): Promise<void> {
  await audioBytes(`${import.meta.env.BASE_URL}audio/slayer-blades.wav`);
  await audioBytes(`${import.meta.env.BASE_URL}audio/summon-materials.wav`);
  await audioBytes(`${import.meta.env.BASE_URL}audio/array-spells.${audioFormats()[0]}`);
}
