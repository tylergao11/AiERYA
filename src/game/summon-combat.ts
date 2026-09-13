import { distance, type Point } from '../core/math';
import { strokeTouches, type CombatStroke } from './combat';
import type { Element, GameEvents, Wolf } from './contracts';
import { bindWolf, reactionStatus } from './reactions';
import type { CastCredit, RogueCombat, RogueHit, RunSpirit } from './rogue-combat';
import { SPIRIT_DAMAGE } from './rogue-balance';
import { SUMMON as S, ORDERS } from './summon-balance';
import { SpiritMovement } from './spirit-movement';
import { spiritProfile } from './spirit-profile';
import { wolfClear, wolfSegmentClear } from './wolf-collision';
import type { World } from './world';
import { BATTLE, TACTICAL_ORDERS, type TacticalOrder } from './battle-rules';

interface OrderCredit { ticket: CastCredit; reactions: Set<string>; pincer: boolean; swordSpent: boolean; contacts: Map<number, { spirit: number; time: number; from: Point; element: Element }> }
interface Charge { amount: number; expires: number; element: Element; credit: OrderCredit; storm: boolean; power: number }
export interface SummonShot { element: Element; amount: number; power: number; credit: OrderCredit; union: boolean; pure: boolean }
interface Seal { element: Element; amount: number; expires: number }
interface FollowUp { time: number; run: () => void }
type GameTechnique = GameEvents['summonTechnique']['kind'];

