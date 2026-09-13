import { clamp, type Point } from '../core/math';
import type { World } from '../game/world';
import type { Element, GameEvents } from '../game/contracts';
import { ART, toArt, type Camera2D } from './projection';
import { COLORS } from './ink';

export const SUMMON_CLOSEUP = { enter: .11, portraitEnter: .18, hold: .37, union: .94, impactHold: .16, release: .42, wait: 1.15, fury: .62, furyWait: .32, evolution: 1.18, interval: 1.8, desktopZoom: 1.48, mobileZoom: 1.28, portraitZoom: 2 } as const;
interface Bounds { left: number; right: number; top: number; bottom: number }
interface Shot { age: number; duration: number; priority: number; bounds: Bounds; from: Point; to: Point; actors: number[]; ownerId?: number; targetId?: number; landed: boolean; contactAge: number | null; contactWeight: number; element: Element }
const valid = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.z);
const smooth = (t: number) => { const p=clamp(t,0,1); return p*p*(3-2*p); };

/** One closeup per union order: frame the companions AND contact, never change combat time. */
export class SummonCloseup {
  private shot: Shot | null = null;
  private cooldown = 0;
  private order = 0;
  private filmedOrder = -1;
  private weight = 0;
  private focus: Point = { x: 0, z: 0 };
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly off: (() => void)[];
  constructor(private readonly world: World) {
    this.off = [
      world.events.on('summonOrder', e => { if(e.kind==='union')this.order++; }),
      world.events.on('spiritAttack', e => {
        if(e.union && !e.echo && (e.stage==='windup'||e.stage==='launch'))this.union(e.at,e.to,e.spiritId,e.targetId,e.element);
        else if(e.stage==='windup' && e.empowered && !e.echo && this.world.mechanics.commands.fury>=3 && this.world.build.has('beast') && this.world.mechanics.spirits.some(s=>s.id===e.spiritId&&s.role==='main'))
          this.start(e.at,e.to,1,e.spiritId,e.targetId,e.element,true);
      }),
      world.events.on('summonImpact', e => this.contact(e)),
      world.events.on('summonTechnique', e => { if(e.kind==='fury')this.fury(e); }),
      world.events.on('spiritTransition', e => { if(e.kind==='evolve')this.start(e.at,e.at,3,e.spiritId,undefined,e.element); }),
      world.events.on('spiritRestriction', e => { if(e.state!=='free'&&this.shot?.ownerId===e.spiritId&&!this.shot.landed)this.cancel(); }),
      world.events.on('phase', () => this.cancel()),
      world.events.on('ultimate', () => this.cancel()),
      world.events.on('reset', () => { this.cancel(); this.cooldown=0; this.order=0; this.filmedOrder=-1; }),
    ];
  }
  get active(): boolean { return this.shot!==null; }
  private union(from: Point, to: Point, spiritId?: number, targetId?: number, element: Element = 'metal'): void {
    if(this.filmedOrder===this.order || !valid(from) || !valid(to))return;
    // Later pets and delayed echoes from this same order cannot reopen a cancelled shot.
    this.filmedOrder=this.order;
    this.start(from,to,2,spiritId,targetId,element);
  }
  private contact(e: GameEvents['summonImpact']): void {
    if(!e.union||e.echo||!valid(e.from)||!valid(e.at))return;
    this.union(e.from,e.at,e.spiritId,e.targetId,e.element);
    const shot=this.shot;
    // A late teammate hit cannot drag an existing closeup to the other side of the map.
    if(!shot||shot.priority!==2||shot.landed||shot.ownerId!==undefined&&e.spiritId!==shot.ownerId)return;
    if(shot.targetId!==undefined&&e.targetId!==shot.targetId)return;
    shot.from={...e.from};shot.to={...e.at};shot.landed=true;shot.element=e.element;
    shot.contactAge=shot.age;shot.contactWeight=this.weight;
    shot.duration=Math.max(SUMMON_CLOSEUP.union,shot.age+SUMMON_CLOSEUP.impactHold+SUMMON_CLOSEUP.release);
  }
  private fury(e: GameEvents['summonTechnique']): void {
    if(!valid(e.from)||!valid(e.at))return;
    const shot=this.shot;
    if(shot?.priority===1&&!shot.landed){
      if(shot.ownerId!==undefined&&e.spiritId!==shot.ownerId || shot.targetId!==undefined&&e.targetId!==shot.targetId)return;
      // Anticipation only frames the attack. The real technique confirms its impact.
      shot.from={...e.from};shot.to={...e.at};shot.element=e.element;shot.landed=true;
      shot.contactAge=shot.age;shot.contactWeight=this.weight;shot.duration=shot.age+SUMMON_CLOSEUP.fury;
    }else this.start(e.from,e.at,1,e.spiritId,e.targetId,e.element);
  }
  private framing(from: Point, to: Point, priority: number, actorIds: number[]): Bounds {
    const p=toArt(to),radius=priority===2?120:86;
    const bounds: Bounds={left:p.x-radius,right:p.x+radius,top:p.y-radius*1.3,bottom:p.y+60};
    const actors=this.world.mechanics.spirits.filter(s=>actorIds.includes(s.id));
    const expand=(at:Point,beast:boolean,ground:boolean,growth=1)=>{
      const q=toArt(at),width=(beast?222:ground?122:234)*growth,height=(beast?210:ground?235:285)*growth;
      bounds.left=Math.min(bounds.left,q.x-width);bounds.right=Math.max(bounds.right,q.x+width);
      bounds.top=Math.min(bounds.top,q.y-height);bounds.bottom=Math.max(bounds.bottom,q.y+24);
    };
    for(const s of actors){const beast=s.role==='main'&&this.world.build.has('beast');expand(s,beast,s.element==='wood'||s.element==='earth',beast?Math.max(1,s.size/1.75):Math.max(1,s.size));}
    if(!actors.length)expand(from,false,false);
    return bounds;
  }
  private start(from: Point, to: Point, priority: number, spiritId?: number, targetId?: number, element: Element = 'metal', anticipate=false): void {
    if(!this.world.mechanics.commands.active || this.world.phase!=='battle' || this.world.ultimate.active || !valid(from) || !valid(to))return;
    if(this.shot && (priority<=this.shot.priority || priority<3&&this.shot.age>.22))return;
    if(!this.shot && this.cooldown>0&&priority<3)return;
    const owner=spiritId!==undefined?this.world.mechanics.spirits.find(s=>s.id===spiritId)
      :priority===1&&this.world.build.has('beast')?this.world.mechanics.spirits.find(s=>s.role==='main')
      :this.world.mechanics.spirits.find(s=>Math.hypot(s.x-from.x,s.z-from.z)<.2);
    if(priority===3&&!owner)return;
    // Feature the casting body and its contact; idle nearby pets must not force a wide shot.
    const actors=owner?[owner]:[];
    const ids=actors.map(s=>s.id),bounds=this.framing(from,to,priority,ids);
    const tracking={from:{...from},to:{...to},actors:ids,ownerId:owner?.id,targetId,landed:priority!==2&&!anticipate,contactAge:priority===1&&!anticipate?0:null,contactWeight:0,element};
    if(priority===3)this.shot={age:0,duration:SUMMON_CLOSEUP.evolution,priority,bounds,...tracking};
    else if(this.shot){
      const old=this.shot.bounds;
      this.shot.bounds={left:Math.min(old.left,bounds.left),right:Math.max(old.right,bounds.right),top:Math.min(old.top,bounds.top),bottom:Math.max(old.bottom,bounds.bottom)};
      this.shot.priority=priority;this.shot.duration=SUMMON_CLOSEUP.wait+SUMMON_CLOSEUP.release;
      Object.assign(this.shot,tracking);
    }else this.shot={age:0,duration:priority===2?SUMMON_CLOSEUP.wait+SUMMON_CLOSEUP.release:anticipate?SUMMON_CLOSEUP.furyWait+SUMMON_CLOSEUP.release:SUMMON_CLOSEUP.fury,priority,bounds,...tracking};
    this.cooldown=SUMMON_CLOSEUP.interval;
  }
  update(dt:number,camera:Camera2D,interrupted=false,otherCameraActive=false):void {
    const step=Number.isFinite(dt)?Math.max(0,dt):0;
    this.cooldown=Math.max(0,this.cooldown-step);
    if(interrupted||otherCameraActive||this.world.phase!=='battle'||this.world.ultimate.active)this.cancel();
    // Preserve another flow's already-applied camera transform.
    if(otherCameraActive)return;
    const shot=this.shot;
    if(!shot){camera.focus(null);return;}
    shot.age+=step;
    if(shot.age>=shot.duration){this.cancel();camera.focus(null);return;}
    if(shot.priority===3){
      const owner=this.world.mechanics.spirits.find(s=>s.id===shot.ownerId);
      if(!owner){this.cancel();camera.focus(null);return;}
      shot.from={x:owner.x,z:owner.z};shot.to={...shot.from};
    }
    if(!shot.landed){
      const owner=this.world.mechanics.spirits.find(s=>s.id===shot.ownerId),target=this.world.wolves.find(w=>w.id===shot.targetId&&w.action!=='dead');
      if(owner)shot.from={x:owner.x,z:owner.z};
      if(target)shot.to={x:target.x,z:target.z};
    }
    const desired=this.framing(shot.from,shot.to,shot.priority,shot.actors),blend=1-Math.exp(-14*step);
    for(const edge of ['left','right','top','bottom'] as const)shot.bounds[edge]+=(desired[edge]-shot.bounds[edge])*blend;
    const viewport=camera.viewport??{x:0,y:0,width:camera.width,height:camera.height};
    const mobile=Math.min(viewport.width,viewport.height)<=600,portrait=mobile&&viewport.height>viewport.width;
    const enter=portrait?SUMMON_CLOSEUP.portraitEnter:SUMMON_CLOSEUP.enter;
    const hold=shot.priority>=2?SUMMON_CLOSEUP.hold:.08;
    if(shot.priority<=2){
      const wait=shot.priority===1?SUMMON_CLOSEUP.furyWait:SUMMON_CLOSEUP.wait;
      if(shot.contactAge===null)this.weight=.88*smooth(shot.age/enter)*(1-smooth((shot.age-wait)/SUMMON_CLOSEUP.release));
      else{
        const hitAge=shot.age-shot.contactAge,settle=shot.contactAge+SUMMON_CLOSEUP.impactHold;
        this.weight=(shot.contactWeight+(1-shot.contactWeight)*smooth(hitAge/.045))*(1-smooth((shot.age-settle)/(shot.duration-settle)));
      }
    }else this.weight=smooth(shot.age/enter)*(1-smooth((shot.age-enter-hold)/(shot.duration-enter-hold)));
    const box=shot.bounds;
    this.focus={x:((box.left+box.right)/2-ART.x)/ART.unitX,z:((box.top+box.bottom)/2+20-ART.y)/ART.unitY};
    camera.focus(null);
    if(this.reduced.matches)return;
    const peak=portrait?SUMMON_CLOSEUP.portraitZoom:mobile?SUMMON_CLOSEUP.mobileZoom:SUMMON_CLOSEUP.desktopZoom;
    const fit=Math.max(1,Math.min(peak,viewport.width*.86/((box.right-box.left)*camera.scale),viewport.height*.74/((box.bottom-box.top)*camera.scale)));
    const strength=shot.priority>=2?1:.7;
    camera.focus(this.focus,1+(fit-1)*this.weight*strength,this.weight*(portrait?1:.78),peak);
  }
  paint(c:CanvasRenderingContext2D,camera:Camera2D,ratio:number):void {
    if(!this.shot||this.weight<=0)return;
    const p=camera.project(this.focus,.8),box=this.shot.bounds;
    const rx=Math.max(100,(box.right-box.left)*camera.scale*.63),ry=Math.max(85,(box.bottom-box.top)*camera.scale*.62);
    c.save();c.setTransform(ratio,0,0,ratio,0,0);c.translate(p.x,p.y);c.scale(1,ry/rx);
    const shade=c.createRadialGradient(0,0,rx*.54,0,0,rx*1.8),opacity=this.weight*(this.reduced.matches?.12:.5);
    shade.addColorStop(0,'rgba(5,15,19,0)');shade.addColorStop(.4,`rgba(5,15,19,${opacity*.32})`);shade.addColorStop(1,`rgba(5,15,19,${opacity})`);
    c.fillStyle=shade;c.fillRect(-p.x,-p.y*rx/ry,camera.width,camera.height*rx/ry);c.restore();
    this.paintContact(c,camera,ratio);
  }
  private paintContact(c:CanvasRenderingContext2D,camera:Camera2D,ratio:number):void {
    const shot=this.shot;
    if(!shot||shot.contactAge===null||this.reduced.matches)return;
    const age=shot.age-shot.contactAge;
    if(age<0||age>=.2)return;
    const t=age/.2,at=camera.project(shot.to,.7),from=camera.project(shot.from,1),angle=Math.atan2(at.y-from.y,at.x-from.x);
    // Brief peripheral brush strokes leave the actual creature and impact unobscured.
    const radius=Math.min(camera.width,camera.height)*.15,fade=Math.sin(t*Math.PI)*.42;
    c.save();c.setTransform(ratio,0,0,ratio,0,0);c.translate(at.x,at.y);
    for(let n=0;n<6;n++){
      const a=angle+Math.PI+n*Math.PI/3+.12,reach=radius+(1-t)*22,length=12+(1-t)*22;
      c.save();c.rotate(a);c.globalAlpha=fade*(n%2?.65:1);c.fillStyle=n%2?'#ded1af':COLORS[shot.element];
      c.beginPath();c.moveTo(reach,0);c.lineTo(reach+length,-1.5);c.lineTo(reach+length*.78,1);c.closePath();c.fill();c.restore();
    }
    c.restore();
  }
  cancel():void { this.shot=null;this.weight=0; }
  dispose():void { this.off.forEach(off=>off());this.cancel(); }
}
