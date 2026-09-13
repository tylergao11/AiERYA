import { AUDIO_REVISION, AUDIO_TRACKS, SOUND_CUES, type AudioTrack, type SoundCue } from './catalog';
import { normalizeAudio, readAudioPreferences, saveAudioPreferences, type AudioPreferences } from './preferences';
import { audioBytes, audioFormats } from './loading';

export type AudioBus = 'music' | 'effects' | 'ambience';
interface Voice { stop(): void; priority: number; cue: SoundCue }
/** One context and one gain graph for the scene, including flow-owned skill sounds. */
export class AudioMixer {
  context: AudioContext | null = null;
  readonly buses: Partial<Record<AudioBus, GainNode>> = {};
  readonly buffers = new Map<AudioTrack, AudioBuffer>();
  settings = readAudioPreferences();
  private master?: GainNode;
  private duckGain?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private limiter?: WaveShaperNode;
  private decoder?: OfflineAudioContext;
  private readonly listeners = new Set<(settings: AudioPreferences) => void>();
  private readonly ready = new Set<() => void>();
  private readonly trackReady = new Set<(name: AudioTrack, buffer: AudioBuffer) => void>();
  private readonly requests = new Map<AudioTrack, Promise<AudioBuffer | null>>();
  private readonly voices = new Set<Voice>();
  private readonly lastCue = new Map<SoundCue, number>();
  private paused = false;
  private disposed = false;
  private lastDuck = -10;
  private peakVoices = 0;
  private dropped = 0;
  private failed = new Set<AudioTrack>();
  private lastRetry=-10;
  get diagnostics() { return { state: this.context?.state ?? 'locked', activeVoices: this.voices.size, peakVoices: this.peakVoices, dropped: this.dropped, decodedBytes: [...this.buffers.values()].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0), loaded: [...this.buffers.keys()], failed: [...this.failed] }; }
  subscribe(listener: (settings: AudioPreferences) => void): () => void { this.listeners.add(listener); listener(this.settings); return () => { this.listeners.delete(listener); }; }
  onReady(listener: () => void): () => void { this.ready.add(listener); if(this.context)listener(); return () => {this.ready.delete(listener);}; }
  onTrackReady(listener:(name:AudioTrack,buffer:AudioBuffer)=>void):()=>void{this.trackReady.add(listener);this.buffers.forEach((buffer,name)=>listener(name,buffer));return()=>{this.trackReady.delete(listener);};}
  setPreferences(patch: Partial<AudioPreferences>): void { this.settings=normalizeAudio({...this.settings,...patch});if(this.settings.muted||this.settings.master===0||this.settings.effects===0)this.stopEffects();saveAudioPreferences(this.settings);this.applyVolumes();this.listeners.forEach(fn=>fn(this.settings)); }
  async unlock(): Promise<void> {
    if(this.disposed)return;
    try { const session=(navigator as Navigator & {audioSession?:{type:string}}).audioSession;if(session)session.type='playback'; } catch { /* Optional iOS playback routing. */ }
    if(!this.context){
      const ctx=this.context=new AudioContext({latencyHint:'interactive'});
      try { this.decoder??=new OfflineAudioContext(1,1,24000); } catch { /* Decode at the live context rate on older engines. */ }
      this.master=ctx.createGain();this.compressor=ctx.createDynamicsCompressor();this.duckGain=ctx.createGain();
      this.limiter=ctx.createWaveShaper();const curve=new Float32Array(4097);
      for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1,a=Math.abs(x);curve[i]=Math.sign(x)*(a<=.78?a:.78+.16*(1-Math.exp(-(a-.78)/.16)));}
      this.limiter.curve=curve;this.limiter.oversample='2x';
      this.compressor.threshold.value=-8;this.compressor.knee.value=8;this.compressor.ratio.value=12;this.compressor.attack.value=.003;this.compressor.release.value=.18;
      this.master.connect(this.compressor);this.compressor.connect(this.limiter);this.limiter.connect(ctx.destination);this.duckGain.connect(this.master);
      for(const bus of ['music','effects','ambience'] as const){
        const node=ctx.createGain(),highpass=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter(),lowpass=ctx.createBiquadFilter();
        highpass.type='highpass';highpass.frequency.value=bus==='music'?85:bus==='effects'?55:110;highpass.Q.value=.7;
        presence.type='peaking';presence.frequency.value=bus==='effects'?3200:2200;presence.Q.value=.7;presence.gain.value=bus==='effects'?-2.5:-1;
        lowpass.type='lowpass';lowpass.frequency.value=bus==='music'?8500:bus==='effects'?11500:7000;lowpass.Q.value=.7;
        node.connect(highpass);highpass.connect(presence);presence.connect(lowpass);lowpass.connect(bus==='music'?this.duckGain:this.master);this.buses[bus]=node;
      }
      this.applyVolumes();this.ready.forEach(fn=>fn());
    }
    if(!this.paused && this.context.state!=='running') await this.context.resume();
    // A pending resume must not undo a newer background/pause request.
    if(this.paused && this.context.state==='running')await this.context.suspend();
    if(this.failed.size&&this.context.currentTime-this.lastRetry>3){this.lastRetry=this.context.currentTime;for(const name of this.failed){this.requests.delete(name);void this.load(name);}}
  }
  pause(paused: boolean): void {
    this.paused=paused;
    if(paused)this.stopEffects();
    const ctx=this.context;if(!ctx||ctx.state==='closed')return;
    void (paused?ctx.suspend():ctx.resume()).then(()=>{if(this.disposed)return;if(this.paused&&ctx.state==='running')return ctx.suspend();if(!this.paused&&ctx.state==='suspended')return ctx.resume();}).catch(()=>{});
  }
  load(name: AudioTrack): Promise<AudioBuffer | null> {
    if(this.disposed)return Promise.resolve(null);
    try { this.decoder??=new OfflineAudioContext(1,1,24000); } catch { if(!this.context)return Promise.resolve(null); }
    if(this.buffers.has(name))return Promise.resolve(this.buffers.get(name)!);
    const cached=this.requests.get(name);if(cached)return cached;
    const promise=this.loadTrack(name);this.requests.set(name,promise);return promise;
  }
  async preload(names: readonly AudioTrack[]): Promise<void> {
    for(const name of names)if(!await this.load(name))throw new Error(`Audio unavailable: ${name}`);
  }
  private async loadTrack(name: AudioTrack): Promise<AudioBuffer | null> {
    const ctx=this.decoder??this.context;if(!ctx||this.disposed)return null;
    for(const extension of audioFormats()){
      try{
        const bytes=await audioBytes(`./audio/${name}.${extension}?v=${AUDIO_REVISION}`);
        if(this.disposed)return null;
        const buffer=await ctx.decodeAudioData(bytes);if(this.disposed)return null;
        if(buffer.duration+.02<AUDIO_TRACKS[name].seconds)continue;
        this.buffers.set(name,buffer);this.failed.delete(name);this.trackReady.forEach(fn=>fn(name,buffer));return buffer;
      }catch{if(this.disposed)return null;}
    }
    this.failed.add(name);this.requests.delete(name);return null;
  }
  play(cue: SoundCue, options: {volume?: number; pan?: number; priority?: number; cooldown?: number; rate?: number} = {}): boolean {
    const ctx=this.context,buffer=this.buffers.get('forest-cues');
    if(!ctx||!buffer||this.disposed||this.paused||ctx.state!=='running'||this.settings.muted||this.settings.effects===0||this.settings.master===0)return false;
    const now=ctx.currentTime,priority=options.priority??1;
    if(now-(this.lastCue.get(cue)??-100)<(options.cooldown??.1)){this.dropped++;return false;}
    if(this.voices.size>=18){const weakest=[...this.voices].sort((a,b)=>a.priority-b.priority)[0]!;if(weakest.priority>=priority){this.dropped++;return false;}weakest.stop();}
    this.lastCue.set(cue,now);
    const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
    const clip=SOUND_CUES[cue],rate=Math.max(.7,Math.min(1.3,options.rate??1));
    source.buffer=buffer;source.playbackRate.value=rate;pan.pan.value=Math.max(-.8,Math.min(.8,options.pan??0));
    const duration=clip.duration/rate,volume=options.volume??1;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.006);gain.gain.setValueAtTime(volume,now+Math.max(.007,duration-.035));gain.gain.linearRampToValueAtTime(0,now+duration);
    source.connect(gain);gain.connect(pan);pan.connect(this.buses.effects!);
    let stopped=false;
    const voice: Voice={cue,priority,stop:()=>{if(stopped)return;stopped=true;try{source.stop();}catch{}source.disconnect();gain.disconnect();pan.disconnect();this.voices.delete(voice);}};
    this.voices.add(voice);this.peakVoices=Math.max(this.peakVoices,this.voices.size);source.onended=voice.stop;
    source.start(now,clip.offset,clip.duration);return true;
  }
  /** Flow owners can request one bounded music dip at the actual impact. */
  duck(strength=.35): void {
    const ctx=this.context,gain=this.duckGain?.gain;if(!ctx||!gain||this.paused||ctx.currentTime-this.lastDuck<.65)return;
    const now=ctx.currentTime;this.lastDuck=now;gain.cancelScheduledValues(now);gain.setValueAtTime(1,now);gain.linearRampToValueAtTime(Math.max(.35,1-strength),now+.025);gain.setTargetAtTime(1,now+.18,.22);
  }
  stopEffects(): void { for(const voice of [...this.voices])voice.stop();this.lastCue.clear(); }
  dispose(): void { if(this.disposed)return;this.disposed=true;this.stopEffects();this.ready.clear();this.trackReady.clear();this.listeners.clear();this.buffers.clear();this.requests.clear();this.decoder=undefined;if(this.context)void this.context.close().catch(()=>{}); }
  private applyVolumes(): void {
    const ctx=this.context;if(!ctx||!this.master)return;
    this.master.gain.setTargetAtTime(this.settings.muted?0:this.settings.master,ctx.currentTime,.04);
    for(const bus of ['music','effects','ambience'] as const)this.buses[bus]?.gain.setTargetAtTime(this.settings[bus],ctx.currentTime,.06);
  }
}
