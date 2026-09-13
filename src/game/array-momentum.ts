import { distance, segmentDistance, type Point } from '../core/math';
import { GENERATES, OVERCOMES, type CombatStroke } from './combat';
import type { Element, Ward, Wolf } from './contracts';
import type { World } from './world';
import type { RogueHit } from './rogue-combat';
import { bindWolf, reactionStatus } from './reactions';
import { ArraySupport } from './array-support';
import { ARRAY as A, ARRAY_NAMES } from './array-balance';

export type ArrayStyle = Element | 'steam' | 'splinter' | 'rupture' | 'melt' | 'mud';
export interface ArrayEvent { kind: 'feed' | 'transfer' | 'release' | 'harmony' | 'echo' | 'remnant' | 'mark' | 'support'; at: Point; to?: Point; element: Element; style: ArrayStyle; energy: number; label: string; targets: Point[]; radius: number }
export interface ArrayNode extends Point { id: number; ward: Ward }
export interface ArrayCharge { energy: number; memory: Element[]; bucket: number; fed: number }
export interface ArrayRemnant extends Point { id: number; element: Element; energy: number; remaining: number }
export interface ArrayMark { targetId: number; sourceId: number; element: Element; remaining: number; energy: number }
export interface ArrayField extends Point { element: Element; style: ArrayStyle; radius: number; remaining: number; tick: number; power: number; touched: Set<number> }
interface ArrayPlan { nodes: ArrayNode[]; element: Element; investment: number; ticket: number; remnants: number[] }
interface Echo { node: ArrayNode; element: Element; style: ArrayStyle; energy: number; memory: Element[]; remaining: number; label?: string }

/** Persistent, local formation energy. Only real damage and paid manual reactions
 * can feed it. Transfers spend their source; every secondary effect is terminal. */
