import { EventBus } from '../core/events';
import { distance, random, type Point } from '../core/math';
import { abilities, directApproach, upgrades } from './content';
import { CONCENTRATION, calculateWardPower } from './concentration';
import { ELEMENTS, type DamageSource, type Element, type ElementInfluence, type GameEvents, type Mode, type Phase, type Ward, type WardCompanion, type WardRemovalReason, type Wolf, type WolfBehavior } from './contracts';
import { COMBAT, SPELLS, STEAM, REACTION_MULTIPLIER, elementalReaction, type CombatStroke, type ElementReaction, planCombatStroke, strokeTouches, strokeWardContact } from './combat';
import { WardFormationEffects, type PlannedCompanion } from './formation';
import { NavigationField } from './navigation';
import { planWardPlacement, type WardPlacementResult } from './placement';
import { StatModifiers } from './stats';
import { CAMP, CAMP_FIRE, MAGE, ENTRANCES, naturalElement } from './terrain';
import { separateWolves, wolfSpawn, wolfWall } from './wolf-collision';
import { staggerWolf, tickWolfMotion } from './wolf-motion';
import { landVault } from './wolf-vault';
import { WOLF_KINDS, wolfProfile } from './wolves';
import { bindWolf, ElementalReactions, REACTIONS, tickReactionStatus, type ReactionRequest } from './reactions';
import { wardContains } from './ward-geometry';
import { FateRoller, RunBuild, FATES, type Destiny, type Fate } from './roguelike';
import { BATTLE } from './battle-rules';
import { ElementTraces } from './element-traces';
import { RogueCombat, MAIN_ARRAY_DAMAGE, type RogueHit } from './rogue-combat';
import { BirthDraft } from './birth-draft';
import { TimeStopUltimate, ULTIMATE } from './ultimate';
import { normalizeLoop } from './strokes';
import { ROGUE as B } from './rogue-balance';
import { ARRAY_SUPPORT } from './array-balance';
import { SpiritMovement } from './spirit-movement';
import { EnemyAbilities } from './enemy-abilities';
import { chargedStroke, CHARGE } from './charge';
import { SlayerCombo } from './slayer-combo';
import { SlayerTechniques } from './slayer-techniques';
import { CAMPAIGN_WAVES, ENCOUNTERS, encounter, type WaveSpawn } from './encounters';
import { WaveDirector } from './wave-director';
import { ECONOMY } from './economy';
import { affixAttack, splitElite, tickAffixes } from './elite-affixes';
import { sharedWardArea } from './ground-clipping';

