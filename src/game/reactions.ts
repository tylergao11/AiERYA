import { distance, type Point } from '../core/math';
import type { EventBus } from '../core/events';
import type { DamageSource, Element, GameEvents, ReactionStatus, Wolf } from './contracts';
import { COMBAT, REACTION_MULTIPLIER, type ElementReaction } from './combat';
import { CONCENTRATION } from './concentration';
import { staggerWolf } from './wolf-motion';
import { wolfProfile } from './wolves';

export const REACTIONS = Object.freeze({ radius: 3.2, maxTargets: 6, spreadTargets: 2, spreadFraction: 0.5,
  spreadMultiplier: 1.35 * REACTION_MULTIPLIER,
  guardReduction: 0.35 * REACTION_MULTIPLIER, weakness: 0.3 * REACTION_MULTIPLIER, markSeconds: 4, chainCharges: 3, chainFraction: 0.5 * REACTION_MULTIPLIER,
  pullSpeed: 7, rootSeconds: 0.85 * REACTION_MULTIPLIER, ruptureDamage: 12 * REACTION_MULTIPLIER, mudSeconds: 4 * REACTION_MULTIPLIER, mudSlow: 0.65,
  exposure: 0.25 * REACTION_MULTIPLIER, maxExposure: 0.4 * REACTION_MULTIPLIER, meltDamage: 6 * REACTION_MULTIPLIER, cutDamage: 12 * REACTION_MULTIPLIER, cutPerRootSecond: 12 * REACTION_MULTIPLIER, splinterFraction: 0.4 });

export const REACTION_GUIDE = [
  ['木生火', '助燃蔓延', '强化火阵；把火种传给附近两只未燃烧的狼。'],
  ['火生土', '固土护阵', '修复土墙并减伤；震慑附近狼，降低其扑咬伤害。'],
  ['土生金', '凝锋连击', '给金阵储存三次连击；命中后追击附近另一只狼。'],
  ['金生水', '聚流漩涡', '把附近狼拉向交汇点，方便范围阵法集中输出。'],
  ['水生木', '滋养缠枝', '缠绕从交汇点蔓延到附近两只狼，接续留敌。'],
  ['木克土', '破土生根', '碎岩伤害并缠足；土阵反击暂歇，墙体仍阻挡。'],
  ['土克水', '截流泥沼', '消耗水势留下八秒泥沼，后来踏入的狼也会减速。'],
  ['水克火', '蒸汽爆炸', '消耗灼烧换一次范围爆炸，火阵可重新点燃。'],
  ['火克金', '熔金破防', '融出破绽，四秒内承受额外伤害，适合集火精英。'],
  ['金克木', '斩木碎裂', '消耗缠绕换重击，木屑溅射一只邻敌，提前结束束缚。'],
] as const;

export function reactionStatus(wolf: Wolf): ReactionStatus {
  return wolf.reactions ??= { exposed: 0, exposure: 0, weakened: 0, weakness: 0, mired: 0, mireSlow: 0, edge: 0, edgeCharges: 0, edgePower: 0 };
}
export function tickReactionStatus(wolf: Wolf, dt: number): void {
  const state = wolf.reactions; if (!state) return;
  for (const key of ['exposed', 'weakened', 'mired', 'edge'] as const) state[key] = Math.max(0, state[key] - dt);
  if (state.exposed === 0) state.exposure = 0;
  if (state.weakened === 0) state.weakness = 0;
  if (state.mired === 0) state.mireSlow = 0;
  if (state.edge === 0) { state.edgeCharges = 0; state.edgePower = 0; }
}
export function bindWolf(wolf: Wolf, seconds: number, effect = 1): boolean {
  if (wolf.action === 'dead' || wolf.rooted > 0 || (wolf.rootImmunity ?? 0) > 0) return false;
  wolf.rooted = Math.min(CONCENTRATION.maxRootSeconds * effect, seconds) * wolfProfile(wolf).control; return wolf.rooted > 0;
}
export interface ReactionRequest {
  reaction: ElementReaction; at: Point; power: number; focusId?: number; field?: boolean; chargedWard?: boolean;
  /** Snapshot before direct damage consumes or overwrites the source. */
  burning?: number; burnDps?: number; rooted?: number;
  sourceId?: string; effect?: number;
}
export interface MudZone { readonly id: number; readonly at: Readonly<Point>; readonly radius: number; readonly slow: number; remaining: number }
interface ReactionHost {
  wolves(): readonly Wolf[];
  fireDamage(value: number): number;
  hit(wolf: Wolf, damage: number, element: Element, power: number, source: DamageSource): void;
  burn?(wolf: Wolf): void;
}

