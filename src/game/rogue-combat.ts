import { distance, type Point } from '../core/math';
import { COMBAT, planCombatStroke, strokeTouches, type CombatStroke } from './combat';
import type { DamageSource, Element, Ward, Wolf } from './contracts';
import { BOONS, type RunBuild } from './roguelike';
import type { World } from './world';
import { ROGUE as B, SPIRIT_DAMAGE, SPIRIT_SKILLS } from './rogue-balance';
import { CONCENTRATION } from './concentration';
import { SpiritAbilities } from './spirit-abilities';
import { RogueTactics } from './rogue-tactics';
import { ArrayMomentum } from './array-momentum';
import { SpiritMovement } from './spirit-movement';
import { spiritProfile } from './spirit-profile';
import { SummonCombat } from './summon-combat';
import { SpiritRestrictions, spiritRestriction } from './spirit-restrictions';
import { pureSlayer, SLAYER_COMBO } from './slayer-combo';

export interface CastCredit { id: number; remaining: number; power: number; investment?: number; paidCost?: number; charge?: number; neutral?: boolean }
export interface RogueHit { kind: 'manual' | 'derived' | 'mimic' | 'spirit' | 'array' | 'trigger'; scale?: number; ticket?: CastCredit; spiritId?: number; wardId?: number; noProc?: boolean; arrayRelease?: boolean; sustained?: boolean; command?: boolean; commandReactions?: Set<string>; returning?: boolean }
export interface RunSpirit extends Point { id: number; role: 'main' | 'twin' | 'support' | 'array'; wardId?: number; originWard?: Ward; element: Element; power: number; age: number; cooldown: number; targetId: number | null; cast: number; energy: number; size: number; hp?: number; maxHp?: number; revive?: number }
export interface RootSeed extends Point { remaining: number; element: Element; damage: number }
export interface BattleScar { points: readonly Point[]; element: Element; remaining: number; power?: number }
interface Pending { remaining: number; run: () => void }
export { MAIN_ARRAY_DAMAGE, SLAYER_DAMAGE } from './rogue-balance';
import { SLAYER_DAMAGE } from './rogue-balance';

/** Combat-time effects. Rendering reads state and events, never advances an ability. */
export class RogueCombat {
  readonly spiritSkills: SpiritAbilities;
  readonly tactics: RogueTactics;
  readonly arrays: ArrayMomentum;
  readonly commands: SummonCombat;
  readonly movement = new SpiritMovement();
  readonly restrictions = new SpiritRestrictions();
  readonly spirits: RunSpirit[] = [];
  readonly seeds: RootSeed[] = [];
  scar: BattleScar | null = null;

