import type { World } from '../game/world';

/** Small synthesized sound palette; no network media, autoplay, or game-state writes. */
export class Soundscape {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private muted = false;
  private suspended = false;
  private lastImpact = 0;
  private readonly off: (() => void)[];
  constructor(world: World) {
    this.off = [world.events.on('gather', () => this.chime(587, 0.3, 0.055)), world.events.on('ward', () => this.chime(196, 0.6, 0.06)), world.events.on('invoke', ({ element }) => this.chime(element === 'water' ? 294 : element === 'fire' ? 98 : 440, 0.3, 0.07)), world.events.on('campHit', () => this.chime(65, 0.18, 0.09)), world.events.on('hit', () => { const t = this.context?.currentTime ?? 0; if (t - this.lastImpact > 0.16) { this.lastImpact = t; this.chime(130, 0.08, 0.018); } })];
  }
  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext(); this.output = this.context.createGain(); this.output.gain.value = this.muted ? 0 : 0.6; this.output.connect(this.context.destination);
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 5, this.context.sampleRate), data = buffer.getChannelData(0);
      let previous = 0; for (let i = 0; i < data.length; i++) { previous = (previous + (Math.random() * 2 - 1) * 0.02) / 1.02; data[i] = previous * 0.24; }
      this.source = this.context.createBufferSource(); this.source.buffer = buffer; this.source.loop = true;
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 750; this.source.connect(filter); filter.connect(this.output); this.source.start();
    }
    if (!this.suspended) await this.context.resume();
  }
  mute(muted: boolean): void { this.muted = muted; if (this.output && this.context) this.output.gain.setTargetAtTime(muted ? 0 : 0.6, this.context.currentTime, 0.1); }
  pause(paused: boolean): void { this.suspended = paused; if (this.context) void (paused ? this.context.suspend() : this.context.resume()); }
  dispose(): void { this.off.forEach(off => off()); this.source?.stop(); if (this.context) void this.context.close(); }
  private chime(frequency: number, duration: number, volume: number): void {
    if (!this.context || !this.output || this.muted || this.suspended) return;
    const now = this.context.currentTime, oscillator = this.context.createOscillator(), gain = this.context.createGain(); oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency * 1.4, now); oscillator.frequency.exponentialRampToValueAtTime(frequency, now + duration);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain); gain.connect(this.output); oscillator.start(now); oscillator.stop(now + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
