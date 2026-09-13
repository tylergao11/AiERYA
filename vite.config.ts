import { defineConfig } from 'vite';
import { cpSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

// Keep editable PNG masters in the repository without publishing duplicate textures.
const optimized = JSON.parse(readFileSync(new URL('./docs/design/visuals/warm-scroll-v2/runtime-art-manifest.json', import.meta.url), 'utf8')) as {source:string;runtime:string}[];
const sourceOnly = new Set(optimized.filter(row => row.source.startsWith('public/') && row.runtime !== row.source).map(row => row.source.slice(7)));
sourceOnly.add('video/opening-ink.mp4');
let projectRoot = '', outputDirectory = '';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: { outDir: 'web-release', target: 'es2022', chunkSizeWarningLimit: 850, copyPublicDir: false,
    rollupOptions: { input: { index: resolve(import.meta.dirname, 'index.html'), game: resolve(import.meta.dirname, 'game.html') } } },
  plugins: [{
    name: 'publish-runtime-art', apply: 'build',
    configResolved(config) { projectRoot = config.root; outputDirectory = resolve(config.root, config.build.outDir); },
    writeBundle() {
      const publicDirectory = resolve(projectRoot, 'public');
      cpSync(publicDirectory, outputDirectory, { recursive: true, filter: path => !sourceOnly.has(relative(publicDirectory, path).replaceAll('\\', '/')) });
    },
  }],
});
