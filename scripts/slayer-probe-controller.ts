import { distance, type Point } from '../src/core/math';
import type { World } from '../src/game/world';
import type { Boon, Reward } from '../src/game/roguelike';
import type { Element } from '../src/game/contracts';
import { OVERCOMES } from '../src/game/combat';
import { ART, toArt } from '../src/render/projection';
const drawable = (p: Point) => { const a = toArt(p); return a.x >= 0 && a.x <= ART.width && a.y >= 0 && a.y <= ART.height; };

export const pairs: Record<string, readonly Boon[]> = { blades: ['three', 'scar'], pressure: ['three', 'debt'], scars: ['scar', 'debt'], blades_pet: ['three', 'mimic'], scars_pet: ['scar', 'twins'] };
export type Style = 'combo' | 'spam' | 'tiny';
export const inputProfiles = {
  precise: { scatter: 0, wrongAimChance: 0, wrongAimDistance: 0, gap: .14, holdMargin: 0 },
  imperfect: { scatter: .55, wrongAimChance: .1, wrongAimDistance: 3.2, gap: .26, holdMargin: .04 },
} as const;
export type InputProfile = keyof typeof inputProfiles;
export interface Gesture { points: Point[]; seconds: number; element: Element; ends: number; ultimate: boolean }
export function selectReward(w: World, route: string) {
  const score = (r: Reward) => r.id === 'awaken' || r.id === 'ascend' ? 100 : r.id === 'common-repair' && w.health < 60 ? 95
    : r.id === (route === 'blades' ? 'slayer-edge' : route === 'scars' ? 'slayer-focus' : 'slayer-return') ? 90
      : r.lane === 'slayer' ? 80 : r.id === 'common-spell' ? 70 : r.id === 'common-regen' ? 55 : r.lane === 'common' ? 35 : r.lane === 'root' || r.lane === 'reaction' ? 30 : 0;
  let offers = [...w.build.offers].sort((a, b) => score(b) - score(a));
  if (score(offers[0]!) < 60 && w.rerollRewards()) offers = [...w.build.offers].sort((a, b) => score(b) - score(a));
  return offers[0]!.id;
}
export function aim(w: World, style: Style, now: number, casts: number, input: InputProfile, controllerRandom: () => number): Gesture | null {
  const enemies = w.wolves.filter(e => e.action !== 'dead' && drawable(e) && distance(e, w.camp) < 24).sort((a, b) => distance(a, w.camp) - distance(b, w.camp));
  if (!enemies.length || w.ultimate.stage === 'release') return null;
  let target = enemies[0]!, element: Element = 'metal';
  if (style === 'combo') {
    const dangerous = enemies.find(e => w.enemyAbilities.counterAura(e) && (distance(e, w.camp) < 15 || w.enemyAbilities.casting(e.id)));
    if (dangerous) { target = dangerous; element = (Object.keys(OVERCOMES) as Element[]).find(e => OVERCOMES[e] === w.enemyAbilities.counterAura(target))!; }
    else if (target.burning > .4 && target.burnDps * target.burning > 12 && enemies.filter(e => distance(e, target) < 3.2).length >= 3) element = 'water';
    else if (enemies.filter(e => distance(e, target) < 3.2).length >= 3) element = 'fire';
  }
  const cluster = enemies.filter(e => distance(e, target) < 5);
  const available = w.spirit - w.mechanics.debtFloor;
  const heavy = style === 'combo' && !w.ultimate.active && available >= 8 && w.slayerCombo.momentum >= .5 && (cluster.length >= 4 || target.kind !== 'normal');
  const profile = inputProfiles[input];
  const seconds = heavy ? Math.max(.25, 1.2 - w.slayerTechniques.initiative) + profile.holdMargin : .24;
  const lead = { x: target.x + target.vx * seconds * .65, z: target.z + target.vz * seconds * .65 };
  let center = drawable(lead) ? lead : target;
  let angle = style === 'combo' && w.build.has('scar') ? (casts % 2) * Math.PI / 2 : 0;
  if (style === 'combo' && !w.build.has('scar') && cluster.length > 1) {
    const far = cluster.reduce((a, b) => distance(a, target) > distance(b, target) ? a : b); angle = Math.atan2(far.z - target.z, far.x - target.x);
  }
  if (input !== 'precise') {
    // A separate RNG never changes the wave/reward RNG. This is a sensitivity
    // experiment, not a claim to model real players or a gameplay aim assist.
    const wrongAim = controllerRandom() < profile.wrongAimChance;
    const offset = (controllerRandom() * 2 - 1) * profile.scatter + (wrongAim ? (controllerRandom() < .5 ? -1 : 1) * profile.wrongAimDistance : 0);
    center = { x: center.x - Math.sin(angle) * offset, z: center.z + Math.cos(angle) * offset };
  }
  let length = style === 'tiny' ? .4 : style === 'spam' ? 4 : w.ultimate.active || cluster.length >= 4 ? 8 : target.kind === 'normal' && cluster.length === 1 ? Math.max(.6, Math.min(4, target.hp / 48 * 4 + .1)) : 4;
  let points: Point[] = [];
  for (let n = 0; n < 6; n++) {
    points = [-.5, .5].map(k => ({ x: center.x + Math.cos(angle) * length * k, z: center.z + Math.sin(angle) * length * k }));
    if (points.every(drawable)) break; length *= .75;
  }
  if (!points.every(drawable)) return null;
  if (style === 'combo' && !w.ultimate.active) {
    // Follow the visible cost preview: shorten an unaffordable sweep instead of waiting to die.
    for (let n = 0; n < 5; n++) {
      const quote = w.quoteStroke(points, seconds);
      if (!quote || quote.cost <= available + 1e-8) break;
      length *= Math.min(.85, available / quote.cost * .98);
      if (length < .36) return null;
      points = [-.5, .5].map(k => ({ x: center.x + Math.cos(angle) * length * k, z: center.z + Math.sin(angle) * length * k }));
    }
  }
  return { points, seconds, element, ends: now + seconds, ultimate: w.ultimate.stage === 'drawing' };
}
