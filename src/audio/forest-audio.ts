import type { World } from '../game/world';
import type { Wolf } from '../game/contracts';
import { CAMP } from '../game/terrain';
import type { Point } from '../core/math';
import { ForestScore } from './score';
import type { AudioMixer } from './mixer';
import type { SoundCue } from './catalog';

interface WolfSoundState { x:number; z:number; hp:number; rage:boolean; travel:number; lastStep:number; lastRegen:number }
/** Reads combat state; never changes wolf AI, damage, rewards, or flow-owned effects. */
export class ForestAudio {
  readonly score: ForestScore;
  private readonly off:(()=>void)[]=[];
  private readonly wolves=new Map<number,WolfSoundState>();
  private time=0;
  private scan=0;
  private dangerAt=-100;
  private dangerHealth=100;
  private kingId=-1;
  private disposed=false;
  constructor(private readonly world:World,readonly mixer:AudioMixer,private readonly host:HTMLElement){
    this.score=new ForestScore(mixer);
    this.off.push(mixer.onReady(()=>{void mixer.load('forest-cues');}),
      world.events.on('phase',({phase})=>{if(phase==='rest')mixer.play('reward',{priority:3,cooldown:1});if(phase==='won'||phase==='lost'){mixer.stopEffects();mixer.play(phase==='won'?'victory':'defeat',{priority:5});}}),
      world.events.on('death',({wolf})=>{this.enemy(wolf.kind==='king'||wolf.kind==='elite'?'elite-death':'wolf-death',wolf,!wolf.kind||wolf.kind==='normal'?.32:.7,wolf.kind==='king'?5:2,.28);}),
      world.events.on('campHit',()=>{mixer.play('camp-hit',{volume:.65,priority:4,cooldown:.55});}),
      world.events.on('campRepaired',()=>mixer.play('repair',{priority:2})),
      world.events.on('upgrade',()=>mixer.play('choose',{priority:2})),
      world.events.on('enemySkill',e=>{this.enemy(e.stage==='interrupt'?'interrupt':e.skill==='call'?'howl':e.skill==='break'?(e.stage==='release'?'break':'rage'):'seal',e.at,e.stage==='release'?.9:.65,3,.3);if(e.stage==='release')mixer.duck(.28);}),
      world.events.on('enemyBite',e=>{this.enemy(e.king?'giant':'bite',e.at,.4,e.king?3:1,.25);}),
      world.events.on('enemySplit',e=>this.enemy('split',e.at,.9,3,.2)),
      world.events.on('reset',()=>{this.wolves.clear();this.time=0;this.scan=0;this.kingId=-1;this.dangerAt=-100;this.dangerHealth=100;this.score.reset();}),
      world.events.on('ultimate',e=>{if(e.stage==='release')mixer.duck(.5);}),
      world.events.on('slayerFinisher',()=>mixer.duck(.4)),
      world.events.on('arrayEffect',e=>{if(e.kind==='harmony'&&e.targets.length)mixer.duck(.35);}),
      world.events.on('summonOrder',e=>{if(e.kind==='union')mixer.duck(.35);}));
    host.addEventListener('click',this.click);
  }
  update(elapsed:number,battleElapsed:number):void{
    if(this.disposed)return;
    this.time+=battleElapsed;this.scan+=elapsed;if(this.scan<.1)return;
    const sampled=this.scan;this.scan=0;
    const live=this.world.wolves.filter(w=>w.action!=='dead');
    this.score.update({phase:this.world.phase,alive:live.length,nearCamp:live.filter(w=>Math.hypot(w.x-CAMP.x,w.z-CAMP.z)<7).length,elites:live.filter(w=>w.kind==='elite').length,king:live.some(w=>w.kind==='king'),health:this.world.health,wave:this.world.wave},sampled);
    if(this.world.phase!=='battle'||battleElapsed<=0)return;
    const ids=new Set<number>();
    for(const wolf of live){ids.add(wolf.id);this.observe(wolf);}
    for(const id of this.wolves.keys())if(!ids.has(id))this.wolves.delete(id);
    if(this.world.health>40)this.dangerHealth=100;
    if(this.world.health<=30&&this.world.health<=this.dangerHealth-10&&live.some(w=>Math.hypot(w.x-CAMP.x,w.z-CAMP.z)<7)&&this.time-this.dangerAt>12){this.dangerAt=this.time;this.dangerHealth=this.world.health;this.mixer.play('danger',{volume:.7,priority:5,cooldown:12});this.mixer.duck(.25);}
  }
  dispose():void{this.disposed=true;this.off.forEach(off=>off());this.host.removeEventListener('click',this.click);this.score.dispose();this.wolves.clear();}
  private observe(wolf:Wolf):void{
    const rage=!!wolf.affixes?.includes('rage')&&wolf.hp/wolf.maxHp<.4;
    const old=this.wolves.get(wolf.id);
    if(!old){this.wolves.set(wolf.id,{x:wolf.x,z:wolf.z,hp:wolf.hp,rage:false,travel:0,lastStep:this.time+(wolf.id%7)*.12,lastRegen:-100});if(wolf.kind==='king'&&this.kingId!==wolf.id){this.kingId=wolf.id;this.enemy('king',wolf,1,5,2);this.mixer.duck(.45);}return;}
    if(rage&&!old.rage)this.enemy('rage',wolf,.8,3,.4);
    if(wolf.affixes?.includes('regen')&&wolf.hp>old.hp+.001&&this.time-old.lastRegen>6){this.enemy('regen',wolf,.4,1,1.5);old.lastRegen=this.time;}
    old.travel+=Math.hypot(wolf.x-old.x,wolf.z-old.z);
    const running=wolf.motion?wolf.motion.pose==='run':wolf.action==='run';
    if(old.travel>2.4&&this.time-old.lastStep>.65+(wolf.id%5)*.09&&wolf.rooted<=0&&running&&Math.hypot(wolf.x-CAMP.x,wolf.z-CAMP.z)<20){
      const cue=wolf.affixes?.includes('giant')?'giant':wolf.affixes?.includes('swift')?'swift':'footstep';
      this.enemy(cue,wolf,cue==='footstep'?.2:.25,0,cue==='footstep'?.29:.7);old.travel=0;old.lastStep=this.time;
    }
    old.x=wolf.x;old.z=wolf.z;old.hp=wolf.hp;old.rage=rage;
  }
  private enemy(cue:SoundCue,at:Point,volume:number,priority:number,cooldown:number):void {
    const d=Math.hypot(at.x-CAMP.x,at.z-CAMP.z),attenuation=Math.max(.12,1-d/42);
    this.mixer.play(cue,{volume:volume*attenuation,pan:(at.x-CAMP.x)/35,priority,cooldown,rate:cue==='king'?1:cue==='elite-death'&&priority===5?.73:.95+Math.random()*.1});
  }
  private readonly click=(event:MouseEvent):void=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    const action=button.dataset.action;
    if(action&&['start','roll','accept-fate','reroll-rewards','continue-run','reset','help','build','pause','resume','finish-run'].includes(action))this.mixer.play('ui',{volume:.8,priority:2,cooldown:.08});
  };
}
