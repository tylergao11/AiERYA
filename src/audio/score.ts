import type { Phase } from '../game/contracts';
import { SCORE_BAR, AUDIO_TRACKS, type AudioTrack } from './catalog';
import type { AudioMixer } from './mixer';

export interface ScoreState { phase: Phase; alive: number; nearCamp: number; elites: number; king: boolean; health: number; wave: number }
export type ScoreLevel = 'quiet' | 'battle' | 'pressure' | 'king' | 'won' | 'lost';
/** Hysteresis and dwell prevent rapid musical changes when one pack is killed. */
export class ScoreDirector {
  level: ScoreLevel='quiet';
  pressure=0;
  private held=0;
  update(state: ScoreState,dt: number): ScoreLevel {
    const wanted=Math.min(1,state.alive/100+state.nearCamp*.045+state.elites*.022+(100-state.health)*.003+state.wave*.009);
    this.pressure+=(wanted-this.pressure)*(1-Math.exp(-Math.max(0,dt)/3));this.held+=dt;
    let next: ScoreLevel=state.phase==='won'?'won':state.phase==='lost'?'lost':state.phase!=='battle'?'quiet':state.king?'king':this.level==='pressure'&&this.pressure>.42?'pressure':this.pressure>.7?'pressure':'battle';
    if(state.phase==='battle'&&!state.king&&next!==this.level&&this.held<6&&['battle','pressure'].includes(this.level))next=this.level;
    if(next!==this.level){this.level=next;this.held=0;}return this.level;
  }
  reset(): void {this.level='quiet';this.pressure=0;this.held=0;}
}
interface Layer {source: AudioBufferSourceNode; gain: GainNode; name: AudioTrack}
const LAYERS:AudioTrack[]=['night-theme','war-drums','tightening-strings','wind','river','embers'];
export class ForestScore {
  readonly director=new ScoreDirector();
  private layers: Layer[]=[];
  private disposed=false;
  private started=false;
  private origin=0;
  private current='';
  private readonly off: (() => void)[];
  constructor(private readonly mixer: AudioMixer){this.off=[mixer.onReady(()=>this.start()),mixer.onTrackReady((name,buffer)=>this.addLayer(name,buffer))];}
  update(state: ScoreState,dt:number):void {
    const level=this.director.update(state,dt);
    if(!this.layers.length||this.current===level)return;
    this.current=level;
    const ctx=this.mixer.context!,now=ctx.currentTime;
    const boundary=this.origin+Math.ceil(Math.max(0,now-this.origin)/SCORE_BAR)*SCORE_BAR;
    const when=['battle','pressure','king'].includes(level)?Math.max(now,boundary):now;
    const mix:Record<ScoreLevel,readonly number[]>={quiet:[1,0,0,1,.8,.7],battle:[1,.6,.18,.6,.48,.55],pressure:[.85,.8,.62,.4,.32,.4],king:[.8,.9,.82,.3,.25,.35],won:[.8,0,0,.8,.7,.65],lost:[.28,0,0,.5,.4,.4]};
    for(const layer of this.layers){const i=LAYERS.indexOf(layer.name);const gain=layer.gain.gain;if(typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(now);else{gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);}gain.setTargetAtTime(mix[level][i]??0,when,level==='lost'?.6:1.1);}
  }
  reset():void {this.director.reset();this.current='';this.mixer.stopEffects();}
  dispose():void {this.disposed=true;this.off.forEach(off=>off());for(const {source,gain} of this.layers){source.stop();source.disconnect();gain.disconnect();}this.layers=[];}
  private start():void{
    if(this.started||this.disposed)return;this.started=true;
    this.origin=this.mixer.context!.currentTime+.06;
    for(const name of LAYERS)void this.mixer.load(name);
  }
  private addLayer(name:AudioTrack,buffer:AudioBuffer):void{
    const ctx=this.mixer.context,i=LAYERS.indexOf(name);if(!ctx||this.disposed||i<0||this.layers.some(l=>l.name===name))return;
    const source=ctx.createBufferSource(),gain=ctx.createGain(),when=Math.max(this.origin,ctx.currentTime+.02),seconds=AUDIO_TRACKS[name].seconds;
    source.buffer=buffer;source.loop=true;source.loopEnd=seconds;gain.gain.value=0;source.connect(gain);gain.connect(this.mixer.buses[i<3?'music':'ambience']!);
    source.start(when,Math.max(0,when-this.origin)%seconds);this.layers.push({source,gain,name});this.current='';
  }
}
