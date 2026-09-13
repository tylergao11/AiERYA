import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Reuse the existing UI cue as a small, independently preloadable entry sound.
const input = fileURLToPath(new URL('../public/audio/forest-cues.mp3', import.meta.url));
const output = fileURLToPath(new URL('../public/audio/opening-enter.wav', import.meta.url));
execFileSync(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
  '-ss', '0.1', '-t', '0.18', '-af', 'volume=14dB', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', output], { windowsHide: true });
console.log(`Opening entry cue: 0.18s, ${statSync(output).size} bytes`);
