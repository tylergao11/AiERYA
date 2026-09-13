import type { World } from '../game/world';
import type { Point } from '../core/math';
import { ORDERS } from '../game/summon-balance';
import { summonTechniqueText } from '../ui/summon-copy';
import { toArt } from './projection';
import type { CombatLabel } from './combat-labels';

interface Caption { at: Point; title: string; age: number; duration: number; priority: number; order: boolean }
export const summonDetailScale = (scale: number): number => Math.max(1,Math.min(4.4,.82/(Number.isFinite(scale)&&scale>0?scale:1)));

/** One bounded title layer shares collision layout with damage, instead of each FX writing text. */
export class SummonLabels {
  private captions: Caption[] = [];
  private readonly off: (()=>void)[];
  constructor(private readonly world: World){
    this.off=[world.events.on('summonTechnique',e=>{
      const copy=summonTechniqueText(e);if(copy)this.add(e.at,copy.title,.85,4,false);
    }),world.events.on('summonOrder',e=>{
      if(world.mechanics.commands.stormOnly && world.ultimate.active)return;
      if(e.kind!=='infuse'&&e.kind!=='union')return;
      this.captions=this.captions.filter(c=>!c.order);
      const title=e.kind==='union'?(e.pure?'万灵同契':'群灵合击'):e.element?ORDERS[e.element].name:'';
      if(title)this.add(e.at,title,e.kind==='union'?1.05:.55,e.kind==='union'?5:3,true);
    }),world.events.on('phase',e=>{if(e.phase!=='battle')this.clear();}),world.events.on('reset',()=>this.clear())];
  }
  private add(at:Point,title:string,duration:number,priority:number,order:boolean):void {
    if(!this.world.mechanics.commands.active||this.world.phase!=='battle')return;
    // Nearby simultaneous contributors use a single readable title without extending it indefinitely.
    if(this.captions.some(c=>c.title===title&&c.age<.28&&Math.hypot(c.at.x-at.x,c.at.z-at.z)<2))return;
    if(this.captions.length>=6)this.captions.shift();
    this.captions.push({at:{...at},title,duration,priority,order,age:0});
  }
  update(dt:number):void {const step=Number.isFinite(dt)?Math.max(0,dt):0;this.captions=this.captions.filter(c=>{c.age+=step;return c.age<c.duration;});}
  labels(detail:number,measure:(text:string,size:number)=>number):CombatLabel[]{
    return [...this.captions].reverse().map(c=>{
      const p=toArt(c.at,2.8),size=(c.priority===5?18:14)*detail;
      return {p:{x:p.x,y:p.y-c.age*20},text:c.title,size,width:measure(c.title,size),color:'#ddc9a0',alpha:Math.min(1,(c.duration-c.age)*5),priority:c.priority};
    });
  }
  clear():void {this.captions=[];}
  dispose():void {this.off.forEach(off=>off());this.clear();}
}
