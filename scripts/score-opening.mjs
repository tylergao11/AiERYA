/** Original stereo cue: breath, brush scrape, plucked pentatonic strings,
 * five element accents and a low drum/gong title hit. No third-party samples. */
export function makeOpeningScore(duration = 9.4) {
  const rate = 48000, length = Math.round(rate * duration);
  const left = new Float64Array(length), right = new Float64Array(length);
  let seed = 543287; const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const put = (start, seconds, pan, fn) => {
    const offset = Math.round(start * rate), end = Math.min(length - offset, Math.round(seconds * rate));
    const l = Math.sqrt((1 - pan) / 2), r = Math.sqrt((1 + pan) / 2);
    for (let i = 0; i < end; i++) { const x = fn(i / rate, i); left[i + offset] += x * l; right[i + offset] += x * r; }
  };
  let wind = 0;
  put(0, duration, 0, t => { wind = wind * .985 + noise() * .015; return wind * .27 * Math.min(1, t * 3, (duration - t) * 3); });
  const drum = (start, force = 1) => put(start, 1.4, 0, t => {
    const phase = 2 * Math.PI * (45 * t + 13 * (1 - Math.exp(-t * 25)));
    return force * (Math.sin(phase) * Math.exp(-t * 5) * .5 + noise() * Math.exp(-t * 45) * .13) * Math.min(1, t * 400);
  });
  const string = (start, frequency, pan, strength = .18) => {
    const count = Math.round(rate / frequency), ring = Float64Array.from({ length: count }, () => noise());
    let idx = 0, last = 0;
    put(start, 2.2, pan, (t) => { const v = ring[idx]; ring[idx] = (v + last) * .497; last = v; idx = (idx + 1) % count; return v * strength * Math.min(1, t * 300) * Math.exp(-t * .7); });
  };
  const rush = (start, span, strength, pan) => {
    let low = 0;
    put(start, span, pan, t => { low = low * .91 + noise() * .09; const e = Math.sin(Math.PI * t / span) ** 2; return low * e * strength + Math.sin(2 * Math.PI * (90 * t + 140 * t * t)) * e * strength * .06; });
  };
  drum(.14, .65); rush(.2, 1.14, .4, -.3);
  string(.4, 146.83, -.45, .32); string(.88, 220, .35, .23); string(1.32, 293.66, -.15, .24);
  rush(1.43, .8, .68, .2); drum(2.03, .85);
  string(2.35, 146.83, -.35, .25); string(2.85, 196, .3, .25);
  const tones = [440, 293.66, 329.63, 392, 220];
  for (let e = 0; e < 5; e++) {
    const start = 3.18 + e * .35; string(start, tones[e], (e - 2) * .26, .32);
    put(start, 1.15, (e - 2) * .25, t => Math.sin(2 * Math.PI * tones[e] * t) * Math.exp(-t * 5) * Math.min(1, t * 150) * .06);
  }
  drum(4.6, .55); drum(5.01, .66); rush(4.8, .82, .8, 0); drum(5.62, 1.12);
  rush(5.56, .85, 1.0, 0);
  drum(6.48, 1.2);
  put(6.46, 2.9, 0, t => {
    const strike = Math.min(1, t * 100) * Math.exp(-t * 1.1);
    return (Math.sin(2 * Math.PI * 73.416 * t) * .15 + Math.sin(2 * Math.PI * 147.4 * t) * .095 + Math.sin(2 * Math.PI * 212.6 * t) * .052 + Math.sin(2 * Math.PI * 351.7 * t) * .025) * strike;
  });
  string(6.63, 146.83, -.45, .25); string(6.84, 220, .4, .22); string(7.04, 293.66, -.1, .2);
  // Short stereo reflections give the chamber a tail, without clipping transients.
  for (let i = length - 1; i >= 0; i--) {
    for (const [delay, gain] of [[.119, .2], [.237, .13], [.401, .07]]) {
      const j = i - Math.round(rate * delay); if (j >= 0) { left[i] += right[j] * gain; right[i] += left[j] * gain; }
    }
  }
  let peak = 0; for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const gain = .86 / Math.max(.1, peak), wav = Buffer.alloc(44 + length * 4);
  wav.write('RIFF'); wav.writeUInt32LE(36 + length * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(length * 4, 40);
  for (let i = 0; i < length; i++) {
    const fade = Math.max(0, Math.min(1, (length - i) / (rate * .45)));
    wav.writeInt16LE(Math.round(Math.tanh(left[i] * gain) * 32767 * fade), 44 + i * 4);
    wav.writeInt16LE(Math.round(Math.tanh(right[i] * gain) * 32767 * fade), 46 + i * 4);
  }
  return wav;
}