export class ArrayMomentum {
  readonly support: ArraySupport;
  private readonly charges = new Map<number, ArrayCharge>();
  readonly remnants: ArrayRemnant[] = [];
  readonly marks: ArrayMark[] = [];
  readonly fields: ArrayField[] = [];
  private echoes: Echo[] = [];
  private nextId = 1;
  private lastTicket = -1;
  lastAction = '有效攻击养势 · 相生传势 · 相克放势';
  constructor(private readonly world: World) { this.support = new ArraySupport(world); }
  get active(): boolean { return this.world.build.is('array'); }
  get pure(): boolean { const chosen = this.world.build.starting; return chosen.length > 0 && chosen.every(d => d.fate === 'array'); }
  get nodes(): ArrayNode[] {
    if (!this.active) return [];
    return this.world.wards.filter(w => w.health > 0).map(ward => ({ id: ward.id, x: ward.x, z: ward.z, ward }));
  }
  charge(id: number): Readonly<ArrayCharge> | undefined { return this.charges.get(id); }
  get total(): number { return this.nodes.reduce((sum, n) => sum + (this.charges.get(n.id)?.energy ?? 0), 0); }
  get readyCount(): number { return this.nodes.filter(n => this.available(n) && (this.charges.get(n.id)?.energy ?? 0) >= A.ready).length; }
  get harmonyReady(): boolean {
    if(!this.pure)return false;
    const ready=this.nodes.filter(n=>this.available(n)&&(this.charges.get(n.id)?.energy??0)>=A.ready&&this.targets(n).length>0);
    return ready.some((a,i)=>ready.some((b,j)=>i!==j&&distance(a,b)<=A.linkRange));
  }
  hasTargets(id:number):boolean { const node=this.nodes.find(n=>n.id===id);return !!node&&this.targets(node).length>0; }
  private state(node: ArrayNode): ArrayCharge {
    let state = this.charges.get(node.id);
    if (!state) { state = { energy: 0, memory: [node.ward.element], bucket: -1, fed: 0 }; this.charges.set(node.id, state); }
    return state;
  }
  private available(node: ArrayNode, ownConversion = false): boolean {
    return this.nodes.some(n => n.id === node.id) && node.ward.health > 0 && (ownConversion || node.ward.suppressed <= 0) && !this.world.enemyAbilities.silenced(node);
  }
  private affects(node: ArrayNode, wolf: Wolf): boolean {
    return this.world.wardAffects(wolf, node.ward);
  }
  private targets(node: ArrayNode): Wolf[] { return this.world.wolves.filter(w => w.action !== 'dead' && this.affects(node, w)).sort((a,b) => distance(node,a)-distance(node,b) || a.id-b.id).slice(0,A.targetCap); }
  private remember(state: ArrayCharge, elements: readonly Element[]): void { state.memory = [...new Set([...state.memory, ...elements])]; }
  private add(node: ArrayNode, amount: number, memory: readonly Element[] = []): number {
    const state = this.state(node), gain = Math.max(0, Math.min(A.capacity - state.energy, amount));
    if (gain <= 0) return 0; state.energy += gain; this.remember(state, memory); return gain;
  }
  clear(): void { this.charges.clear(); this.endBattle(); this.nextId = 1; this.lastTicket = -1; this.lastAction = '有效攻击养势 · 相生传势 · 相克放势'; }
  endBattle(): void { this.remnants.length = 0; this.marks.length = 0; this.fields.length = 0; this.echoes = []; this.support.clear(); }
  sync(): void { const live = new Set(this.nodes.map(n => n.id)); for (const id of this.charges.keys()) if (!live.has(id)) this.charges.delete(id); }
  feedHit(origin: RogueHit | undefined, damage: number, wolf: Wolf): void {
    if (!this.active || this.world.phase !== 'battle' || !origin || origin.noProc || origin.arrayRelease || !(damage > 0)) return;
    const node = origin.spiritId === undefined ? this.nodes.find(n => origin.wardId === n.id) : undefined;
    if (!node || !this.available(node)) return;
    const state = this.state(node), bucket = Math.floor(this.world.time / A.feedWindow);
    if (state.bucket !== bucket) { state.bucket = bucket; state.fed = 0; }
    const gain = Math.max(0, Math.min(A.feedWindowCap - state.fed, damage * A.feedPerDamage));
    const old = state.energy; state.fed += this.add(node, gain);
    if (old < A.ready && state.energy >= A.ready) this.emit('feed', node, node.ward.element, node.ward.element, state.energy, '阵势可放');
    if (this.has('messenger') && wolf.action !== 'dead' && wolf.hp > 0 && state.energy >= A.markCost && !this.marks.some(m => m.targetId === wolf.id) && this.marks.length < A.markCap) {
      state.energy -= A.markCost;
      this.marks.push({ targetId: wolf.id, sourceId: node.id, element: node.ward.element, energy: A.markCost, remaining: A.markSeconds });
      this.emit('mark', wolf, node.ward.element, node.ward.element, A.markCost, '借敌行阵');
    }
  }
  touched(points: readonly Point[]): ArrayNode[] {
    const along = (node: Point) => {
      let length = 0, first = Infinity;
      for (let i = 1; i < points.length; i++) {
        const a = points[i-1]!, b = points[i]!, d = distance(a,b);
        if (segmentDistance(node,a,b) <= A.eyeRadius) {
          const projection = d ? Math.max(0, Math.min(1, ((node.x-a.x)*(b.x-a.x)+(node.z-a.z)*(b.z-a.z))/(d*d))) : 0;
          first = Math.min(first, length + projection*d);
        }
        length += d;
      }
      return first;
    };
    return this.nodes.filter(n => this.available(n)).map(n => ({n,order:along(n)})).filter(n => Number.isFinite(n.order)).sort((a,b) => a.order-b.order || a.n.id-b.n.id).map(n=>n.n);
  }
  plan(stroke: CombatStroke, element: Element, origin?: RogueHit): ArrayPlan | null {
    if (!this.active || origin?.kind !== 'manual' || !origin.ticket || this.world.phase !== 'battle') return null;
    this.sync();
    return { nodes: this.touched(stroke.points), element, investment: Math.min(1,origin.ticket.investment ?? stroke.investment ?? 1), ticket: origin.ticket.id,
      remnants: this.remnants.filter(r => stroke.points.some((p,i) => i > 0 && segmentDistance(r,stroke.points[i-1]!,p) <= A.eyeRadius)).map(r => r.id) };
  }
  resolve(plan: ArrayPlan | null): void {
    if (!plan || plan.ticket <= this.lastTicket || this.world.phase !== 'battle' || plan.investment <= 0) return;
    this.lastTicket = plan.ticket;
    const visited = new Set<number>(), released = new Set<number>();
    let previous: ArrayNode | undefined, firstReleased: ArrayNode | undefined;
    const assisted = new Set<number>();
    for (const node of plan.nodes) {
      if (!this.available(node,true) || visited.has(node.id)) continue;
      visited.add(node.id);
      const element = node.ward.element;
      this.support.invoke(node.ward,plan.element,plan.investment,assisted);
      if (previous && GENERATES[previous.ward.element] === element) this.transfer(previous,node);
      const generated = GENERATES[plan.element] === element || GENERATES[element] === plan.element;
      if (generated && this.targets(node).length) this.add(node,A.invocationGain * plan.investment / Math.max(1,plan.nodes.length),[plan.element,element]);
      previous = node;
    }
    let hops = Number(this.world.build.has('twinArray')) + Number(this.has('cycle'));
    while (previous && hops-- > 0) {
      const from = previous;
      const next = this.nodes.filter(n => !visited.has(n.id) && this.available(n) && GENERATES[from.ward.element] === n.ward.element && distance(from,n) <= A.linkRange)
        .sort((a,b)=>distance(from,a)-distance(from,b)||a.id-b.id)[0];
      if (!next || !this.transfer(from,next)) break;
      visited.add(next.id); previous = next;
    }
    // Route the stored energy before spending it: water -> wood -> fire must
    // not discharge the starting water node before the chain can reach fire.
    for (const node of [...plan.nodes].reverse()) {
      if (OVERCOMES[plan.element] === node.ward.element || plan.element === node.ward.element) {
        if (this.release(node,plan.element,plan.investment,'release',true)) { released.add(node.id); firstReleased ??= node; }
      }
    }
    // Pure starting fates grant one additional, independently paid native release.
    if (firstReleased) this.harmony(firstReleased,plan.investment,released);
    for (const id of plan.remnants) this.releaseRemnant(id,plan.investment);
  }
  private transfer(from: ArrayNode, to: ArrayNode): boolean {
    const a = this.state(from), b = this.state(to);
    const amount = Math.min(a.energy*A.transferShare,A.capacity-b.energy);
    if (amount < A.minimumTransfer || !this.available(from,true) || !this.available(to,true)) return false;
    a.energy -= amount; this.add(to,amount,[...a.memory,from.ward.element,to.ward.element]);
    this.emit('transfer',from,to.ward.element,to.ward.element,amount,'相生传势',[],to); return true;
  }
  private has(id: string): boolean { return this.world.build.level(`array-${id}`)>0; }
  private snapshot(node:ArrayNode):ArrayNode {
    return {...node,ward:{...node.ward,points:node.ward.points.slice()}};
  }
  private harmony(source:ArrayNode,investment:number,released:ReadonlySet<number>):void {
    if(!this.pure)return;
    const partner=this.nodes.filter(n=>!released.has(n.id)&&this.available(n)&&distance(source,n)<=A.linkRange&&(this.charge(n.id)?.energy??0)>=A.ready&&this.targets(n).length)
      .sort((a,b)=>(this.charge(b.id)?.energy??0)-(this.charge(a.id)?.energy??0)||a.id-b.id)[0];
    if(partner&&this.release(partner,partner.ward.element,investment,'harmony'))this.emit('transfer',source,partner.ward.element,partner.ward.element,0,'纯阵合鸣',[],partner);
  }
  private style(element: Element, source: Element): ArrayStyle {
    if (OVERCOMES[element] !== source) return source;
    return ({water:'steam',metal:'splinter',wood:'rupture',fire:'melt',earth:'mud'} as const)[element];
  }
  private release(node: ArrayNode, incoming: Element, investment: number, kind: 'release'|'harmony', ownConversion=false): boolean {
    if (!this.available(node,ownConversion)) return false;
    const state=this.state(node), spend=Math.min(state.energy,A.capacity*investment), targets=this.targets(node);
    if (spend < A.ready || !targets.length) return false;
    const memory=[...state.memory], style=this.style(incoming,node.ward.element), element=OVERCOMES[incoming]===node.ward.element ? incoming : node.ward.element;
    state.energy-=spend; state.memory=[node.ward.element];
    const hit=this.strike(node,element,style,spend,memory,kind);
    if (kind==='release' && this.has('density')) this.add(node,spend*A.retainShare);
    if (kind==='release' && this.has('invoke')) this.support.activate(node.ward,investment);
    if (kind==='release' && this.has('echo') && memory.length>=3) this.echoes.push({node:this.snapshot(node),element,style,energy:spend*A.echoShare,memory,remaining:A.echoDelay});
    if (kind==='release' && this.world.build.stage>=2 && memory.length===5) {
      const cycle:Element[]=['water','wood','fire','earth','metal'];
      cycle.forEach((e,i)=>this.echoes.push({node:this.snapshot(node),element:e,style:e,energy:spend*A.heavenShare,memory:[e],remaining:A.heavenInterval*(i+1),label:`周天合鸣 · ${ARRAY_NAMES[e]}`}));
    }
    if (kind==='release' && this.has('remnant')) for (const wolf of hit.filter(w=>w.action==='dead').slice(0,3)) {
      if (this.remnants.length>=A.remnantCap) this.remnants.shift();
      this.remnants.push({id:this.nextId++,x:wolf.x,z:wolf.z,element,energy:Math.min(A.remnantEnergy,spend*.15),remaining:A.remnantSeconds});
      this.emit('remnant',wolf,element,element,A.remnantEnergy,'借尸续阵');
    }
    return true;
  }
  private strike(node: ArrayNode, element: Element, style: ArrayStyle, energy: number, memory: readonly Element[], kind: 'release'|'harmony'|'echo', label?: string): Wolf[] {
    let targets=this.targets(node); if (!targets.length) return [];
    const power=Math.min(2,node.ward.power.multiplier), damage=(A.baseDamage+energy*A.damagePerEnergy)*power;
    const counter=['steam','splinter','rupture','melt','mud'].includes(style);
    if (style==='metal') {
      const aim=targets[0]!, d=distance(node,aim)||1, end={x:node.x+(aim.x-node.x)/d*12,z:node.z+(aim.z-node.z)/d*12};
      targets=targets.filter(w=>segmentDistance(w,node,end)<1.6);
    }
    if (element==='water' || memory.includes('water')) this.world.reactionEffects.pull(node,targets,1.2);
    for (const wolf of targets) {
      const factor=style==='water' || style==='mud' ? .55 : style==='wood' || style==='melt' ? .72 : style==='steam' || style==='splinter' ? 1.18 : 1;
      if (style==='splinter') { wolf.rooted=0; wolf.rootImmunity=Math.max(wolf.rootImmunity??0,.8); }
      if (style==='steam') { wolf.burning=0; wolf.burnDps=0; wolf.burnBaseDps=0; }
      // The paid primary release still uses common elemental growth. Its own
      // momentum cannot feed back; all secondary releases remain terminal.
      this.world.hitRogue(wolf,damage*factor,element,{kind:'array',wardId:node.id,arrayRelease:true,noProc:kind!=='release'});
      if (wolf.action==='dead') continue;
      if ((element==='wood'||memory.includes('wood'))&&style!=='splinter') bindWolf(wolf,1.25+energy/160);
      if (element==='earth'||memory.includes('earth')) { const state=reactionStatus(wolf);state.weakened=Math.max(state.weakened,2);state.weakness=Math.max(state.weakness,.25); const d=distance(node,wolf)||1;wolf.vx+=(wolf.x-node.x)/d*4;wolf.vz+=(wolf.z-node.z)/d*4; }
      if (style==='melt'||memory.includes('metal')) {const state=reactionStatus(wolf);state.exposed=Math.max(state.exposed,3);state.exposure=Math.max(state.exposure,.25);}
      if (memory.includes('fire')&&element!=='water') this.world.spreadEmber(wolf,4+energy*.06,2);
      if (counter) this.world.enemyAbilities.interrupt(wolf.id,1);
    }
    if (style==='earth') for (const ward of this.world.wards.filter(w=>w.element==='earth'&&distance(w,node)<7)) ward.health=Math.min(ward.maxHealth,ward.health+energy*.35);
    if (kind!=='echo' && (style==='mud'||style==='water')) this.field(node,element,style,energy*.6);
    const names:Record<string,string>={steam:'蒸汽破阵',splinter:'斩木飞刃',rupture:'碎岩根牢',melt:'熔金开锋',mud:'截流泥牢'};
    this.emit(kind,node,element,style,energy,label??`${memory.length===5?'五行归一 · ':''}${kind==='harmony'?'纯阵合鸣 · ':kind==='echo'?'三才回响 · ':''}${names[style]??ARRAY_NAMES[element]}`,targets);
    return targets;
  }
  private field(at: Point,element:Element,style:ArrayStyle,energy:number):void {
    if (this.fields.length>=A.fieldCap)this.fields.shift();
    const scale='ward' in at ? Math.min(2,(at as ArrayNode).ward.power.multiplier) : 1;
    this.fields.push({x:at.x,z:at.z,element,style,radius:A.fieldRadius,remaining:A.fieldSeconds,tick:0,power:energy*.12*scale,touched:new Set()});
  }
  private releaseRemnant(id:number,investment:number):void {
    const index=this.remnants.findIndex(r=>r.id===id);if(index<0)return;const r=this.remnants[index]!;
    const targets=this.world.wolves.filter(w=>w.action!=='dead'&&distance(w,r)<=A.fieldRadius).slice(0,A.targetCap);if(!targets.length)return;
    this.remnants.splice(index,1);
    for(const wolf of targets)this.world.hitRogue(wolf,r.energy*3*investment,r.element,{kind:'array',noProc:true});
    this.emit('release',r,r.element,r.element,r.energy,'阵痕续爆',targets);
  }
  moved(ward:Ward):void {
    if(this.world.phase!=='battle'||!this.world.build.has('living'))return;
    const node=this.nodes.find(n=>n.id===ward.id);if(node&&this.release(node,ward.element,1,'release'))this.harmony(node,1,new Set([node.id]));
  }
  tick(dt:number):void {
    if(!this.active||this.world.phase!=='battle'||!(dt>0))return;this.sync();this.support.tick(dt);
    for(let i=this.echoes.length-1;i>=0;i--){const e=this.echoes[i]!;e.remaining-=dt;if(e.remaining>0)continue;this.echoes.splice(i,1);if(this.available(e.node,true))this.strike(e.node,e.element,e.style,e.energy,e.memory,'echo',e.label);}
    for(let i=this.remnants.length-1;i>=0;i--)if((this.remnants[i]!.remaining-=dt)<=0)this.remnants.splice(i,1);
    for(let i=this.marks.length-1;i>=0;i--){const m=this.marks[i]!,wolf=this.world.wolves.find(w=>w.id===m.targetId&&w.action!=='dead');m.remaining-=dt;
      if(!wolf||m.remaining<=0){this.marks.splice(i,1);continue;}
      const node=this.nodes.find(n=>n.id!==m.sourceId&&this.available(n)&&this.affects(n,wolf)&&(GENERATES[m.element]===n.ward.element||OVERCOMES[m.element]===n.ward.element));
      if(!node)continue;this.marks.splice(i,1);
      if(GENERATES[m.element]===node.ward.element){this.add(node,m.energy*1.5,[m.element]);this.emit('transfer',wolf,node.ward.element,node.ward.element,m.energy,'阵印入阵',[],node);}
      else this.strike(node,m.element,this.style(m.element,node.ward.element),m.energy*A.markScale,[m.element],'echo');
    }
    for(let i=this.fields.length-1;i>=0;i--){const f=this.fields[i]!;f.remaining-=dt;f.tick-=dt;if(f.remaining<=0){this.fields.splice(i,1);continue;}if(f.tick>0)continue;f.tick=A.fieldTick;
      const targets=this.world.wolves.filter(w=>w.action!=='dead'&&distance(w,f)<=f.radius).slice(0,A.targetCap);
      if(f.element==='water')this.world.reactionEffects.pull(f,targets,.8);
      for(const wolf of targets){
        if(f.element==='wood'&&!f.touched.has(wolf.id)){bindWolf(wolf,.75);f.touched.add(wolf.id);}
        if(f.element==='earth'){const s=reactionStatus(wolf);s.mired=.7;s.mireSlow=.55;}
        this.world.hitRogue(wolf,f.power,f.element,{kind:'array',noProc:true,sustained:true});
      }
    }
  }
  private emit(kind:ArrayEvent['kind'],at:Point,element:Element,style:ArrayStyle,energy:number,label:string,targets:readonly Point[]=[],to?:Point):void {
    this.lastAction=label;this.world.events.emit('arrayEffect',{kind,at:{x:at.x,z:at.z},to:to?{x:to.x,z:to.z}:undefined,element,style,energy,label,targets:targets.map(w=>({x:w.x,z:w.z})),radius:A.fieldRadius});
  }
}
