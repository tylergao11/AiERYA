/** Deterministic, pre-rendered blade textures. Cached once, never synthesized per victim. */
export const SLAYER_AUDIO_RATE = 24000;
export const SLAYER_CUES = ['air', 'cut', 'cleave', 'crush', 'return', 'break', 'block', 'charge1', 'charge2', 'charge3', 'combo', 'recover', 'finisher', 'pursuit'] as const;
export type SlayerCue = typeof SLAYER_CUES[number];
export const SLAYER_SOUND_SECONDS: Record<SlayerCue, number> = {
  air: .19, cut: .26, cleave: .42, crush: .62, return: .48, break: .4, block: .23,
  charge1: .24, charge2: .3, charge3: .46, combo: .4, recover: .28, finisher: .92, pursuit: .36,
};
export const SLAYER_SPRITE = new Map<string, { offset: number; duration: number }>();
let spriteTime = 0;
for (const cue of SLAYER_CUES) for (let variant = 0; variant < 3; variant++) {
  const duration = Math.ceil(SLAYER_SOUND_SECONDS[cue] * SLAYER_AUDIO_RATE) / SLAYER_AUDIO_RATE;
  SLAYER_SPRITE.set(`${cue}:${variant}`, { offset: spriteTime, duration }); spriteTime += duration + .02;
}
export const SLAYER_SPRITE_SECONDS = spriteTime;
const tau = Math.PI * 2;

export function renderSlayerCue(cue: SlayerCue, variant = 0, rate = SLAYER_AUDIO_RATE): Float32Array {
  const duration = SLAYER_SOUND_SECONDS[cue], count = Math.ceil(duration * rate), samples = new Float32Array(count);
  let seed = 7319 + SLAYER_CUES.indexOf(cue) * 8191 + variant * 313, low = 0, mid = 0, phase = 0;
  const weight = cue === 'finisher' ? 1.35 : cue === 'crush' ? 1 : cue === 'cleave' ? .68 : .3;
  const charge = cue.startsWith('charge') ? Number(cue.at(-1)) : 0;
  const tune = 1 + (variant - 1) * .037;
  const mode = (t: number, root: number, decay: number) => {
    if (t < 0) return 0;
    // Inharmonic blade modes, with a short high-frequency tail instead of a pure beep.
    return ([1, 1.503, 2.317, 3.91] as const).reduce((sum, ratio, i) =>
      sum + Math.sin(t * root * ratio * tune * tau + Math.sin(t * 31) * .1) * Math.exp(-t * decay * (1 + i * .6)) / (1 + i * 1.8), 0);
  };
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = ((seed >>> 0) / 4294967296) * 2 - 1;
    low += .065 * (noise - low); mid += .42 * (noise - mid);
    const sand = mid - low, air = noise - mid;
    const attack = 1 - Math.exp(-t * 1300), tail = Math.min(1, (duration - t) / .035);
    let value: number;
    if (charge) {
      const swell = Math.sin(Math.PI * Math.min(1, t / (duration * .65))) ** 2;
      value = sand * .3 * swell * Math.exp(-t * 7)
        + mode(t, 530 + charge * 130, 8 - charge) * (.15 + charge * .025) * (1 - Math.exp(-t * 100));
    } else if (cue === 'recover' || cue === 'combo') {
      const root = cue === 'recover' ? 1260 : 760;
      value = mode(t, root, 17) * .12 + mode(t - .045, root * 1.33, 16) * .085;
      if (cue === 'combo') value += mode(t - .085, root * 1.5, 12) * .14;
    } else if (cue === 'block') {
      value = low * 1.2 * Math.exp(-t * 55) + mode(t, 370, 26) * .24;
    } else if (cue === 'break') {
      value = air * .48 * Math.exp(-t * 38) + sand * .9 * Math.exp(-t * 19) + mode(t, 930, 17) * .22;
    } else if (cue === 'pursuit') {
      const snap = Math.max(0, t - .018), split = Math.max(0, t - .061);
      const body = (Math.sin(t * 145 * tau) + Math.sin(t * 290 * tau) * .4) * Math.exp(-t * 24) * .22;
      value = sand * .65 * Math.exp(-t * 22) + body
        + (t >= .018 ? air * .58 * Math.exp(-snap * 95) + mode(snap, 1140, 26) * .22 : 0)
        + (t >= .061 ? sand * .72 * Math.exp(-split * 44) + mode(split, 740, 22) * .18 : 0);
    } else if (cue === 'return') {
      const swell = Math.max(0, 1 - Math.abs(t - .055) / .055);
      value = sand * swell * .62 + mode(t - .055, 870, 15) * .25 + air * Math.exp(-Math.max(0, t - .055) * 45) * (t >= .055 ? .2 : 0);
    } else {
      const bodyFrequency = (55 + weight * 18) + 105 * Math.exp(-t * 36);
      phase += tau * bodyFrequency / rate;
      const whoosh = Math.sin(Math.PI * Math.min(1, t / (.065 + weight * .045))) ** 1.5;
      value = (sand * .95 + air * .22) * whoosh * Math.exp(-t * (cue === 'air' ? 9 : 15));
      if (cue !== 'air') {
        // Audible upper harmonics keep the impact body present on small speakers.
        value += (Math.sin(phase) + Math.sin(phase * 2) * .35 + Math.sin(phase * 3) * .16) * weight * .34 * Math.exp(-t * (15 - weight * 5));
        value += mode(t, 700 - weight * 140, 15 - weight * 4) * .17;
        value += air * .42 * Math.exp(-t * 100);
      }
      if (cue === 'finisher') {
        const second = t - .085;
        if (second >= 0) value += (sand * 1.3 + air * .3) * Math.exp(-second * 25) * (1 - Math.exp(-second * 800)) + mode(second, 510, 7) * .2;
      }
    }
    // A fixed saturator controls peaks without flattening the relative cue dynamics.
    samples[i] = Math.tanh(value * 1.45) * .72 * attack * tail;
  }
  samples[count - 1] = 0;
  return samples;
}
