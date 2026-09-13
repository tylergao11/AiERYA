import { CHARGE, type ChargePreview } from '../game/charge';
import type { Element } from '../game/contracts';
import { COLORS, line } from './ink';
import { clamp } from '../core/math';
import type { Pixel, ViewportRect } from './projection';
import { blade } from './slayer-blade';

/** A bounded ink ring and twelve converging sparks, anchored to the player's brush. */
export function strokeCaptionOffset(textWidth: number, preferredY: number, bounds?: ViewportRect): Pixel {
  if (!bounds) return { x: 0, y: preferredY };
  const half = Math.min(textWidth / 2 + 5, bounds.width / 2);
  return { x: clamp(0, bounds.x + half, bounds.x + bounds.width - half), y: clamp(preferredY, bounds.y + 18, bounds.y + bounds.height - 6) };
}

export function paintCharge(c: CanvasRenderingContext2D, at: Pixel, charge: ChargePreview, element: Element, scale: number, motionTime = charge.seconds, reduced = false, captionBounds?: ViewportRect): void {
  const usableSeconds = charge.unaffordable ? 0 : charge.limited ? Math.min(charge.seconds, CHARGE.thresholds[charge.level - 1] ?? 0) : charge.seconds;
  const progress = Math.min(1, usableSeconds / CHARGE.thresholds[2]);
  const r = 17 + progress * 8, color = charge.unaffordable || charge.limited ? '#ce977c' : COLORS[element];
  c.save(); c.translate(at.x, at.y); c.scale(1 / scale, 1 / scale);
  if (charge.level >= 2) {
    c.save(); c.globalAlpha = charge.level === 3 ? .85 : .5;
    for (let i = 0; i < 3; i++) {
      c.save(); c.rotate(i * Math.PI * 2 / 3 + (reduced ? 0 : motionTime * .65));
      c.translate(0, -r - 7); c.rotate(-.25); blade(c, 25 + charge.level * 5, 4, color); c.restore();
    }
    c.restore();
  }
  c.strokeStyle = '#10201dd0'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 3; i++) {
    const start = -Math.PI / 2 + i * Math.PI * 2 / 3 + .09;
    c.strokeStyle = charge.level > i ? '#ffebae' : color;
    c.globalAlpha = charge.level > i ? .95 : .35; c.lineWidth = charge.level > i ? 3 : 1.5;
    c.beginPath(); c.arc(0, 0, r, start, start + Math.PI * 2 / 3 - .18); c.stroke();
  }
  c.globalAlpha = .8; c.strokeStyle = '#fff2c3'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); c.stroke();
  for (let i = 0; i < (reduced ? 0 : 12); i++) {
    const t = (motionTime * (1.4 + progress) + i / 12) % 1, a = i * 2.399, outer = r + (1 - t) * (21 + progress * 18);
    c.globalAlpha = Math.sin(t * Math.PI) * (.25 + progress * .6);
    line(c, [{ x: Math.cos(a) * outer, y: Math.sin(a) * outer }, { x: Math.cos(a) * (outer - 5), y: Math.sin(a) * (outer - 5) }], color, 1.5);
  }
  if (charge.level === 3) {
    c.save(); c.globalAlpha = reduced ? .8 : .72 + Math.sin(motionTime * 7) * .14;
    c.rotate(-.65); blade(c, 33, 6, '#fff4cc'); c.restore();
  }
  c.globalAlpha = 1; c.font = 'bold 12px "Microsoft YaHei UI",sans-serif'; c.textAlign = 'center';
  c.strokeStyle = '#10201e'; c.lineWidth = 4; c.fillStyle = '#ffe9b0';
  const label = charge.unaffordable ? charge.cost === null ? '灵力不足 · 击杀回灵' : '灵力不足 · 缩短划线' : charge.limited ? `灵力受限 · ${CHARGE.names[charge.level]}` : charge.level === 3 ? '破军 · 划动出刀' : `${CHARGE.names[charge.level]} ${charge.level}/3`;
  const caption = strokeCaptionOffset(captionBounds ? c.measureText(label).width : 0, -r - 25, captionBounds);
  c.strokeText(label, caption.x, caption.y); c.fillText(label, caption.x, caption.y);
  c.restore();
}
