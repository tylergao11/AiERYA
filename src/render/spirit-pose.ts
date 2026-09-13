import type { RunSpirit } from '../game/rogue-combat';
import type { GameEvents } from '../game/contracts';
import { spiritProfile } from '../game/spirit-profile';
import { spiritStrideLength } from './spirit-gait';
import { spiritLanes } from './spirit-lanes';

export interface SpiritPose { age: number; elapsed: number; previousCast: number; facing: 1 | -1; heading: number; growth: number; x: number; z: number; speed: number; vx: number; vz: number; stride: number; walkWeight: number; still: number; spread: number; windup: number; recovery: number; force: number; actionTarget: number | null }

function initial(spirit:RunSpirit):SpiritPose {
  const profile=spiritProfile(spirit);
  return {age:spirit.age,elapsed:1,previousCast:0,facing:1,heading:1,growth:spirit.size,x:spirit.x,z:spirit.z,speed:0,vx:0,vz:0,stride:0,walkWeight:0,still:1,spread:0,windup:profile.windup,recovery:profile.recovery,force:1,actionTarget:null};
}

/** The body reaches its strongest pose at contact, then holds and settles. */
export function spiritActionMotion(elapsed:number,windup:number,recovery:number):{pull:number;strike:number;active:boolean} {
  if(elapsed<0||elapsed>=windup+recovery)return {pull:0,strike:0,active:false};
  const preparation=windup*.64;
  if(elapsed<preparation)return {pull:Math.sin(elapsed/preparation*Math.PI/2),strike:0,active:true};
  if(elapsed<windup){const t=(elapsed-preparation)/(windup-preparation),ease=t*t*(3-2*t);return {pull:1-ease,strike:ease,active:true};}
  const hold=Math.min(.045,recovery*.2),t=Math.min(1,Math.max(0,(elapsed-windup-hold)/(recovery-hold)));
  return {pull:0,strike:1-t*t*(3-2*t),active:true};
}

/** Ground bodies keep their walking silhouette while bracing, then transfer
 * into the painted contact pose and back without replacing a whole body at once. */
export function spiritMeleeBlend(elapsed:number,windup:number,recovery:number):number {
  const smooth=(t:number)=>{const p=Math.max(0,Math.min(1,t));return p*p*(3-2*p);};
  if(elapsed<0||elapsed>=windup+recovery)return 0;
  return smooth((elapsed-windup*.5)/(windup*.42))*(1-smooth((elapsed-windup-.045)/Math.max(.01,recovery-.045)));
}