/** Orders own intent and finite paid attack budgets. Only real contacts earn resonance. */
export class SummonCombat {
  selectedOrder: TacticalOrder | null = null;
  private lastOrder?: { kind: Exclude<TacticalOrder, 'repeat'>; at: Point; targetId?: number };
  private orderCooldowns = new Map<TacticalOrder, number>();
  private defenseUntil = 0;
  private leapUntil = 0;
  private woundsPulse = 0;
  private nextCredit = 1000000;
  orderCost(kind: TacticalOrder): number { return kind === 'repeat' ? this.lastOrder ? TACTICAL_ORDERS[this.lastOrder.kind].cost : 0 : TACTICAL_ORDERS[kind].cost; }
  orderCooldown(kind: TacticalOrder): number { return Math.max(0, (this.orderCooldowns.get(kind === 'repeat' ? this.lastOrder?.kind ?? kind : kind) ?? 0) - this.time); }
  canOrder(kind: TacticalOrder): boolean {
    if (!this.active || this.world.phase !== 'battle' || this.world.ultimate.active || this.orderCooldown(kind) > 0 || this.world.spirit < this.orderCost(kind)) return false;
    if (kind === 'repeat') return !!this.lastOrder && this.canOrder(this.lastOrder.kind);
    return this.troops.some(s => (s.hp ?? 100) > 0 && (kind !== 'heal' || (s.hp ?? 100) < (s.maxHp ?? 100)));
  }
  chooseOrder(kind: TacticalOrder): boolean {
    if (!this.canOrder(kind)) return false;
    if (kind === 'heal' || kind === 'defend' || kind === 'repeat') return this.executeOrder(kind);
    this.selectedOrder = this.selectedOrder === kind ? null : kind;
    return true;
  }
  executeOrder(kind: TacticalOrder, point?: Point, target?: Wolf): boolean {
    if (!this.canOrder(kind)) return false;
    if (kind === 'repeat') {
      const last = this.lastOrder!;
      return this.executeOrder(last.kind, last.at, this.world.wolves.find(w => w.id === last.targetId && w.action !== 'dead'));
    }
    const at = point ?? this.world.wolves.find(w => w.id === this.targetId && w.action !== 'dead') ?? this.rally ?? this.world.camp;
    if (!Number.isFinite(at.x) || !Number.isFinite(at.z) || Math.abs(at.x) > 50 || Math.abs(at.z) > 50) return false;
    const live = this.troops.filter(s => (s.hp ?? 100) > 0);
    if (kind === 'attack' && !target) target = this.world.wolves.filter(w => w.action !== 'dead' && distance(w, at) <= 4).sort((a,b) => distance(a,at)-distance(b,at))[0];
    if (kind === 'attack' && !target) return false;
    if (kind === 'attack' && live.every(s => this.amount(s.id) >= 4) && !this.ready) return false;
    const landings = live.map((s, i) => {
      const d = Math.max(1, distance(s, at) / 7);
      return SpiritMovement.ground({ x: s.x + (at.x-s.x)/d, z: s.z + (at.z-s.z)/d + i*.4 }, this.world.wards);
    });
    if (kind === 'leap' && landings.some(p => !wolfClear(p, .38, this.world.wards))) return false;
    if (!this.world.spendSpirit(TACTICAL_ORDERS[kind].cost)) return false;
    this.lastOrder = { kind, at: { x: at.x, z: at.z }, targetId: target?.id };
    this.selectedOrder = null; this.orderCooldowns.set(kind, this.time + TACTICAL_ORDERS[kind].cooldown);
    if (kind === 'heal') {
      for (const s of live) s.hp = Math.min(s.maxHp ?? 100, (s.hp ?? 100) + (s.maxHp ?? 100)*.35);
      this.world.mechanics.effect('root', live[0]!, 'wood', '回春', 2);
    } else if (kind === 'defend') {
      this.setIntent(undefined, { x: this.world.camp.x + 3.5, z: this.world.camp.z });
      this.defenseUntil = this.time + 3;
      this.world.events.emit('summonOrder', { kind: 'move', at: this.rally!, spiritIds: live.map(s => s.id) });
    } else if (kind === 'leap') {
      live.forEach((s, i) => { this.combat.movement.remove(s.id); s.x = landings[i]!.x; s.z = landings[i]!.z; s.cast = 0; });
      this.epoch++; this.leapUntil = this.time + 1;
      this.setIntent(target, target ? null : landings[0]!);
      for (const wolf of this.world.wolves.filter(w => w.action !== 'dead' && landings.some(p => distance(w, p) < 2.5))) this.world.enemyAbilities.interrupt(wolf.id);
      this.world.events.emit('summonOrder', { kind: 'move', at, spiritIds: live.map(s => s.id) });
    } else {
      this.setIntent(target);
      const ticket: CastCredit = { id: this.nextCredit++, paidCost: TACTICAL_ORDERS.attack.cost, investment: 1, power: 1, remaining: 0 };
      const credit: OrderCredit = { ticket, reactions: new Set(), contacts: new Map(), pincer: false, swordSpent: false };
      const union = this.ready;
      if (union) { this.resonance = 0; this.unionUntil = this.time + 1.2; }
      for (const s of live) {
        const lots = this.charges.get(s.id) ?? [];
        const amount = Math.min(BATTLE.spirit.attackOrders, Math.max(0, S.capacity - this.amount(s.id)));
        if (amount) lots.push({ amount, element: s.element, expires: this.time + 8, credit, storm: false, power: 2.3 });
        this.charges.set(s.id, lots);
        if (union) this.unions.set(s.id, { element: s.element, expires: this.time + S.unionSeconds, pure: this.pure, credit });
      }
      this.world.events.emit('summonOrder', { kind: union ? 'union' : 'infuse', at: target!, spiritIds: live.map(s => s.id), element: live[0]!.element, pure: union && this.pure });
    }
    this.world.notice = TACTICAL_ORDERS[kind].name;
    return true;
  }
  tap(at: Point, target?: Wolf): boolean {
    return this.selectedOrder ? this.executeOrder(this.selectedOrder, at, target) : this.command(at, target);
  }
  resonance = 0;
  targetId: number | null = null;
  rally: Point | null = null;
  epoch = 0;
  fury = 0;
  private time = 0;
  private chaseUntil = 0;
  private furyUntil = 0;
  private pincerUntil = 0;
  private unionUntil = 0;
  private charges = new Map<number, Charge[]>();
  private unions = new Map<number, { element: Element; expires: number; pure: boolean; credit: OrderCredit }>();
  private seals = new Map<number, Seal>();
  private arrivals = new Set<number>();
  private jobs: FollowUp[] = [];
  constructor(private readonly world: World, private readonly combat: RogueCombat) {}
  get active(): boolean { return this.world.build.is('spirit'); }
  get replacesStroke(): boolean { return this.active && this.world.combatStyle === 'spirit'; }
  /** This ultimate stores pet orders; mixed array/slayer casts keep their own release. */
  get stormOnly(): boolean { return this.replacesStroke; }
  get ready(): boolean { return this.resonance >= S.resonanceMax; }
  get pure(): boolean { return this.world.build.pureSummoner; }
  get movingSpeed(): number { return S.movement * (this.time < this.chaseUntil || this.time < this.defenseUntil ? S.pursuitSpeed : 1); }
  get troops(): readonly RunSpirit[] { return this.combat.spirits; }
  amount(id: number): number { return (this.charges.get(id) ?? []).reduce((n, c) => n + c.amount, 0); }
  /** Read-only warning for the actual expiring lots; a new order never restarts their clock. */
  expiry(id: number): { stock: number; union: boolean } {
    let stock=0;
    for(const lot of this.charges.get(id)??[])if(lot.expires-this.time<=2)stock+=lot.amount;
    const union=this.unions.get(id);
    return {stock,union:!!union&&union.expires-this.time<=2};
  }
  element(id: number): Element | undefined { return this.unions.get(id)?.element ?? this.charges.get(id)?.[0]?.element; }
  united(id: number): boolean { return this.unions.has(id); }
  rallied(id: number): boolean { return this.arrivals.has(id); }
  speed(id: number): number { return this.unions.has(id) ? 1.8 : this.amount(id) > 0 ? S.empoweredSpeed : 1; }
  clear(): void {
    this.selectedOrder = null; this.lastOrder = undefined; this.orderCooldowns.clear(); this.defenseUntil = this.leapUntil = this.woundsPulse = 0;
    this.resonance = 0; this.targetId = null; this.rally = null; this.epoch++;
    this.charges.clear(); this.unions.clear(); this.seals.clear(); this.arrivals.clear(); this.jobs = [];
    this.fury = 0; this.time = 0; this.chaseUntil = this.furyUntil = this.pincerUntil = this.unionUntil = 0;
  }
  /** Largest recipient deficit prices one group infusion, never a per-unit charge. */
  accepted(investment: number): number {
    const deficit = Math.max(0, ...this.troops.map(s => S.capacity - this.amount(s.id))) / S.charges;
    return Math.min(investment, Math.max(deficit, this.ready ? S.minimumOrder : 0));
  }
  command(at: Point, target?: Wolf): boolean {
    if (!this.active || this.world.phase !== 'battle' || this.world.ultimate.active || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return false;
    if (Math.abs(at.x) > 50 || Math.abs(at.z) > 50) return false;
    const enemy = target ?? this.world.wolves.filter(w => w.action !== 'dead' && distance(w, at) <= S.tapRadius).sort((a,b) => distance(a,at)-distance(b,at))[0];
    const ground = enemy ? null : SpiritMovement.ground(at, this.world.wards);
    if (ground && (!wolfClear(ground, .38, this.world.wards) || distance(at, ground) > 5)) return false;
    this.setIntent(enemy, ground);
    this.world.events.emit('summonOrder', { kind: enemy ? 'focus' : 'move', at: enemy ? { x: enemy.x, z: enemy.z } : ground!, spiritIds: this.troops.map(s => s.id) });
    this.world.notice = enemy ? '御灵 · 全队集火' : '御灵 · 前往集合点';
    return true;
  }
  private setIntent(enemy?: Wolf, ground: Point | null = null): void {
    const changed = this.targetId !== (enemy?.id ?? null) || !!this.rally !== !!ground || !!ground && !!this.rally && distance(ground, this.rally) > .3;
    this.targetId = enemy?.id ?? null; this.rally = ground;
    if (changed) {
      this.epoch++; this.arrivals.clear();
      for (const s of this.troops) { s.cast = 0; s.cooldown = Math.min(s.cooldown,S.commandResponse); s.targetId = null; this.combat.movement.remove(s.id); }
    }
  }
  /** Retune already-paid orders without buying stock or restarting its lifetime. */
  redirect(stroke: CombatStroke, element: Element): boolean {
    if(!this.active || this.world.phase!=='battle' || this.world.ultimate.active)return false;
    if(!this.troops.some(s=>this.amount(s.id)>0))return false;
    const at=stroke.points.at(-1)!;
    const enemy=this.world.wolves.filter(w=>w.action!=='dead'&&strokeTouches(w,stroke)).sort((a,b)=>distance(a,at)-distance(b,at))[0];
    const ground=SpiritMovement.ground(at,this.world.wards);
    this.setIntent(enemy,enemy?null:wolfClear(ground,.38,this.world.wards)?ground:null);
    for(const lots of this.charges.values())for(const lot of lots)if(!lot.storm)lot.element=element;
    this.world.events.emit('summonOrder',{kind:'infuse',at:enemy?{x:enemy.x,z:enemy.z}:ground,element,points:stroke.points,spiritIds:this.troops.map(s=>s.id),pure:false});
    this.world.notice='御令已切换';
    return true;
  }
  issue(stroke: CombatStroke, element: Element, origin: RogueHit): void {
    if (!this.active) return;
    const investment = stroke.investment ?? 1, at = stroke.points.at(-1)!;
    const enemy = this.world.wolves.filter(w => w.action !== 'dead' && strokeTouches(w, stroke)).sort((a,b) => distance(a,at)-distance(b,at))[0];
    const ground = SpiritMovement.ground(at, this.world.wards);
    this.setIntent(enemy, enemy ? null : wolfClear(ground,.38,this.world.wards) ? ground : null);
    const credit: OrderCredit = { ticket: { ...origin.ticket!, remaining: 0 }, reactions: new Set(), contacts: new Map(), pincer: false, swordSpent: false };
    const storm = (stroke.effect ?? 1) > 1;
    const union = this.ready && investment >= S.minimumOrder;
    if (union) { this.resonance = 0; this.unionUntil = this.time + 1.2; }
    for (const s of this.troops) {
      const lots = this.charges.get(s.id) ?? [];
      for (const c of lots) if (!c.storm) c.element = element;
      const amount = Math.min(storm ? S.ultimateCapacity - this.amount(s.id) : S.capacity - this.amount(s.id), investment * S.charges);
      if (amount > 1e-8) lots.push({ amount, element, credit, expires: this.time + S.lifetime, storm, power: stroke.effect ?? 1 });
      this.charges.set(s.id, lots);
      if (union) this.unions.set(s.id, { element, expires: this.time + S.unionSeconds, pure: this.pure, credit });
    }
    this.world.events.emit('summonOrder', { kind: union ? 'union' : 'infuse', at: enemy ? {x:enemy.x,z:enemy.z} : ground, element, points: stroke.points, spiritIds: this.troops.map(s=>s.id), pure: union && this.pure });
  }
  destination(spirit: RunSpirit): Point | null {
    if (!this.active || !this.rally || spirit.wardId !== undefined) return null;
    const index = this.troops.filter(s => s.wardId === undefined).indexOf(spirit);
    const at = SpiritMovement.ground({ x: this.rally.x + (spiritProfile(spirit).style === 'ranged' ? -1 : .8), z: this.rally.z + (index - (this.troops.length-1)/2) * 1.2 }, this.world.wards);
    if (distance(spirit, at) < .5) this.arrivals.add(spirit.id);
    return !this.arrivals.has(spirit.id) || distance(spirit, this.rally) > S.rallyRadius + 1 ? at : null;
  }
  target(spirit: RunSpirit, fallback: Wolf | undefined, anchor: Point | null): Wolf | undefined {
    if (!this.active) return fallback;
    const focused = this.world.wolves.find(w => w.id === this.targetId && w.action !== 'dead');
    const ward = spirit.wardId === undefined ? undefined : this.world.wards.find(w => w.id === spirit.wardId);
    if (focused && (!anchor || (ward ? SpiritMovement.defends(ward, focused) : distance(focused,anchor) <= 4))) return focused;
    if (this.rally && !anchor) return this.world.wolves.filter(w => w.action !== 'dead' && distance(w,this.rally!) <= S.rallyRadius).sort((a,b) => distance(a,spirit)-distance(b,spirit))[0];
    return fallback;
  }
  take(spirit: RunSpirit): SummonShot | undefined {
    if (!this.active) return;
    const united = this.unions.get(spirit.id);
    if (united) { this.unions.delete(spirit.id); return { ...united, amount: 1, union: true, power: this.world.build.stage >= 2 ? S.unionAscendPower : S.unionPower }; }
    const lots = this.charges.get(spirit.id), lot = lots?.[0]; if (!lot) return;
    const amount = Math.min(1,lot.amount); lot.amount -= amount; if (lot.amount <= 1e-8) lots!.shift();
    return { element: lot.element, amount, credit: lot.credit, power: lot.power, union: false, pure: false };
  }
  private available(spirit: RunSpirit, target: Wolf): boolean {
    if (this.world.phase !== 'battle' || (spirit.hp ?? 100) <= 0 || !this.troops.includes(spirit) || this.world.enemyAbilities.silenced(spirit) || target.action === 'dead') return false;
    const ward = this.world.wards.find(w=>w.id===spirit.wardId);
    return (spirit.wardId === undefined || !!ward && ward.health>0 && ward.suppressed<=0) && SpiritMovement.canHit(spirit,target,this.world.wards);
  }
  /** Called once for the real attack, before its native hit can kill the target. */
  land(spirit: RunSpirit, target: Wolf, shot?: SummonShot): void {
    if (!this.active || !this.available(spirit,target)) return;
    const focused = target.id === this.targetId;
    if (shot) {
      const seal = this.seals.get(spirit.id);
      if (this.world.build.level('spirit-seal') && seal && seal.element !== shot.element && shot.amount >= .5) {
        this.seals.delete(spirit.id);
        this.strike(spirit,target,{...shot,element:seal.element,amount:Math.min(seal.amount,shot.amount),power:shot.power*S.sealPower,union:false},true);
        const continues=this.available(spirit,target);
        this.technique('seal',target,spirit,seal.element,continues?shot.element:undefined,{spiritId:spirit.id,targetId:target.id});
        // The old imprint may finish the target. It cannot spend fury or manufacture
        // a new imprint / echo / resonance for a primary strike that never happened.
        if(!continues)return;
      }
      const fury = spirit.role === 'main' && this.fury >= 3;
      if (fury) { this.fury = 0; shot = { ...shot, power: shot.power * (1 + S.furyPower) }; this.technique('fury',target,spirit,shot.element,undefined,{spiritId:spirit.id,targetId:target.id}); }
      this.strike(spirit,target,shot,false);
      if (shot.amount >= .5) this.seals.set(spirit.id, { element: shot.element, amount: shot.amount, expires: this.time+S.sealSeconds });
      if (!shot.union && this.world.build.has('mimic') && (spirit.role==='main'||spirit.role==='twin')) this.echo(spirit,target,{...shot,power:shot.power*S.echoPower},false);
      if (shot.union && shot.pure) this.echo(spirit,target,{...shot,power:shot.power*S.echoPower,union:false},true);
      if (shot.union && this.world.build.has('mimic') && (spirit.role==='main'||spirit.role==='twin')) this.echo(spirit,target,{...shot,power:shot.power*S.echoPower,union:false},false);
      if (target.action !== 'dead' && this.world.build.level('spirit-pincer') && shot.amount>=.5 && !shot.credit.pincer && this.time>=this.pincerUntil) {
        const old = shot.credit.contacts.get(target.id);
        if (old && old.spirit!==spirit.id && this.time-old.time<=S.pincerWindow) {
          shot.credit.pincer=true;this.pincerUntil=this.time+S.pincerCooldown;
          this.strike(spirit,target,{...shot,power:shot.power*S.pincerPower,union:false},true);
          this.technique('pincer',target,spirit,shot.element,undefined,{spiritId:spirit.id,targetId:target.id,partner:{spiritId:old.spirit,at:{...old.from},element:old.element}});
        } else shot.credit.contacts.set(target.id,{spirit:spirit.id,time:this.time,from:{x:spirit.x,z:spirit.z},element:shot.element});
      }
    }
    if (!shot?.union && this.time>=this.unionUntil && (focused || shot)) {
      const total = Math.max(.1,this.troops.reduce((n,s)=>n+s.power,0));
      const gain = (focused ? S.focusGain : 0) + (shot ? S.empoweredGain*shot.amount : 0);
      const wasReady=this.ready;
      this.resonance=Math.min(S.resonanceMax,this.resonance+gain*spirit.power/total);
      if (!wasReady && this.ready) this.world.events.emit('summonReady',undefined);
    }
  }
  private strike(spirit: RunSpirit, target: Wolf, shot: SummonShot, echo: boolean): void {
    if (!this.available(spirit,target)) return;
    const order=ORDERS[shot.element], base=SPIRIT_DAMAGE[spirit.element], strength=shot.amount*shot.power;
    const radius=shot.union?S.unionRadius:order.radius;
    const origin:RogueHit={kind:'spirit',spiritId:spirit.id,command:true,noProc:echo,
      scale:strength*(1+.25*this.world.build.level('common-spell')),ticket:{...shot.credit.ticket,investment:Math.min(shot.amount,shot.credit.ticket.investment??shot.amount),remaining:0},commandReactions:shot.credit.reactions};
    const nearby=this.world.wolves.filter(w=>w.action!=='dead'&&w.id!==target.id&&distance(w,target)<=radius&&wolfSegmentClear(spirit,w,.08,this.world.wards)
      && distance(spirit,w)<=SpiritMovement.reach(spirit)+radius).sort((a,b)=>distance(a,target)-distance(b,target)).slice(0,shot.union?6:shot.element==='fire'?5:3);
    this.world.events.emit('summonImpact',{at:{x:target.x,z:target.z},from:{x:spirit.x,z:spirit.z},spiritId:spirit.id,targetId:target.id,element:shot.element,radius:Math.max(.8,radius),strength,union:shot.union,echo});
    if (shot.element==='metal') { const state=reactionStatus(target),power=.2*Math.min(1,strength);if(state.exposed<=0||power>=state.exposure){state.exposed=Math.max(state.exposed,2*shot.amount);state.exposure=power;} }
    if (shot.element==='wood') for(const w of [target,...nearby]) bindWolf(w,1.2*Math.min(1.5,strength));
    if (shot.element==='water') this.world.reactionEffects.pull(target,nearby,strength);
    if (shot.element==='earth') for(const w of [target,...nearby]) {
      const d=distance(w,this.world.camp)||1,power=Math.min(1.5,strength);w.vx=(w.x-this.world.camp.x)/d*4*power;w.vz=(w.z-this.world.camp.z)/d*4*power;
      const state=reactionStatus(w),weakness=.2*Math.min(1,strength);if(state.weakened<=0||weakness>=state.weakness){state.weakened=Math.max(state.weakened,1.5*shot.amount);state.weakness=weakness;}
    }
    this.world.hitSummon(target,base*order.power,shot.element,origin,shot.amount);
    for(const w of nearby) {
      this.world.hitRogue(w,base*(shot.union?.7:order.splash),shot.element,{...origin,noProc:true});
      if(w.action==='dead'&&!echo) this.kill(spirit,w,shot);
    }
    if(!echo && spirit.role==='main' && this.world.build.has('beast') && this.world.build.level('spirit-sweep')) {
      const dx=target.x-spirit.x,dz=target.z-spirit.z;
      for(const w of this.world.wolves.filter(w=>w.action!=='dead'&&w.id!==target.id&&distance(w,spirit)<=3
        && (w.x-spirit.x)*dx+(w.z-spirit.z)*dz>0 && wolfSegmentClear(spirit,w,.08,this.world.wards)).slice(0,3)) {
        this.world.hitRogue(w,base*S.sweepPower,shot.element,{...origin,noProc:true});if(w.action==='dead')this.kill(spirit,w,shot);
      }
    }
    if(!echo && this.replacesStroke && !shot.credit.swordSpent) shot.credit.swordSpent=this.combat.tactics.commandContact(target,spirit,shot.element,origin);
    if(target.action==='dead'&&!echo)this.kill(spirit,target,shot);
  }
  private kill(spirit:RunSpirit,target:Wolf,shot:SummonShot):void {
    if(this.world.build.level('spirit-fury')&&this.world.build.has('beast')&&spirit.role==='main'&&!target.summoned){const before=this.fury;this.fury=Math.min(3,this.fury+Math.min(1,shot.amount));this.furyUntil=this.time+S.furySeconds;if(before<3&&this.fury>=3)this.technique('furyReady',spirit,spirit,shot.element);}
    if(this.world.build.level('spirit-hunt')&&target.id===this.targetId){
      const next=this.world.wolves.filter(w=>w.action!=='dead'&&distance(w,target)<=S.huntRange).sort((a,b)=>distance(a,target)-distance(b,target))[0];
      this.targetId=next?.id??null;this.chaseUntil=this.time+S.huntSeconds;
      if(next){this.world.events.emit('summonOrder',{kind:'focus',at:{x:next.x,z:next.z},spiritIds:this.troops.map(s=>s.id)});this.technique('hunt',next,target,shot.element);}
    }
  }
  nativeKill(spirit:RunSpirit,target:Wolf,shot:SummonShot):void { this.kill(spirit,target,shot); }
  private echo(spirit:RunSpirit, original:Wolf, shot:SummonShot, redirect:boolean):void {
    this.jobs.push({time:this.time+S.echoDelay,run:()=>{
      let target=original;
      if(target.action==='dead'&&(redirect||this.world.build.level('spirit-echo'))) target=this.world.wolves.filter(w=>w.action!=='dead'&&distance(w,original)<=4&&this.available(spirit,w)).sort((a,b)=>distance(a,original)-distance(b,original))[0]!;
      if(!target||!this.available(spirit,target))return;
      const profile=spiritProfile(spirit), duration=profile.style==='ranged'?Math.max(.1,distance(spirit,target)/profile.projectileSpeed):.12;
      this.combat.attackEvent(profile.style==='ranged'?'launch':'windup',spirit,target,duration,shot.element,true);
      this.jobs.push({time:this.time+duration,run:()=>{if(!this.available(spirit,target))return;this.technique('echo',target,spirit,shot.element);this.strike(spirit,target,shot,true);}});
    }});
  }
  private technique(kind:GameTechnique,at:Point,from:Point,element:Element,toElement?:Element,detail:Partial<Pick<GameEvents['summonTechnique'],'spiritId'|'targetId'|'partner'>>={}):void {this.world.events.emit('summonTechnique',{kind,at:{x:at.x,z:at.z},from:{x:from.x,z:from.z},element,toElement,...detail});}
  tick(dt:number):void {
    this.time+=dt;
    this.woundsPulse += dt;
    for (const s of this.troops) {
      if (s.role === 'array') continue;
      s.maxHp ??= BATTLE.spirit.health * (s.role === 'main' && this.world.build.has('beast') ? 1.6 : 1);
      s.hp ??= s.maxHp;
      if (s.hp <= 0) {
        s.revive = Math.max(0, (s.revive ?? BATTLE.spirit.downSeconds) - dt);
        if (!s.revive) { s.hp = s.maxHp * .6; const home = SpiritMovement.spawn(0, this.world.wards, this.troops); s.x = home.x; s.z = home.z; }
      }
    }
    if (this.woundsPulse >= BATTLE.spirit.biteInterval) {
      this.woundsPulse %= BATTLE.spirit.biteInterval;
      for (const s of this.troops) {
        if (s.role === 'array' || (s.hp ?? 0) <= 0) continue;
        const attackers = this.world.wolves.filter(w => w.action !== 'dead' && distance(w, s) < 2.2 && w.rooted <= 0).slice(0, BATTLE.spirit.nearbyAttackers);
        const damage = attackers.reduce((n,w) => n + (w.kind === 'normal' ? 4 : w.kind === 'king' ? 14 : 7), 0) * 1.1 ** (this.world.wave - 1);
        s.hp = Math.max(0, (s.hp ?? 100) - damage * (this.time < this.defenseUntil ? .4 : this.time < this.leapUntil ? 0 : 1));
        if (!s.hp) { s.revive = BATTLE.spirit.downSeconds; s.cast = 0; this.charges.delete(s.id); this.unions.delete(s.id); this.world.mechanics.effect('root', s, s.element, '灵体暂退', 1); }
      }
    }
    // Small checked separation keeps several commanded pets from sharing one footprint.
    if(this.active)for(let i=0;i<this.troops.length;i++)for(let j=i+1;j<this.troops.length;j++){
      const a=this.troops[i]!,b=this.troops[j]!,d=distance(a,b),gap=Math.min(1.8,.65*(a.size+b.size));if(d>=gap)continue;
      const angle=d>.001?Math.atan2(b.z-a.z,b.x-a.x):(i+j)*2.399,amount=Math.min(dt*2,(gap-d)/2);
      for(const [s,sign]of [[a,-1],[b,1]] as const){const to={x:s.x+Math.cos(angle)*amount*sign,z:s.z+Math.sin(angle)*amount*sign};if(wolfSegmentClear(s,to,.38,this.world.wards))Object.assign(s,to);}
    }
    for(const [id,lots] of this.charges){const remaining=lots.filter(c=>c.expires>this.time&&c.amount>1e-8);if(remaining.length&&this.troops.some(s=>s.id===id))this.charges.set(id,remaining);else this.charges.delete(id);}
    for(const [id,union]of this.unions)if(union.expires<=this.time||!this.troops.some(s=>s.id===id))this.unions.delete(id);
    for(const [id,seal]of this.seals)if(seal.expires<=this.time)this.seals.delete(id);
    if(this.furyUntil<=this.time)this.fury=0;
    if(this.targetId!==null&&!this.world.wolves.some(w=>w.id===this.targetId&&w.action!=='dead'))this.targetId=null;
    const ready=this.jobs.filter(job=>job.time<=this.time);this.jobs=this.jobs.filter(job=>job.time>this.time);for(const job of ready)job.run();
  }
}
