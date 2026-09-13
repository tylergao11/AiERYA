import { defineConfig } from 'vite';
import { cpSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const assetOrigin = JSON.parse(readFileSync(new URL('./src/core/asset-origin.json', import.meta.url), 'utf8')) as { origin: string; paths: string[]; sha256: Record<string, string> };

// Keep editable PNG masters in the repository without publishing duplicate textures.
const optimized = JSON.parse(readFileSync(new URL('./docs/design/visuals/warm-scroll-v2/runtime-art-manifest.json', import.meta.url), 'utf8')) as {source:string;runtime:string}[];
const sourceOnly = new Set(optimized.filter(row => row.source.startsWith('public/') && row.runtime !== row.source).map(row => row.source.slice(7)));
sourceOnly.add('video/opening-ink.mp4');
let projectRoot = '', outputDirectory = '';
const sharedAssets = new Set(assetOrigin.paths.filter(path => {
  try { return createHash('sha256').update(readFileSync(new URL(`./public/${path}`, import.meta.url))).digest('hex') === assetOrigin.sha256[path]; }
  catch { return false; }
}));
const sharedUrl = (path: string) => sharedAssets.has(path) ? `${assetOrigin.origin}/${path}` : undefined;
const routedHtml = (html: string) => html.replace(/(href|src)="(?:\.\/|\/)(art|audio|fonts|video)\/([^"]+)"/g,
  (all, attr: string, dir: string, file: string) => { const url = sharedUrl(`${dir}/${file}`); return url ? `${attr}="${url}"` : all; });

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: { outDir: 'web-release', target: 'es2022', chunkSizeWarningLimit: 850, copyPublicDir: false,
    rollupOptions: { input: { index: resolve(import.meta.dirname, 'index.html'), game: resolve(import.meta.dirname, 'game.html') } } },
  plugins: [{
    name: 'verified-mobile-asset-origin', apply: 'build', enforce: 'pre',
    transformIndexHtml: { order: 'pre', handler: routedHtml },
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/core/asset-origin.json')) return JSON.stringify({ origin: assetOrigin.origin, paths: [...sharedAssets] });
      if (!id.endsWith('.css')) return;
      return code.replace(/url\((['"]?)\/?(art|audio|fonts|video)\/([^)'"\s]+)\1\)/g,
        (all, _quote: string, dir: string, file: string) => { const url = sharedUrl(`${dir}/${file}`); return url ? `url("${url}")` : all; });
    },
  }, {
    name: 'publish-runtime-art', apply: 'build',
    configResolved(config) { projectRoot = config.root; outputDirectory = resolve(config.root, config.build.outDir); },
    writeBundle() {
      const publicDirectory = resolve(projectRoot, 'public');
      cpSync(publicDirectory, outputDirectory, { recursive: true, filter: path => !sourceOnly.has(relative(publicDirectory, path).replaceAll('\\', '/')) });
    },
  }],
});
