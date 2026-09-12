import type { Point } from '../core/math';

export const ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water'] as const;
export type Element = typeof ELEMENTS[number];
export type Phase = 'prepare' | 'battle' | 'rest' | 'won' | 'lost';
export type Mode = 'ward' | 'invoke';
export type Stat = 'damage' | 'range' | 'cooldown' | 'gather' | 'capacity' | 'wardCost';
export interface Modifier { id: string; stat: Stat; element?: Element; multiply?: number; add?: number }
export interface Resource extends Point { id: string; element: Element; title: string; radius: number; cooldown: number }
export interface Ward extends Point { id: number; element: Element; points: Point[]; radius: number; age: number; charge: number; pulse: number; health: number }
export interface Wolf extends Point { id: number; hp: number; maxHp: number; speed: number; heading: number; action: 'run' | 'attack' | 'dead'; age: number; attack: number; hit: number; burning: number; rooted: number; wet: number; vx: number; vz: number; pack: number; routeAge: number; waypoint: Point | null }
export interface Hit extends Point { element: Element; direction: Point; strength: number; target?: number }
export interface GameEvents {
  gather: { resource: Resource; amount: number };
  ward: { ward: Ward };
  wardRemoved: { id: number; at: Point; element: Element };
  pulse: { ward: Ward; targets: number[] };
  hit: Hit;
  death: { wolf: Wolf; element: Element };
  invoke: { points: Point[]; element: Element; source: Point; combo: boolean };
  phase: { phase: Phase };
  warning: { message: string };
  campHit: { amount: number };
  upgrade: { id: string };
  reset: undefined;
}
export interface DecisionContext { camp: Point; wolves: readonly Wolf[]; wards: readonly Ward[]; time: number }
/** AI returns intent. Movement, damage and presentation remain separate responsibilities. */
export interface WolfBehavior { id: string; target(wolf: Readonly<Wolf>, context: DecisionContext): Point }
export interface UpgradeDefinition { id: string; title: string; detail: string; modifiers: readonly Modifier[] }
export interface AbilityDefinition { id: Element; name: string; label: string; color: number; css: string; damage: number; interval: number; detail: string }
