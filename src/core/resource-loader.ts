import assetOrigin from './asset-origin.json';
const mirrored = new Set(assetOrigin.paths);
const images = new Map<string, Promise<HTMLImageElement>>();
let active = 0;
const pending: (() => void)[] = [];
export const assetUrl = (path: string): string => {
  const url = new URL(path, document.baseURI);
  const base = new URL(import.meta.env.BASE_URL, document.baseURI);
  const relative = url.pathname.slice(base.pathname.length);
  // Only byte-verified, unchanged assets use the working immutable deployment.
  // New code and any new assets remain on this release's own origin.
  if (import.meta.env.PROD && url.origin === base.origin && url.pathname.startsWith(base.pathname) && mirrored.has(relative)) {
    return new URL(relative + url.search, `${assetOrigin.origin}/`).href;
  }
  return url.href;
};

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>(resolve => pending.push(resolve));
  else active++;
  try { return await work(); }
  finally { const next = pending.shift(); if (next) next(); else active--; }
}

/** Retry transient mobile-network failures, with a finite wait for every attempt. */
export async function fetchBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  url = assetUrl(url);
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 20000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: attempt ? 'reload' : 'default' });
      if (!response.ok) throw new Error(`Resource ${response.status}: ${url}`);
      return await response.arrayBuffer();
    } catch (error) {
      if (signal?.aborted || attempt >= 2) throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
}

/** All scene and UI callers share three decode slots and the same retained image. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  const key = assetUrl(url);
  let ready = images.get(key);
  if (!ready) {
    ready = slot(async () => {
      for (let attempt = 0; ; attempt++) {
        const image = new Image(); image.decoding = 'async'; image.crossOrigin = 'anonymous';
        let timer = 0;
        try {
          image.src = attempt ? `${key}${key.includes('?') ? '&' : '?'}retry=${attempt}` : key;
          await Promise.race([image.decode(), new Promise<never>((_, reject) => {
            timer = window.setTimeout(() => reject(new Error(`Image timed out: ${url}`)), 20000);
          })]);
          return image;
        } catch (error) { image.removeAttribute('src'); if (attempt >= 2) throw error; }
        finally { clearTimeout(timer); }
      }
    }).catch(error => { images.delete(key); throw error; });
    images.set(key, ready);
  }
  return ready;
}