  beastMarks = 0;
  private pending: Pending[] = [];
  private casts = 0;
  private nextTicket = 1;
  private rippleCooldown = 0;
  private readonly marks = new Map<number, number>();
  private readonly fractures = new Map<number, number>();
  private burnCredits = new WeakMap<Wolf, RogueHit>();
  private mainProgress?: { id: number; stage: number; ancestor: boolean; evolved: boolean; size: number };
  constructor(private readonly world: World, readonly build: RunBuild) { this.spiritSkills = new SpiritAbilities(world, this); this.tactics = new RogueTactics(world, this); this.commands = new SummonCombat(world,this); this.arrays = new ArrayMomentum(world); }
  get debtFloor(): number { return this.build.has('debt') ? B.slayer.debtFloor : 0; }
  get beastEvolved(): boolean { return this.beastMarks >= B.spirit.beastKills; }
  isMarked(id: number): boolean { return this.commands.active ? this.commands.targetId === id : (this.marks.get(id) ?? 0) > 0; }
  initialize(): void {
    this.clear();
    this.upgraded();
  }
  clear(): void {
    this.arrays.clear();
    this.spiritSkills.clear(); this.tactics.clear(); this.movement.clear(); this.commands.clear();
    this.restrictions.clear();
    this.spirits.length = 0; this.seeds.length = 0; this.scar = null; this.pending = []; this.marks.clear(); this.fractures.clear();
    this.beastMarks = 0; this.casts = 0; this.nextTicket = 1; this.rippleCooldown = 0; this.burnCredits = new WeakMap();
    this.mainProgress = undefined;
  }
  endBattle(): void { this.arrays.endBattle(); this.spiritSkills.clear(); this.tactics.clear(); this.commands.clear(); this.restrictions.clear(); this.pending = []; this.seeds.length = 0; this.scar = null; this.marks.clear(); this.fractures.clear(); for (const spirit of this.spirits) { spirit.targetId = null; spirit.cast = 0; } }
  addSpirit(role: RunSpirit['role'], element: Element, ward?: Ward): RunSpirit {
    const offset = this.spirits.filter(s => s.wardId === undefined).length;
    const at = ward ? SpiritMovement.ground(ward,this.world.wards) : SpiritMovement.spawn(offset,this.world.wards,this.spirits);
    const spirit: RunSpirit = { id: this.world.allocateEntityId(), role, wardId: ward?.id, element, x: at.x, z: at.z,
      power: role === 'twin' ? B.spirit.twinPower : role === 'support' ? B.spirit.supportPower : role === 'array' ? B.spirit.arrayPower : 1,
      age: 0, cooldown: 0, targetId: null, cast: 0, energy: 0, size: role === 'main' && this.build.has('beast') ? 1.75 : role === 'support' ? .7 : 1 };
    this.spirits.push(spirit);
    this.world.events.emit('spiritSpawn',{spiritId:spirit.id,at:{x:spirit.x,z:spirit.z},element,ancestor:role==='main'&&this.build.has('beast'),role});
    this.effect('evolve', at, element, role === 'array' ? '阵灵现身' : role === 'support' ? '支援灵加入' : '伴灵现身');
    return spirit;
  }
  wardRemoved(id: number): void { for (let i = this.spirits.length - 1; i >= 0; i--) if (this.spirits[i]!.wardId === id || this.spirits[i]!.originWard?.id === id && this.spirits[i]!.originWard!.health <= 0) { this.spiritSkills.removed(this.spirits[i]!.id); this.movement.remove(this.spirits[i]!.id); this.spirits.splice(i, 1); } }
  upgraded(): void {
    // Add newly acquired mechanics without resetting existing entities, charges or cooldowns.
    const roots = this.build.affinities;
    if (this.build.is('spirit') && !this.spirits.some(s => s.role === 'main')) {
      this.addSpirit('main', this.build.has('mimic') && !this.build.has('twins') && roots.length > 1 ? roots[1]! : roots[0]!);
    }
    if (this.build.has('twins') && !this.spirits.some(s => s.role === 'twin')) this.addSpirit('twin', roots[1] ?? roots[0]!);
    if (this.build.is('spirit') && this.build.stage >= 1 && !this.build.has('beast') && !this.spirits.some(s => s.role === 'support')) this.addSpirit('support', this.build.affinities[1] ?? this.build.affinities[0]!);
    for (const spirit of this.spirits) {
      if (spirit.role === 'main' && this.build.has('beast')) spirit.size = 1.75 * (this.beastEvolved ? 1.35 : 1) * (this.build.stage >= 1 ? 1.1 : 1);
    }
    const main = this.spirits.find(s => s.role === 'main'), previous = this.mainProgress;
    if (!main) { this.mainProgress = undefined; return; }
    const progress = { id: main.id, stage: this.build.stage, ancestor: this.build.has('beast'), evolved: this.beastEvolved, size: main.size };
    // Ordinary rewards must not replay an awakening for every companion.
    this.mainProgress = progress;
    if (previous?.id !== main.id) return;
    const kind = progress.ancestor && !previous.ancestor ? 'ancestor'
      : progress.evolved && !previous.evolved ? 'evolve'
      : progress.stage > previous.stage ? progress.stage >= 2 ? 'ascend' : 'awaken' : null;
    if (kind) this.world.events.emit('spiritTransition', { kind, spiritId: main.id, at: { x: main.x, z: main.z }, element: main.element, ancestor: progress.ancestor, fromSize: previous.size, toSize: main.size });
  }
  beginCast(overdraw: boolean, paidCost = this.world.spellCost, investment = 1, charge = 0): RogueHit {
    const ticket = { id: this.nextTicket++, investment, paidCost, charge, remaining: this.build.is('slayer') ? Math.min(paidCost * B.slayer.refundShare, B.slayer.refundCap + B.slayer.refundCapPerLevel * this.build.level('slayer-return')) : 0, power: overdraw ? B.slayer.debtPower : 1 };
    return { kind: 'manual', ticket: { ...ticket, neutral: this.world.swordActive } };
  }
  spellBase(element: Element, origin?: RogueHit): number | undefined {
    if (origin?.kind === 'mimic') return SPIRIT_DAMAGE[element];
    return this.build.is('slayer') ? SLAYER_DAMAGE[element] : undefined;
  }
  damageMultiplier(wolf: Pick<Wolf, 'id'>, element: Element, source: DamageSource, origin?: RogueHit): number {
    if (!this.build.active) return source === 'companion' ? B.spirit.attackMultiplier : 1;
    let power = origin?.ticket?.neutral ? 1 : this.build.affinityPower(element);
    if (this.build.level('common-overdrive')) power *= 1 + B.growth.overdrive;
    power *= origin?.scale ?? 1;
    if (origin?.ticket) power *= origin.ticket.power;
    if (origin?.kind === 'manual' || origin?.kind === 'array') power *= 1 + B.growth.power * this.build.level('common-spell');
    if (origin?.spiritId !== undefined) {
      const spirit = this.spirits.find(s => s.id === origin.spiritId);
      if (spirit) {
        power *= spirit.power * B.spirit.attackMultiplier;
        power *= 1 + B.growth.power * this.build.level('spirit-might');
        if (spirit.role === 'main' && this.build.has('beast')) power *= B.spirit.beastPower * (this.beastEvolved ? B.spirit.evolvedPower : 1) * (this.build.stage >= 1 ? B.spirit.awakenedPower : 1);
        if (this.isMarked(wolf.id)) power *= 1 + B.growth.command * this.build.level('spirit-command');
        const ward = spirit.originWard ?? (spirit.wardId === undefined ? null : this.world.wards.find(w => w.id === spirit.wardId));
        // A roaming array spirit spends the array's budget, not its inverse area: tiny drawings cannot multiply its full-range attack.
        if (ward) power *= ward.power.efficiency * ward.power.investment / CONCENTRATION.defaultInvestment * (ward.empowered > 0 ? COMBAT.empowerMultiplier : 1);
      }
    }
    // Steam/reactive damage has already inherited its source energy in the reaction snapshot.
    if (source === 'steam' || source === 'reaction') return origin?.scale ?? 1;
    return power;
  }
  noteBurn(wolf: Wolf, origin?: RogueHit): void { if (origin) this.burnCredits.set(wolf, origin); else this.burnCredits.delete(wolf); }
  burnOrigin(wolf: Wolf): RogueHit | undefined { return this.burnCredits.get(wolf); }
  returnCut(stroke: CombatStroke, element: Element, origin: RogueHit): void {
    this.later(.08, () => {
      const targets=new Map<number,Point>(),guarded=new Set<number>();
      const off=this.world.events.on('damage',e=>{if(e.returning&&!e.ongoing)targets.set(e.targetId,{...e.at});});
      const offGuard=this.world.events.on('slayerGuarded',e=>guarded.add(e.targetId));
      try { this.world.castRogueStroke(stroke,element,{kind:'derived',ticket:origin.ticket ? {...origin.ticket,charge:stroke.charge} : undefined,returning:true}); }
      finally { off();offGuard(); }
      this.world.events.emit('slayerReturn',{at:stroke.points[0]!,element,points:stroke.points.map(p=>({...p})),direction:{...stroke.direction},
        investment:Math.min(stroke.investment??1,origin.ticket?.investment??1),hits:targets.size,
        guarded:[...guarded].filter(id=>targets.has(id)).length,contacts:[...targets].filter(([id])=>!guarded.has(id)).map(([,at])=>at)});
    });
  }
  crossFinisher(stroke: CombatStroke, element: Element, origin: RogueHit, at: Point): void {
    if (!pureSlayer(this.build) || stroke.charge !== 3 || (stroke.burst ?? 0) + 1e-8 < SLAYER_COMBO.pureThreshold || !origin.ticket?.paidCost) return;
    const direction = { x: -stroke.direction.z, z: stroke.direction.x }, half = SLAYER_COMBO.pureLength / 2;
    const points = [{ x: at.x - direction.x * half, z: at.z - direction.z * half }, { x: at.x + direction.x * half, z: at.z + direction.z * half }];
    const cross: CombatStroke = { ...stroke, points, direction, loop: null, burst: 0 };
    this.later(.09, () => {
      const targets = new Set<number>(), guarded = new Set<number>();
      const off = this.world.events.on('damage', e => { if (!e.ongoing) targets.add(e.targetId); });
      const offGuard = this.world.events.on('slayerGuarded', e => guarded.add(e.targetId));
      try { this.world.castRogueStroke(cross, element, { kind: 'derived', ticket: origin.ticket, scale: SLAYER_COMBO.purePower }); }
      finally { off(); offGuard(); }
      this.world.events.emit('slayerFinisher', { at, element, direction, hits: targets.size, guarded: guarded.size });
    });
  }
  afterCast(stroke: CombatStroke, element: Element, origin: RogueHit): void {
    if (this.world.combatStyle === 'spirit') this.commands.issue(stroke,element,origin);
    if (!this.commands.replacesStroke && !origin.ticket?.neutral) this.tactics.afterCast(stroke, element, origin);
    for (const wolf of this.world.wolves) if (wolf.action !== 'dead' && strokeTouches(wolf, stroke)) this.marks.set(wolf.id, 3.5);
    const geometry = stroke.loop ? [...stroke.loop, stroke.loop[0]!] : stroke.points;
    // These cast trajectories never call afterCast again. They may trigger one root follow-up;
    // only that final follow-up carries noProc, so return kills can actually feed pursuit and fracture.
    const derived = (scale: number): RogueHit => ({ kind: 'derived', scale, ticket: origin.ticket });
    if (origin.ticket?.neutral && this.build.has('three')) this.sideStrokes(stroke).forEach((side, i) => this.later(.06 + i * .07, () => this.world.castRogueStroke(side, element, derived(B.slayer.sidePower))));
    if (origin.ticket?.neutral && this.build.has('scar')) {
      const point = this.scar && intersection(geometry, this.scar.points);
      if (point) { this.burst(point, element, B.slayer.scarDamage, B.slayer.scarRadius, derived(Math.min(stroke.multiplier, this.scar!.power ?? 1) * (stroke.effect ?? 1))); this.effect('burst', point, element, '交叉引爆', B.slayer.scarRadius); }
      this.scar = { points: geometry.map(p => ({ ...p })), element, remaining: B.slayer.scarSeconds, power: stroke.multiplier };
    }
    if (origin.ticket?.neutral && this.build.stage >= 1) this.later(.28, () => this.world.castRogueStroke(stroke, element, derived(B.slayer.returnPower)));
    const previousCasts = this.casts; this.casts += Math.min(1, stroke.investment ?? 1);
    if (origin.ticket?.neutral && this.build.stage >= 2 && Math.floor(this.casts / B.slayer.riftEvery) > Math.floor(previousCasts / B.slayer.riftEvery)) this.later(.42, () => { this.world.castRogueStroke(stroke, element, derived(B.slayer.riftPower)); this.effect('burst', stroke.points.at(-1)!, element, '裂空'); });
    if (this.build.has('mimic') && !this.commands.active) {
      const imitators = this.spirits.filter(s => s.role === 'main' || this.build.has('twins') && s.role === 'twin');
      imitators.forEach((spirit, i) => this.later(.22 + i * .2, () => {
        if (this.world.enemyAbilities.silenced(spirit)) return;
        const local = this.meleeMimic(stroke, spirit);
        if (!this.world.wolves.some(w => w.action !== 'dead' && strokeTouches(w, local) && SpiritMovement.canHit(spirit, w, this.world.wards))) return;
        spirit.cast = .7; this.world.castRogueStroke(local, spirit.element, { kind: 'mimic', spiritId: spirit.id, scale: B.spirit.mimicPower });
        this.effect('burst', spirit, spirit.element, '拟法', SpiritMovement.reach(spirit));
      }));
    }
    // ArrayMomentum settles manual paths once in World.resolveStroke.
  }
  sideStrokes(stroke: CombatStroke): CombatStroke[] {
    const offset = { x: -stroke.direction.z * 2.1, z: stroke.direction.x * 2.1 };
    return [-1, 1].map(sign => ({ ...stroke, points: stroke.points.map(p => ({ x: p.x + offset.x * sign, z: p.z + offset.z * sign })), loop: stroke.loop?.map(p => ({ x: p.x + offset.x * sign, z: p.z + offset.z * sign })) ?? null }));
  }
  meleeMimic(stroke: CombatStroke, spirit: RunSpirit): CombatStroke {
    const points = stroke.loop ?? stroke.points, center = points.reduce((p, q) => ({ x: p.x + q.x / points.length, z: p.z + q.z / points.length }), { x: 0, z: 0 });
    const scale = Math.min(1, SpiritMovement.reach(spirit) / Math.max(.1, ...points.map(p => distance(p, center))));
    const translate = (p: Point) => ({ x: spirit.x + (p.x - center.x) * scale, z: spirit.z + (p.z - center.z) * scale });
    return { ...stroke, points: stroke.points.map(translate), loop: stroke.loop?.map(translate) ?? null, width: .65 };
  }
  markForSpell(points: readonly Point[]): void { const stroke = planCombatStroke(points); if (stroke) for (const wolf of this.world.wolves) if (strokeTouches(wolf, stroke)) this.marks.set(wolf.id, 3.5); }
  afterHit(wolf: Wolf, element: Element, origin: RogueHit | undefined, wasWet: boolean): void {
    if (origin?.ticket?.neutral) return;
    if (!this.build.active || origin?.noProc) return;
    const investment = Math.min(1, origin?.ticket?.investment ?? 1);
    const water = this.build.level('root-water-ripple');
    if (element === 'water' && water && wasWet && this.rippleCooldown <= 0) {
      this.rippleCooldown = B.roots.rippleCooldown; this.burst(wolf, 'water', B.roots.rippleBase + water * B.roots.ripplePerLevel, B.roots.rippleRadius, { kind: 'trigger', scale: investment, noProc: true }, wolf.id);
    }
    const earth = this.build.level('root-earth-fracture');
    if (element === 'earth' && earth && wolf.action !== 'dead') {
      const count = (this.fractures.get(wolf.id) ?? 0) + investment;
      if (count >= B.roots.fractureEvery) { this.fractures.delete(wolf.id); this.world.hitRogue(wolf, B.roots.fractureBase + earth * B.roots.fracturePerLevel, 'earth', { kind: 'trigger', noProc: true }); this.effect('burst', wolf, 'earth', '震裂', 1.5); }
      else this.fractures.set(wolf.id, count);
    }
  }
  killRefund(wolf: Wolf, origin?: RogueHit): number {
    const ticket = origin?.ticket;
    if (!this.build.is('slayer') || wolf.summoned || !ticket || ticket.remaining <= 0) return 0;
    const amount = Math.min(ticket.remaining, B.slayer.refundBase + B.slayer.refundPerLevel * this.build.level('slayer-return'));
    ticket.remaining -= amount;
    return amount;
  }
  afterDeath(wolf: Wolf, element: Element, origin?: RogueHit): void {
    if (!this.build.active) return;
    this.spiritSkills.died(wolf, origin);
    this.fractures.delete(wolf.id); this.marks.delete(wolf.id);
    const ticket = origin?.ticket;
    const ancestor=this.build.has('beast')&&this.spirits.find(s=>s.id===origin?.spiritId&&s.role==='main');
    if (ancestor && !wolf.summoned && !this.beastEvolved) {
      this.beastMarks++;
      this.world.events.emit('beastFeast',{spiritId:ancestor.id,targetId:wolf.id,at:{x:wolf.x,z:wolf.z},element:ancestor.element,marks:this.beastMarks,goal:B.spirit.beastKills});
      if (this.beastEvolved) this.upgraded();
    }
    if (origin?.noProc || origin?.ticket?.neutral) return;
    const investment = Math.min(1, origin?.ticket?.investment ?? 1);
    const metal = this.build.level('root-metal-pursuit');
    if (element === 'metal' && metal) {
      const target = this.world.wolves.filter(w => w.action !== 'dead' && distance(w, wolf) <= B.roots.pursuitRange).sort((a, b) => distance(a, wolf) - distance(b, wolf))[0];
      if (target) { this.world.hitRogue(target, B.roots.pursuitBase + metal * B.roots.pursuitPerLevel, 'metal', { kind: 'trigger', scale: investment, noProc: true, ticket }); this.effect('beam', wolf, 'metal', '追锋', 0, target); }
    }
    const wood = this.build.level('root-wood-seed');
    if (wood && wolf.rooted > 0 && this.seeds.length < B.roots.seedCap) { this.seeds.push({ x: wolf.x, z: wolf.z, remaining: B.roots.seedDelay, element: 'wood', damage: (B.roots.seedBase + wood * B.roots.seedPerLevel) * investment }); this.effect('root', wolf, 'wood', '寄生', B.roots.seedRadius); }
    const fire = this.build.level('root-fire-ember');
    if (fire && wolf.burning > 0) for (const target of this.world.wolves.filter(w => w.action !== 'dead' && distance(w, wolf) <= B.roots.emberRange).slice(0, fire + 1)) {
      this.world.spreadEmber(target, wolf.burnDps * (B.roots.emberBase + B.roots.emberPerLevel * fire), Math.min(B.roots.emberSeconds, wolf.burning)); this.effect('beam', wolf, 'fire', '余烬', 0, target);
    }
  }
  tick(dt: number): void {
    this.arrays.tick(dt);
    if (!this.build.active) return;
    this.restrictions.refresh(this.world, this.spirits);
    this.commands.tick(dt);
    this.rippleCooldown = Math.max(0, this.rippleCooldown - dt);
    if (this.scar) { this.scar.remaining -= dt; if (this.scar.remaining <= 0) this.scar = null; }
    for (const [id, time] of this.marks) { if (time <= dt) this.marks.delete(id); else this.marks.set(id, time - dt); }
    const ready: Pending[] = [];
    this.pending = this.pending.filter(job => { job.remaining -= dt; if (job.remaining <= 0) { ready.push(job); return false; } return true; });
    ready.forEach(job => job.run());
    this.spiritSkills.tick(dt); this.tactics.tick(dt);
    for (let i = this.seeds.length - 1; i >= 0; i--) { const seed = this.seeds[i]!; seed.remaining -= dt; if (seed.remaining <= 0) { this.seeds.splice(i, 1); this.burst(seed, 'wood', seed.damage, 2.6, { kind: 'trigger', noProc: true }); } }
    for (const spirit of this.spirits) {
      spirit.age += dt; spirit.cast = Math.max(0, spirit.cast - dt); spirit.targetId = null;
      if ((spirit.hp ?? 100) <= 0) continue;
      const ward = spirit.wardId === undefined ? null : this.world.wards.find(w => w.id === spirit.wardId);
      if (spirit.wardId !== undefined && (!ward || ward.suppressed > 0 || ward.health <= 0)) continue;
      if (ward) spirit.element = ward.element;
      spirit.cooldown = Math.max(0, spirit.cooldown - dt);
      const anchor = ward ? this.movement.anchor(ward, this.world.wards) : null;
      const destination = this.commands.destination(spirit);
      if (destination) { this.movement.step(spirit,destination,dt,this.world.wards,true,this.commands.movingSpeed); continue; }
      const targets = this.world.wolves.filter(w => w.action !== 'dead' && (ward ? SpiritMovement.defends(ward, w) : distance(w, spirit) <= B.spirit.range));
      targets.sort((a, b) => Number((this.marks.get(b.id) ?? 0) > 0) - Number((this.marks.get(a.id) ?? 0) > 0) || distance(a, spirit) - distance(b, spirit));
      const target = this.commands.target(spirit,targets[0],anchor); if (!target) { if (anchor) this.movement.step(spirit, anchor, dt, this.world.wards, true); continue; }
      spirit.targetId = target.id;
      if (spirit.cast > 0) continue;
      this.movement.step(spirit, target, dt, this.world.wards,false,this.commands.active?this.commands.movingSpeed:1);
      if (this.world.enemyAbilities.silenced(spirit)) continue;
      if (!SpiritMovement.canHit(spirit, target, this.world.wards)) continue;
      if (spirit.cooldown > 0) continue;
      spirit.cooldown = this.world.stats.value('cooldown', spirit.role === 'main' && this.build.has('beast') ? B.spirit.beastInterval : SPIRIT_SKILLS[spirit.element].interval, spirit.element) / (1 + B.growth.power * this.build.level('spirit-harmony'));
      spirit.cooldown /= this.commands.speed(spirit.id);
      const profile = spiritProfile(spirit);
      const epoch = this.commands.epoch;
      const castToken = this.restrictions.begin(spirit);
      spirit.cast = profile.windup + profile.recovery;
      this.attackEvent('windup', spirit, target, profile.windup,this.commands.element(spirit.id),false,this.commands.united(spirit.id));
      const origin: RogueHit = { kind: 'spirit', spiritId: spirit.id };
      this.later(profile.windup, () => {
        if (epoch !== this.commands.epoch || !this.restrictions.valid(spirit, castToken) || !this.spirits.includes(spirit) || spiritRestriction(this.world, spirit) || target.action === 'dead' || !SpiritMovement.canHit(spirit, target, this.world.wards)) return;
        const shot = this.commands.take(spirit);
        const land = () => {
          if (!this.spirits.includes(spirit) || spiritRestriction(this.world, spirit) || target.action === 'dead' || !SpiritMovement.canHit(spirit, target, this.world.wards)) return;
          this.commands.land(spirit,target,shot);
          if (target.hp > 0) { this.spiritSkills.attack(spirit, target, SPIRIT_DAMAGE[spirit.element], origin); if (target.hp <= 0 && shot) this.commands.nativeKill(spirit,target,shot); }
          if (spirit.role === 'main' && this.build.has('beast')) this.burst(spirit, spirit.element, SPIRIT_DAMAGE[spirit.element] * B.spirit.splashPower, B.spirit.splashRadius, { ...origin, noProc: true }, target.id);
          const main = this.spirits.find(s => s.role === 'main');
          if (!this.commands.active && this.build.stage >= 2 && main && spirit.role !== 'array') {
            main.energy = Math.min(B.spirit.energy, main.energy + 1);
            if (main.energy >= B.spirit.energy && main === spirit && this.spiritSkills.attack(main, target, SPIRIT_DAMAGE[main.element] * B.spirit.ultimatePower, { kind: 'spirit', spiritId: main.id, noProc: true })) {
              main.energy = 0; this.effect('burst', main, main.element, '灵体绝技', 2);
            }
          }
        };
        if (profile.style === 'ranged') {
          const flight = Math.max(.1, distance(spirit, target) / profile.projectileSpeed);
          this.attackEvent('launch', spirit, target, flight,shot?.element,false,shot?.union); this.later(flight, land);
        } else land();
      });
    }
  }
  attackEvent(stage: 'windup' | 'launch' | 'impact', spirit: RunSpirit, target: Wolf, duration: number, infusion?: Element, echo = false, union = false): void {
    this.world.events.emit('spiritAttack', { stage, spiritId: spirit.id, targetId: target.id, at: { x: spirit.x, z: spirit.z }, to: { x: target.x, z: target.z }, element: infusion ?? spirit.element, style: spiritProfile(spirit).style, duration, heavy: !echo && (spirit.size >= 1.7 || spirit.element === 'earth'), ancestor:spirit.role==='main'&&this.build.has('beast'), empowered: !!infusion, union, echo });
  }
  burst(at: Point, element: Element, damage: number, radius: number, origin: RogueHit, exclude?: number, genericEffect=true): void {
    const spirit = origin.spiritId === undefined ? undefined : this.spirits.find(s => s.id === origin.spiritId);
    for (const wolf of this.world.wolves.filter(w => w.action !== 'dead' && w.id !== exclude && distance(w, at) <= radius && (!spirit || SpiritMovement.canHit(spirit, w, this.world.wards, .25))).slice(0, B.limits.burstTargets)) this.world.hitRogue(wolf, damage, element, origin);
    if(genericEffect)this.effect('burst', at, element, '', radius);
  }
  effect(kind: 'burst' | 'beam' | 'root' | 'shift' | 'evolve', at: Point, element: Element, label = '', radius = 2, to?: Point): void {
    this.world.events.emit('rogueEffect', { kind, at: { x: at.x, z: at.z }, element, label, radius, to: to ? { x: to.x, z: to.z } : undefined });
  }
  // Paid strokes are bounded by spirit investment; the ultimate has its own stroke budget.
  private later(remaining: number, run: () => void): void { this.pending.push({ remaining, run }); }
  get boonNames(): string { return this.build.destiny ? Object.keys(BOONS).filter(id => this.build.has(id as keyof typeof BOONS)).map(id => BOONS[id as keyof typeof BOONS].name).join(' · ') : ''; }
}

function intersection(a: readonly Point[], b: readonly Point[]): Point | null {
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const p = a[i - 1]!, q = b[j - 1]!, r = { x: a[i]!.x - p.x, z: a[i]!.z - p.z }, s = { x: b[j]!.x - q.x, z: b[j]!.z - q.z };
    const d = r.x * s.z - r.z * s.x; if (Math.abs(d) < 1e-8) continue;
    const t = ((q.x - p.x) * s.z - (q.z - p.z) * s.x) / d, u = ((q.x - p.x) * r.z - (q.z - p.z) * r.x) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { x: p.x + t * r.x, z: p.z + t * r.z };
  }
  return null;
}
