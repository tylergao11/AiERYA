/** Offline, deterministic motion-design master. No game or balance dependencies.
 * node scripts/render-opening.mjs [--stills]
 * Set CANVAS_MODULE to @napi-rs/canvas's entry path when using another workstation.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { makeOpeningScore } from './score-opening.mjs';

const require = createRequire(import.meta.url);
let canvasModule;
try { canvasModule = require('@napi-rs/canvas'); } catch {
  canvasModule = require(process.env.CANVAS_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas'));
}
const { createCanvas, loadImage, GlobalFonts } = canvasModule;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public/video'), evidence = join(root, 'artifacts/opening');
await mkdir(output, { recursive: true }); await mkdir(evidence, { recursive: true });
GlobalFonts.registerFromPath(join(process.env.WINDIR || 'C:/Windows', 'Fonts/STXINGKA.TTF'), 'OpeningBrush');
GlobalFonts.registerFromPath(join(process.env.WINDIR || 'C:/Windows', 'Fonts/simkai.ttf'), 'OpeningKai');
const plate = await loadImage(join(root, 'docs/design/visuals/opening/ink-battle.png'));
const W = 1920, H = 1080, FPS = 30, DURATION = 9.4;
const canvas = createCanvas(W, H), c = canvas.getContext('2d');
const TAU = Math.PI * 2, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const out = x => 1 - (1 - clamp(x)) ** 3;
const mix = (a, b, x) => a + (b - a) * x;
const rand = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const colors = ['#dce6df', '#b9cc89', '#80c8cd', '#ffb65b', '#c5a378'];
const labels = ['金', '木', '水', '火', '土'];

// The texture is generated geometry, while the cinematic painting stays unmodified.
const paper = createCanvas(W, H), p = paper.getContext('2d');
p.fillStyle = '#e3dbc5'; p.fillRect(0, 0, W, H);
for (let i = 0; i < 47000; i++) {
  p.fillStyle = `rgba(64,53,35,${rand(i + 1) * .08})`;
  p.fillRect(rand(i + 2) * W, rand(i + 3) * H, .5 + rand(i + 4) * 3, .4 + rand(i + 5));
}
function line(points, color, width = 2, alpha = 1) {
  if (points.length < 2) return;
  c.save(); c.globalAlpha *= clamp(alpha); c.strokeStyle = color; c.lineWidth = width;
  c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.restore();
}
function glow(x, y, r, color, opacity = 1) {
  c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha *= clamp(opacity);
  const g = c.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  g.addColorStop(0, color); g.addColorStop(.18, color + '8a'); g.addColorStop(1, color + '00');
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
}
function words(text, x, y, size, color, spacing = 0, font = 'OpeningBrush') {
  c.save(); c.font = `${size}px ${font}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = color;
  const chars = [...text], widths = chars.map(a => c.measureText(a).width);
  let px = x - (widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)) / 2;
  chars.forEach((a, i) => { c.fillText(a, px, y); px += widths[i] + spacing; }); c.restore();
}
function seal(x, y, size, alpha = 1) {
  c.save(); c.globalAlpha *= alpha; c.translate(x, y); c.rotate(-.045);
  c.fillStyle = '#97372d'; c.fillRect(-size / 2, -size / 2, size, size);
  c.strokeStyle = '#e5c997'; c.lineWidth = 1.4; c.strokeRect(-size / 2 + 5, -size / 2 + 5, size - 10, size - 10);
  words('阵', 0, 1, size * .7, '#eee0bb', 0, 'OpeningKai');
  for (let i = 0; i < 28; i++) { c.fillStyle = '#151c20'; c.globalAlpha = .26 * alpha; c.fillRect((rand(i + 33) - .5) * size, (rand(i + 44) - .5) * size, rand(i + 55) * 4, 1); }
  c.restore();
}
function inkStroke(t) {
  const end = out((t - .12) / 1.25);
  for (let k = 0; k < 42; k++) {
    const points = [];
    for (let j = 0; j < 230 * end; j++) {
      const a = -2.8 + j / 230 * 6.7;
      const r = 370 + Math.sin(a * 3) * 9 + (k - 21) * 1.4;
      points.push([850 + Math.cos(a) * r, 546 + Math.sin(a) * r * .71 + Math.sin(j * .7 + k) * 2]);
    }
    line(points, '#15272b', 1.5 + rand(k) * 3.2, .36 + rand(k + 300) * .5);
  }
  for (let k = 0; k < 110 * end; k++) {
    const a = rand(k + 90) * TAU, radius = 350 + rand(k + 92) * 160;
    c.fillStyle = '#16282bc0'; c.beginPath(); c.ellipse(850 + Math.cos(a) * radius, 546 + Math.sin(a) * radius * .71, 1 + rand(k + 96) * 6, 1 + rand(k + 98) * 2, a, 0, TAU); c.fill();
  }
  c.save(); c.globalAlpha = smooth((t - .45) / .45);
  words('落笔', 848, 523, 204, '#17282b', 12);
  words('五 行 入 墨', 850, 681, 26, '#5a6158', 8, 'OpeningKai'); c.restore();
  seal(1130, 648, 48, smooth((t - .95) / .2));
}
function painting(t, alpha = 1) {
  c.save(); c.globalAlpha = alpha;
  const n = smooth((t - 1.75) / 3.6), scale = mix(1.43, 1.03, n) + Math.max(0, t - 5.3) * .04;
  const x = mix(-290, -28, n), y = mix(-146, -8, n);
  const shake = Math.exp(-Math.max(0, t - 5.56) * 7) * (t >= 5.56 ? 8 : 0);
  c.translate(x + Math.sin(t * 94) * shake, y + Math.cos(t * 73) * shake);
  c.drawImage(plate, 0, 0, W * scale, H * scale);
  c.restore();
}
function emberField(t, amount = 1) {
  c.save(); c.globalCompositeOperation = 'screen';
  for (let i = 0; i < 145; i++) {
    const depth = .3 + rand(i + 660) * .7;
    const x = ((rand(i + 111) * W + t * (35 + depth * 90)) % (W + 180)) - 90;
    const y = H - ((rand(i + 221) * H + t * (22 + depth * 75)) % (H + 100));
    const a = amount * (.18 + Math.sin(t * 2 + i) ** 2 * .58);
    line([[x, y], [x - depth * 9, y + depth * 4]], '#f4b465', depth * 2.4, a);
    if (i % 19 === 0) glow(x, y, 17 * depth, '#ffb864', a * .5);
  }
  c.restore();
}
function inkMotes(t) {
  for (let i = 0; i < 42; i++) {
    const x = ((rand(i + 763) * W - t * (70 + rand(i + 10) * 60)) % W + W) % W;
    const y = rand(i + 838) * H + Math.sin(t * 2 + i) * 22;
    c.save(); c.translate(x, y); c.rotate(t + i); c.fillStyle = '#060e12b0';
    c.beginPath(); c.moveTo(-5, 0); c.quadraticCurveTo(1, -8, 11, 0); c.quadraticCurveTo(0, 3, -5, 0); c.fill(); c.restore();
  }
}
function ellipseArc(cx, cy, rx, ry, start, length, color, width, alpha) {
  const points = Array.from({ length: 161 }, (_, j) => { const a = start + j / 160 * length; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  line(points, color, width, alpha);
}
function elements(t) {
  const local = t - 3.18, rise = out(local / .6);
  if (local < 0) return;
  const cx = 1000, cy = 770, rx = 505, ry = 162;
  c.save(); c.globalCompositeOperation = 'screen';
  ellipseArc(cx, cy, rx, ry, -1.7, TAU * rise, '#a49062', 1.8, .8);
  ellipseArc(cx, cy, rx + 15, ry + 8, -1.7, TAU * rise, '#ead5a0', .8, .7);
  const lit = [];
  for (let e = 0; e < 5; e++) {
    const age = local - e * .35, on = out(age / .3); if (age < 0) continue;
    const a = -Math.PI / 2 + e * TAU / 5, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    lit.push([x, y]);
    glow(x, y, 150, colors[e], .38 * on);
    c.save(); c.globalAlpha = on;
    c.strokeStyle = colors[e]; c.lineWidth = 1.4; c.beginPath(); c.ellipse(x, y, 31, 19, 0, 0, TAU); c.stroke();
    words(labels[e], x, y - 44, 45, colors[e]);
    // Five distinct moving silhouettes, rather than five copies of an orb.
    for (let j = 0; j < 7; j++) {
      const phase = (age * .58 + j / 7) % 1, top = y - 60 - Math.sin(phase * Math.PI) * (100 + j * 12);
      const px = x + Math.sin(j * 2.4 + age) * 90;
      if (e === 0) {
        const dy = 25 + phase * 48;
        line([[px - 12, top + dy], [px + 9, top - dy]], colors[e], 2.8, 1 - phase * .5);
        line([[px - 4, top + 16], [px + 4, top - 8]], '#ffffff', 5, .8);
        line([[px - 14, top + 8], [px + 8, top + 15]], colors[e], 2, .85);
      } else if (e === 1) {
        const points = Array.from({ length: 30 }, (_, k) => [x + Math.sin(k * .12 + j + age) * (k * 2.8), y - k * 7 * on]);
        line(points, colors[e], 1.8, .68);
        c.save(); c.translate(px, top); c.rotate(j + age); c.fillStyle = colors[e]; c.globalAlpha *= .7;
        c.beginPath(); c.moveTo(-13, 0); c.quadraticCurveTo(-2, -12, 15, 0); c.quadraticCurveTo(0, 7, -13, 0); c.fill(); c.restore();
      } else if (e === 2) {
        const points = Array.from({ length: 66 }, (_, k) => { const b = k / 65 * TAU + age * 2 + j; return [x + Math.cos(b) * (28 + j * 12), y - k * 2.5 + Math.sin(b) * 25]; });
        line(points, colors[e], 2 + (j % 2) * 1.5, .36);
      } else if (e === 3) {
        const points = Array.from({ length: 40 }, (_, k) => [x + Math.sin(k * .18 + age * 5 + j) * k * 1.5 + (j - 3) * 12, y - k * 5.6 * on]);
        line(points, j % 2 ? '#e46a2d' : colors[e], 9 - j, .58);
        glow(px, top, 24, '#f6b65c', .65);
      } else {
        c.save(); c.translate(px, top); c.rotate(j + age * .25); c.fillStyle = '#a68659';
        c.beginPath(); c.moveTo(-11, -8); c.lineTo(5, -16); c.lineTo(16, 4); c.lineTo(-2, 15); c.closePath(); c.fill(); c.strokeStyle = '#ecd3a1'; c.lineWidth = 2; c.stroke(); c.restore();
      }
    }
    c.restore();
    if (age < .5) ellipseArc(x, y, 20 + age * 180, 8 + age * 60, 0, TAU, colors[e], 2, 1 - age * 2);
  }
  if (lit.length > 1) line([...lit, ...(lit.length === 5 ? [lit[0]] : [])], '#ffe4a1', 2, .38);
  if (lit.length === 5) {
    for (let i = 0; i < 5; i++) line([lit[i], lit[(i + 2) % 5]], colors[i], 1, .25);
    glow(cx, cy, 420, '#ffe1a0', smooth((local - 1.4) / .7) * .45);
  }
  c.restore();
}
function burst(t) {
  const age = t - 5.62; if (age < 0 || age > 1.15) return;
  const radius = out(age / .85) * 1500;
  c.save(); c.globalCompositeOperation = 'screen';
  for (let n = 0; n < 5; n++) ellipseArc(1020, 750, radius * (1 - n * .065), radius * .43, 0, TAU, colors[n], 8 - n, (1 - age) * .8);
  for (let i = 0; i < 155; i++) {
    const a = rand(i + 1100) * TAU, velocity = 500 + rand(i + 1200) * 1300, d = age * velocity;
    const x = 1020 + Math.cos(a) * d, y = 750 + Math.sin(a) * d * .74;
    line([[x, y], [x - Math.cos(a) * (14 + age * 60), y - Math.sin(a) * (14 + age * 60)]], colors[i % 5], 1 + rand(i) * 3, clamp(1 - age));
  }
  glow(1020, 700, 850 * out(age / .25), '#ffdd9e', Math.exp(-age * 4) * .8);
  c.restore();
}
function vignette(alpha = .8) {
  const g = c.createRadialGradient(W / 2, H / 2, H * .19, W / 2, H / 2, W * .62);
  g.addColorStop(0, '#040c1000'); g.addColorStop(1, `rgba(2,8,12,${alpha})`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function title(t) {
  const a = out((t - 6.48) / .45);
  c.save(); c.globalAlpha = a;
  const scale = mix(1.13, 1, out((t - 6.48) / 1.8)); c.translate(W / 2, H / 2); c.scale(scale, scale); c.translate(-W / 2, -H / 2);
  const grad = c.createLinearGradient(0, 372, 0, 626); grad.addColorStop(0, '#f6e9c7'); grad.addColorStop(.42, '#d5bd83'); grad.addColorStop(1, '#9c7b49');
  c.shadowColor = '#090d10'; c.shadowBlur = 32;
  words('山野', 661, 530, 237, grad, 0); words('阵火', 1206, 530, 263, grad, -5);
  c.shadowBlur = 0; seal(946, 535, 41);
  c.globalAlpha *= smooth((t - 6.82) / .6);
  words('落 笔 成 阵   ·   借 火 守 夜', W / 2, 729, 31, '#d8cbb1', 7, 'OpeningKai');
  words('山 涧 营 地  ·  第 一 夜', W / 2, 339, 23, '#b7b6a6', 6, 'OpeningKai');
  line([[596, 673], [877, 673]], '#bca06b', .8, .5); line([[1043, 673], [1324, 673]], '#bca06b', .8, .5);
  c.restore();
}
function render(t) {
  c.resetTransform(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.fillStyle = '#071016'; c.fillRect(0, 0, W, H);
  if (t < 2.25) {
    c.drawImage(paper, 0, 0); c.save(); const z = 1 + t * .02; c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2); inkStroke(t); c.restore();
    if (t >= 1.5) {
      const sweep = out((t - 1.5) / .72);
      c.save(); c.beginPath(); c.moveTo(0, 0); c.lineTo(W * sweep - 120, 0);
      for (let y = 0; y <= H + 20; y += 16) c.lineTo(W * sweep + Math.sin(y * .023) * 55 + Math.sin(y * .079) * 20, y);
      c.lineTo(0, H); c.closePath(); c.clip(); painting(t); c.restore();
    }
  } else if (t < 6.55) {
    painting(t); elements(t); inkMotes(t); emberField(t, .9); burst(t); vignette(.85);
    if (t < 3.35) { c.save(); c.globalAlpha = smooth((t - 2.15) / .35) * (1 - smooth((t - 2.9) / .4)); words('成阵', 347, 440, 120, '#e4d5b0'); c.restore(); }
  } else {
    painting(5.6, .18); c.fillStyle = '#0b141bd9'; c.fillRect(0, 0, W, H);
    glow(1000, 544, 700, '#9e7950', .12); emberField(t, .48); vignette(); title(t);
  }
  // One soft impact, rather than repetitive strobing.
  const flash = Math.exp(-(((t - 6.43) / .1) ** 2)) * .84;
  if (flash > .001) { c.fillStyle = `rgba(242,232,207,${flash})`; c.fillRect(0, 0, W, H); }
  c.fillStyle = '#060d11'; c.fillRect(0, 0, W, 59); c.fillRect(0, H - 59, W, 59);
  const fade = smooth((t - 9.08) / .32); if (fade) { c.fillStyle = `rgba(5,12,16,${fade})`; c.fillRect(0, 0, W, H); }
}

const keyTimes = [.95, 2.5, 4.18, 5.42, 5.92, 7.9];
for (const t of keyTimes) { render(t); await writeFile(join(evidence, `frame-${t.toFixed(2)}.jpg`), canvas.encodeSync('jpeg', 91)); }
render(7.9); await writeFile(join(output, 'opening-poster.jpg'), canvas.encodeSync('jpeg', 91));
render(0); await writeFile(join(output, 'opening-first-frame.jpg'), canvas.encodeSync('jpeg', 88));
if (!process.argv.includes('--stills')) {
  const score = join(evidence, 'opening-score.wav'); await writeFile(score, makeOpeningScore(DURATION));
  const target = join(output, 'opening-ink.mp4');
  const encoder = spawn(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0', '-i', score, '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-profile:v', 'high', '-level', '4.1', '-c:a', 'aac', '-b:a', '192k', '-af', 'alimiter=limit=0.89', '-movflags', '+faststart', '-t', String(DURATION), target], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
  let encoderError; encoder.on('error', error => { encoderError = error; });
  const done = once(encoder, 'close'); encoder.stdin.on('error', error => { encoderError = error; });
  for (let frame = 0; frame < DURATION * FPS; frame++) {
    if (encoderError) throw encoderError;
    render(frame / FPS); const bytes = canvas.encodeSync('jpeg', 95);
    if (!encoder.stdin.write(bytes)) await once(encoder.stdin, 'drain');
    if (frame % FPS === 0) console.log(`Rendered ${frame / FPS}s / ${DURATION}s`);
  }
  encoder.stdin.end(); const [exitCode] = await done; if (exitCode) throw new Error(`ffmpeg exited ${exitCode}`);
  console.log(target);
}
