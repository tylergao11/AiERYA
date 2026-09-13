import type { GameEvents } from '../game/contracts';
import { COLORS, flame, glow, line, oval, shape } from './ink';
import { toArt, type Pixel } from './projection';
import { wardContours } from '../game/ward-geometry';
import { paintSpiritStrike } from './spirit-strike';
import { paintSpiritMaterial } from './spirit-material';

export type SpiritAttackArt = GameEvents['spiritAttack'] & { age: number; source: Pixel };

/** A travelling missile has no hit flash. Impact arrives on the actual damage event. */
export function paintSpiritAttack(c: CanvasRenderingContext2D, e: SpiritAttackArt, target?: Pixel): void {
  const to = target ?? toArt(e.to, .7), t = Math.min(1, e.age / Math.max(.01, e.duration)), color = COLORS[e.element];
  c.save();
  if(e.echo)c.globalAlpha*=.5;
  if (e.stage === 'windup') {
    c.globalAlpha *= Math.sin(t * Math.PI)*.85; const radius = 34 * (1 - t) + 8;
    if (e.style === 'ranged') {
      glow(c, e.source.x, e.source.y, radius, color, .3);
      const angle=Math.atan2(to.y-e.source.y,to.x-e.source.x);
      paintSpiritMaterial(c,e.element,0,e.source.x,e.source.y,25+t*32,18+t*22,angle,.85);
      for (let n = 0; n < 3; n++) { const a = n * 2.09 + t; line(c, [{ x: e.source.x + Math.cos(a) * radius, y: e.source.y + Math.sin(a) * radius * .6 }, { x: e.source.x + Math.cos(a) * (radius + 6), y: e.source.y + Math.sin(a) * (radius + 6) * .6 }], color, 1); }
    } else {
      // Antlers and claws pull back before contact; the anticipation has no hit flash.
      const pull=(1-t)*22,sign=Math.sign(to.x-e.source.x)||1;
      for(let n=0;n<3;n++)line(c,[{x:e.source.x-sign*(pull+n*7),y:e.source.y-13+n*10},{x:e.source.x-sign*(pull+14+n*7),y:e.source.y-22+n*10}],color,1.6);
    }
  } else if (e.stage === 'launch') paintSpiritStrike(c, e.source, to, e.element, e.age, false, 'flight', e.duration,e.union?1.65:e.empowered?1.22:1);
  else {
    const fade = Math.pow(1 - t, 1.5), p = toArt(e.to), impact = toArt(e.to, .5); c.globalAlpha *= fade;
    paintSpiritStrike(c,e.source,to,e.element,e.age,!!e.ancestor&&e.style==='melee','impact',e.duration);
    if (e.style === 'melee' && e.element === 'earth') {
      for (let i = 0; i < 7; i++) { const a = i * .898, r = 14 + t * 45, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * .4;
        line(c, [{ x: p.x + Math.cos(a) * 11, y: p.y + Math.sin(a) * 4 }, { x: x - Math.sin(a) * 4, y: y - 2 }, { x, y }], '#7d684c', 2 * fade);
        shape(c, [x-3,y,x,y-5-12*Math.sin(t*Math.PI),x+5,y-1,x+2,y+3], '#b7a27a', '#35413a', .7); }
      c.strokeStyle = '#c9b385'; c.lineWidth = 1.8 * fade; c.beginPath(); c.ellipse(p.x, p.y, 16 + t * 54, 5 + t * 17, 0, 0, Math.PI * 2); c.stroke();
    } else if (e.style === 'melee' && e.element === 'wood') {
      c.beginPath(); c.moveTo(impact.x - 29, impact.y + 8); c.quadraticCurveTo(impact.x - 3, impact.y - 24, impact.x + 22, impact.y + 5); c.strokeStyle = '#b2c491'; c.lineWidth = 4 * fade; c.stroke();
      for (let i = 0; i < 5; i++) { const a = i * 2.4, r = 9 + t * 24, x = impact.x + Math.cos(a) * r, y = impact.y + Math.sin(a) * r * .5; shape(c, [x,y,x+6,y-4,x+9,y+1,x+2,y+3], '#98a66d'); }
    }
    if (e.element === 'water') {
      c.strokeStyle = '#a6d4d5'; c.lineWidth = 1.6 * fade; c.beginPath(); c.ellipse(p.x, p.y, 8 + t * 35, 3 + t * 12, 0, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 7; i++) { const a = i * 2.4; oval(c, impact.x + Math.cos(a) * t * 29, impact.y + Math.sin(a) * t * 16 - Math.sin(t * Math.PI) * 12, 1.2, 2.2, '#c0dcdd'); }
    }
    if (e.element === 'fire') flame(c, impact.x, p.y, 21 * (1 - t) + 9, e.age * 2, e.spiritId);
  }
  c.restore();
}

export function paintEvolution(c: CanvasRenderingContext2D, event: GameEvents['wardEvolved'], age: number): void {
  const t = Math.min(1, age / .85), p = toArt(event.ward), fade = Math.sin(t * Math.PI), color = COLORS[event.ward.element];
  c.save(); c.globalAlpha = fade * .75;
  for (const contour of wardContours(event.ward)) {
    const pixels = contour.map(point => toArt(point)), gather = Math.pow(t, .65);
    const inward = (point: Pixel) => ({ x: point.x + (p.x - point.x) * gather, y: point.y + (p.y - point.y) * gather - Math.sin(t * Math.PI) * 25 });
    line(c, [...pixels, pixels[0]!].map(inward), color, 1.3);
    const stride = Math.max(1, Math.ceil(pixels.length / 20));
    for (let i = 0; i < pixels.length; i += stride) {
      const from = pixels[i]!, to = pixels[(i + stride) % pixels.length]!, count = Math.min(6, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 16));
      for (let n = 0; n < count; n++) {
        const q = n / count, point = { x: from.x + (to.x - from.x) * q, y: from.y + (to.y - from.y) * q }, at = inward(point);
        at.y -= Math.sin(t * Math.PI) * (8 + n * 3);
        line(c, [at, { x: at.x + (point.x - p.x) * .05 * (1 - t), y: at.y + 6 }], color, 1.4);
      }
    }
  }
  glow(c, p.x, p.y - 18, 50 + Math.sin(t * Math.PI) * 28, color, fade * .13);
  c.restore();
}
