import type { ElementInfluence } from '../game/contracts';

export type ElementState = 'normal' | 'weakened' | 'enhanced';
/** State identity comes from the simulation; concentration is a separate visual input. */
export function elementState(influence: Readonly<Pick<ElementInfluence, 'empowered' | 'suppressed'>>): ElementState {
  return influence.suppressed > 0 ? 'weakened' : influence.empowered > 0 ? 'enhanced' : 'normal';
}
export const STATE_MOTION: Readonly<Record<ElementState, number>> = { normal: 1, weakened: 0.24, enhanced: 1.55 };
