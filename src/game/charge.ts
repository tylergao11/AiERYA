import { COMBAT, type CombatStroke } from './combat';

export const CHARGE = {
  thresholds: [.25, .65, 1.05], extraInvestment: [0, .4, .9, 1.6],
  width: [1, 1.15, 1.4, 1.75], shake: [0, 3.2, 4.8, 6.5],
  hitStop: [0, .025, .045, .065], names: ['轻划', '蓄势', '重斩', '破军'],
} as const;
export type ChargeLevel = 0 | 1 | 2 | 3;
export interface ChargePreview { seconds: number; level: number; cost: number | null; width: number; limited: boolean; unaffordable?: boolean; holding?: boolean }
export function chargeLevel(seconds: number): ChargeLevel {
  return (Number.isFinite(seconds) ? CHARGE.thresholds.filter(t => seconds + 1e-8 >= t).length : 0) as ChargeLevel;
}
function chargeBudget(investment: number, seconds: number, unitCost: number, available: number, free: boolean) {
  const requested = chargeLevel(seconds);
  const price = (level: ChargeLevel) => free ? 0 : Math.round(unitCost * (investment + CHARGE.extraInvestment[level]) * 100) / 100;
  let level = requested;
  while (level > 0 && price(level) > available + 1e-8) level = (level - 1) as ChargeLevel;
  return { level, cost: price(level), limited: level < requested };
}
/** Before a line exists, show the best affordable tier of a minimum valid stroke.
 * Keep its price unknown: drawing farther can still lower that tier. */
export function previewCharge(quote: { cost: number; limited: boolean; stroke: CombatStroke } | null, seconds: number, unitCost: number, available: number, free = false): ChargePreview {
  const budget = quote ? { level: (quote.stroke.charge ?? 0) as ChargeLevel, cost: quote.cost, limited: quote.limited }
    : chargeBudget(COMBAT.minimumLength / COMBAT.unitLength, seconds, unitCost, available, free);
  return { seconds, level: budget.level, cost: quote?.cost ?? null, limited: budget.limited,
    width: quote?.stroke.width ?? COMBAT.strokeWidth * CHARGE.width[budget.level], unaffordable: budget.cost > available + 1e-8 };
}
/** Charge adds paid energy, never a free damage multiplier or a minimum-hit floor. */
export function chargedStroke(stroke: CombatStroke, seconds: number, unitCost: number, available: number, free = false) {
  const base = stroke.investment ?? 1, budget = chargeBudget(base, seconds, unitCost, available, free), level = budget.level;
  const investment = base + CHARGE.extraInvestment[level];
  return { cost: budget.cost, limited: budget.limited, stroke: { ...stroke, investment, charge: level,
    multiplier: stroke.multiplier * investment / base, width: (stroke.width ?? COMBAT.strokeWidth) * CHARGE.width[level] } };
}
