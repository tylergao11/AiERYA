import type { Point } from '../core/math';
import type { WolfKind, WolfMotion } from './wolves';
import type { WardShape } from './ward-geometry';
import type { ArrayEvent } from './array-momentum';

export const ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water'] as const;
export type Element = typeof ELEMENTS[number];
export type Phase = 'destiny' | 'prepare' | 'battle' | 'rest' | 'won' | 'lost';
export type Mode = 'ward' | 'invoke';
export type Stat = 'damage' | 'range' | 'cooldown' | 'regen' | 'capacity' | 'wardCost' | 'castCost' | 'concentration';
export interface Modifier { id: string; stat: Stat; element?: Element; multiply?: number; add?: number }
export interface NaturalSource extends Point { id: string; element: Element; title: string; radius: number }
export interface ElementInfluence { empowered: number; suppressed: number; charge: number; edgeCharges?: number }
export type DamageSource = 'ward' | 'companion' | 'spell' | 'steam' | 'reaction' | 'campfire';
export interface ReactionStatus { exposed: number; exposure: number; weakened: number; weakness: number; mired: number; mireSlow: number; edge: number; edgeCharges: number; edgePower: number }
export interface WardPower {
  readonly investment: number;
  readonly area: number;
  readonly perimeter: number;
  readonly measure: 'area' | 'perimeter';
  readonly effectiveSize: number;
  readonly efficiency: number;
  readonly concentration: number;
  readonly multiplier: number;
}
export interface Ward extends Point, ElementInfluence { id: number; element: Element; points: Point[]; regions?: Point[][][]; radius: number; age: number; charge: number; pulse: number; health: number; maxHealth: number; power: WardPower; mainSlot?: number; readonly paidCost?: number }
export type WardRemovalReason = 'undo' | 'dismissed' | 'destroyed' | 'reset' | 'evolved';
export interface CompanionAttack { readonly damage: number; readonly interval: number; readonly range: number }
/** A formation effect describes units; only the simulation creates and owns them. */
export interface WardCompanionSpawn {
  readonly kind: string;
  readonly attack: CompanionAttack;
  readonly at?: Readonly<Point>;
}
export interface WardCompanion extends Point {
  readonly id: number;
  readonly wardId: number;
  readonly effectId: string;
  readonly kind: string;
  readonly element: Element;
  readonly attack: CompanionAttack;
  readonly powerShare: number;
  age: number;
  cooldown: number;
  targetId: number | null;
}
export interface WardFormationContext {
  readonly ward: Readonly<Omit<Ward, 'points' | 'regions'>> & WardShape;
  readonly area: number;
  readonly cost: number;
  readonly phase: Phase;
  readonly wave: number;
}
export interface WardFormationEffect {
  readonly id: string;
  readonly element?: Element;
  /** Pure planning after placement validation, before committing energy or entities. */
  plan(context: WardFormationContext): readonly WardCompanionSpawn[];
}
export interface Wolf extends Point { id: number; kind?: WolfKind; motion?: WolfMotion; reactions?: ReactionStatus; hp: number; maxHp: number; speed: number; heading: number; action: 'run' | 'attack' | 'dead'; age: number; attack: number; hit: number; burning: number; burnDps: number; burnBaseDps: number; burnSource?: DamageSource; rootImmunity?: number; rooted: number; wet: number; slowAmount: number; aura: Element | null; auraTime: number; vx: number; vz: number; pack: number; routeAge: number; waypoint: Point | null }
export interface Hit extends Point { element: Element; direction: Point; strength: number; target?: number; source?: DamageSource }
export interface GameEvents {
  arrayEffect: ArrayEvent;
  summonOrder: { kind: 'focus' | 'move' | 'infuse' | 'union'; at: Point; element?: Element; points?: readonly Point[]; spiritIds: readonly number[]; pure?: boolean };
  summonReady: undefined;
  summonTechnique: { kind: 'pincer' | 'hunt' | 'furyReady' | 'fury' | 'seal' | 'echo'; at: Point; from: Point; element: Element; toElement?: Element; spiritId?: number; targetId?: number; partner?: { spiritId: number; at: Point; element: Element } };
  summonImpact: { at: Point; from: Point; spiritId?: number; targetId?: number; element: Element; radius: number; strength: number; union: boolean; echo: boolean };
  slayerStrike: { at: Point; direction?: Point; element: Element; level: number; hits: number; kills: number; guarded?: number; openings?: readonly Point[]; combo: number; tier: number; tierRaised?: boolean; burst: number; rush?: number; investment: number };
  slayerGuarded: { at: Point; targetId: number; amount: number };
  chargeReady: { level: number };
  slayerFinisher: { at: Point; direction?: Point; element: Element; hits?: number; guarded?: number };
  slayerReturn: { at: Point; element: Element; points: readonly Point[]; direction: Point; investment: number; hits: number; guarded: number; contacts: readonly Point[] };
  chargedStrike: { at: Point; element: Element; level: number; hits: number; kills: number; width: number };
  spiritAttack: { stage: 'windup' | 'launch' | 'impact'; spiritId: number; targetId: number; at: Point; to: Point; element: Element; style: 'melee' | 'ranged'; duration: number; heavy: boolean; ancestor?:boolean; empowered?: boolean; union?: boolean; echo?: boolean };
  spiritAbility: { kind: 'pierce' | 'fireburst' | 'stomp'; spiritId: number; at: Point; targets: Point[]; radius: number; stacks?: number };
  spiritTransition: { kind: 'awaken' | 'ascend' | 'ancestor' | 'evolve'; spiritId: number; at: Point; element: Element; ancestor: boolean; fromSize: number; toSize: number };
  spiritSpawn: { spiritId:number; at:Point; element:Element; ancestor:boolean; role:'main'|'twin'|'support'|'array' };
  beastFeast: { spiritId: number; targetId: number; at: Point; element: Element; marks: number; goal: number };
  spiritRestriction: { spiritId: number; at: Point; element: Element; state: 'silenced' | 'suppressed' | 'free' };
  /** Cosmetic foot contact from the distance-driven gait; never an attack or movement command. */
  spiritStep: { spiritId: number; at: Point; element: Element; ancestor: boolean; side: -1 | 1 };
  wardEvolved: { ward: Ward; spiritId: number };
  ultimate: { stage: 'start' | 'stroke' | 'release' };
  ultimateClosing: undefined;
  rogueEffect: { kind: 'burst' | 'beam' | 'root' | 'shift' | 'evolve'; at: Point; element: Element; label: string; radius: number; to?: Point };
  wardMoved: { ward: Ward };
  reactionEffect: { effect: 'spread' | 'guard' | 'chain' | 'vortex' | 'roots' | 'rupture' | 'mud' | 'expose' | 'cut'; at: Point; radius: number; targets: Point[] };
  damage: { at: Point; targetId: number; amount: number; element: Element; source: DamageSource; ongoing: boolean; opening?: boolean; returning?: boolean };
  steam: { at: Point; radius: number; targets: number[] };
  spiritRecovered: { amount: number; at: Point; source?: 'natural' };
  reaction: { kind: 'generate' | 'overcome' | 'resist'; from: Element; to: Element; result: Element; name: string; at: Point; targetId?: number; wardId?: number; sourceElement?: Element };
  ward: { ward: Ward; area: number; cost: number; phase: Phase };
  wardRemoved: { id: number; at: Point; element: Element; reason: WardRemovalReason };
  companionSpawned: { companion: Readonly<WardCompanion> };
  companionAttack: { companion: Readonly<WardCompanion>; targetId: number };
  companionRemoved: { id: number; wardId: number; at: Point; kind: string; reason: WardRemovalReason };
  pulse: { ward: Ward; targets: number[] };
  hit: Hit;
  death: { wolf: Wolf; element: Element };
  invoke: { points: Point[]; element: Element; source: Point; combo: boolean; width?: number; charge?: number };
  phase: { phase: Phase };
  warning: { message: string; cause?: unknown };
  campHit: { amount: number };
  campRepaired: { amount: number; cost: number };
  enemySkill: { stage: 'start' | 'release' | 'interrupt'; skill: 'call' | 'silence' | 'break' | 'hunt' | 'mend' | 'rush'; id: number; at: Point };
  enemyBite: { at: Point; king: boolean };
  enemySplit: { at: Point };
  upgrade: { id: string };
  reset: undefined;
}
export interface Wolf { summoned?: boolean; entrance?: 0 | 1 | 2; approach?: Point; eliteSkill?: 'call' | 'silence' | 'guard' | 'hunt' | 'mend' | 'rush'; affixes?: readonly import('./elite-affixes').EliteAffix[]; recentDamage?: number }
export interface Wolf { campBurning?: number; campBurnDps?: number }
export interface DecisionContext { camp: Point; wolves: readonly Wolf[]; wards: readonly Ward[]; time: number }
/** AI returns intent. Movement, damage and presentation remain separate responsibilities. */
export interface WolfBehavior { id: string; target(wolf: Readonly<Wolf>, context: DecisionContext): Point }
export interface UpgradeDefinition { id: string; title: string; detail: string; modifiers: readonly Modifier[]; formationEffects?: readonly WardFormationEffect[] }
export interface AbilityDefinition { id: Element; name: string; label: string; color: number; css: string; damage: number; interval: number; detail: string }
