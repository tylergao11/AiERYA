import type { World } from '../game/world';
import { AudioMixer } from '../audio/mixer';
import { SlayerAudio } from './slayer-audio';
import { SummonAudio } from '../audio/summon-audio';
import { ArrayAudio } from '../audio/array-audio';

/** Shared audio lifecycle; each flow owns its material sounds and voice budget. */
export class Soundscape {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private readonly slayer: SlayerAudio;
  private slayerReady: Promise<void> | null = null;
  private readonly summon: SummonAudio;
  private summonAttached: Promise<void> | null = null;
  private readonly arrays: ArrayAudio;
  private readonly off: (() => void)[];
  constructor(world: World, readonly mixer = new AudioMixer()) {
    this.slayer = new SlayerAudio(world, undefined, () => mixer.duck(.45));
    this.summon = new SummonAudio(world, {duck:()=>mixer.duck(.4)});
    this.arrays = new ArrayAudio(world, mixer);
    this.off = [mixer.subscribe(settings => {
      const silent = settings.muted || settings.master === 0 || settings.effects === 0;
      this.slayer.mute(silent); this.summon.mute(silent);
    }), world.events.on('ward', () => mixer.play('formation-set', {volume:.5, priority:1, cooldown:.2})),
    world.events.on('invoke', ({ element }) => {
      if (!world.build.is('slayer') && !world.mechanics.commands.replacesStroke) mixer.play(`invoke-${element}`, {volume:.5, priority:2, cooldown:.12});
    }), world.events.on('hit', () => {
      // The three flows already emit material contact sounds. Do not add a tonal ping per hit.
      if (!world.build.active) mixer.play('impact', {volume:.3, priority:0, cooldown:.28});
    })];
    this.off.push(world.events.on('ultimate', ({stage}) => {
      if (stage === 'start') mixer.play('time-stop', {volume:.65, priority:4, cooldown:.5});
      if (stage === 'release') mixer.play('time-release', {volume:world.mechanics.commands.stormOnly?.24:.8, priority:5, cooldown:.5});
    }));
  }
  async unlock(): Promise<void> {
    const unlocked = this.mixer.unlock();
    if (!this.context) {
      this.context = this.mixer.context;
      if (this.context) { this.output = this.context.createGain(); this.output.gain.value = .7; this.output.connect(this.mixer.buses.effects!); this.slayerReady = this.slayer.attach(this.context, this.output); this.summonAttached = this.summon.attach(this.context, this.output); }
    }
    await unlocked; await Promise.all([this.slayerReady,this.summonAttached,this.arrays.prepare()]);
  }
  get slayerDiagnostics() { return this.slayer.diagnostics; }
  get summonDiagnostics() { return this.summon.diagnostics; }
  get arrayDiagnostics() { return this.arrays.diagnostics; }
  mute(muted: boolean): void { this.mixer.setPreferences({ muted }); }
  pause(paused: boolean): void { this.slayer.pause(paused); this.summon.pause(paused); this.arrays.pause(paused); this.mixer.pause(paused); }
  dispose(): void { this.off.forEach(off => off()); this.slayer.dispose(); this.summon.dispose(); this.arrays.dispose(); this.output?.disconnect(); this.mixer.dispose(); }
}