/** Bounded follow-up effects. They never recursively invoke elemental reactions. */
export class ElementalReactions {
  private mud: MudZone[] = [];
  private nextId = 1;
  constructor(private readonly host: ReactionHost, private readonly events: EventBus<GameEvents>) {}
  get zones(): readonly Readonly<MudZone>[] { return this.mud; }
  clear(): void { this.mud = []; this.nextId = 1; }
  private nearby(at: Point, radius: number = REACTIONS.radius): Wolf[] {
    return this.host.wolves().filter(wolf => wolf.action !== 'dead' && distance(wolf, at) <= radius)
      .sort((a, b) => distance(a, at) - distance(b, at) || a.id - b.id);
  }
  private show(effect: GameEvents['reactionEffect']['effect'], at: Point, wolves: readonly Wolf[], radius: number = REACTIONS.radius): void {
    this.events.emit('reactionEffect', { effect, at: { ...at }, radius, targets: wolves.map(wolf => ({ x: wolf.x, z: wolf.z })) });
  }
  pull(at: Point, wolves: readonly Wolf[], power: number, strength = 1): void {
    for (const wolf of wolves) {
      const d = distance(wolf, at); if (d < 0.35) continue;
      const speed = Math.min(REACTIONS.pullSpeed, d * 5) * Math.min(1.5, power) * strength;
      // Replace, never accumulate. Actual displacement still obeys body collision and walls.
      wolf.vx = (at.x - wolf.x) / d * speed; wolf.vz = (at.z - wolf.z) / d * speed;
    }
  }
  chain(at: Point, primaryId: number, baseDamage: number, power: number, source: DamageSource): boolean {
    const target = this.nearby(at).find(wolf => wolf.id !== primaryId);
    if (!target) return false;
    this.host.hit(target, baseDamage, 'metal', power, source); this.show('chain', at, [target]); return true;
  }
  tick(dt: number): void {
    for (const zone of this.mud) {
      zone.remaining = Math.max(0, zone.remaining - dt);
      if (zone.remaining === 0) continue;
      for (const wolf of this.nearby(zone.at, zone.radius)) {
        const state = reactionStatus(wolf);
        if (state.mired <= 0) staggerWolf(wolf);
        if (state.mired <= 0 || zone.slow >= state.mireSlow) { state.mired = 0.35; state.mireSlow = zone.slow; }
      }
    }
    this.mud = this.mud.filter(zone => zone.remaining > 0);
  }
  resolve(requests: readonly ReactionRequest[]): void {
    // Distinct contacts all react; revisiting the same contact in one stroke does not repeat it.
    const unique = new Map<string, ReactionRequest>();
    for (const request of requests) {
      if (request.reaction.kind === 'resist' || !(request.power > 0)) continue;
      const key = `${request.reaction.from}:${request.reaction.to}:${request.sourceId ?? (request.focusId !== undefined ? `wolf:${request.focusId}` : `${request.at.x}:${request.at.z}`)}`, old = unique.get(key);
      if (!old || request.power > old.power || request.power === old.power && request.focusId !== undefined && old.focusId === undefined) unique.set(key, request);
    }
    const seen = new Set<string>(), focuses = new Set(requests.flatMap(r => r.focusId === undefined ? [] : [r.focusId]));
    for (const request of [...unique.values()].sort((a,b) => b.power-a.power || Number(b.focusId !== undefined)-Number(a.focusId !== undefined))) this.resolveOne(request,seen,focuses);
  }
  private resolveOne(request: ReactionRequest, seen: Set<string>, focuses: Set<number>): void {
    const { reaction, at, power } = request, effect = request.effect ?? 1;
    const key = (wolf: Wolf) => `${reaction.from}:${reaction.to}:${wolf.id}`;
    const targets = this.nearby(at).filter(wolf => !seen.has(key(wolf)));
    const mark = (wolves: readonly Wolf[]) => wolves.forEach(wolf => seen.add(key(wolf)));
    const focus = this.host.wolves().find(wolf => wolf.id === request.focusId);
    if (reaction.kind === 'generate') switch (reaction.from) {
      case 'wood': {
        const base = (request.burnDps ?? this.host.fireDamage(request.field ? CONCENTRATION.burnDps : 3)) * REACTIONS.spreadFraction * power;
        const spread = targets.filter(wolf => wolf.id !== request.focusId && wolf.burning <= 0).slice(0, REACTIONS.spreadTargets);
        for (const wolf of spread) { wolf.burning = 1.5; wolf.burnBaseDps = base; wolf.burnDps = base * REACTIONS.spreadMultiplier; wolf.burnSource = 'reaction'; wolf.aura = 'fire'; wolf.auraTime = COMBAT.auraSeconds; this.host.burn?.(wolf); }
        mark(spread);
        if (spread.length) this.show('spread', at, spread); break;
      }
      case 'fire': {
        for (const wolf of targets) { const state = reactionStatus(wolf); const amount = Math.min(1, REACTIONS.weakness * power / effect);
          if (state.weakened <= 0 || amount >= state.weakness) { state.weakened = Math.max(state.weakened, REACTIONS.markSeconds * effect); state.weakness = amount; } }
        mark(targets);
        this.show('guard', at, targets); break;
      }
      case 'earth': {
        const marked = request.chargedWard ? undefined : focus && focus.action !== 'dead' ? focus : targets[0];
        if (marked && !seen.has(key(marked))) { const state = reactionStatus(marked); state.edge = REACTIONS.markSeconds * effect; state.edgeCharges = REACTIONS.chainCharges * effect; state.edgePower = Math.min(1, power / effect) * REACTIONS.chainFraction; mark([marked]); }
        this.show('chain', at, []); break;
      }
      case 'metal': this.pull(at, targets, power, REACTION_MULTIPLIER); mark(targets); this.show('vortex', at, targets); break;
      case 'water': {
        const spread = targets.filter(wolf => wolf.id !== request.focusId && wolf.rooted <= 0 && (wolf.rootImmunity ?? 0) <= 0).slice(0, REACTIONS.spreadTargets);
        for (const wolf of spread) bindWolf(wolf, REACTIONS.rootSeconds * power, effect * REACTION_MULTIPLIER);
        mark(spread);
        if (spread.length) this.show('roots', at, spread); break;
      }
    }
    else switch (reaction.from) {
      case 'wood':
        for (const wolf of targets) { this.host.hit(wolf, REACTIONS.ruptureDamage, 'wood', power, 'reaction'); bindWolf(wolf, REACTIONS.rootSeconds * power, effect * REACTION_MULTIPLIER); }
        mark(targets);
        this.show('rupture', at, targets); break;
      case 'earth': {
        // Fixed visual/physical radius; concentration affects slowing, never free reach.
        const zone: MudZone = { id: this.nextId++, at: { ...at }, radius: REACTIONS.radius, slow: Math.min(0.8, REACTIONS.mudSlow * power / effect), remaining: REACTIONS.mudSeconds * effect };
        this.mud = this.mud.filter(old => distance(old.at, at) > zone.radius * 0.5);
        if (this.mud.length >= 128) this.mud.shift(); this.mud.push(zone);
        for (const wolf of targets) { wolf.wet = 0; wolf.slowAmount = 0; if (wolf.aura === 'water') { wolf.aura = null; wolf.auraTime = 0; } }
        this.show('mud', at, targets); break;
      }
      case 'fire':
        for (const wolf of targets) {
          this.host.hit(wolf, REACTIONS.meltDamage, 'fire', power, 'reaction');
          const state = reactionStatus(wolf), exposure = Math.min(REACTIONS.maxExposure, REACTIONS.exposure * power / effect);
          if (state.exposed <= 0 || exposure >= state.exposure) { state.exposed = Math.max(state.exposed, REACTIONS.markSeconds * effect); state.exposure = exposure; }
        }
        mark(targets);
        this.show('expose', at, targets); break;
      case 'metal': {
        const primary = focus ?? (request.field ? targets.find(wolf => wolf.rooted > 0) ?? targets[0] : undefined);
        if (!primary || seen.has(key(primary))) break;
        const roots = request.rooted ?? primary.rooted;
        if (!request.field && roots <= 0) break;
        primary.rooted = 0; primary.rootImmunity = CONCENTRATION.rootImmunity;
        if (primary.aura === 'wood') { primary.aura = null; primary.auraTime = 0; }
        const amount = REACTIONS.cutDamage + Math.min(CONCENTRATION.maxRootSeconds, roots) * REACTIONS.cutPerRootSecond;
        const secondary = this.nearby(primary).find(wolf => wolf.id !== primary.id && !focuses.has(wolf.id) && !seen.has(key(wolf)));
        this.host.hit(primary, amount, 'metal', power, 'reaction');
        if (secondary) this.host.hit(secondary, amount * REACTIONS.splinterFraction, 'wood', power, 'reaction');
        mark(secondary ? [primary, secondary] : [primary]);
        this.show('cut', primary, secondary ? [primary, secondary] : [primary]); break;
      }
      // Water/fire keeps its explicit burn-consumption and heat budget in the combat cast.
    }
  }
}
