import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { SlayerAudio, SLAYER_AUDIO_VOICES } from '../src/ui/slayer-audio';
import { renderSlayerCue, SLAYER_AUDIO_RATE, SLAYER_CUES, SLAYER_SPRITE, SLAYER_SPRITE_SECONDS } from '../src/ui/slayer-sound-bank';
import type { GameEvents, Wolf } from '../src/game/contracts';

const strike: GameEvents['slayerStrike'] = { at: { x: -6, z: 4 }, element: 'metal', level: 0, hits: 12, kills: 4, combo: 0, tier: 0, burst: 0, investment: 1 };
function mockNode() {
  const parameter = (value = 0) => ({ value, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  return { gain: parameter(), pan: parameter(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), buffer: null, onended: null as (() => void) | null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
}
function context() {
  const nodes: ReturnType<typeof mockNode>[] = [];
  function node() {
    const result = mockNode();
    nodes.push(result); return result;
  }
  const ctx = { currentTime: 0, state: 'running', createDynamicsCompressor: node, createGain: node, createStereoPanner: node, createBufferSource: node, decodeAudioData: vi.fn().mockResolvedValue({ duration: SLAYER_SPRITE_SECONDS, length: Math.ceil(SLAYER_SPRITE_SECONDS * SLAYER_AUDIO_RATE), numberOfChannels: 1 }) };
  return { ctx, nodes, sources: () => nodes.filter(n => n.start.mock.calls.length) };
}
async function fixture() {
  const world = new World({ roguelike: true });
  world.chooseDestiny({ serial: 1, fate: 'slayer', roots: ['metal'], tier: 'ordinary', boon: 'three' });
  world.startWave();
  const duck = vi.fn(), sound = new SlayerAudio(world, async () => new ArrayBuffer(2), duck), c = context();
  await sound.attach(c.ctx as unknown as AudioContext, {} as AudioNode);
  return { world, sound, duck, ...c };
}
function cueAt(source: ReturnType<ReturnType<typeof context>['sources']>[number]) {
  const offset = source.start.mock.calls[0]![1]; return [...SLAYER_SPRITE].find(([, value]) => value.offset === offset)![0].split(':')[0];
}
function fillComboTargets(world: World) {
  world.selected = 'metal';
  world.wolves = Array.from({ length: 24 }, (_, id): Wolf => ({ id: 9000 + id, x: -6 + (id % 6) * .2, z: 4 + Math.floor(id / 6) * .2,
    hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0, attack: 0, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0,
    rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null }));
}
const comboLine = [{ x: -8, z: 4 }, { x: -4, z: 4 }];

describe('slayer sound assets', () => {
  it('ships the actual sprite with every cue, rather than rendering audio during a hit', () => {
    const file = readFileSync(new URL('../public/audio/slayer-blades.wav', import.meta.url));
    expect(file.toString('ascii', 0, 4)).toBe('RIFF'); expect(file.readUInt32LE(24)).toBe(SLAYER_AUDIO_RATE);
    expect(file.length).toBe(44 + Math.ceil(SLAYER_SPRITE_SECONDS * SLAYER_AUDIO_RATE) * 2);
    for (const cue of SLAYER_CUES) for (let variant = 0; variant < 3; variant++) {
      const samples = renderSlayerCue(cue, variant), segment = SLAYER_SPRITE.get(`${cue}:${variant}`)!;
      const base = Math.round(segment.offset * SLAYER_AUDIO_RATE);
      let peak = 0, sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const actual = file.readInt16LE(44 + (base + i) * 2) / 32767;
        expect(Math.abs(actual - samples[i]!)).toBeLessThanOrEqual(1 / 32767);
        peak = Math.max(peak, Math.abs(actual)); sum += actual * actual;
      }
      expect(peak).toBeGreaterThan(.03); expect(peak).toBeLessThan(.72);
      expect(Math.sqrt(sum / samples.length)).toBeGreaterThan(.008);
      expect(Math.abs(samples[0]!)).toBe(0); expect(samples.at(-1)).toBe(0);
    }
  });
  it('has variation, heavier impact body, and a second finisher attack instead of a single enlarged light hit', () => {
    expect(renderSlayerCue('cut', 0)).not.toEqual(renderSlayerCue('cut', 1));
    const energy = (cue: Parameters<typeof renderSlayerCue>[0], start = 0, end = .18) => {
      const s = renderSlayerCue(cue); let total = 0;
      for (let i = Math.floor(start * SLAYER_AUDIO_RATE); i < end * SLAYER_AUDIO_RATE; i++) total += (s[i] ?? 0) ** 2;
      return total;
    };
    expect(energy('crush')).toBeGreaterThan(energy('cut') * 1.5);
    expect(energy('finisher', .09, .17)).toBeGreaterThan(energy('crush', .09, .17) * 1.5);
  });
});

describe('slayer sound event routing and cleanup', () => {
  it('keeps passive recovery silent while retaining kill recovery feedback', async () => {
    const f = await fixture();
    try {
      f.world.spirit = 0;
      vi.spyOn(f.world.assault, 'tick').mockImplementation(() => {});
      f.world.tick(1);
      expect(f.world.spirit).toBe(6); expect(f.sources()).toHaveLength(0);
      f.world.events.emit('spiritRecovered', { amount: 3, at: strike.at });
      expect(f.sources().map(cueAt)).toEqual(['recover']);
    } finally { f.sound.dispose(); }
  });
  it('uses one dedicated pursuit contact for an entire AOE and leaves guarded strokes silent', async () => {
    const f = await fixture();
    try {
      const openings = Array.from({ length: 72 }, (_, i) => ({ x: i % 12, z: Math.floor(i / 12) }));
      f.world.events.emit('slayerStrike', { ...strike, hits: 72, kills: 0, openings });
      expect(f.sources().map(cueAt)).toEqual(['pursuit']);
      f.ctx.currentTime += .2;
      f.world.events.emit('slayerStrike', { ...strike, hits: 72, kills: 0, guarded: 72 });
      expect(f.sources().map(cueAt)).toEqual(['pursuit']);
      f.sound.pause(true); expect(f.sound.activeVoices).toBe(0);
    } finally { f.sound.dispose(); }
  });
  it('announces a newly earned tier again after the previous chain expires', async () => {
    const f = await fixture(); fillComboTargets(f.world);
    try {
      f.world.invoke(comboLine);
      expect(f.world.slayerCombo.tier).toBe(2);
      expect(f.sources().filter(s => cueAt(s) === 'combo')).toHaveLength(1);
      f.world.slayerCombo.tick(3.3); expect(f.world.slayerCombo.count).toBe(0); f.ctx.currentTime += 3.3;
      f.world.invoke(comboLine);
      expect(f.world.slayerCombo.tier).toBe(2);
      expect(f.sources().filter(s => cueAt(s) === 'combo')).toHaveLength(2);
    } finally { f.sound.dispose(); }
  });
  it.each(['mute', 'pause'] as const)('does not invent a tier gain after %s resumes the same live chain', async method => {
    const f = await fixture(); fillComboTargets(f.world);
    try {
      f.world.invoke(comboLine); f.ctx.currentTime += .3; f.world.invoke(comboLine);
      expect(f.world.slayerCombo.tier).toBe(3);
      const before = f.sources().filter(s => cueAt(s) === 'combo').length;
      f.sound[method](true); f.sound[method](false); f.ctx.currentTime += .3;
      f.world.invoke(comboLine);
      expect(f.world.slayerCombo.tier).toBe(3);
      expect(f.sources().filter(s => cueAt(s) === 'combo')).toHaveLength(before);
    } finally { f.sound.dispose(); }
  });
  it('plays one contact sound for 72 targets, varies successive cuts, and scales tiny strokes down', async () => {
    const f = await fixture();
    try {
      f.world.events.emit('slayerStrike', { ...strike, hits: 72 }); expect(f.sources()).toHaveLength(1); expect(cueAt(f.sources()[0]!)).toBe('cut');
      const first = f.sources()[0]!.start.mock.calls[0]![1];
      f.ctx.currentTime = .2; f.world.events.emit('slayerStrike', { ...strike, investment: .02 });
      expect(f.sources()[1]!.start.mock.calls[0]![1]).not.toBe(first);
      const gains = f.nodes.filter(n => n.gain.value > 0); expect(gains[1]!.gain.value).toBeCloseTo(gains[0]!.gain.value * .02);
    } finally { f.sound.dispose(); }
  });
  it('misses have only an air swish; charge, armor, return and recovery have distinct clips', async () => {
    const f = await fixture();
    try {
      f.world.events.emit('slayerStrike', { ...strike, level: 3, hits: 0, kills: 0 });
      f.world.events.emit('chargeReady', { level: 3 });
      f.world.events.emit('slayerReturn', { at: strike.at, element: 'metal',points:[{x:-4,z:4},{x:-8,z:4}],direction:{x:-1,z:0},investment:1,hits:1,guarded:0,contacts:[strike.at] });
      f.world.events.emit('reaction', { kind: 'overcome', from: 'fire', to: 'metal', result: 'fire', name: '熔金破防', at: strike.at, targetId: 1 });
      f.world.events.emit('spiritRecovered', { amount: 3, at: strike.at });
      expect(f.sources().map(cueAt)).toEqual(['air', 'charge3', 'return', 'break', 'recover']);
    } finally { f.sound.dispose(); }
  });
  it('uses air for an empty return, no false impact for all guards, and one weighted cue for an AOE return', async () => {
    const f=await fixture();
    const event:GameEvents['slayerReturn']={at:strike.at,element:'metal',points:[{x:-4,z:4},{x:-8,z:4}],direction:{x:-1,z:0},investment:1,hits:0,guarded:0,contacts:[]};
    try{
      f.world.events.emit('slayerReturn',event);expect(f.sources().map(cueAt)).toEqual(['air']);
      f.ctx.currentTime=.2;f.world.events.emit('slayerReturn',{...event,hits:3,guarded:3});expect(f.sources()).toHaveLength(1);
      f.ctx.currentTime=.4;f.world.events.emit('slayerReturn',{...event,hits:72,contacts:[strike.at]});expect(f.sources().map(cueAt)).toEqual(['air','return']);
      f.ctx.currentTime=.6;f.world.events.emit('slayerReturn',{...event,hits:1,investment:.02,contacts:[strike.at]});
      const gains=f.nodes.filter(n=>n.gain.value>0);expect(gains.at(-1)!.gain.value).toBeCloseTo(.65*.02);expect(f.sound.activeVoices).toBeLessThanOrEqual(SLAYER_AUDIO_VOICES);
    }finally{f.sound.dispose();}
  });
  it('separates armor deflection from a successful finisher and gives pursuit a heavier cut', async () => {
    const f = await fixture();
    try {
      f.world.events.emit('slayerGuarded', { at: strike.at, targetId: 1, amount: 100 });
      f.world.events.emit('slayerStrike', { ...strike, hits: 1, guarded: 1, kills: 0, level: 3 });
      f.world.events.emit('slayerFinisher', { at: strike.at, element: 'metal', hits: 1, guarded: 1 });
      expect(f.sources().map(cueAt)).toEqual(['block']); expect(f.duck).not.toHaveBeenCalled();
      f.ctx.currentTime = .2;
      f.world.events.emit('slayerFinisher', { at: strike.at, element: 'metal', hits: 0 });
      expect(cueAt(f.sources().at(-1)!)).toBe('air'); expect(f.duck).not.toHaveBeenCalled();
      f.ctx.currentTime = .4;
      f.world.events.emit('slayerStrike', { ...strike, rush: .6 });
      expect(cueAt(f.sources().at(-1)!)).toBe('cleave');
      f.world.events.emit('slayerFinisher', { at: strike.at, element: 'metal', hits: 2, guarded: 1 });
      expect(cueAt(f.sources().at(-1)!)).toBe('finisher'); expect(f.duck).toHaveBeenCalledOnce();
    } finally { f.sound.dispose(); }
  });
  it('promotes a heavy contact in the same instant and keeps the finisher audible above lower-priority sounds', async () => {
    const f = await fixture();
    try {
      f.world.events.emit('slayerStrike', strike); f.world.events.emit('slayerStrike', { ...strike, level: 3 });
      f.world.events.emit('slayerFinisher', { at: strike.at, element: 'metal', hits: 3 });
      expect(f.sources().map(cueAt)).toEqual(['cut', 'crush', 'finisher']); expect(f.duck).toHaveBeenCalledOnce();
      expect(f.nodes.filter(n => n.gain.setTargetAtTime.mock.calls.length)).toHaveLength(2);
      f.world.events.emit('slayerFinisher', { at: strike.at, element: 'metal', hits: 3 }); expect(f.duck).toHaveBeenCalledOnce();
    } finally { f.sound.dispose(); }
  });
  it('caps sound sources during hundreds of procs and disconnects every node after playback or clearing', async () => {
    const f = await fixture();
    for (let i = 0; i < 500; i++) {
      f.ctx.currentTime += .05; f.world.events.emit('slayerStrike', { ...strike, level: i % 4 });
      f.world.events.emit('spiritRecovered', { amount: 30, at: strike.at });
      expect(f.sound.activeVoices).toBeLessThanOrEqual(SLAYER_AUDIO_VOICES);
    }
    for (const source of f.sources()) source.onended?.();
    expect(f.sound.activeVoices).toBe(0);
    for (const source of f.sources()) expect(source.disconnect).toHaveBeenCalled();
    f.sound.dispose();
  });
  it('pause, mute, phase changes and disposal clear voices; nothing stale replays on resume', async () => {
    const f = await fixture();
    f.world.events.emit('slayerStrike', strike); f.sound.pause(true); expect(f.sound.activeVoices).toBe(0);
    f.world.events.emit('slayerStrike', strike); expect(f.sources()).toHaveLength(1);
    f.sound.pause(false); expect(f.sound.activeVoices).toBe(0);
    f.world.events.emit('slayerStrike', strike); f.sound.mute(true); f.world.events.emit('slayerStrike', strike); expect(f.sources()).toHaveLength(2);
    f.sound.mute(false); f.world.events.emit('slayerStrike', strike); f.world.events.emit('phase', { phase: 'rest' }); expect(f.sound.activeVoices).toBe(0);
    f.sound.dispose(); f.world.events.emit('slayerStrike', strike); expect(f.sources()).toHaveLength(3); expect(f.sound.diagnostics.state).toBe('disposed');
  });
  it('does not write battle state, create voices before decoding or play after a failed load', async () => {
    const f = await fixture(), before = [f.world.spirit, f.world.health, f.world.kills, f.world.time];
    f.world.events.emit('slayerStrike', strike); expect([f.world.spirit, f.world.health, f.world.kills, f.world.time]).toEqual(before); f.sound.dispose();
    const c = context(), sound = new SlayerAudio(f.world, async () => { throw new Error('offline'); });
    f.world.events.emit('slayerStrike', strike); expect(c.sources()).toHaveLength(0);
    await sound.attach(c.ctx as unknown as AudioContext, {} as AudioNode);
    f.world.events.emit('slayerStrike', strike); expect(sound.diagnostics.state).toBe('failed'); expect(c.sources()).toHaveLength(0); sound.dispose();
  });
  it('ignores other flows and refuses to play into a suspended context', async () => {
    const f = await fixture();
    try {
      f.ctx.state = 'suspended'; f.world.events.emit('slayerStrike', strike); expect(f.sources()).toHaveLength(0);
      f.ctx.state = 'running'; f.world.reset(); f.world.events.emit('slayerStrike', strike); expect(f.sources()).toHaveLength(0);
    } finally { f.sound.dispose(); }
  });
  it('keeps the undecided opening light, then loads once when the player chooses slayer', async () => {
    const world = new World({ roguelike: true }), c = context(), load = vi.fn(async () => new ArrayBuffer(2));
    const sound = new SlayerAudio(world, load);
    await sound.attach(c.ctx as unknown as AudioContext, {} as AudioNode);
    expect(load).not.toHaveBeenCalled(); expect(sound.diagnostics.state).toBe('idle');
    world.chooseDestiny({ serial: 1, fate: 'slayer', roots: ['metal'], tier: 'ordinary', boon: 'three' });
    await vi.waitFor(() => expect(sound.diagnostics.state).toBe('ready'));
    world.events.emit('phase', { phase: 'battle' }); expect(load).toHaveBeenCalledOnce(); expect(c.ctx.decodeAudioData).toHaveBeenCalledOnce(); sound.dispose();
  });
  it('an in-flight decode cannot resurrect a disposed sound bank', async () => {
    const world = new World({ roguelike: true }); world.chooseDestiny({ serial: 1, fate: 'slayer', roots: ['metal'], tier: 'ordinary', boon: 'three' });
    let resolve!: (bytes: ArrayBuffer) => void;
    const c = context(), sound = new SlayerAudio(world, () => new Promise(done => { resolve = done; }));
    const attached = sound.attach(c.ctx as unknown as AudioContext, {} as AudioNode); sound.dispose(); resolve(new ArrayBuffer(2)); await attached;
    expect(c.ctx.decodeAudioData).not.toHaveBeenCalled(); expect(sound.diagnostics.state).toBe('disposed');
  });
});