/** Presentation clocks follow accepted casts; they never move or damage actors. */
export class SpiritPoses {
  private readonly poses = new Map<number, SpiritPose>();
  private ensure(spirit:RunSpirit):SpiritPose {let pose=this.poses.get(spirit.id);if(!pose){pose=initial(spirit);this.poses.set(spirit.id,pose);}return pose;}
  attack(spirit:RunSpirit,event:GameEvents['spiritAttack']):void {
    if(event.echo)return;
    const pose=this.ensure(spirit);
    if(event.stage==='windup'){
      pose.elapsed=0;pose.previousCast=spirit.cast;pose.windup=Math.max(.01,event.duration);pose.recovery=spiritProfile(spirit).recovery;
      pose.force=event.union?1.2:event.empowered?1.1:1;pose.actionTarget=event.targetId;
      if(Math.abs(event.to.x-spirit.x)>.4)pose.facing=event.to.x>spirit.x?1:-1;
    }else if(pose.actionTarget===event.targetId&&(event.stage==='launch'||event.style==='melee'))this.contact(spirit);
  }
  contact(spirit:RunSpirit):void {
    const pose=this.poses.get(spirit.id);
    if(pose&&pose.elapsed<pose.windup+.09)pose.elapsed=Math.max(pose.elapsed,pose.windup);
  }
  cancel(spirit:RunSpirit):void { const pose=this.ensure(spirit);pose.elapsed=1;pose.previousCast=spirit.cast;pose.actionTarget=null;pose.force=1; }
  update(spirits: readonly RunSpirit[], dt: number, targetX: (id: number) => number | undefined, onStep?: (spirit:RunSpirit,side:-1|1)=>void): void {
    const live = new Set(spirits.map(s => s.id));
    const lanes = spiritLanes(spirits);
    for (const id of this.poses.keys()) if (!live.has(id)) this.poses.delete(id);
    for (const spirit of spirits) {
      const pose = this.ensure(spirit);
      // Flying companions bank into adjacent visual lanes when their silhouettes overlap.
      // Their simulation coordinates, contact ranges and damage remain unchanged.
      const flying=spirit.size<1.7&&['metal','water','fire'].includes(spirit.element);
      const spread=lanes.get(spirit.id)??0;
      pose.spread+=(spread-pose.spread)*Math.min(1,dt*7);
      const dx = spirit.x - pose.x, dz=spirit.z-pose.z, travel = Math.hypot(dx, dz);
      const speed = dt > 0 && travel < 1 ? Math.min(5, travel / dt) : 0;
      const smooth=1-Math.exp(-Math.max(0,dt)*18);
      pose.speed += (speed - pose.speed) * smooth;
      pose.vx+=((speed?dx/Math.max(dt,.001):0)-pose.vx)*smooth;pose.vz+=((speed?dz/Math.max(dt,.001):0)-pose.vz)*smooth;
      const stepping=!flying&&speed>.15;
      pose.still=speed>.15?0:pose.still+Math.max(0,dt);
      // Rendering can occur between fixed simulation ticks. A single unchanged
      // position is not a stop and must never advance the foot toward rest.
      const moving=!flying&&(stepping||pose.still<.085&&pose.walkWeight>.01);
      pose.walkWeight+=((moving?1:0)-pose.walkWeight)*(1-Math.exp(-Math.max(0,dt)*(moving?15:20)));
      const previousStep=Math.floor(pose.stride/2);
      if (stepping) pose.stride += travel*4/spiritStrideLength(spirit);
      else if(!flying&&!moving){
        // Set the raised foot down before resting, without restarting the loop
        // or advancing it forever after the simulation has stopped.
        const planted=Math.max(0,Math.ceil((pose.stride-1e-6)/2)*2);
        pose.stride+=(planted-pose.stride)*(1-Math.exp(-Math.max(0,dt)*22));
        if(Math.abs(planted-pose.stride)<.01)pose.stride=planted;
      }
      pose.x = spirit.x; pose.z = spirit.z;
      pose.age += Math.max(0, dt);
      pose.elapsed += Math.max(0, dt);
      if (spirit.cast > pose.previousCast + .035) {pose.elapsed = 0;pose.actionTarget=spirit.targetId;pose.force=1;}
      // Changed orders clear the actual cast. Do not finish an abandoned swing while retreating.
      if(spirit.cast===0&&pose.previousCast>Math.max(0,dt)+.04){pose.elapsed=1;pose.actionTarget=null;}
      pose.previousCast = spirit.cast;
      const x = spirit.targetId === null ? undefined : targetX(spirit.targetId);
      const committed=pose.elapsed<pose.windup+.08&&pose.actionTarget!==null;
      if(!committed){
        // Ignore tiny sideways routing corrections during vertical movement.
        if(speed>.15&&Math.abs(pose.vx)>Math.max(.35,Math.abs(pose.vz)*.22))pose.facing=pose.vx>0?1:-1;
        else if(pose.still>=.085&&x!==undefined&&Math.abs(x-spirit.x)>.65)pose.facing=x>spirit.x?1:-1;
      }
      pose.heading+=(pose.facing-pose.heading)*(1-Math.exp(-Math.max(0,dt)*24));
      pose.growth += (spirit.size - pose.growth) * Math.min(1, Math.max(0, dt) * 6);
      const step=Math.floor(pose.stride/2);
      if(stepping&&step>previousStep&&spirit.cast<=0&&pose.age>.25&&pose.elapsed>=pose.windup+pose.recovery)onStep?.(spirit,step%2?1:-1);
    }
  }
  get(spirit: RunSpirit): SpiritPose { return this.poses.get(spirit.id) ?? initial(spirit); }
  clear(): void { this.poses.clear(); }
}

export function ancestorFrame(elapsed: number, windup=.18, recovery=.28): number {
  return elapsed < windup*.7 ? 1 : elapsed < windup+.1 ? 2 : elapsed < windup+recovery ? 3 : 0;
}

export function spiritAttackRow(elapsed: number, windup=.16, recovery=.24): number { return elapsed >= windup*.82 && elapsed < windup+recovery ? 1 : 0; }
