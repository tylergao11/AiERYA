import type { Element, WardPower } from './contracts';

/** One tuning point for the concentration model; geometry uses world units. */
export const CONCENTRATION = Object.freeze({
  defaultInvestment: 8,
  referenceSize: 36,
  referenceWallLength: 24,
  minimumArea: 9,
  minimumWallLength: 6,
  minimumDrawingArea: 0.01,
  wardHealth: 120,
  burnDps: 8,
  rootSeconds: 1.1,
  maxRootSeconds: 1.5,
  rootImmunity: 0.6,
  slowAmount: 0.6,
  maxSlowAmount: 0.8,
  statusSeconds: 2.5,
  maxImpulseMultiplier: 2,
});

export function calculateWardPower(element: Element, investment: number, area: number, perimeter: number, efficiency = 1): WardPower {
  if (![investment, area, perimeter, efficiency].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Ward concentration requires finite positive investment, geometry and efficiency');
  }
  const measure = element === 'earth' ? 'perimeter' : 'area';
  const effectiveSize = measure === 'perimeter' ? Math.max(CONCENTRATION.minimumWallLength, perimeter) : Math.max(CONCENTRATION.minimumArea, area);
  const concentration = investment * efficiency / effectiveSize;
  return Object.freeze({ investment, area, perimeter, measure, effectiveSize, efficiency, concentration,
    multiplier: concentration / (CONCENTRATION.defaultInvestment / (measure === 'perimeter' ? CONCENTRATION.referenceWallLength : CONCENTRATION.referenceSize)) });
}