export class World {
  readonly traces = new ElementTraces(this);
  private selectedStyle?: Fate;
  get combatStyle(): Fate { return this.selectedStyle && this.build.is(this.selectedStyle) ? this.selectedStyle : this.build.destiny?.fate ?? 'array'; }
  get swordActive(): boolean { return this.build.active && this.combatStyle === 'slayer'; }
  selectStyle(style: Fate): boolean {
    if (!this.build.is(style) || this.ultimate.active || !['prepare','battle'].includes(this.phase)) return false;
    this.selectedStyle = style;
    if (style === 'slayer') this.selected = 'metal';
    return true;
  }
  readonly waveEconomy = { natural: 0, kills: 0, technique: 0, spent: 0, starved: 0, elapsed: 0 };
  recoverTechnique(amount: number): void {
    const allowed = Math.max(0, Math.min(amount, BATTLE.mana.techniqueCap - this.waveEconomy.technique, this.capacity - this.spirit));
    this.waveEconomy.technique += allowed; this.replenishSpirit(allowed);
  }
  spendSpirit(amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0 || this.spirit - amount < this.mechanics.debtFloor) return false;
    this.spirit -= amount; this.ledger.spent += amount; this.waveEconomy.spent += amount; return true;
  }
  readonly slayerCombo = new SlayerCombo();
  readonly slayerTechniques = new SlayerTechniques(this);
  readonly enemyAbilities = new EnemyAbilities(this);
  readonly ultimate = new TimeStopUltimate();
  readonly build: RunBuild;
  readonly mechanics: RogueCombat;
  readonly fateRoller: FateRoller;
  private openingDraft?: BirthDraft;
  get birthDraft(): BirthDraft { return this.openingDraft ??= new BirthDraft(this.options.random); }
  private readonly mainGifts = new Set<number>();
  private castOrigin?: RogueHit;
  private continuing = false;
  private rewardedWave = 0;
  readonly events = new EventBus<GameEvents>();
  readonly stats = new StatModifiers();
  readonly formationEffects = new WardFormationEffects();
  readonly navigation = new NavigationField();
  readonly behaviors = new Map<string, WolfBehavior>([[directApproach.id, directApproach]]);
  readonly camp = CAMP;
  readonly naturalInfluences = Object.fromEntries(ELEMENTS.map(element => [element, { empowered: 0, suppressed: 0, charge: 1 }])) as Record<Element, ElementInfluence>;
  readonly combatTotals: Record<DamageSource, number> = { ward: 0, companion: 0, spell: 0, steam: 0, reaction: 0, campfire: 0 };
  readonly ledger = { earned: 0, spent: 0, salvaged: 0 };
  readonly reactionEffects = new ElementalReactions({ wolves: () => this.reactionTargets(),
    fireDamage: value => this.stats.value('damage', value, 'fire'),
    burn: wolf => this.mechanics.noteBurn(wolf, this.castOrigin ? { ...this.castOrigin, noProc: true } : { kind: 'trigger', noProc: true }),
    hit: (wolf, damage, element, power, source) => this.reactionHit(wolf, damage, element, power, source) }, this.events);
  private spiritBalance: number = COMBAT.capacity;
  get spirit(): number { return this.spiritBalance; }
  set spirit(value: number) {
    // All income and restored state share the hard cap; debt may remain negative.
    if (Number.isFinite(value)) this.spiritBalance = Math.min(COMBAT.capacity, value);
  }
  wards: Ward[] = [];
  wolves: Wolf[] = [];
  selected: Element = 'fire';
  phase: Phase = 'prepare';
  time = 0;
  health = 100;
  wave = 0;
  kills = 0;
  notice = '五行共用灵力 · 在空地围一圈，首尾接近即可成阵';
  behaviorId = 'approach';
  private activeCompanions: WardCompanion[] = [];
  private nextId = 1;
  assault = new WaveDirector(1);
  private recoveryTime = 0;
  private recovered = 0;
  private hitStop = 0;
  private readonly rng = random(4217);

  constructor(private readonly options: { roguelike?: boolean; random?: () => number } = {}) {
    this.build = new RunBuild(options.random); this.mechanics = new RogueCombat(this, this.build);
    this.fateRoller = new FateRoller(options.random);
    if (options.roguelike) this.phase = 'destiny';
    this.navigation.rebuild(CAMP, []);
    this.events.on('hit', hit => { const wolf = this.wolves.find(w => w.id === hit.target); if (wolf && !(this.build.is('slayer') && hit.source === 'spell' && hit.element === 'metal' && this.enemyAbilities.armored(wolf))) staggerWolf(wolf); });
  }
  get capacity(): number { return COMBAT.capacity; }
  get mode(): Mode { return this.phase === 'battle' ? 'invoke' : 'ward'; }
  get preparationLocked(): boolean { return this.phase === 'prepare' && this.build.active && !this.build.is('array'); }
  get regeneration(): number {
    const lanes = this.build.fates;
    const base = lanes.length ? lanes.reduce((sum, lane) => sum + BATTLE.mana[lane].regen, 0) / lanes.length : COMBAT.regeneration;
    const growth = 1 + .12 * this.build.level('common-regen');
    const penalty = this.build.level('common-overdrive') ? 1 - B.growth.regenPenalty : 1;
    return Math.max(0, this.stats.value('regen', base) * growth * penalty);
  }
  private get unitSpellCost(): number {
    const base = this.build.is('slayer') ? B.slayer.cost : this.build.active ? ECONOMY.strokePrice : COMBAT.spellCost;
    return Math.max(.1, Math.round(this.stats.value('castCost', base) * 100) / 100);
  }
  get spellCost(): number { return this.mechanics.tactics.freeCast ? 0 : this.unitSpellCost; }
  effectiveChargeSeconds(seconds: number): number { return this.swordActive ? this.slayerTechniques.chargeTime(seconds) : 0; }
  quoteStroke(points: readonly Point[], chargeSeconds = 0) {
    const stroke = planCombatStroke(points); if (!stroke) return null;
    if (this.build.active) {
      const limit = this.swordActive ? 8 : this.combatStyle === 'array' ? 24 : 32;
      let remaining = limit;
      const bounded = [stroke.points[0]!];
      for (const p of stroke.points.slice(1)) {
        const previous = bounded.at(-1)!, d = distance(previous, p);
        if (d > remaining) { bounded.push({ x: previous.x + (p.x-previous.x)*remaining/d, z: previous.z + (p.z-previous.z)*remaining/d }); break; }
        bounded.push(p); remaining -= d;
      }
      stroke.points = bounded;
    }
    if (this.swordActive) {
      const seconds = this.effectiveChargeSeconds(chargeSeconds), charge = seconds >= 1.05 ? 3 : seconds >= .65 ? 2 : seconds >= .25 ? 1 : 0;
      const heavy = charge >= 2, length = Math.min(2, Math.max(.5, (stroke.investment ?? 1)));
      const cost = this.ultimate.active ? 0 : Math.round((heavy ? BATTLE.blade.heavyCost + length : BATTLE.blade.lightCost * length) * 100) / 100;
      const burst = heavy ? this.slayerCombo.finisher(1, charge, cost > 0) : 0;
      const rush = this.slayerTechniques.rushEnergy({ ...stroke, investment: length, charge }, cost > 0);
      return { cost, limited: false, stroke: { ...stroke, loop: null, investment: length, charge, burst, rush,
        multiplier: (heavy ? charge === 3 ? 1.3 : 1 : length) * (1 + burst + rush / length), width: heavy ? BATTLE.blade.heavyWidth : BATTLE.blade.lightWidth } };
    }
    if (this.build.active && this.combatStyle === 'array') {
      const length = Math.min(3, Math.max(.5, (stroke.investment ?? 1) / 2));
      return { cost: this.ultimate.active ? 0 : Math.round(BATTLE.trace.cost * length * 100) / 100, limited: false,
        stroke: { ...stroke, loop: null, multiplier: 1, investment: length, charge: 0, burst: 0, rush: 0 } };
    }
    let quote = chargedStroke(stroke, this.effectiveChargeSeconds(chargeSeconds), this.unitSpellCost, Math.max(0, this.spirit - this.mechanics.debtFloor), !this.spellCost || this.ultimate.active);
    if (this.mechanics.commands.replacesStroke && !this.build.is('array') && !this.ultimate.active) {
      const investment = this.mechanics.commands.accepted(quote.stroke.investment), ratio = investment / quote.stroke.investment;
      quote = { ...quote, cost: Math.round(quote.cost * ratio * 100) / 100, stroke: { ...quote.stroke, investment, multiplier: quote.stroke.multiplier * ratio } };
    }
    const burst = this.build.is('slayer') ? this.slayerCombo.finisher(quote.stroke.investment, quote.stroke.charge, quote.cost > 0) : 0;
    const rush = this.build.is('slayer') ? this.slayerTechniques.rushEnergy(quote.stroke, quote.cost > 0) : 0;
    return { ...quote, stroke: { ...quote.stroke, burst, rush, multiplier: quote.stroke.multiplier * (1 + (quote.stroke.investment ? (burst + rush) / quote.stroke.investment : 0)) } };
  }
  strokeCost(points: readonly Point[], chargeSeconds = 0): number { return this.quoteStroke(points, chargeSeconds)?.cost ?? 0; }
  get killSpirit(): number { return this.build.active ? BATTLE.mana[this.combatStyle].kill : ECONOMY.killIncome; }
  private get preparationCostMultiplier(): number { return this.phase === 'prepare' ? ECONOMY.preparationCostMultiplier : 1; }
  private get wardInvestment(): number { return Math.ceil(this.stats.value('wardCost', CONCENTRATION.defaultInvestment, this.selected)); }
  get wardCost(): number { return this.wardInvestment * this.preparationCostMultiplier; }
  get repairCost(): number { return ECONOMY.repairPrice * this.preparationCostMultiplier; }
  get companions(): readonly Readonly<WardCompanion>[] { return this.activeCompanions; }
  naturalPower(element: Element): number { return this.influencePower(this.naturalInfluences[element]); }

  allocateEntityId(): number { return this.nextId++; }
  replenishSpirit(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const before=this.spirit; this.spirit=Math.min(this.capacity, this.spirit+amount);
    if(this.build.active)this.ledger.earned+=this.spirit-before;
  }
  selectElement(element: Element): boolean {
    if (this.swordActive && this.phase === 'battle') { this.selected = 'metal'; return element === 'metal'; }
    if (!ELEMENTS.includes(element) || !this.build.owns(element) || this.phase === 'destiny' || this.preparationLocked) return false;
    this.selected = element; return true;
  }
  chooseDestiny(destiny: Destiny = this.fateRoller.current): boolean {
    if (this.phase !== 'destiny' || !this.build.begin(destiny)) return false;
    this.selectedStyle = destiny.fate; this.selected = this.swordActive ? 'metal' : destiny.roots[0]!;
    this.mechanics.initialize(); this.setPhase('prepare'); this.notice = FATES[destiny.fate].rule; return true;
  }
  chooseBirth(): boolean {
    if (this.phase !== 'destiny' || !this.birthDraft.ready || !this.build.beginPair(this.birthDraft.choices)) return false;
    this.selectedStyle = this.build.destiny!.fate; this.selected = this.swordActive ? 'metal' : this.build.roots[0]!;
    this.mechanics.initialize(); this.setPhase('prepare'); this.notice = '双命同修 · 已选天赋共同生效，借天地之势入山'; return true;
  }
  get availableMainSlot(): number | undefined {
    if (!this.build.is('array')) return undefined;
    return Array.from({ length: this.build.has('twinArray') ? 2 : 1 }, (_, i) => i).find(slot => !this.wards.some(w => w.mainSlot === slot) && !this.mechanics.spirits.some(s => s.originWard?.mainSlot === slot));
  }
  get mainPlacementCost(): number {
    const slot = this.availableMainSlot;
    return slot !== undefined && !this.mainGifts.has(slot) ? 0 : this.wardCost;
  }
  draw(points: readonly Point[], chargeSeconds = 0): boolean {
    if (this.ultimate.active) return this.queueUltimateStroke(points, this.selected, chargeSeconds);
    const moving = this.combatStyle === 'array' && points.length > 1 && this.build.has('living') && !normalizeLoop(points) && this.wards.find(w => w.mainSlot !== undefined && distance(w, points[0]!) < 1.6);
    if (moving) return this.moveMain(moving.id, points.at(-1)!);
    return this.phase === 'battle' ? this.invoke(points, chargeSeconds) : this.place(points);
  }

  previewPlacement(points: readonly Point[], investment = this.wardInvestment): WardPlacementResult {
    if (this.build.active && !this.build.is('array')) return { ok: false, reason: 'fate', message: '当前流派直接迎战' };
    if (this.wards.length >= 6) return { ok: false, reason: 'limit', message: '最多保留六座阵法，先撤回一座再调整' };
    const slot = this.availableMainSlot, main = slot !== undefined, gifted = main && this.mainPlacementCost === 0;
    // A gift owns a fixed investment. Re-drawing it preserves that budget, never arbitrary free power.
    if (gifted && Number.isSafeInteger(investment) && investment > 0) investment = CONCENTRATION.defaultInvestment;
    return planWardPlacement(points, {
      phase: this.phase, element: this.selected, energy: gifted ? investment : this.spirit, investment,
      costMultiplier: gifted ? 0 : this.preparationCostMultiplier,
      efficiency: this.stats.value('concentration', 1, this.selected) * (main ? (this.availableMainSlot === 1 ? B.array.twinPower : 1) : 1),
      wards: this.wards,
    });
  }

  place(points: readonly Point[], investment = this.wardInvestment): boolean {
    if (this.build.active && !this.build.is('array')) { this.warn('当前流派直接迎战'); return false; }
    if (!this.build.owns(this.selected)) return false;
    const slot = this.availableMainSlot, main = slot !== undefined;
    const plan = this.previewPlacement(points, investment);
    if (!plan.ok) { this.warn(plan.message); return false; }
    const cost = main && this.mainPlacementCost === 0 ? 0 : plan.cost;
    const maxHealth = CONCENTRATION.wardHealth * (plan.element === 'earth' ? plan.power.multiplier : 1);
    const ward: Ward = { id: this.nextId, ...plan.at, points: plan.points, regions: plan.regions, element: plan.element, radius: plan.radius, mainSlot: slot,
      age: 0, charge: 1, pulse: 0, health: maxHealth, maxHealth, empowered: 0, suppressed: 0, power: plan.power, paidCost: cost };
    const phase = this.phase;
    let companions: PlannedCompanion[];
    try {
      companions = this.formationEffects.plan({ ward, area: plan.area, cost, phase, wave: this.wave });
    } catch (cause) {
      this.warn('成阵未完成，灵力已保留，请重新布阵', cause); return false;
    }
    // Commit the complete formation before notifying presentation listeners.
    this.spirit -= cost; this.nextId++;
    if(this.build.active)this.ledger.spent+=cost;
    if (slot !== undefined) {
      this.mainGifts.add(slot);
    }
    const created: WardCompanion[] = companions.map(companion => ({
      id: this.nextId++, wardId: ward.id, effectId: companion.effectId, kind: companion.kind, element: ward.element,
      ...companion.at, attack: companion.attack, powerShare: 1 / companions.length, age: 0, cooldown: 0, targetId: null,
    }));
    this.wards.push(ward); this.activeCompanions.push(...created); this.navigation.rebuild(CAMP, this.wards);
    this.notice = `${abilities[ward.element].label}阵已成 · 灵力浓度 ${(ward.power.multiplier * 100).toFixed(0)}%${ward.element === 'earth' ? ` · 土墙生命 ${ward.maxHealth.toFixed(1)}` : ' · 阵法自动防守'}`;
    if (plan.clipped) this.notice += ' · 已保留空地内有效部分';
    if (main) this.notice += this.build.has('fivefold') ? ' · 相生点阵，原阵与来笔双辅同开' : ' · 古阵强化';
    if (main && this.availableMainSlot === undefined) this.notice += ' · 可继续自由画阵';
    this.events.emit('ward', { ward, area: plan.area, cost, phase });
    for (const companion of created) this.events.emit('companionSpawned', { companion });
    return true;
  }

  undo(): void {
    if (this.phase !== 'prepare') return;
    const ward = this.wards.at(-1); if (!ward) return;
    this.dismissWard(ward.id, 'undo');
  }

  get canDismissWard(): boolean { return (this.phase === 'prepare' || this.phase === 'battle') && !this.ultimate.active; }

  wardRefund(id: number): number {
    const ward = this.wards.find(ward => ward.id === id), paid = ward?.paidCost ?? 0;
    // Gift power and later concentration upgrades are not spirit payments.
    const remaining=ward ? Math.max(0,Math.min(1,ward.health/ward.maxHealth)) : 0;
    return Number.isFinite(paid) ? Math.max(0, paid * ECONOMY.salvageShare * remaining) : 0;
  }

  dismissWard(id: number, reason: 'dismissed' | 'undo' = 'dismissed'): boolean {
    if (!this.canDismissWard) return false;
    const ward = this.wards.find(ward => ward.id === id); if (!ward) return false;
    const refund = this.wardRefund(id), received = Math.min(refund, Math.max(0, this.capacity - this.spirit));
    this.spirit += received;
    if(this.build.active)this.ledger.salvaged+=received;
    this.removeWard(id, reason);
    this.notice = `${abilities[ward.element].label}阵已撤 · 回收残值 ${Number(received.toFixed(1))} 灵力${ward.paidCost === 0 ? ' · 赠阵仅赠一次，重建需付灵力' : ''}`;
    return true;
  }

  invoke(points: readonly Point[], chargeSeconds = 0): boolean {
    if (this.phase !== 'battle') return false;
    if (this.ultimate.active) return this.queueUltimateStroke(points, this.selected, chargeSeconds);
    if (this.combatStyle === 'spirit' && this.build.active) { const at = points.at(-1); return !!at && this.mechanics.commands.tap(at); }
    if (!this.build.owns(this.selected)) return false;
    const quote = this.quoteStroke(points, chargeSeconds); if (!quote) return false;
    const { stroke, cost } = quote;
    if (this.mechanics.commands.replacesStroke && !this.build.is('array') && (stroke.investment ?? 0) <= 1e-8) return this.mechanics.commands.redirect(stroke,this.selected);
    if (this.spirit - cost < this.mechanics.debtFloor) { this.warn(this.build.active ? `本笔需 ${cost} 灵力 · 正在回灵，可短划或击杀补灵` : `需要 ${cost} 灵力，正在自然恢复`); return false; }
    const element = this.swordActive ? 'metal' : this.selected;
    const origin = this.build.active ? this.mechanics.beginCast(this.spirit < cost, cost, stroke.investment, stroke.charge) : undefined;
    this.mechanics.tactics.freeCast = false;
    this.spendSpirit(cost);
    this.slayerCombo.spend(stroke.burst);
    this.slayerTechniques.spendInitiative(stroke.charge);
    this.slayerTechniques.spendRush(stroke, cost > 0);
    if (origin) this.mechanics.markForSpell(points);
    const reactionNames = new Set<string>();
    const stopNotice = this.events.on('reaction', r => reactionNames.add(`${abilities[r.from].name}${r.kind === 'generate' ? '生' : '克'}${abilities[r.to].name}·${r.name}`));
    try {
      this.castRogueStroke(stroke, element, origin);
      if (origin) this.mechanics.afterCast(stroke, element, origin);
    } finally { stopNotice(); }
    this.notice = `${stroke.charge ? `${CHARGE.names[stroke.charge]} · ` : ''}${reactionNames.size ? [...reactionNames].join(' / ') : `${abilities[element].name}行施法`} · ${cost ? `消耗 ${cost} 灵力` : '轮转免耗'}${quote.limited ? ' · 按可用灵力降档' : ''}${this.spirit < 0 ? ' · 透支狂书' : ''}`;
    if (this.mechanics.commands.replacesStroke) this.notice = `${abilities[element].name}行御令 · 宝宝受令${this.mechanics.commands.united(this.mechanics.spirits[0]?.id ?? -1) ? ' · 群灵合击' : ''} · ${cost} 灵力`;
    return true;
  }

  startUltimate(): boolean {
    if (this.phase !== 'battle' || !this.ultimate.start()) return false;
    this.notice = this.mechanics.commands.stormOnly ? `停时蓄令 · 最多 ${B.limits.storedStrokes} 笔，灌入群灵后依次出手` : `停时 · 最多蓄 ${B.limits.storedStrokes} 笔，三秒后万象齐发`; this.events.emit('ultimate', { stage: 'start' }); return true;
  }
  queueUltimateStroke(points: readonly Point[], element: Element, chargeSeconds = 0): boolean {
    if (this.phase !== 'battle' || !this.build.owns(element)) return false;
    const quote = this.quoteStroke(points, chargeSeconds); if (!quote) return false;
    const stroke = { ...quote.stroke, investment: Math.min(1, quote.stroke.investment ?? 1), multiplier: Math.min(1.3, quote.stroke.multiplier) };
    if (!this.ultimate.add(stroke, this.swordActive ? 'metal' : element)) { if (this.ultimate.stage === 'drawing') this.warn(`已蓄满 ${B.limits.storedStrokes} 笔，等待齐发`); return false; }
    this.events.emit('ultimate', { stage: 'stroke' }); return true;
  }

  castRogueStroke(stroke: CombatStroke, element: Element, origin?: RogueHit): void {
    if (this.phase !== 'battle' || !this.build.owns(element)) return;
    if (origin?.kind === 'manual' && this.mechanics.commands.replacesStroke) {
      // Mixed summoner/array builds keep their orders and can still route array eyes.
      this.mechanics.arrays.resolve(this.mechanics.arrays.plan(stroke, element, origin));
      return;
    }
    const previous = this.castOrigin; this.castOrigin = origin;
    const tracked = !!origin?.ticket?.neutral && origin.kind === 'manual', targets = new Set<number>(), kills = this.kills;
    const center = { x: 0, z: 0 }, guarded = new Set<number>(), openings = new Map<number, Point>();
    const offGuard = tracked ? this.events.on('slayerGuarded', e => guarded.add(e.targetId)) : () => {};
    const off = tracked ? this.events.on('damage', e => {
      if (!e.ongoing && !targets.has(e.targetId)) { targets.add(e.targetId); center.x += e.at.x; center.z += e.at.z; }
      if (e.opening) openings.set(e.targetId, e.at);
    }) : () => {};
    try { this.resolveStroke(stroke, element, origin); } finally { off(); offGuard(); this.castOrigin = previous; }
    if (tracked) {
      const level = stroke.charge ?? 0, investment = stroke.investment ?? 1;
      const previousTier = this.slayerCombo.tier;
      this.slayerCombo.hit((origin?.ticket?.paidCost ?? 0) > 0 ? investment : 0, targets.size, level);
      if (targets.size && !this.ultimate.active) this.hitStop = Math.max(this.hitStop, CHARGE.hitStop[level] ?? 0);
      const at = targets.size ? { x: center.x / targets.size, z: center.z / targets.size } : stroke.points.at(-1)!;
      const result = { at, element, level, hits: targets.size, kills: this.kills - kills };
      if (level) this.events.emit('chargedStrike', { ...result, width: stroke.width ?? COMBAT.strokeWidth });
      this.events.emit('slayerStrike', { ...result, guarded: guarded.size, ...(openings.size ? { openings: [...openings.values()] } : {}), direction: stroke.direction, combo: this.slayerCombo.count, tier: this.slayerCombo.tier, tierRaised: this.slayerCombo.tier > previousTier, burst: stroke.burst ?? 0, rush: stroke.rush ?? 0, investment });
      if (targets.size && origin) this.mechanics.crossFinisher(stroke, element, origin, at);
      const echo = this.slayerTechniques.after(stroke, element, origin, targets);
      if (echo && origin) this.mechanics.returnCut(echo.stroke, echo.element, origin);
    }
  }
  private resolveStroke(stroke: CombatStroke, element: Element, origin?: RogueHit): void {
    if (origin?.ticket?.neutral) {
      const heavy = (origin.ticket.charge ?? 0) >= 2;
      const targets = this.wolves.filter(w => w.action !== 'dead' && strokeTouches(w, stroke));
      for (const wolf of targets) {
        if (heavy) this.enemyAbilities.breakGuard(wolf);
        this.damage(wolf, heavy ? BATTLE.blade.heavyDamage : BATTLE.blade.lightDamage, 'metal', stroke.direction,
          .55, false, stroke.multiplier * (stroke.effect ?? 1), 1, 'spell', origin);
      }
      if (heavy && targets.length && (stroke.burst ?? 0) > 0 && origin.kind === 'manual' && origin.ticket.paidCost) this.recoverTechnique(BATTLE.blade.comboRefund);
      this.events.emit('invoke', { points: stroke.points, element: 'metal', source: stroke.points[0]!, combo: !!stroke.burst, width: stroke.width, charge: stroke.charge });
      return;
    }
    if (origin?.kind === 'manual' && this.combatStyle === 'array') {
      this.traces.add(stroke, element, origin);
      this.mechanics.arrays.resolve(this.mechanics.arrays.plan(stroke, element, origin));
      this.events.emit('invoke', { points: stroke.points, element, source: stroke.points[0]!, combo: false, width: BATTLE.trace.width });
      return;
    }
    const arrayPlan = this.mechanics.arrays.plan(stroke, element, origin);
    const spell = SPELLS[element], sources = new Map<Element, Point>(), effect = stroke.effect ?? 1;
    const power = stroke.multiplier * effect;
    for (const p of stroke.points) { const source = naturalElement(p); if (source && !sources.has(source)) sources.set(source, p); }
    const wards = this.wards.map(ward => ({ ward, at: strokeWardContact(stroke, ward) })).filter(contact => contact.at !== null);
    // Snapshot all source power before modifying any field, so one stroke cannot amplify itself.
    const contacts = [
      ...[...sources].map(([source, at]) => ({ element: source, at, influence: this.naturalInfluences[source], power: this.influencePower(this.naturalInfluences[source]), ward: undefined as Ward | undefined })),
      ...wards.map(({ward, at}) => ({ element: ward.element, at: at!, influence: ward, power: this.wardStrength(ward), ward })),
    ].map(contact => ({ ...contact, reaction: elementalReaction(element, contact.element) }));
    // Every intersected enemy is a target. Additional metal hits retain half power.
    const spiritCaster = origin?.spiritId === undefined ? undefined : this.mechanics.spirits.find(s => s.id === origin.spiritId);
    const directTargets = this.wolves.filter(wolf => wolf.action !== 'dead' && strokeTouches(wolf, stroke) && (!spiritCaster || SpiritMovement.canHit(spiritCaster, wolf, this.wards)))
      .sort((a, b) => stroke.points.findIndex(p => distance(p, a) <= (stroke.width ?? COMBAT.strokeWidth)) - stroke.points.findIndex(p => distance(p, b) <= (stroke.width ?? COMBAT.strokeWidth)) || a.id - b.id);
    const blasts: { at: Point; damage: number }[] = [];
    if (element === 'water') for (const wolf of directTargets) if (wolf.burning > 0) {
      blasts.push({ at: { x: wolf.x, z: wolf.z }, damage: STEAM.burnBaseDamage + wolf.burnDps * wolf.burning });
    }
    const reactions = new Set<string>();
    const requests: ReactionRequest[] = [];
    const emit = (reaction: ElementReaction, at: Point, target: { wardId?: number; targetId?: number; sourceElement?: Element } = {}) => {
      reactions.add(`${abilities[reaction.from].name}${reaction.kind === 'generate' ? '生' : '克'}${abilities[reaction.to].name}·${reaction.name}`);
      this.events.emit('reaction', { ...reaction, at, ...target });
    };
    for (const contact of contacts) {
      const reaction = contact.reaction; if (!reaction) continue;
      if (reaction.kind === 'generate' && reaction.to === contact.element) {
        contact.influence.empowered = Math.max(contact.influence.empowered, COMBAT.empowerSeconds * Math.min(2, stroke.multiplier) * effect); contact.influence.suppressed = 0;
        if (contact.ward?.element === 'earth') contact.ward.health = Math.min(contact.ward.maxHealth, contact.ward.health + Math.min(B.tactics.wallRepairCap, contact.ward.maxHealth * (this.build.active ? B.tactics.wallRepair : .2 * REACTION_MULTIPLIER)) * power);
        if (contact.element === 'metal') contact.influence.edgeCharges = Math.max(contact.influence.edgeCharges ?? 0, REACTIONS.chainCharges * power);
      } else if (contact.power <= 0) continue;
      else if (reaction.kind === 'overcome') {
        if (contact.influence.charge < STEAM.minimumHeat) continue;
        if (element === 'water' && contact.element === 'fire') {
          blasts.push({ at: { x: contact.at.x, z: contact.at.z }, damage: this.stats.value('damage', contact.ward ? STEAM.wardDamage : STEAM.naturalDamage, 'fire') * contact.power * contact.influence.charge });
          contact.influence.charge = 0; contact.influence.empowered = 0;
        } else { contact.influence.empowered = 0; contact.influence.suppressed = COMBAT.suppressSeconds * effect; contact.influence.charge = 0; contact.influence.edgeCharges = 0; }
      }
      requests.push({ reaction, at: { x: contact.at.x, z: contact.at.z }, power: contact.power * power, effect, field: true, sourceId: contact.ward ? `ward:${contact.ward.id}` : `nature:${contact.element}`,
        chargedWard: contact.ward?.element === 'metal' && reaction.kind === 'generate' && reaction.result === 'metal' });
      emit(reaction, contact.at, contact.ward ? { wardId: contact.ward.id } : { sourceElement: contact.element });
    }
    for (const wolf of this.wolves) {
      if (wolf.action === 'dead') continue;
      const targetIndex = directTargets.indexOf(wolf), direct = targetIndex >= 0;
      if (!direct) continue;
      const environment = contacts.filter(contact => contact.power > 0 && contact.reaction && (contact.ward ? wardContains(wolf,contact.ward) : naturalElement(wolf) === contact.element))
        .sort((a,b) => b.power-a.power)[0]?.reaction;
      // Actual burning remains meaningful even if another hit overwrote the last aura.
      const aura = this.enemyAbilities.counterAura(wolf) ?? (wolf.burning > 0 && (element === 'water' || element === 'wood') ? 'fire'
        : wolf.rooted > 0 && (element === 'metal' || element === 'water') ? 'wood'
        : wolf.wet > 0 && (element === 'earth' || element === 'metal' || element === 'wood') ? 'water'
        : wolf.auraTime > 0 && !(element === 'water' && wolf.aura === 'fire') ? wolf.aura : null);
      const local = direct && aura ? elementalReaction(element, aura) : null;
      const reaction = direct ? local ?? environment : undefined;
      if (local) {
        requests.push({ reaction: local, at: { x: wolf.x, z: wolf.z }, power: power * spell.falloff ** Math.min(1,targetIndex), effect,
          focusId: wolf.id, burning: wolf.burning, burnDps: wolf.burnDps || undefined, rooted: wolf.rooted });
        emit(local, wolf, { targetId: wolf.id });
        if (local.kind === 'overcome') this.enemyAbilities.interrupt(wolf.id, power);
      }
      const generated = reaction?.kind === 'generate', resisted = reaction?.kind === 'resist';
      const steam = element === 'water' && reaction?.to === 'fire';
      if (reaction?.kind === 'overcome' && !steam && !(element === 'metal' && reaction.to === 'wood')) this.clearElementStatus(wolf, reaction.to);
      const base = direct ? generated ? this.build.active ? B.tactics.generationDamage : COMBAT.generationDamage : resisted ? COMBAT.resistedDamage : 1 : 0;
      const bonus = reaction?.kind === 'overcome' && !steam ? COMBAT.overcomingBonus : 0;
      const resultElement = generated ? reaction.result : element;
      this.damage(wolf, (this.mechanics.spellBase(element, origin) ?? spell.damage) * (base + bonus), resultElement, stroke.direction, 0.55, !resisted, power * spell.falloff ** Math.min(1,targetIndex), generated ? this.build.active ? B.tactics.empowerMultiplier : COMBAT.empowerMultiplier : 1, 'spell', origin, effect);
    }
    const casterShare = spiritCaster ? this.mechanics.damageMultiplier(spiritCaster, element, 'companion', { ...origin!, scale: 1, ticket: undefined }) : 1;
    const reactionScale = (origin?.scale ?? 1) * (origin?.ticket?.power ?? 1) * casterShare;
    this.reactionEffects.resolve(requests.map(r => ({ ...r, power: r.power * reactionScale * (this.build.active && r.reaction.kind === 'generate' ? B.tactics.generationEffect : 1) })));
    // Snapshot first, resolve once. Overlapping blasts never multiply damage or recursively detonate victims.
    for (const wolf of this.wolves) {
      if (wolf.action === 'dead' || spiritCaster && !SpiritMovement.canHit(spiritCaster, wolf, this.wards)) continue;
      const blast = blasts.filter(blast => distance(wolf, blast.at) <= STEAM.radius).sort((a, b) => b.damage - a.damage)[0];
      if (!blast) continue;
      this.clearElementStatus(wolf, 'fire');
      this.damage(wolf, blast.damage * REACTION_MULTIPLIER, 'water', stroke.direction, 0.8, false, power, 1, 'steam');
      wolf.hit = 0.2;
    }
    for (const blast of blasts) this.events.emit('steam', { at: blast.at, radius: STEAM.radius, targets: this.wolves.filter(wolf => distance(wolf, blast.at) <= STEAM.radius).map(wolf => wolf.id) });
    this.mechanics.tactics.reactions(requests, origin);
    this.mechanics.arrays.resolve(arrayPlan);
    this.events.emit('invoke', { points: stroke.loop ? [...stroke.loop, stroke.loop[0]!] : stroke.points, element, source: stroke.points[0]!, combo: reactions.size > 0, width: stroke.width, charge: stroke.charge });
  }

  startWave(): void {
    if (this.phase !== 'prepare') return;
    this.ultimate.clear(true);
    for (const s of this.mechanics.spirits) if (s.role !== 'array' && s.maxHp) { s.hp = Math.min(s.maxHp, Math.max(0,s.hp ?? 0) + s.maxHp*.3); s.revive = 0; }
    this.wave++; this.assault = new WaveDirector(this.wave);
    this.setPhase('battle');
    this.notice = `第 ${this.wave} 波 · ${this.assault.plan.title}`;
  }

  repairCamp(): boolean {
    const cost = this.repairCost;
    if(!this.build.active||this.phase!=='prepare'||this.health>=100||this.health<=0||this.spirit<cost)return false;
    const restored=Math.min(ECONOMY.repairHealth,100-this.health);
    this.spirit-=cost;this.ledger.spent+=cost;this.health+=restored;
    this.events.emit('campRepaired', { amount: restored, cost });
    this.notice=`修营 +${Number(restored.toFixed(1))} · 支出 ${cost} 灵力`;return true;
  }

  chooseUpgrade(id: string): void {
    if (this.phase !== 'rest') return;
    if (this.build.active) {
      const hadArray = this.build.is('array'), hadTwinArray = this.build.has('twinArray');
      const reward = this.build.choose(id, this.health); if (!reward) return;
      this.rewardedWave = this.wave;
      if (id === 'common-capacity') this.replenishSpirit(ECONOMY.reserveGrant);
      if (id === 'common-repair') this.health = Math.min(100, this.health + B.growth.repair);
      if (id === 'replenish') this.replenishSpirit(ECONOMY.reserveGrant);
      if (this.build.is('array') && (!hadArray || !hadTwinArray && this.build.has('twinArray'))) {
        // Mid-run opportunities attach to already drawn wards without changing their geometry or refunding their cost.
        for (const ward of this.wards) {
          const slot = this.availableMainSlot; if (slot === undefined) break;
          if (ward.mainSlot === undefined) { ward.mainSlot = slot; this.mainGifts.add(slot); }
        }
      }
      this.refreshMainPower(); this.mechanics.upgraded();
      this.events.emit('upgrade', { id }); this.setPhase('prepare');
      this.notice = reward.dormant ? `${reward.title}已记下 · ${reward.dormant}` : `${reward.title}${reward.boon ? '机缘已得' : '已生效'} · ${reward.detail}`; return;
    }
    const upgrade = upgrades.find(u => u.id === id); if (!upgrade) return;
    for (const modifier of upgrade.modifiers) this.stats.add({ ...modifier, id: `${modifier.id}:${this.wave}` });
    for (const effect of upgrade.formationEffects ?? []) this.formationEffects.add({ ...effect, id: `${effect.id}:${this.wave}` });
    this.health = Math.min(100, this.health + 15);
    this.events.emit('upgrade', { id }); this.setPhase('prepare');
    this.notice = '可以调整阵法，准备好后迎接下一波';
  }
  rerollRewards(): boolean { return this.phase === 'rest' && this.build.reroll(this.health); }
  continueRun(): void {
    if (this.phase !== 'won' || !this.build.active) return;
    this.continuing = true; this.setPhase(this.victoryHasReward ? 'rest' : 'prepare');
  }
  get victoryHasReward(): boolean { return this.wave > this.rewardedWave; }
  get canFinishRun(): boolean { return this.build.active && this.phase === 'prepare' && this.wave >= CAMPAIGN_WAVES; }
  finishRun(): void { if (this.canFinishRun) this.setPhase('won'); }

  private refreshMainPower(): void {
    for (const ward of [...this.wards, ...this.mechanics.spirits.flatMap(s => s.originWard ? [s.originWard] : [])]) {
      if (ward.mainSlot === undefined) continue;
      const ratio = ward.health / ward.maxHealth, p = ward.power;
      ward.power = calculateWardPower(ward.element, p.investment, p.area, p.perimeter, this.stats.value('concentration', 1, ward.element) * (ward.mainSlot === 1 ? B.array.twinPower : 1));
      ward.maxHealth = CONCENTRATION.wardHealth * (ward.element === 'earth' ? ward.power.multiplier : 1);
      ward.health = ward.maxHealth * ratio;
    }
  }
  moveMain(id: number, at: Point): boolean {
    if (this.ultimate.active) return false;
    const ward = this.wards.find(w => w.id === id && w.mainSlot !== undefined);
    const combat = this.phase === 'battle';
    if (!ward || this.phase !== 'prepare' && !(combat && this.build.has('living'))) return false;
    if (combat && this.spirit < B.array.moveCost) { this.warn(`迁阵需要 ${B.array.moveCost} 灵力`); return false; }
    const dx = at.x - ward.x, dz = at.z - ward.z;
    if (Math.hypot(dx, dz) < .2) return false;
    const points = ward.points.map(p => ({ x: p.x + dx, z: p.z + dz })); points.push(points[0]!);
    const plan = planWardPlacement(points, { phase: 'prepare', element: ward.element, energy: ward.power.investment, investment: ward.power.investment, efficiency: ward.power.efficiency, wards: this.wards.filter(w => w.id !== id) });
    if (!plan.ok || plan.clipped) { this.warn('此处无法完整容纳古阵，迁阵未消耗灵力'); return false; }
    if (combat && ward.element === 'earth') {
      const moved = { ...ward, ...plan.at, points: plan.points, regions: plan.regions, radius: plan.radius };
      if (this.wolves.some(wolf => wolf.action !== 'dead' && wolfWall(wolf, wolfProfile(wolf).radius, [moved]))) {
        this.warn('土墙落点被狼群占据，迁阵未消耗灵力'); return false;
      }
    }
    ward.x = plan.at.x; ward.z = plan.at.z; ward.points = plan.points; ward.regions = plan.regions; ward.radius = plan.radius;
    for (const spirit of this.mechanics.spirits) if (spirit.wardId === id) { spirit.x = ward.x; spirit.z = ward.z; }
    this.navigation.rebuild(CAMP, this.wards); this.events.emit('wardMoved', { ward });
    if (combat) {
      this.spirit -= B.array.moveCost;
      if(this.build.active)this.ledger.spent+=B.array.moveCost;
      this.mechanics.arrays.moved(ward);
      const origin: RogueHit = { kind: 'array', wardId: id, scale: ward.power.multiplier, noProc: true };
      for (const wolf of this.wolves) if (wolf.action !== 'dead' && this.wardAffects(wolf, ward)) this.hitRogue(wolf, B.array.moveDamage, ward.element, origin);
      this.mechanics.effect('shift', ward, ward.element, '活阵落地', ward.radius);
    }
    return true;
  }
  cycleSpirit(id: number): boolean {
    if (this.phase !== 'prepare' || !this.build.destiny) return false;
    const spirit = this.mechanics.spirits.find(s => s.id === id && s.wardId === undefined && !s.originWard); if (!spirit) return false;
    const roots = this.build.roots; spirit.element = roots[(roots.indexOf(spirit.element) + 1) % roots.length]!;
    this.build.revision++; return true;
  }

  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.ultimate.active) {
      if (this.phase !== 'battle') { this.ultimate.clear(); return; }
      this.ultimate.tick(dt, () => this.events.emit('ultimateClosing', undefined), strokes => {
        this.events.emit('ultimate', {stage:'release'});
        for (const stored of strokes) {
          const stroke = {...stored.stroke, width: (stored.stroke.width ?? COMBAT.strokeWidth) * ULTIMATE.width, effect: ULTIMATE.effect};
          const origin = this.build.active ? this.mechanics.beginCast(false, 0, stroke.investment, stroke.charge) : undefined;
          this.castRogueStroke(stroke, stored.element, origin);
          if (origin) this.mechanics.afterCast(stroke, stored.element, origin);
        }
        this.notice = this.mechanics.commands.stormOnly ? strokes.length ? `群灵齐发 · 已蓄 ${strokes.length} 笔，接敌后依次释放` : '停时结束 · 未蓄御令' : `万象齐发 · ${strokes.length} 笔 · 双倍效果`;
      });
      return;
    }
    if (this.phase === 'battle' && this.hitStop > 0) { const held = Math.min(dt, this.hitStop); this.hitStop -= held; dt -= held; if (dt <= 1e-8) return; }
    this.time += dt;
    for (const ward of this.wards) ward.age += dt;
    for (const companion of this.activeCompanions) companion.age += dt;
    if (this.phase !== 'battle') return;
    this.slayerCombo.tick(dt);
    this.slayerTechniques.tick(dt);
    this.recoverSpirit(dt);
    this.traces.tick(dt);
    this.waveEconomy.elapsed += dt;
    if (this.spirit < (this.combatStyle === 'slayer' ? BATTLE.blade.heavyCost : this.combatStyle === 'array' ? BATTLE.trace.cost : 7)) this.waveEconomy.starved += dt;
    if(this.build.active)for(const ward of new Set([...this.wards,...this.mechanics.spirits.flatMap(s=>s.originWard?[s.originWard]:[])]))this.consumeWard(ward,dt/ECONOMY.wardLifetime);
    for (const influence of [...this.wards, ...Object.values(this.naturalInfluences)]) {
      influence.empowered = Math.max(0, influence.empowered - dt); influence.suppressed = Math.max(0, influence.suppressed - dt);
      if (influence.empowered === 0) influence.edgeCharges = 0;
      if (influence.suppressed === 0) influence.charge = Math.min(1, influence.charge + dt / STEAM.reheatSeconds);
    }
    this.reactionEffects.tick(dt);
    this.enemyAbilities.tick(dt);
    this.assault.tick(dt, ticket => this.wolves.filter(w => w.action !== 'dead').length < ENCOUNTERS.aliveLimit && this.spawnWolf(ticket));
    for (const ward of this.wards) {
      if (ward.suppressed > 0) continue;
      ward.pulse = Math.max(0, ward.pulse - dt);
      if (ward.pulse > 0 || ward.health <= 0) continue;
      let targets = this.wolves.filter(w => w.action !== 'dead' && this.wardAffects(w, ward));
      if (ward.element === 'metal') targets = targets.sort((a, b) => a.hp - b.hp || a.id - b.id).slice(0, 1);
      if (!targets.length) continue;
      ward.pulse = Math.max(1 / 60, this.stats.value('cooldown', abilities[ward.element].interval, ward.element));
      this.events.emit('pulse', { ward, targets: targets.map(t => t.id) });
      for (const wolf of targets) {
        const d = distance(wolf, ward) || 1;
        const chained = this.damage(wolf, ward.mainSlot === undefined ? abilities[ward.element].damage : MAIN_ARRAY_DAMAGE[ward.element], ward.element, { x: (wolf.x - ward.x) / d, z: (wolf.z - ward.z) / d }, 0.45, true, this.wardStrength(ward), 1, 'ward', { kind: 'array', wardId: ward.id, sustained: true });
        if (!chained && ward.element === 'metal' && ward.empowered > 0 && (ward.edgeCharges ?? 0) >= 1 && this.reactionEffects.chain(wolf, wolf.id, abilities.metal.damage, this.wardStrength(ward) * REACTIONS.chainFraction, 'ward')) ward.edgeCharges = (ward.edgeCharges ?? 0) - 1;
      }
      if (ward.element === 'water' && ward.empowered > 0) this.reactionEffects.pull(ward, targets, Math.min(1, this.wardStrength(ward)) * 0.5);

      if(this.build.active)this.consumeWard(ward,ECONOMY.wardShotWear);
    }
    this.tickCompanions(dt);
    this.mechanics.tick(dt);
    for (const wolf of this.wolves) this.tickWolf(wolf, dt);
    separateWolves(this.wolves, this.wards);
    this.wolves = this.wolves.filter(w => w.action !== 'dead' || w.age < 2.1);
    if (this.health <= 0) { this.setPhase('lost'); return; }
    if (this.assault.finished && !this.wolves.some(w => w.action !== 'dead')) {
      this.replenishSpirit(ECONOMY.waveRecovery);
      this.setPhase(this.wave >= CAMPAIGN_WAVES && !this.continuing ? 'won' : 'rest');
    }
  }

  reset(): void {
    this.enemyAbilities.clear();
    this.ultimate.clear(true);
    for (const ward of [...this.wards]) this.removeWard(ward.id, 'reset');
    this.activeCompanions = []; this.formationEffects.clear();
    this.build.clear(); this.mechanics.clear(); this.mainGifts.clear(); this.continuing = false; this.castOrigin = undefined;
    this.rewardedWave = 0;
    this.openingDraft?.roll();
    this.wards = []; this.wolves = [];
    this.health = 100; this.wave = 0; this.kills = 0; this.time = 0; this.nextId = 1;
    this.assault = new WaveDirector(1);
    this.selected = 'fire'; this.stats.clear(); this.spirit = this.capacity; this.recovered = 0; this.recoveryTime = 0; this.navigation.rebuild(CAMP, []);
    for (const influence of Object.values(this.naturalInfluences)) { influence.empowered = 0; influence.suppressed = 0; influence.charge = 1; influence.edgeCharges = 0; }
    for (const source of Object.keys(this.combatTotals) as DamageSource[]) this.combatTotals[source] = 0;
    this.ledger.earned=0;this.ledger.spent=0;this.ledger.salvaged=0;
    this.reactionEffects.clear();
    this.notice = '五行共用灵力 · 在空地围一圈，首尾接近即可成阵';
    this.events.emit('reset', undefined); this.setPhase(this.options.roguelike ? 'destiny' : 'prepare');
  }

  private recoverSpirit(dt: number): void {
    const amount = Math.max(0, Math.min(this.capacity - this.spirit, this.regeneration * dt));
    this.spirit += amount; this.recovered += amount; this.recoveryTime += dt;
    this.waveEconomy.natural += amount;
    if (this.build.active) this.ledger.earned += amount;
    if (this.recoveryTime >= 1 && this.recovered > 0) {
      this.events.emit('spiritRecovered', { amount: this.recovered, at: MAGE, source: 'natural' });
      this.recovered = 0; this.recoveryTime = 0;
    }
  }

  private influencePower(influence: ElementInfluence): number { return influence.suppressed > 0 ? 0 : influence.empowered > 0 ? this.build.active ? B.tactics.empowerMultiplier : COMBAT.empowerMultiplier : 1; }
  private wardStrength(ward: Ward): number { return ward.power.multiplier * this.influencePower(ward); }
  private clearElementStatus(wolf: Wolf, element: Element): void {
    if (element === 'fire') { wolf.burning = 0; wolf.burnDps = 0; wolf.burnBaseDps = 0; }
    if (element === 'wood' && wolf.rooted > 0) { wolf.rooted = 0; wolf.rootImmunity = CONCENTRATION.rootImmunity; }
    if (element === 'water') { wolf.wet = 0; wolf.slowAmount = 0; }
    if (wolf.aura === element) { wolf.aura = null; wolf.auraTime = 0; }
  }

  evolveWard(id: number, spiritId: number): void {
    const ward = this.wards.find(w => w.id === id); if (!ward) return;
    this.removeWard(id, 'evolved');
    this.events.emit('wardEvolved', { ward, spiritId });
  }
  restoreEvolvedWard(ward: Ward): boolean {
    if(ward.health<=0)return false;
    if (this.wards.some(w => w.id === ward.id)) return false;
    if (this.wards.some(w => { const shared = sharedWardArea(ward, w); return shared / ward.power.area > .25 || shared / w.power.area > .25; })) return false;
    const plan = planWardPlacement([...ward.points, ward.points[0]!], { phase: 'prepare', element: ward.element, energy: ward.power.investment, investment: ward.power.investment, efficiency: ward.power.efficiency, wards: this.wards });
    if (!plan.ok || plan.clipped || ward.element === 'earth' && this.wolves.some(w => w.action !== 'dead' && wolfWall(w, wolfProfile(w).radius, [ward]))) return false;
    this.wards.push(ward); this.navigation.rebuild(CAMP, this.wards);
    this.events.emit('ward', { ward, area: ward.power.area, cost: 0, phase: this.phase }); return true;
  }
  private removeWard(id: number, reason: WardRemovalReason): void {
    const ward = this.wards.find(w => w.id === id); if (!ward) return;
    const removed = this.activeCompanions.filter(companion => companion.wardId === id);
    this.wards = this.wards.filter(w => w.id !== id);
    this.activeCompanions = this.activeCompanions.filter(companion => companion.wardId !== id);
    this.mechanics.wardRemoved(id);
    this.navigation.rebuild(CAMP, this.wards);
    for (const companion of removed) this.events.emit('companionRemoved', {
      id: companion.id, wardId: id, at: { x: companion.x, z: companion.z }, kind: companion.kind, reason,
    });
    this.events.emit('wardRemoved', { id, at: { x: ward.x, z: ward.z }, element: ward.element, reason });
  }

  private tickCompanions(dt: number): void {
    for (const companion of this.activeCompanions) {
      companion.targetId = null;
      const ward = this.wards.find(ward => ward.id === companion.wardId && ward.health > 0);
      if (!ward || ward.suppressed > 0) continue;
      companion.cooldown = Math.max(0, companion.cooldown - dt);
      let target: Wolf | undefined, nearest = this.stats.value('range', companion.attack.range, companion.element);
      for (const wolf of this.wolves) {
        if (wolf.action === 'dead') continue;
        const d = distance(wolf, companion);
        if (d <= nearest) { nearest = d; target = wolf; }
      }
      companion.targetId = target?.id ?? null;
      if (!target || companion.cooldown > 0) continue;
      companion.cooldown = Math.max(1 / 60, this.stats.value('cooldown', companion.attack.interval, companion.element));
      this.events.emit('companionAttack', { companion, targetId: target.id });
      const d = distance(target, companion) || 1;
      this.damage(target, companion.attack.damage, companion.element, { x: (target.x - companion.x) / d, z: (target.z - companion.z) / d }, 0.45, true, this.wardStrength(ward) * companion.powerShare, 1, 'companion');
    }
  }

  private spawnWolf(ticket: WaveSpawn): boolean {
    const entrance = ENTRANCES[ticket.entrance]!;
    const kind = ticket.kind, profile = WOLF_KINDS[kind];
    const spread = { x: entrance.x + ticket.spreadX, z: entrance.z + ticket.spreadZ };
    const at = wolfSpawn(spread, profile.radius, this.wolves, this.wards) ?? wolfSpawn(entrance, profile.radius, this.wolves, this.wards); if (!at) return false;
    const pressure = this.assault.plan, hp = pressure.health * profile.hp * ticket.healthScale * (ticket.affixes.includes('giant')?1.35:1);
    const dx=CAMP.x-at.x,dz=CAMP.z-at.z,length=Math.hypot(dx,dz)||1;
    const approach={x:at.x+dx*.55-dz/length*ticket.flank,z:at.z+dz*.55+dx/length*ticket.flank};
    this.wolves.push({ id: this.nextId++, kind, affixes:ticket.affixes, eliteSkill: ticket.eliteSkill, entrance: ticket.entrance, approach, ...at, hp, maxHp: hp, speed: pressure.speed * ticket.pace * profile.speed, heading: -Math.PI / 2, action: 'run', age: this.rng(), attack: 0.8, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: ticket.pack, routeAge: 0, waypoint: null });
    return true;
  }

  private tickWolf(wolf: Wolf, dt: number): void {
    wolf.age += dt;
    if (wolf.action === 'dead') return;
    tickAffixes(wolf,dt);
    tickReactionStatus(wolf, dt);
    wolf.hit = Math.max(0, wolf.hit - dt);
    wolf.auraTime = Math.max(0, wolf.auraTime - dt); if (wolf.auraTime === 0) wolf.aura = null;
    if (wolf.burning > 0) {
      const elapsed = Math.min(dt, wolf.burning);
      const beforeBurn = wolf.hp;
      this.recordDamage(wolf, elapsed * wolf.burnDps, 'fire', wolf.burnSource ?? 'ward', true);
      this.mechanics.arrays.feedHit(this.mechanics.burnOrigin(wolf), Math.max(0, beforeBurn - wolf.hp), wolf);
      this.settleDeath(wolf, 'fire', this.mechanics.burnOrigin(wolf));
      wolf.burning = Math.max(0, wolf.burning - dt);
      if (wolf.burning === 0) { wolf.burnDps = 0; wolf.burnBaseDps = 0; }
    }
    if (wolf.hp <= 0) return;
    this.tickCampfire(wolf, dt);
    if (wolf.hp <= 0) return;
    wolf.rootImmunity = Math.max(0, (wolf.rootImmunity ?? 0) - dt);
    const wasRooted = wolf.rooted > 0;
    wolf.rooted = Math.max(0, wolf.rooted - dt); wolf.wet = Math.max(0, wolf.wet - dt);
    if (wasRooted && wolf.rooted === 0) wolf.rootImmunity = CONCENTRATION.rootImmunity;
    if (wolf.wet === 0) wolf.slowAmount = 0;
    if (this.enemyAbilities.casting(wolf.id)) return;
    const intent = (this.behaviors.get(this.behaviorId) ?? directApproach).target(wolf, { camp: CAMP, wards: this.wards, wolves: this.wolves, time: this.time });
    tickWolfMotion(wolf, dt, this.navigation, this.wards, this.wolves, intent, wall => {
      this.events.emit('enemyBite', { at: { x: wolf.x, z: wolf.z }, king: wolf.kind === 'king' });
      const attackPower = affixAttack(wolf) * (1 - ((wolf.reactions?.weakened ?? 0) > 0 ? wolf.reactions!.weakness : 0));
      if (wall) { wall.health -= 12 * encounter(this.wave).attackMultiplier * wolfProfile(wolf).attack * attackPower * (1 - Math.max(wall.empowered > 0 ? REACTIONS.guardReduction : 0, this.mechanics.arrays.support.guards(wall) ? ARRAY_SUPPORT.guard : 0)); if (wall.health <= 0) this.removeWard(wall.id, 'destroyed'); }
      else { const amount = encounter(this.wave).campDamage * wolfProfile(wolf).attack * attackPower; this.health = Math.max(0, this.health - amount); this.events.emit('campHit', { amount }); }
    });
  }

  private tickCampfire(wolf: Wolf, dt: number): void {
    const dps = this.health > 0 ? CAMP_FIRE.burnDps * this.naturalPower('fire') : 0;
    // Camp heat is separate from elemental auras: it must not turn a rooting wood spell into fuel.
    if (dps > 0 && distance(wolf, CAMP) <= CAMP_FIRE.radius) {
      wolf.campBurning = dt + CAMP_FIRE.emberSeconds; wolf.campBurnDps = dps;
    }
    const remaining = wolf.campBurning ?? 0;
    if (remaining <= 0) return;
    this.recordDamage(wolf, Math.min(dt, remaining) * (wolf.campBurnDps ?? 0), 'fire', 'campfire', true);
    wolf.campBurning = Math.max(0, remaining - dt);
    if (wolf.campBurning === 0) wolf.campBurnDps = 0;
    this.settleDeath(wolf, 'fire', { kind: 'trigger', noProc: true });
  }

  hitRogue(wolf: Wolf, value: number, element: Element, origin: RogueHit): void {
    this.damage(wolf, value, element, { x: 0, z: 0 }, .45, true, 1, 1, origin.spiritId !== undefined ? 'companion' : origin.kind === 'array' ? 'ward' : 'spell', origin);
  }
  /** The pet delivers an elemental order at contact, using the existing reaction rules. */
  hitSummon(wolf: Wolf, value: number, element: Element, origin: RogueHit, investment: number): void {
    if (wolf.action === 'dead') return;
    const previous = this.castOrigin; this.castOrigin = origin;
    try {
      const aura = this.enemyAbilities.counterAura(wolf) ?? (wolf.burning > 0 && (element === 'water' || element === 'wood') ? 'fire'
        : wolf.rooted > 0 && (element === 'metal' || element === 'water') ? 'wood'
        : wolf.wet > 0 && (element === 'earth' || element === 'metal' || element === 'wood') ? 'water' : wolf.auraTime > 0 ? wolf.aura : null);
      const reaction = aura ? elementalReaction(element,aura) : null;
      const power = this.mechanics.damageMultiplier(wolf,element,'companion',origin);
      const request: ReactionRequest | undefined = reaction ? { reaction, at:{x:wolf.x,z:wolf.z}, focusId:wolf.id, power, effect:Math.min(1,investment), burning:wolf.burning, burnDps:wolf.burnDps, rooted:wolf.rooted } : undefined;
      if (reaction?.kind === 'overcome' && !origin.noProc) { this.enemyAbilities.interrupt(wolf.id,Math.min(investment,origin.ticket?.investment??investment)); this.clearElementStatus(wolf,reaction.to); }
      this.damage(wolf,value,element,{x:0,z:0},.5,true,1,1,'companion',origin,Math.min(1,investment));
      if (request && !origin.noProc) {
        this.events.emit('reaction',{...reaction!,at:request.at,targetId:wolf.id});
        this.reactionEffects.resolve([request]);
        const key = `${reaction!.from}:${reaction!.to}`;
        if (!origin.commandReactions?.has(key)) { origin.commandReactions?.add(key); this.mechanics.tactics.reactions([request],origin); }
      }
    } finally { this.castOrigin = previous; }
  }
  spreadEmber(wolf: Wolf, dps: number, seconds: number): void {
    if (wolf.action === 'dead' || dps <= 0 || seconds <= 0 || wolf.burning > 0 && wolf.burnDps > dps) return;
    wolf.burning = seconds; wolf.burnDps = dps; wolf.burnBaseDps = dps; wolf.burnSource = 'spell'; wolf.aura = 'fire'; wolf.auraTime = seconds;
    this.mechanics.noteBurn(wolf, { kind: 'trigger', noProc: true });
  }
  private damage(wolf: Wolf, value: number, element: Element, direction: Point, strength: number, applyStatus = true, multiplier = 1, statusMultiplier = 1, source: DamageSource = 'ward', origin: RogueHit | undefined = this.castOrigin, effect = 1): boolean {
    if (wolf.action === 'dead') return false;
    const wasWet = wolf.wet > 0;
    multiplier *= this.mechanics.damageMultiplier(wolf, element, source, origin);
    const openingPower = source === 'spell' ? this.slayerTechniques.openingPower(wolf.id, origin) : 1;
    multiplier *= openingPower;
    const directPower = multiplier;
    const damageSource = origin?.kind === 'mimic' && source === 'spell' ? 'companion' : source;
    // Flat and multiplicative upgrades are both diluted with the formation.
    const hpBefore = wolf.hp;
    this.recordDamage(wolf, (source === 'steam' ? value : this.stats.value('damage', value, origin?.ticket?.neutral ? undefined : element)) * multiplier, element, damageSource, false, openingPower > 1, origin?.returning, origin?.sustained, origin);
    this.mechanics.arrays.feedHit(origin, Math.max(0, hpBefore - Math.max(0, wolf.hp)), wolf);
    if (origin?.ticket?.neutral) wolf.hit = .14;
    if (applyStatus) {
      multiplier *= statusMultiplier;
      wolf.hit = 0.14;
      wolf.aura = element; wolf.auraTime = COMBAT.auraSeconds * effect;
      if (element === 'fire') {
        const incomingBase = this.stats.value('damage', origin?.spiritId !== undefined ? B.spirit.burnDps : source === 'spell' ? 3 : CONCENTRATION.burnDps, element) * multiplier / statusMultiplier;
        const base = statusMultiplier > 1 && wolf.burning > 0 ? Math.max(incomingBase, wolf.burnBaseDps || wolf.burnDps) : incomingBase;
        const dps = base * statusMultiplier;
        // A weaker effect must not refresh a stronger effect's remaining lifetime.
        if (wolf.burning <= 0 || dps >= wolf.burnDps) {
          const fueled = statusMultiplier > 1 && wolf.burning > 0;
          wolf.burning = fueled ? Math.max(wolf.burning, 1.2) : source === 'spell' ? 1.2 : CONCENTRATION.statusSeconds;
          if (!fueled || incomingBase >= wolf.burnBaseDps) { wolf.burnSource = damageSource; this.mechanics.noteBurn(wolf, origin); }
          wolf.burnDps = dps; wolf.burnBaseDps = base;
        }
      }
      if (element === 'wood') bindWolf(wolf, (source === 'spell' ? 0.6 : CONCENTRATION.rootSeconds) * multiplier, effect);
      if (element === 'water') {
        const slow = Math.min(CONCENTRATION.maxSlowAmount, (source === 'spell' ? 0.3 : CONCENTRATION.slowAmount) * multiplier / effect);
        if (wolf.wet <= 0 || slow >= wolf.slowAmount) { wolf.wet = Math.max(wolf.wet, (source === 'spell' ? 1.4 : CONCENTRATION.statusSeconds) * effect); wolf.slowAmount = slow; }
      }
      strength *= Math.min(CONCENTRATION.maxImpulseMultiplier, multiplier);
      if (source === 'spell' && (element === 'water' || element === 'earth')) { wolf.vx += direction.x * strength * 4; wolf.vz += direction.z * strength * 4; }
      this.events.emit('hit', { ...wolf, element, direction, strength, target: wolf.id, source: damageSource });
    }
    this.settleDeath(wolf, element, origin);
    this.mechanics.afterHit(wolf, element, origin, wasWet);
    const state = wolf.reactions;
    if (!origin?.noProc && !origin?.ticket?.neutral && element === 'metal' && state && state.edge > 0 && state.edgeCharges > 0 && this.reactionEffects.chain(wolf, wolf.id, value, directPower * state.edgePower, source)) { state.edgeCharges--; return true; }
    return false;
  }
  private reactionHit(wolf: Wolf, value: number, element: Element, multiplier: number, source: DamageSource): void {
    if (wolf.action === 'dead') return;
    this.recordDamage(wolf, this.stats.value('damage', value, element) * multiplier, element, source, false, false, false, source === 'ward');
    wolf.hit = 0.18;
    this.events.emit('hit', { x: wolf.x, z: wolf.z, element, direction: { x: 0, z: 0 }, strength: 0.5, target: wolf.id, source });
    this.settleDeath(wolf, element, this.castOrigin ? { ...this.castOrigin, noProc: true } : { kind: 'trigger', noProc: true });
  }
  damageWard(id: number, amount: number): void {
    const ward = this.wards.find(w => w.id === id); if (!ward || !Number.isFinite(amount) || amount <= 0) return;
    ward.health = Math.max(0, ward.health - amount * (1 - Math.max(ward.empowered > 0 ? REACTIONS.guardReduction : 0, this.mechanics.arrays.support.guards(ward) ? ARRAY_SUPPORT.guard : 0)));
    if (ward.health === 0) this.removeWard(id, 'destroyed');
  }
  private consumeWard(ward: Ward, fraction: number): void {
    if(ward.health<=0 || ward.mainSlot !== undefined)return;
    ward.health=Math.max(0,ward.health-ward.maxHealth*fraction);
    if(ward.health>0)return;
    if(this.wards.includes(ward))this.removeWard(ward.id,'destroyed');
    else {this.mechanics.wardRemoved(ward.id);this.events.emit('wardRemoved',{id:ward.id,at:ward,element:ward.element,reason:'destroyed'});}
    this.notice=`${abilities[ward.element].label}阵已耗尽 · 下次整备可补阵`;
  }
  private reactionTargets(): readonly Wolf[] {
    const spirit = this.castOrigin?.spiritId === undefined ? undefined : this.mechanics.spirits.find(s => s.id === this.castOrigin!.spiritId);
    return spirit ? this.wolves.filter(w => SpiritMovement.canHit(spirit, w, this.wards)) : this.wolves;
  }
  private recordDamage(wolf: Wolf, amount: number, element: Element, source: DamageSource, ongoing = false, opening = false, returning = false, sustained = false, origin?: RogueHit): void {
    // Settle damage-only tuning once; stored burn energy and control effects keep their original scale.
    if (source === 'ward' && (ongoing || sustained)) amount *= B.array.sustainDamageMultiplier;
    if (source === 'spell' && origin?.ticket?.neutral && this.enemyAbilities.armored(wolf) && (origin.ticket.charge ?? 0) < 2) {
      const guarded = true;
      if (guarded) opening = false;
      if (guarded && amount > 0) this.events.emit('slayerGuarded', { at: { x: wolf.x, z: wolf.z }, targetId: wolf.id, amount });
      amount *= 1 - BATTLE.blade.guardReduction;
    }
    const exposure = (wolf.reactions?.exposed ?? 0) > 0 ? wolf.reactions!.exposure : 0;
    const actual = Math.max(0, Math.min(wolf.hp, amount * (1 + exposure)));
    if (actual === 0) return;
    wolf.hp -= actual; wolf.recentDamage=3; this.combatTotals[source] += actual;
    this.events.emit('damage', { at: { x: wolf.x, z: wolf.z }, targetId: wolf.id, amount: actual, element, source, ongoing, ...(opening ? { opening: true } : {}), ...(returning ? { returning: true } : {}) });
  }
  private settleDeath(wolf: Wolf, element: Element, origin?: RogueHit): void {
    if (wolf.hp <= 0 && wolf.action !== 'dead') {
      landVault(wolf, this.wards, this.wolves); wolf.action = 'dead'; wolf.age = 0; this.kills++;
      if (this.build.active && !wolf.summoned) {
        // Settle income and this cast's finite refund together, before any death-triggered chain.
        const before = this.spirit;
        const income = Math.max(0, Math.min(BATTLE.mana.killCap - this.waveEconomy.kills, this.killSpirit * (wolf.kind === 'king' ? 5 : wolf.kind === 'elite' ? 3 : 1), this.capacity - this.spirit));
        this.waveEconomy.kills += income; this.replenishSpirit(income);
        const received = this.spirit - before;
        if (received > 0) this.events.emit('spiritRecovered', { amount: received, at: wolf });
      }
      this.events.emit('death', { wolf, element }); this.mechanics.afterDeath(wolf, element, origin);
      splitElite(this,wolf);
    }
  }
  wardAffects(wolf: Wolf, ward: Ward): boolean {
    return ward.element === 'earth' ? !!wolfWall(wolf, wolfProfile(wolf).radius + 0.25, [ward]) : wardContains(wolf, ward);
  }
  private setPhase(phase: Phase): void {
    const leavingBattle = this.phase === 'battle' && phase !== 'battle';
    this.phase = phase; this.hitStop = 0;
    if (phase === 'battle') for (const key of Object.keys(this.waveEconomy) as (keyof typeof this.waveEconomy)[]) this.waveEconomy[key] = 0;
    if (phase !== 'battle') this.traces.clear();
    this.slayerCombo.clear();
    this.slayerTechniques.clear();
    // Corpse age advances only during combat. Remove the whole outgoing wave
    // before notifying UI/reward listeners, or the last death frame freezes in layout.
    if (leavingBattle) this.wolves = [];
    if (phase !== 'battle') this.ultimate.clear();
    if (phase !== 'battle') this.reactionEffects.clear();
    if (phase !== 'battle') this.enemyAbilities.clear();
    if (phase !== 'battle') this.mechanics.endBattle();
    if (phase === 'rest' && this.build.active) this.build.rollOffers(this.health);
    if (phase !== 'battle') for (const companion of this.activeCompanions) companion.targetId = null;
    this.events.emit('phase', { phase });
  }
  private warn(message: string, cause?: unknown): void { this.notice = message; this.events.emit('warning', { message, cause }); }
}
