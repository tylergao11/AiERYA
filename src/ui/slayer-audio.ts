import { clamp, type Point } from '../core/math';
import type { World } from '../game/world';
import { SLAYER_SPRITE, type SlayerCue } from './slayer-sound-bank';
import { audioBytes } from '../audio/loading';

interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; priority: number; volume: number }
export const SLAYER_AUDIO_VOICES = 8;
/** One contact sound per stroke, not per wolf. All timing gates affect audio only. */
export class SlayerAudio {
  private context: AudioContext | null = null;
  private bus: DynamicsCompressorNode | null = null;
  private sprite: AudioBuffer | null = null;
  private loaded: Promise<ArrayBuffer | null> | null = null;
  private decoding: Promise<void> | null = null;
  private readonly voices = new Set<Voice>();
  private readonly recent = new Map<string, { time: number; priority: number }>();
  private sequence = 0;
  private played = 0;
  private peakVoices = 0;
  private tier = 0;
  private muted = false;
  private paused = false;
  private disposed = false;
  private state: 'idle' | 'loading' | 'ready' | 'failed' | 'disposed' = 'idle';
  private readonly abort = new AbortController();
  private readonly off: (() => void)[];
  constructor(private readonly world: World, private readonly load: (signal: AbortSignal) => Promise<ArrayBuffer> = async signal => {
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    return audioBytes(`${import.meta.env.BASE_URL}audio/slayer-blades.wav`);
  }, private readonly duckMusic: () => void = () => {}) {
    this.prepareAsset();
    this.off = [world.events.on('chargeReady', e => this.play(`charge${clamp(e.level, 1, 3)}` as SlayerCue, .66, 1)),
      world.events.on('slayerStrike', e => {
        const weight = clamp(e.investment, 0, 1);
        if (!e.hits) { this.play('air', .28 * weight, 0, e.at, 'contact', .045); return; }
        if (e.guarded === e.hits && !e.kills) return;
        const cue = e.level >= 3 ? 'crush' : e.openings?.length ? 'pursuit' : e.level >= 1 || e.rush ? 'cleave' : 'cut';
        this.play(cue, weight * (.67 + Math.min(6, e.hits) * .025), e.level >= 2 || e.openings?.length ? 3 : 2, e.at, 'contact', .045);
        // Combat owns tier transitions, including expiry and a live chain surviving mute/pause.
        if ((e.tierRaised ?? (e.tier > this.tier)) && e.tier >= 1) this.play('combo', .42, 2, e.at, 'combo', .25);
        this.tier = e.tier;
      }),
      world.events.on('slayerFinisher', e => {
        if (e.hits && e.hits <= (e.guarded ?? 0)) return;
        const contact = (e.hits ?? 0) > 0;
        this.play(contact ? 'finisher' : 'air', contact ? .96 : .4, contact ? 4 : 0, e.at, 'finisher', .12);
      }),
      world.events.on('slayerReturn', e => {
        const weight=clamp(e.investment,0,1);
        if(!e.hits)this.play('air',.22*weight,0,e.at,'return',.1);
        else if(e.hits>e.guarded)this.play('return',.65*weight,3,e.contacts[0]??e.at,'return',.1);
      }),
      world.events.on('slayerGuarded', e => this.play('block', Math.min(.65, e.amount / 80), 2, e.at, 'armor', .12)),
      world.events.on('reaction', e => {
        if (e.targetId === undefined) return;
        if (e.kind === 'resist') this.play('block', .52, 2, e.at, 'armor', .12);
        else if (e.kind === 'overcome' && e.from === 'fire' && e.to === 'metal') this.play('break', .72, 3, e.at, 'armor', .12);
      }),
      world.events.on('spiritRecovered', e => { if (e.amount > 0 && e.source !== 'natural') this.play('recover', .12, 0, e.at, 'recover', .6); }),
      world.events.on('phase', () => { this.clear(); void this.decode(); }), world.events.on('reset', () => this.clear()),
      world.events.on('ultimate', e => { if (e.stage === 'start') this.clear(); })];
  }
  async attach(context: AudioContext, destination: AudioNode): Promise<void> {
    if (this.context || this.disposed) return;
    this.context = context; this.bus = context.createDynamicsCompressor();
    this.bus.threshold.value = -12; this.bus.knee.value = 12; this.bus.ratio.value = 6;
    this.bus.attack.value = .003; this.bus.release.value = .12; this.bus.connect(destination);
    await this.decode();
  }
  private prepareAsset(): void {
    if (this.loaded || this.disposed || !this.world.build.is('slayer')) return;
    this.state = 'loading'; this.loaded = this.load(this.abort.signal).catch(() => { if (!this.disposed) this.state = 'failed'; return null; });
  }
  private decode(): Promise<void> {
    this.prepareAsset();
    if (!this.context || !this.loaded || this.disposed) return Promise.resolve();
    return this.decoding ??= this.decodeAsset(this.context);
  }
  private async decodeAsset(context: AudioContext): Promise<void> {
    const bytes = await this.loaded;
    if (!bytes || this.disposed) return;
    try { const decoded = await context.decodeAudioData(bytes); if (!this.disposed) { this.sprite = decoded; this.state = 'ready'; } }
    catch { if (!this.disposed) this.state = 'failed'; }
  }
  get activeVoices(): number { return this.voices.size; }
  get diagnostics() { return { state: this.state, activeVoices: this.voices.size, peakVoices: this.peakVoices, played: this.played, decodedBytes: this.sprite ? this.sprite.length * this.sprite.numberOfChannels * 4 : 0 }; }
  private play(cue: SlayerCue, volume: number, priority: number, at?: Point, group: string = cue, interval = .07): void {
    const context = this.context;
    if (!context || !this.bus || !this.sprite || context.state !== 'running' || this.disposed || this.muted || this.paused || !this.world.build.is('slayer') || volume <= 0) return;
    const now = context.currentTime, previous = this.recent.get(group);
    // Permit a heavier hit to replace a light one during a single burst of procs.
    if (previous && now - previous.time < interval && previous.priority >= priority) return;
    if (this.voices.size >= SLAYER_AUDIO_VOICES) {
      const victim = [...this.voices].sort((a, b) => a.priority - b.priority)[0]!;
      if (victim.priority > priority) return;
      this.stop(victim);
    }
    this.recent.set(group, { time: now, priority });
    if (priority === 4) this.duckMusic();
    if (priority === 4) for (const voice of this.voices) if (voice.priority < 4) {
      voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setTargetAtTime(voice.volume * .26, now, .012);
    }
    const variant = this.sequence++ % 3, key = `${cue}:${variant}`;
    const segment = SLAYER_SPRITE.get(key)!;
    const source = context.createBufferSource(), gain = context.createGain(), pan = context.createStereoPanner();
    source.buffer = this.sprite; gain.gain.value = volume;
    pan.pan.value = at && Number.isFinite(at.x) ? clamp(at.x / 26, -.5, .5) : 0;
    source.connect(gain); gain.connect(pan); pan.connect(this.bus);
    const voice = { source, gain, pan, priority, volume }; this.voices.add(voice);
    this.played++; this.peakVoices = Math.max(this.peakVoices, this.voices.size);
    source.onended = () => this.disconnect(voice); source.start(now, segment.offset, segment.duration);
  }
  private disconnect(voice: Voice): void { voice.source.onended = null; voice.source.disconnect(); voice.gain.disconnect(); voice.pan.disconnect(); this.voices.delete(voice); }
  private stop(voice: Voice): void { voice.source.stop(); this.disconnect(voice); }
  clear(): void { for (const voice of this.voices) this.stop(voice); this.recent.clear(); this.tier = 0; }
  mute(value: boolean): void { this.muted = value; if (value) this.clear(); }
  pause(value: boolean): void { this.paused = value; if (value) this.clear(); }
  dispose(): void { this.disposed = true; this.state = 'disposed'; this.abort.abort(); this.off.forEach(off => off()); this.clear(); this.sprite = null; this.bus?.disconnect(); this.bus = null; this.context = null; }
}
