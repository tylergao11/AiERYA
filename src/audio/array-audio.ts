import type { World } from '../game/world';
import type { ArrayEvent } from '../game/array-momentum';
import type { Point } from '../core/math';
import { ARRAY_SOUNDS, type ArraySound } from './array-catalog';
import type { AudioMixer } from './mixer';
import { audioBytes, audioFormats } from './loading';

interface Voice { source:AudioBufferSourceNode; gain:GainNode; pan:StereoPannerNode; priority:number; volume:number }
export const ARRAY_VOICES=10;
const pentatonic=[1,2**(3/12),2**(5/12),2**(7/12),2**(10/12)];
const panAt=(at?:Point)=>at&&Number.isFinite(at.x)?Math.max(-.65,Math.min(.65,at.x/25)):0;

/** Bounded, material-specific spell audio on the shared effects bus. No new
 * AudioContext, no per-enemy stacking and no playback of stale pre-unlock hits. */
export class ArrayAudio {
  private bank:AudioBuffer|null=null;
  private pending:Promise<void>|null=null;
  private readonly abort=new AbortController();
  private readonly voices=new Set<Voice>();
  private readonly recent=new Map<string,{time:number;priority:number}>();
  private readonly off:(()=>void)[];
  private readonly variations=new Map<ArraySound,number>();
  private transferStep=0;
  private lastTransfer=-10;
  private muted=false;
  private paused=false;
  private disposed=false;
  private failed=false;
  private played=0;
  private peakVoices=0;
  private dropped=0;
  constructor(private readonly world:World,private readonly mixer:AudioMixer,private readonly load:(extension:string,signal:AbortSignal)=>Promise<ArrayBuffer>=async(extension,signal)=>{
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    return audioBytes(`./audio/array-spells.${extension}`);
  }){
    this.off=[mixer.subscribe(s=>{this.muted=s.muted||s.master===0||s.effects===0;if(this.muted)this.clear();}),
      mixer.onReady(()=>{void this.prepare();}),world.events.on('arrayEffect',e=>this.receive(e)),
      world.events.on('pulse',e=>{if(e.targets.length)this.play(e.ward.element,.12,0,e.ward,'pulse',.24);}),
      world.events.on('phase',()=>this.clear()),world.events.on('reset',()=>this.clear())];
  }
  get diagnostics(){return {loaded:!!this.bank,failed:this.failed,activeVoices:this.voices.size,peakVoices:this.peakVoices,played:this.played,dropped:this.dropped};}
  prepare():Promise<void>{if(!this.mixer.context||this.disposed)return Promise.resolve();return this.pending??=this.decode();}
  private async decode():Promise<void>{
    const context=this.mixer.context;if(!context||this.disposed)return;
    for(const extension of audioFormats()){
      const request=new AbortController(),cancel=()=>request.abort();this.abort.signal.addEventListener('abort',cancel,{once:true});
      const timeout=setTimeout(cancel,8000);
      try{
      const bytes=await this.load(extension,request.signal);if(this.disposed)return;
      const buffer=await context.decodeAudioData(bytes);if(this.disposed)return;
      const tail=ARRAY_SOUNDS.mark[1];if(buffer.duration+1/100<tail.offset+tail.duration)continue;
      this.bank=buffer;this.failed=false;return;
      }catch{if(this.disposed)return;}
      finally{clearTimeout(timeout);this.abort.signal.removeEventListener('abort',cancel);}
    }
    this.failed=true;
  }
  private receive(e:ArrayEvent):void{
    if(this.disposed||this.paused||this.muted||!this.world.build.is('array'))return;
    const now=this.mixer.context?.currentTime??0;
    if(e.kind==='support'){this.play(e.element,.25,1,e.at,`support:${e.element}`,.3,1.12,0,undefined,.7);return;}
    if(e.kind==='feed'){this.play('ready',.62,1,e.at,'ready',.18);return;}
    if(e.kind==='mark'){this.play('mark',.5,0,e.at,'mark',.2);return;}
    if(e.kind==='remnant'){this.play('remnant',.35,0,e.at,'remnant',.15);return;}
    if(e.kind==='transfer'){
      if(e.energy<=0)return;
      if(now-this.lastTransfer>.45)this.transferStep=0;
      if(this.transferStep>=5)return;
      const step=this.transferStep++;this.lastTransfer=now;
      this.play('transfer',.34,2,e.at,`transfer${step}`,0,pentatonic[step]!,step*.05,e.to);return;
    }
    if(!e.targets.length)return;
    const power=Number.isFinite(e.energy)?Math.max(0,Math.min(1,e.energy/100)):0,heaven=e.label.includes('周天'),echo=e.kind==='echo';
    this.play(e.style,.4+Math.sqrt(power)*.4,echo?1:3,e.at,`impact:${e.style}`,echo?.12:.065,echo?1.07:1,0,undefined,echo?.43:1);
    if(e.kind==='harmony'||heaven){if(this.play('harmony',.85,5,e.at,'harmony',.55))this.mixer.duck(.4);}
    else if(echo)this.play('echo',.4,1,e.at,'echo',.25);
    else if(power>=.7)this.mixer.duck(.24);
  }
  private play(cue:ArraySound,volume:number,priority:number,at?:Point,group=cue as string,interval=.1,rate=1,delay=0,to?:Point,scale=1):boolean{
    const ctx=this.mixer.context,destination=this.mixer.buses.effects;
    if(!ctx||ctx.state!=='running'||!destination||!this.bank||this.disposed||this.paused||this.muted||!this.world.build.is('array'))return false;
    const now=ctx.currentTime,previous=this.recent.get(group);if(previous&&now-previous.time<interval&&previous.priority>=priority){this.dropped++;return false;}
    if(this.voices.size>=ARRAY_VOICES){const weakest=[...this.voices].sort((a,b)=>a.priority-b.priority)[0]!;if(weakest.priority>priority){this.dropped++;return false;}this.stop(weakest);}
    this.recent.set(group,{time:now,priority});
    if(priority>=3)for(const v of this.voices)if(v.priority<=1)v.gain.gain.setTargetAtTime(v.volume*.28,now,.015);
    const variant=this.variations.get(cue)??0;this.variations.set(cue,variant+1);
    const segment=ARRAY_SOUNDS[cue][variant%2]!,source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner(),start=now+delay,duration=segment.duration/rate,v=volume*scale*.8;
    source.buffer=this.bank;source.playbackRate.value=rate;pan.pan.setValueAtTime(panAt(at),start);if(to)pan.pan.linearRampToValueAtTime(panAt(to),start+Math.min(.3,duration));
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(v,start+.004);gain.gain.setValueAtTime(v,start+Math.max(.005,duration-.025));gain.gain.linearRampToValueAtTime(0,start+duration);
    source.connect(gain);gain.connect(pan);pan.connect(destination);
    const voice={source,gain,pan,priority,volume:v};this.voices.add(voice);this.peakVoices=Math.max(this.peakVoices,this.voices.size);this.played++;
    source.onended=()=>this.disconnect(voice);source.start(start,segment.offset,segment.duration);return true;
  }
  private disconnect(v:Voice):void{v.source.onended=null;v.source.disconnect();v.gain.disconnect();v.pan.disconnect();this.voices.delete(v);}
  private stop(v:Voice):void{try{v.source.stop();}catch{/* Already stopped by the context. */}this.disconnect(v);}
  clear():void{for(const v of [...this.voices])this.stop(v);this.recent.clear();this.transferStep=0;this.lastTransfer=-10;}
  pause(paused:boolean):void{this.paused=paused;if(paused)this.clear();}
  dispose():void{this.disposed=true;this.abort.abort();this.off.forEach(off=>off());this.clear();this.bank=null;}
}
