import { clamp, type Point } from '../core/math';
import { audioBytes } from './loading';
import type { GameEvents } from '../game/contracts';
import type { World } from '../game/world';
import type { RunSpirit } from '../game/rogue-combat';
import { spiritProfile } from '../game/spirit-profile';
import { SUMMON_SPRITE, SUMMON_SPRITE_SECONDS, type SummonCue, type SummonMaterial } from './summon-bank';

export const SUMMON_AUDIO_VOICES=8;
interface Voice { source:AudioBufferSourceNode; gain:GainNode; pan:StereoPannerNode; priority:number; volume:number }
interface Options { load?:()=>Promise<ArrayBuffer>; duck?:()=>void }
/** Flow-owned audio on the shared mixer. Contacts, commands and echoes have separate voices. */
export class SummonAudio {
  private context:AudioContext|null=null;
  private bus:DynamicsCompressorNode|null=null;
  private sprite:AudioBuffer|null=null;
  private readonly loaded:Promise<ArrayBuffer|null>;
  private readonly abort=new AbortController();
  private readonly voices=new Set<Voice>();
  private readonly recent=new Map<string,{time:number;priority:number}>();
  private readonly contacts=new Map<string,number>();
  private pendingTransition:GameEvents['spiritTransition']|null=null;
  private readonly pendingSpawns=new Map<number,GameEvents['spiritSpawn']>();
  private muted=false;
  private paused=false;
  private disposed=false;
  private order=0;
  private struckOrder=-1;
  private sequence=0;
  private featuredUntil=0;
  private peak=0;
  private dropped=0;
  private played=0;
  private failed=false;
  private readonly off:(()=>void)[];
  constructor(private readonly world:World,private readonly options:Options={}){
    this.loaded=(options.load??(()=>audioBytes(`${import.meta.env.BASE_URL}audio/summon-materials.wav`)))().catch(()=>null);
    this.off=[
      world.events.on('spiritAttack',e=>this.attack(e)),
      world.events.on('beastFeast',e=>{
        if(world.phase!=='battle'||e.marks>=e.goal||!world.mechanics.spirits.some(s=>s.id===e.spiritId&&this.material(s)==='beast'))return;
        this.play('feed-beast',e.marks%4===0?.29:.22,1,e.at,'feast',.18);
      }),
      world.events.on('spiritStep',e=>{
        if(world.phase!=='battle')return;
        const owner=world.mechanics.spirits.find(s=>s.id===e.spiritId);if(!owner||owner.cast>0)return;
        const beast=owner.role==='main'&&world.build.has('beast'),material=beast?'beast':owner.element;
        if(material!=='wood'&&material!=='earth'&&material!=='beast')return;
        // Footfalls can replace each other, but can never evict even a quiet attack voice.
        this.play(`step-${material}`,beast?.29:material==='earth'?.24:.19,-1,e.at,'footstep',.14);
      }),
      world.events.on('spiritSpawn',e=>{
        if(this.paused&&['destiny','rest','prepare'].includes(world.phase)&&!this.muted&&this.sprite&&this.context&&this.context.state!=='closed'){
          if(this.pendingSpawns.size>=8&&!this.pendingSpawns.has(e.spiritId)){
            const oldest=[...this.pendingSpawns.values()].find(s=>s.role!=='main')??this.pendingSpawns.values().next().value!;
            this.pendingSpawns.delete(oldest.spiritId);
          }
          this.pendingSpawns.set(e.spiritId,{...e,at:{...e.at}});
        }else this.spawn(e);
      }),
      world.events.on('spiritTransition',e=>{
        if(this.paused&&world.phase==='rest'&&!this.muted&&this.sprite&&this.context&&this.context.state!=='closed')this.pendingTransition={...e,at:{...e.at}};
        else this.transition(e);
      }),
      world.events.on('spiritRestriction',e=>{
        if(world.phase!=='battle'||!world.mechanics.spirits.some(s=>s.id===e.spiritId))return;
        const freed=e.state==='free';this.play(freed?'freed':'blocked',freed?.25:.34,freed?1:2,e.at,freed?'restriction-free':'restriction-block',.4);
      }),
      world.events.on('summonOrder',e=>{
        if(world.mechanics.commands.stormOnly && world.ultimate.active){
          if(e.kind==='union')this.order++;
          const owner=world.mechanics.spirits.find(s=>e.spiritIds.includes(s.id));
          if(owner)this.play('infuse',.58,3,owner,'storm-order',.65);
          return;
        }
        if(e.kind==='union'){this.order++;this.play('union-call',.64,3,e.at,'order',.22);}
        else this.play(e.kind==='infuse'?'infuse':e.kind==='move'?'move':'focus',e.kind==='infuse'?.47:.52,1,e.at,'order',.13);
      }),
      world.events.on('summonReady',()=>this.play('ready',.62,3,undefined,'ready',.8)),
      world.events.on('summonImpact',e=>this.impact(e)),
      world.events.on('spiritAbility',e=>{
        if(!world.mechanics.spirits.some(s=>s.id===e.spiritId))return;
        this.play(e.kind,e.kind==='fireburst'?.64:e.kind==='stomp'?.34:.27,e.kind==='fireburst'?3:1,e.at,`ability-${e.kind}`,e.kind==='fireburst'?.16:.12);
      }),
      world.events.on('summonTechnique',e=>{
        if(e.kind==='echo')return; // Its arrival event owns the sound, not both events.
        if(e.kind==='seal'&&!e.toElement)return; // A lethal old imprint has one material contact, not a second seal chord.
        if(e.kind==='fury'){if(this.play('fury',.82,4,e.at,'special',.4))this.options.duck?.();}
        else this.play(e.kind==='furyReady'?'ready':e.kind,e.kind==='seal'?.35:.43,2,e.at,`technique-${e.kind}`,e.kind==='hunt'?.4:.2);
      }),
      world.events.on('phase',e=>{this.clear();if(e.phase!=='prepare'&&e.phase!=='battle'){this.pendingTransition=null;this.pendingSpawns.clear();}else this.flushMilestones();}),world.events.on('reset',()=>{this.clear();this.pendingTransition=null;this.pendingSpawns.clear();this.order=0;this.struckOrder=-1;}),
      world.events.on('ultimate',e=>{if(e.stage==='start'){this.clear();this.pendingTransition=null;this.pendingSpawns.clear();}}),
    ];
  }
  async attach(context:AudioContext,destination:AudioNode):Promise<void>{
    if(this.context||this.disposed)return;
    this.context=context;context.addEventListener?.('statechange',this.flushMilestones);this.bus=context.createDynamicsCompressor();this.bus.threshold.value=-14;this.bus.knee.value=10;this.bus.ratio.value=4;this.bus.attack.value=.004;this.bus.release.value=.14;this.bus.connect(destination);
    const data=await this.loaded;
    if(this.disposed)return;
    if(!data){this.failed=true;return;}
    try{const decoded=await context.decodeAudioData(data);if(!this.disposed){if(decoded.duration+.015<SUMMON_SPRITE_SECONDS){this.failed=true;return;}this.sprite=decoded;}}
    catch{this.failed=true;}
  }
  get diagnostics(){return {ready:!!this.sprite,failed:this.failed,contextState:this.context?.state??'locked',pendingArrivals:this.pendingSpawns.size+(this.pendingTransition?1:0),activeVoices:this.voices.size,peakVoices:this.peak,played:this.played,dropped:this.dropped,decodedBytes:this.sprite?this.sprite.length*this.sprite.numberOfChannels*4:0};}
  private spawn(e:GameEvents['spiritSpawn']):void{
    const owner=this.world.mechanics.spirits.find(s=>s.id===e.spiritId);if(!owner)return;
    const material=this.material(owner),ensemble=Math.sqrt(new Set(this.world.mechanics.spirits.map(s=>this.material(s))).size||1);
    this.play(`spawn-${material}`,(owner.role==='support'?.44:.54)/ensemble,3,owner,`spawn-${material}`,.3);
  }
  private transition(e:GameEvents['spiritTransition']):void{
    const owner=this.world.mechanics.spirits.find(s=>s.id===e.spiritId);if(!owner)return;
    if(this.play(`spawn-${e.ancestor?'beast':e.element}`,e.kind==='evolve'?.82:.62,4,owner,'transition',.5))this.options.duck?.();
  }
  private attack(e:GameEvents['spiritAttack']):void{
    const spirit=this.world.mechanics.spirits.find(s=>s.id===e.spiritId);if(!spirit)return;
    const material=this.material(spirit),beast=material==='beast';
    if(e.stage==='launch'||e.stage==='windup'&&e.style==='melee'){
      // Different bodies form a volley; matching bodies share one voice within a tight beat.
      const ensemble=Math.sqrt(new Set(this.world.mechanics.spirits.map(s=>this.material(s))).size||1);
      this.play(`launch-${material}`,(e.echo?.14:e.union?.44:e.empowered?.32:.24)/ensemble,e.union?2:0,e.at,`launch-${material}`,.07);
    }else if(e.stage==='impact'){
      if(this.recentContact(e.to,e.spiritId,e.targetId))return;
      this.play(`hit-${material}`,beast?.57:.42,2,e.to,`contact-${material}`,.085);
    }
  }
  private material(spirit:RunSpirit):SummonMaterial{return spirit.role==='main'&&this.world.build.has('beast')?'beast':spirit.element;}
  private contactKey(at:Point,spiritId?:number,targetId?:number):string{
    return spiritId!==undefined&&targetId!==undefined?`pet:${spiritId}:${targetId}`:`point:${Math.round(at.x*2)}:${Math.round(at.z*2)}`;
  }
  private recentContact(at:Point,spiritId?:number,targetId?:number):boolean{
    const now=this.context?.currentTime??0;
    return [this.contactKey(at,spiritId,targetId),this.contactKey(at)].some(key=>now-(this.contacts.get(key)??-10)<.095);
  }
  private impact(e:GameEvents['summonImpact']):void{
    const now=this.context?.currentTime??0;
    if(e.echo){this.play('echo',.22,0,e.at,'echo',.12);return;}
    this.contacts.set(this.contactKey(e.at,e.spiritId,e.targetId),now);
    if(this.contacts.size>64)this.contacts.delete(this.contacts.keys().next().value!);
    const owner=e.spiritId===undefined?undefined:this.world.mechanics.spirits.find(s=>s.id===e.spiritId);
    const native=owner&&this.material(owner),lead=e.union&&this.struckOrder!==this.order;
    if(lead){
      this.struckOrder=this.order;
      const material=native==='beast'?'beast':e.element;
      if(this.play(`union-${material}`,.82,5,e.at,'special',.4))this.options.duck?.();
      this.play(`hit-${e.element}`,.35,3,e.at,`contact-${e.element}`,.1);
    }else this.play(`hit-${e.element}`,Math.min(.64,.4+e.strength*.13),e.union?3:2,e.at,`contact-${e.element}`,.09);
    // The infused material does not replace the weight of a planted hoof, stone fist or claw.
    if(owner&&native&&native!==e.element&&spiritProfile(owner).style==='melee'&&!(lead&&native==='beast'))
      this.play(`hit-${native}`,e.union?.28:native==='beast'?.34:.24,e.union?3:2,e.at,`body-${native}`,.11);
  }
  private play(cue:SummonCue,volume:number,priority:number,at?:Point,group:string=cue,interval=.1):boolean{
    const ctx=this.context;
    if(!ctx||!this.bus||!this.sprite||this.disposed||this.muted||this.paused||ctx.state!=='running'||(!this.world.build.is('spirit')&&!this.world.mechanics.spirits.length))return false;
    const now=ctx.currentTime,last=this.recent.get(group);
    if(last&&now-last.time<interval&&last.priority>=priority){this.dropped++;return false;}
    if(this.voices.size>=SUMMON_AUDIO_VOICES){
      const weakest=[...this.voices].sort((a,b)=>a.priority-b.priority)[0]!;
      if(weakest.priority>priority){this.dropped++;return false;}this.stop(weakest);
    }
    this.recent.set(group,{time:now,priority});
    if(priority>=4){
      this.featuredUntil=now+.36;
      for(const voice of this.voices)if(voice.priority<3||voice.priority>=4&&voice.priority<priority){voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(voice.volume*.22,now,.012);}
    }
    const amount=volume*(priority<3&&now<this.featuredUntil?.3:1),segment=SUMMON_SPRITE.get(`${cue}:${this.sequence++%2}`)!;
    const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
    source.buffer=this.sprite;gain.gain.value=amount;pan.pan.value=at&&Number.isFinite(at.x)?clamp(at.x/26,-.55,.55):0;
    source.connect(gain);gain.connect(pan);pan.connect(this.bus);
    const voice:Voice={source,gain,pan,priority,volume:amount};this.voices.add(voice);this.peak=Math.max(this.peak,this.voices.size);this.played++;
    source.onended=()=>this.disconnect(voice);source.start(0,segment.offset,segment.duration);return true;
  }
  private disconnect(voice:Voice):void{voice.source.onended=null;voice.source.disconnect();voice.gain.disconnect();voice.pan.disconnect();this.voices.delete(voice);}
  private stop(voice:Voice):void{try{voice.source.stop();}catch{/* A naturally ended source may already be stopped. */}this.disconnect(voice);}
  clear():void{for(const voice of [...this.voices])this.stop(voice);this.recent.clear();this.contacts.clear();this.featuredUntil=0;}
  mute(value:boolean):void{this.muted=value;if(value){this.clear();this.pendingTransition=null;this.pendingSpawns.clear();}}
  pause(value:boolean):void{
    this.paused=value;
    if(value){this.clear();this.pendingTransition=null;this.pendingSpawns.clear();return;}
    this.flushMilestones();
  }
  private readonly flushMilestones=():void=>{
    if(this.disposed||this.muted||this.paused||this.context?.state!=='running'||!['prepare','battle'].includes(this.world.phase))return;
    const transition=this.pendingTransition,spawns=[...this.pendingSpawns.values()];this.pendingTransition=null;this.pendingSpawns.clear();
    // The shared mixer resumes asynchronously after closing a panel. Only its
    // real running state may consume milestone cues; combat hits are never queued.
    if(transition)this.transition(transition);
    const main=transition&&this.world.mechanics.spirits.find(s=>s.id===transition.spiritId),featured=main&&this.material(main);
    for(const spawn of spawns){
      const owner=this.world.mechanics.spirits.find(s=>s.id===spawn.spiritId);
      if(owner&&this.material(owner)!==featured)this.spawn(spawn);
    }
  };
  dispose():void{this.disposed=true;this.abort.abort();this.off.forEach(off=>off());this.clear();this.pendingTransition=null;this.pendingSpawns.clear();this.sprite=null;this.bus?.disconnect();this.bus=null;this.context?.removeEventListener?.('statechange',this.flushMilestones);this.context=null;}
}
