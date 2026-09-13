import { clamp } from '../core/math';
import type { GameEvents } from '../game/contracts';
import { COLORS, glow, line, oval, shape } from './ink';
import { paintSpiritMaterial } from './spirit-material';

export type SpiritTransition = GameEvents['spiritTransition'] & { age: number };
export const SPIRIT_TRANSITION_SECONDS = 1.18;
export function spiritTransitionFrame(age: number) {
  const grow = clamp((age - .2) / .38, 0, 1);
  return {
    growth: grow * grow * (3 - 2 * grow),
    flash: Math.max(0, 1 - Math.abs(age - .32) / .12) * .34,
    fade: clamp((SPIRIT_TRANSITION_SECONDS - age) / .55, 0, 1),
  };
}

/** The gathering stays behind the painted body; only fragments cross its feet. */
export function paintSpiritTransition(c: CanvasRenderingContext2D, e: SpiritTransition, front: boolean): void {
  const { age, element, ancestor } = e, frame = spiritTransitionFrame(age), color = COLORS[element];
  const gather = clamp(age / .32, 0, 1), release = clamp((age - .28) / .7, 0, 1), width = ancestor ? 115 : 79;
  c.save();
  if (!front) {
    glow(c, 0, -48, width * 1.15, color, Math.sin(gather * Math.PI / 2) * frame.fade * .13);
    // A low material fan, not a permanent circular field or a damage telegraph.
    if (release > 0) paintSpiritMaterial(c, element, 1, 0, -13, width * (1.2 + release), 48 + release * 35, 0, frame.fade * .5);
    if (age < .34) for (let n = 0; n < 10; n++) {
      const a = n * 2.399, r = width * (1.05 - gather * .7), x = Math.cos(a) * r, y = Math.sin(a) * r * .35;
      c.globalAlpha = Math.sin(gather * Math.PI) * .68;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x * .58, y - 42, x * .24, -45 - gather * 20);
      c.lineWidth = n % 3 === 0 ? 2 : 1; c.strokeStyle = color; c.stroke();
    }
  } else if (release > 0) {
    for (let n = 0; n < 9; n++) {
      const a = n * 2.399, r = width * (.2 + release * .82), x = Math.cos(a) * r;
      const lift = Math.sin(release * Math.PI) * (14 + n % 3 * 8), y = Math.sin(a) * r * .24 - lift;
      c.globalAlpha = frame.fade * (n % 2 ? .43 : .68);
      if (ancestor || element === 'earth') {
        oval(c, x, Math.sin(a) * r * .24 + 2, 4, 1.5, '#0c171755');
        shape(c, [x - 3, y, x, y - 7, x + 4, y - 2, x + 2, y + 3], '#b6aa84', '#605944', .7);
      } else line(c, [{ x, y }, { x: x + Math.cos(a) * 3, y: y - 8 }], color, n % 3 ? 1.3 : 2);
    }
  }
  c.restore();
}
