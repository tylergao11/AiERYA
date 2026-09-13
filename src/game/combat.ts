import { area, distance, inside, interiorPoint, resample, segmentDistance, type Point } from '../core/math';
import type { Element } from './contracts';
import { normalizeLoop } from './strokes';
import { wardContains, wardContours, type WardShape } from './ward-geometry';

export const REACTION_MULTIPLIER = 2;
/** Amplify the elemental bonus or penalty without multiplying the ordinary attack. */
export const reactionBonus = (multiplier: number): number => 1 + (multiplier - 1) * REACTION_MULTIPLIER;
export const COMBAT = Object.freeze({ capacity: 100, regeneration: 1, spellCost: 4,
  strokeWidth: 1.5, minimumLength: .35, unitLength: 4, maxInvestment: 8, referenceLength: 16, referenceArea: 16, auraSeconds: 5, empowerSeconds: 4, empowerMultiplier: reactionBonus(1.35),
  suppressSeconds: 2 * REACTION_MULTIPLIER, generationDamage: reactionBonus(1.5), overcomingBonus: 0.75 * REACTION_MULTIPLIER, resistedDamage: reactionBonus(0.65) });
/** Active strokes intervene in a defense; their budget is independent of ward attacks. */
export const SPELLS: Readonly<Record<Element, { damage: number; falloff: number }>> = Object.freeze({
  metal: { damage: 11, falloff: 0.5 },
  wood: { damage: 1.4, falloff: 1 },
  water: { damage: 1.4, falloff: 1 },
  fire: { damage: 2.8, falloff: 1 },
  earth: { damage: 3.5, falloff: 1 },
});
export const STEAM = Object.freeze({ radius: 3.2, wardDamage: 28, naturalDamage: 16, burnBaseDamage: 8, reheatSeconds: 4, minimumHeat: 0.5 });
export const GENERATES: Readonly<Record<Element, Element>> = Object.freeze({ wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' });
export const OVERCOMES: Readonly<Record<Element, Element>> = Object.freeze({ wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' });
export const GENERATION_NAMES: Readonly<Record<Element, string>> = Object.freeze({ wood: '助燃', fire: '固土', earth: '凝锋', metal: '聚流', water: '滋养' });
export const OVERCOMING_NAMES: Readonly<Record<Element, string>> = Object.freeze({ wood: '破土', earth: '截流', water: '蒸汽冲击', fire: '熔金', metal: '斩木' });
export interface ElementReaction {
  kind: 'generate' | 'overcome' | 'resist';
  from: Element; to: Element; result: Element; name: string;
}
/** Incoming element acts on an existing element. Generation always strengthens its receiver. */
export function elementalReaction(incoming: Element, existing: Element): ElementReaction | null {
  if (GENERATES[incoming] === existing) return { kind: 'generate', from: incoming, to: existing, result: existing, name: GENERATION_NAMES[incoming] };
  if (GENERATES[existing] === incoming) return { kind: 'generate', from: existing, to: incoming, result: incoming, name: GENERATION_NAMES[existing] };
  if (OVERCOMES[incoming] === existing) return { kind: 'overcome', from: incoming, to: existing, result: incoming, name: OVERCOMING_NAMES[incoming] };
  if (OVERCOMES[existing] === incoming) return { kind: 'resist', from: existing, to: incoming, result: existing, name: '受克削弱' };
  return null;
}
export interface CombatStroke { points: Point[]; loop: Point[] | null; direction: Point; multiplier: number; investment?: number; charge?: number; burst?: number; rush?: number; width?: number; effect?: number }

export function planCombatStroke(input: readonly Point[]): CombatStroke | null {
  if (input.length < 2 || input.length > 1201 || input.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > 50 || Math.abs(p.z) > 50)) return null;
  const length = input.slice(1).reduce((sum, p, i) => sum + distance(p, input[i]!), 0);
  if (length < COMBAT.minimumLength) return null;
  const loop = normalizeLoop(input);
  const geometry = loop ? [...loop, loop[0]!] : input;
  const points = resample(geometry, 0.35); points.push({ ...geometry.at(-1)! });
  // Even a circle has a useful final stroke direction, instead of a zero push vector.
  const previous = input.slice(0, -1).reverse().find(p => distance(p, input.at(-1)!) > 0.1) ?? input[0]!;
  const direction = { x: input.at(-1)!.x - previous.x, z: input.at(-1)!.z - previous.z };
  const d = Math.hypot(direction.x, direction.z) || 1; direction.x /= d; direction.z /= d;
  // Only the actual hand-drawn distance invests energy; auto-closing adds none.
  const investment = Math.min(COMBAT.maxInvestment, length / COMBAT.unitLength);
  const density = loop ? COMBAT.referenceArea / Math.max(COMBAT.referenceArea, area(loop)) : COMBAT.referenceLength / Math.max(COMBAT.referenceLength, length);
  return { points, loop, direction, investment, multiplier: investment * density };
}

export function strokeTouches(point: Point, stroke: CombatStroke): boolean {
  return !!stroke.loop && inside(point, stroke.loop)
    || stroke.points.some((p, i) => i > 0 && segmentDistance(point, stroke.points[i - 1]!, p) <= (stroke.width ?? COMBAT.strokeWidth));
}

/** The brush has thickness even when it only grazes a long formation edge. */
export function strokeWardContact(stroke: CombatStroke, ward: WardShape): Point | null {
  const contours = wardContours(ward), width = stroke.width ?? COMBAT.strokeWidth, center = interiorPoint(ward.points);
  return stroke.points.filter(p => wardContains(p, ward) || contours.some(ring => ring.some((a,i) => segmentDistance(p,a,ring[(i+1)%ring.length]!) <= width)))
    .sort((a,b) => distance(a,center)-distance(b,center))[0]
    ?? contours.flat().find(p => strokeTouches(p,stroke)) ?? null;
}
