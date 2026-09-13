import { clamp } from '../core/math';
import type { Element, GameEvents } from '../game/contracts';
import { COLORS, flame, line, oval, shape } from './ink';
import { ART, toArt } from './projection';
import { paintSpiritMaterial } from './spirit-material';

export type SummonImpactArt = GameEvents['summonImpact'] & { age: number; melee: boolean; ancestor: boolean; accent?: boolean };
const DURATION: Record<Element, number> = { metal: .54, wood: .78, water: .82, fire: .86, earth: .76 };
export const summonImpactSeconds = (e: Pick<SummonImpactArt, 'union' | 'element' | 'echo' | 'accent'>) => e.accent ? .28 : e.echo ? .36 : e.union ? DURATION[e.element] : .48;

/** Separate contact, material movement and settling; these clocks never inflict damage. */
export function summonUnionFrame(element: Element, age: number) {
  const t = clamp(age / DURATION[element], 0, 1), open = 1 - (1 - clamp(age / .14, 0, 1)) ** 3;
  const settle = clamp((age - .2) / (DURATION[element] - .2), 0, 1);
  const opacity = element === 'fire' ? 1 - clamp((age - .18) / .35, 0, 1)
    : element === 'metal' ? 1 - clamp((age - .1) / .27, 0, 1)
    : (1 - settle) ** 1.3;
  return { t, open, settle, opacity,
    width: element === 'water' ? (.63 + open * .37) * (1 - settle * .33)
      : element === 'wood' ? (.68 + open * .32) * (1 - settle * .14) : .58 + open * .42,
    height: element === 'earth' ? (.38 + open * .62) * (1 - settle * .35)
      : element === 'wood' ? .35 + open * .65 : element === 'fire' ? .48 + open * .52 + settle * .12 : .5 + open * .5,
  };
}

export function paintSummonUnion(c: CanvasRenderingContext2D, e: SummonImpactArt, ground: boolean): void {
  if (!e.union || e.echo || e.accent || e.age >= summonImpactSeconds(e)) return;
  const p = toArt(e.at), from = toArt(e.from), f = summonUnionFrame(e.element, e.age), color = COLORS[e.element];
  const width = Math.min(e.melee ? 204 : 238, Math.max(140, e.radius * ART.unitX * 2.35));
  const angle = Math.atan2(p.y - from.y, p.x - from.x);
  c.save(); c.translate(p.x, p.y); c.globalAlpha *= Math.min(1, e.strength) * (e.echo ? .4 : 1);
  if (ground) {
    if (e.element !== 'metal') {
      // The low layer goes below wolves so the affected target keeps its silhouette.
      paintSpiritMaterial(c, e.element, 1, 0, 0, width * (.65 + f.open * .5), width * .27, 0, (1 - f.t) * .28);
      if (e.element === 'earth' || e.ancestor) for (let n = 0; n < 6; n++) {
        const a = n * 2.399, r = width * (.1 + f.open * .28), x = Math.cos(a) * r, y = Math.sin(a) * r * .32;
        c.save(); c.globalAlpha *= (1 - f.t) * .65;
        line(c, [{ x: Math.cos(a) * 9, y: Math.sin(a) * 4 }, { x: x * .55 + 3, y: y * .55 - 2 }, { x, y }], '#4f493a', 2); c.restore();
      }
    }
    // The large crest belongs behind silhouettes; contact sparks and claws stay in front.
    if (f.opacity > 0) paintSpiritMaterial(c, e.element, 2, 0, -25 - (e.element === 'fire' ? f.settle * 19 : 0),
      width * f.width, width * (e.element === 'metal' ? .57 : .85) * f.height,
      e.element === 'metal' ? angle * .35 + (f.open - .5) * .26 : e.element === 'water' ? -.07 + f.settle * .14 : 0, f.opacity * .86);
    c.restore(); return;
  }
  if (e.element === 'metal') {
    for (let n = 0; n < 3; n++) {
      const u = clamp((e.age - n * .045) / .19, 0, 1); if (u <= 0 || u >= 1) continue;
      c.save(); c.rotate(angle - .48 + n * .42); c.globalAlpha *= (1 - u) * .8;
      const reach = width * (.24 + u * .43);
      shape(c, [-reach * .65, -4, reach, -1, reach * .2, 3, -reach * .4, 5], n === 1 ? '#f3e2bb' : '#c4b487', '#655e43', .6); c.restore();
    }
  }
  for (let n = 0; n < 10; n++) {
    const a = n * 2.399, inward = e.element === 'water', r = width * (inward ? .4 - f.t * .32 : .08 + f.t * .38);
    const x = Math.cos(a + (inward ? f.t * 1.8 : 0)) * r, floor = Math.sin(a) * r * .35;
    const lift = Math.sin(f.t * Math.PI) * (e.element === 'fire' ? 32 : 15 + n % 3 * 9), y = floor - lift;
    c.save(); c.globalAlpha *= (1 - f.t) ** .8 * .76;
    if (e.element === 'fire') {
      if (n < 3 && e.age > .18) flame(c, x * .66, floor - 3, 19 * (1 - f.t), e.age + .73, n * 13 + (e.spiritId ?? 0));
      shape(c, [x, y - 3, x + 2, y, x, y + 3, x - 1.4, y], n % 2 ? '#dfa355' : '#bc6538', '#704529', .4);
    } else if (e.element === 'water') {
      oval(c, x, y - 4, 1.4 + (1 - f.t), 3 * (1 - f.t) + 1, '#abd5d1');
    } else if (e.element === 'wood') {
      c.translate(x, y); c.rotate(a + f.t * 2);
      shape(c, [-4, 0, 0, -3, 6, 0, 1, 2], n % 2 ? '#abc582' : '#718f58', '#40513b', .5);
    } else if (e.element === 'earth') {
      oval(c, x, floor + 3, 4, 1.3, '#28302a55');
      shape(c, [x - 4, y, x - 2, y - 6, x + 4, y - 3, x + 3, y + 3], n % 2 ? '#aa9871' : '#c3b38e', '#514b39', .8);
    } else line(c, [{ x, y }, { x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 4 }], color, 1.5);
    c.restore();
  }
  c.restore();
  paintSummonClaws(c, e);
}

/** Claws belong to the beast, including a light contact behind a teammate's crest. */
export function paintSummonClaws(c: CanvasRenderingContext2D, e: SummonImpactArt): void {
  if (!e.ancestor || e.echo || e.age >= .3) return;
  const p = toArt(e.at), from = toArt(e.from), t = clamp(e.age / .3, 0, 1);
  c.save(); c.translate(p.x, p.y); c.scale(Math.sign(p.x - from.x) || 1, 1);
  c.globalAlpha *= (1 - t) ** .7 * Math.min(1, e.strength) * (e.accent ? .72 : 1);
  for (let n = -1; n <= 1; n++) {
    c.beginPath(); c.moveTo(-42 + n * 13, -58); c.bezierCurveTo(-34 + n * 13, -26, 6 + n * 13, 4, 37 + n * 13, 14);
    c.strokeStyle = '#26302bd9'; c.lineWidth = 9; c.stroke(); c.strokeStyle = '#dfcba4'; c.lineWidth = 3.3; c.stroke();
  }
  c.restore();
}
