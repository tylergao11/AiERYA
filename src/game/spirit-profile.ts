import type { RunSpirit } from './rogue-combat';
import { ROGUE } from './rogue-balance';

/** One contract for reach, locomotion, animation and the skill description. */
export function spiritProfile(spirit: Pick<RunSpirit, 'element' | 'size'>) {
  const beast = spirit.size >= 1.7;
  // User reconfirmed the mixed roles on 2026-09-13 after the all-melee conflict.
  // See docs/design/19-spirit-combat-and-ui.md; changing this changes game design.
  const ranged = !beast && (spirit.element === 'metal' || spirit.element === 'water' || spirit.element === 'fire');
  return { style: ranged ? 'ranged' as const : 'melee' as const,
    reach: ranged ? 7 : beast ? ROGUE.spirit.beastRange : ROGUE.spirit.meleeRange,
    windup: beast ? .18 : ranged ? .2 : .16, recovery: beast ? .28 : .22,
    projectileSpeed: 24, standOff: ranged ? 4.5 : 0 };
}
