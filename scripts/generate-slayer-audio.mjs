import fs from 'node:fs/promises';
import ts from 'typescript';

const source = await fs.readFile(new URL('../src/ui/slayer-sound-bank.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { SLAYER_AUDIO_RATE: rate, SLAYER_CUES, SLAYER_SPRITE, SLAYER_SPRITE_SECONDS, renderSlayerCue } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
function wav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2)); return b;
}
const sprite = new Float32Array(Math.ceil(SLAYER_SPRITE_SECONDS * rate));
const diagnostics = [];
for (const cue of SLAYER_CUES) for (let variant = 0; variant < 3; variant++) {
  const samples = renderSlayerCue(cue, variant), segment = SLAYER_SPRITE.get(`${cue}:${variant}`);
  sprite.set(samples, Math.round(segment.offset * rate));
  diagnostics.push({ cue, variant, duration: segment.duration, peak: samples.reduce((m, n) => Math.max(m, Math.abs(n)), 0), rms: Math.sqrt(samples.reduce((m, n) => m + n * n, 0) / samples.length) });
}
await fs.mkdir(new URL('../public/audio/', import.meta.url), { recursive: true });
await fs.writeFile(new URL('../public/audio/slayer-blades.wav', import.meta.url), wav(sprite));
await fs.mkdir(new URL('../artifacts/slayer/', import.meta.url), { recursive: true });
await fs.writeFile(new URL('../artifacts/slayer/audio-bank-audit.json', import.meta.url), JSON.stringify(diagnostics, null, 2), 'utf8');
// A spaced listening reel; actual combat uses the same samples with priority mixing.
const audition = new Float32Array(rate * 17);
for (const [i, cue] of ['air', 'cut', 'cleave', 'charge1', 'charge2', 'charge3', 'crush', 'return', 'block', 'break', 'combo', 'recover', 'finisher', 'pursuit'].entries()) {
  audition.set(renderSlayerCue(cue, 1), Math.round((.25 + i * 1.25) * rate));
}
await fs.writeFile(new URL('../artifacts/slayer/slayer-sound-reel.wav', import.meta.url), wav(audition));
console.log(JSON.stringify({ clips: diagnostics.length, spriteBytes: 44 + sprite.length * 2, peak: Math.max(...diagnostics.map(d => d.peak)) }));
