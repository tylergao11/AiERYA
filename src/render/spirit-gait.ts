import type { RunSpirit } from '../game/rogue-combat';
import { earthFootContact, earthHand } from './earth-gait';

/** One stride is a complete left/right cycle. Large bodies cover more ground
 * per cycle; render frame rate and the simulation's movement speed are unrelated. */
export function spiritStrideLength(spirit: Pick<RunSpirit,'element'|'size'>): number {
  return spirit.size>=1.7 ? 4.2*spirit.size/1.75 : (spirit.element==='earth'?3.5:2.65)*Math.max(.8,spirit.size);
}

const GAITS={
  wood:{top:0,bottom:394,height:116,feet:[382,381,382,381],head:[20,21,21,20],centers:[227,220,218,224]},
  earth:{top:394,bottom:754,height:113,feet:[738,737,735,738],head:[400,405,401,406],centers:[210,206,207,212]},
  beast:{top:754,bottom:1086,height:119,feet:[1037,1037,1037,1037],head:[767,768,767,768],centers:[207,209,210,211]},
} as const;

// Quadrupeds retain painted contact frames; the stone guard uses independent legs.
const CONTACTS={wood:[[56,381],[331,382]],beast:[[78,1032],[326,1033]]} as const;
const MUZZLES={wood:[[299,105],[297,109],[298,107],[300,106]]} as const;

export function spiritWalkMuzzle(element:'wood'|'earth',stride:number){
  if(element==='earth')return earthHand;
  const frame=spiritWalkFrame(element,false,stride),point=MUZZLES[element][frame.frame]!;
  return {x:frame.dx+point[0]*frame.unit,y:(point[1]-frame.foot)*frame.unit};
}

export function spiritWalkContact(element:'wood'|'earth',beast:boolean,side:-1|1){
  if(element==='earth'&&!beast)return earthFootContact(side);
  const index=side>0?1:0,frame=spiritWalkFrame(element,beast,index*2),point=CONTACTS[beast?'beast':'wood'][index];
  return {x:frame.dx+point[0]*frame.unit,y:(point[1]-frame.foot)*frame.unit};
}

/** Per-frame registration retains the source alpha. Contact baselines and
 * painted height replace the old identical crop anchor for every creature. */
export function spiritWalkFrame(element:'wood'|'earth',beast:boolean,stride:number){
  const frame=((Math.floor(stride)%4)+4)%4,profile=GAITS[beast?'beast':element],foot=profile.feet[frame]!,unit=profile.height/(foot-profile.head[frame]!);
  return {frame,sx:frame*362,sy:profile.top,sw:362,sh:profile.bottom-profile.top,
    dx:-profile.centers[frame]!*unit,dy:-(foot-profile.top)*unit,dw:362*unit,dh:(profile.bottom-profile.top)*unit,
    unit,foot,head:profile.head[frame]!,height:profile.height};
}
