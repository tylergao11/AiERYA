import { distance } from '../core/math';
import type { Element, Ward, Wolf } from './contracts';
import { GENERATES } from './combat';
import { bindWolf, reactionStatus } from './reactions';
import type { World } from './world';
import { ARRAY, ARRAY_SUPPORT, ARRAY_SUPPORT_NAMES } from './array-balance';

export interface ArrayAssist { ward: Ward; element: Element; remaining: number; duration: number; strength: number; tick: number; touched: Set<number> }

/** Paid gestures activate terrain-bound utility. No actor, autonomous attack or damage multiplier. */
export class ArraySupport {
  readonly fields: ArrayAssist[] = [];
  private readonly cooldowns = new Map<number, number>();
  constructor(private readonly world: World) {}
  clear(): void { this.fields.length = 0; this.cooldowns.clear(); }
  private available(ward: Ward): boolean {
    return this.world.build.is('array') && this.world.phase === 'battle' && this.world.wards.includes(ward)
      && ward.health > 0 && ward.suppressed <= 0 && !this.world.enemyAbilities.silenced(ward);
  }
  private targets(ward: Ward): Wolf[] {
    return this.world.wolves.filter(w => w.action !== 'dead' && this.world.wardAffects(w, ward))
      .sort((a,b)=>distance(a,ward)-distance(b,ward)||a.id-b.id).slice(0,ARRAY.targetCap);
  }
  invoke(ward: Ward, incoming: Element, investment: number, activated: Set<number>): void {
    // Only the forward generation relation is an auxiliary activation.
    if (GENERATES[incoming] !== ward.element || !this.activate(ward,investment,activated,incoming)) return;
    if (this.world.build.stage < 1) return;
    const next=this.world.wards.filter(w=>w.id!==ward.id && GENERATES[ward.element]===w.element
      && distance(w,ward)<=ARRAY.linkRange && !activated.has(w.id) && this.available(w))
      .sort((a,b)=>distance(a,ward)-distance(b,ward)||a.id-b.id)[0];
    if (next && this.activate(next,investment,activated)) this.world.events.emit('arrayEffect',{
      kind:'transfer',at:{x:ward.x,z:ward.z},to:{x:next.x,z:next.z},element:next.element,style:next.element,
      energy:0,label:'五行通脉 · 辅阵接力',targets:[],radius:next.radius,
    });
  }
  activate(ward: Ward, investment: number, activated=new Set<number>(), incoming?: Element): boolean {
    if (!this.available(ward) || investment < ARRAY_SUPPORT.minimumInvestment || activated.has(ward.id)
      || (this.cooldowns.get(ward.id)??0)>0) return false;
    const elements:Element[]=[ward.element];
    if (incoming && this.world.build.has('fivefold') && incoming!==ward.element) elements.unshift(incoming);
    if (!this.targets(ward).length && !(elements.includes('earth') && ward.health<ward.maxHealth)) return false;
    activated.add(ward.id);this.cooldowns.set(ward.id,ARRAY_SUPPORT.cooldown);
    for (const element of elements) {
      const old=this.fields.findIndex(f=>f.ward.id===ward.id && f.element===element);
      if(old>=0)this.fields.splice(old,1);
      if(this.fields.length>=ARRAY_SUPPORT.fieldCap)this.fields.shift();
      const strength=Math.min(1,investment),duration=ARRAY_SUPPORT.seconds*strength;
      const field:ArrayAssist={ward,element,strength,duration,remaining:duration,tick:ARRAY_SUPPORT.tick,touched:new Set()};
      this.fields.push(field);this.apply(field,true);
      this.world.events.emit('arrayEffect',{kind:'support',at:{x:ward.x,z:ward.z},element,style:element,energy:0,
        label:ARRAY_SUPPORT_NAMES[element],targets:this.targets(ward).map(w=>({x:w.x,z:w.z})),radius:ward.radius});
    }
    return true;
  }
  guards(ward: Ward): boolean {
    return this.available(ward) && this.fields.some(f=>f.ward===ward && f.element==='earth' && f.remaining>0);
  }
  private apply(field: ArrayAssist, first=false): void {
    const {ward,element,strength}=field,targets=this.targets(ward);
    if(element==='water')this.world.reactionEffects.pull(ward,targets,ARRAY_SUPPORT.pull*strength);
    if(element==='earth' && first)ward.health=Math.min(ward.maxHealth,ward.health+ward.maxHealth*ARRAY_SUPPORT.repair*strength);
    const burning=element==='fire'?targets.filter(w=>w.burning>0):[];
    for(const wolf of targets){
      const status=reactionStatus(wolf);
      if(element==='metal'){status.exposed=Math.max(status.exposed,ARRAY_SUPPORT.statusSeconds*strength);status.exposure=Math.max(status.exposure,ARRAY_SUPPORT.exposure*strength);}
      if(element==='wood' && !field.touched.has(wolf.id)){bindWolf(wolf,ARRAY_SUPPORT.rootSeconds*strength);field.touched.add(wolf.id);}
      if(element==='water'){wolf.wet=Math.max(wolf.wet,ARRAY_SUPPORT.statusSeconds*strength);wolf.slowAmount=Math.max(wolf.slowAmount,ARRAY_SUPPORT.slow*strength);}
      if(element==='earth'){status.weakened=Math.max(status.weakened,ARRAY_SUPPORT.statusSeconds*strength);status.weakness=Math.max(status.weakness,ARRAY_SUPPORT.weakness*strength);}
      // Each target is extended once per activation; utility ticks do not ignite new enemies or deal damage.
      if(element==='fire' && wolf.burning>0 && !field.touched.has(wolf.id)){
        wolf.burning=Math.max(wolf.burning,Math.min(ARRAY_SUPPORT.burnCap,wolf.burning+ARRAY_SUPPORT.burnExtension*strength));field.touched.add(wolf.id);
      }
    }
    if(element==='fire' && first && burning.length){
      const source=burning.sort((a,b)=>b.burnDps-a.burnDps)[0]!;
      for(const wolf of targets.filter(w=>w.burning<=0).slice(0,ARRAY_SUPPORT.spreadTargets)){
        this.world.spreadEmber(wolf,source.burnDps*ARRAY_SUPPORT.spreadShare*strength,Math.min(source.burning,field.duration));field.touched.add(wolf.id);
      }
    }
  }
  tick(dt:number):void{
    if(this.world.phase!=='battle'||!(dt>0))return;
    for(const [id,t]of this.cooldowns){if(t<=dt)this.cooldowns.delete(id);else this.cooldowns.set(id,t-dt);}
    for(let i=this.fields.length-1;i>=0;i--){const f=this.fields[i]!;f.remaining-=dt;f.tick-=dt;
      if(f.remaining<=0||!this.world.wards.includes(f.ward)||f.ward.health<=0){this.fields.splice(i,1);continue;}
      if(!this.available(f.ward)||f.tick>0)continue;f.tick=ARRAY_SUPPORT.tick;this.apply(f);
    }
  }
}
