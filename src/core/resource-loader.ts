const images = new Map<string, Promise<HTMLImageElement>>();
let active = 0;
const pending: (() => void)[] = [];
export const assetUrl = (path: string): string => new URL(path, document.baseURI).href;

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>(resolve => pending.push(resolve));
  else active++;
  try { return await work(); }
  finally { const next = pending.shift(); if (next) next(); else active--; }
}

/** Retry transient mobile-network failures, with a finite wait for every attempt. */
export async function fetchBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 25000);
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
        const image = new Image(); image.decoding = 'async';
        let timer = 0;
        try {
          image.src = key;
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
