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

/** Retry stalled connections, never interrupt a download that is making progress. */
export async function fetchBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    signal?.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const progress = () => { clearTimeout(timer); timer = setTimeout(abort, 30000); };
    progress();
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'default' });
      if (!response.ok) throw new Error(`Resource ${response.status}: ${url}`);
      // Older browsers without a readable body cannot report progress. Let their
      // native network stack handle failure instead of imposing a total deadline.
      if (!response.body) { clearTimeout(timer); return await response.arrayBuffer(); }
      progress();
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.length) { progress(); chunks.push(value); length += value.length; }
        }
      } finally { reader.releaseLock(); }
      clearTimeout(timer);
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return bytes.buffer;
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
        try {
          image.src = key;
          // decode includes network transfer; a fixed deadline can cancel an
          // otherwise healthy download on a slow mobile connection.
          await image.decode();
          return image;
        } catch (error) { image.removeAttribute('src'); if (attempt >= 2) throw error; }
      }
    }).catch(error => { images.delete(key); throw error; });
    images.set(key, ready);
  }
  return ready;
}
