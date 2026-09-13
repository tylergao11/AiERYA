import { clamp } from '../core/math';
import type { Element } from '../game/contracts';
import { COMBAT } from '../game/combat';
import { flame, line, oval, shape } from './ink';
import { ART, type Pixel } from './projection';

export interface StrokeGeometry { points: Pixel[]; lengths: number[]; length: number; marks: (Pixel & { angle: number })[] }
/** Distance-based decorations keep a long, densely sampled gesture bounded. */
export function strokeGeometry(input: readonly Pixel[]): StrokeGeometry {
  const points = input.filter((p, i) => i === 0 || Math.hypot(p.x - input[i - 1]!.x, p.y - input[i - 1]!.y) > 0.01).map(p => ({ ...p }));
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  const geometry: StrokeGeometry = { points, lengths, length: lengths.at(-1) ?? 0, marks: [] };
  const step = Math.max(22, geometry.length / 36);
  for (let distance = step * 0.5; distance < geometry.length; distance += step) geometry.marks.push(strokePoint(geometry, distance));
  return geometry;
}
export function strokePoint(stroke: StrokeGeometry, distance: number): Pixel & { angle: number } {
  const { points, lengths } = stroke;
  if (points.length < 2) return { ...(points[0] ?? { x: 0, y: 0 }), angle: 0 };
  const d = clamp(distance, 0, stroke.length);
  let i = 1; while (i < lengths.length - 1 && lengths[i]! < d) i++;
  const a = points[i - 1]!, b = points[i]!, t = (d - lengths[i - 1]!) / (lengths[i]! - lengths[i - 1]! || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}
export function paintStroke(c: CanvasRenderingContext2D, stroke: StrokeGeometry, element: Element, time: number, age: number, life: number, preview = false, hitWidth: number = COMBAT.strokeWidth, charge = 0): void {
  if (stroke.points.length < 2) return;
  const t = preview ? 0 : clamp(age / life, 0, 1), fade = preview ? 0.56 : Math.pow(1 - t, 1.25);
  const palette = { water: ['#244e57', '#73aba9', '#d1e4d8'], wood: ['#263024', '#958052', '#aac78b'], earth: ['#343e35', '#9c8460', '#d4c69e'], fire: ['#402e2b', '#cb773d', '#ffe4a1'], metal: ['#253237', '#a3bab7', '#fff2cf'] }[element];
  const width = ({ water: 15, wood: 8, earth: 12, fire: 7, metal: 4 }[element]) * (preview ? 0.48 : 1) * (1 + charge * .55);
  c.save(); c.globalAlpha *= fade;
  // A quiet wash follows the actual elliptical projection of the gameplay stroke width.
  // The narrow material brush stays visible inside it; closed casts also affect their interior.
  c.save(); c.globalAlpha *= preview ? 0.1 : 0.07; c.translate(ART.x, ART.y); c.scale(ART.unitX, ART.unitY);
  const world = stroke.points.map(p => ({ x: (p.x - ART.x) / ART.unitX, y: (p.y - ART.y) / ART.unitY }));
  line(c, world, palette[1]!, hitWidth * 2);
  if (Math.hypot(stroke.points[0]!.x - stroke.points.at(-1)!.x, stroke.points[0]!.y - stroke.points.at(-1)!.y) < 0.01 && world.length > 2) { c.beginPath(); c.moveTo(world[0]!.x, world[0]!.y); for (const p of world.slice(1)) c.lineTo(p.x, p.y); c.closePath(); c.fillStyle = palette[1]!; c.fill(); }
  c.restore();
  line(c, stroke.points, palette[0]!, width + (preview ? 2 : 4)); line(c, stroke.points, palette[1]!, width);
  if (charge > 0) {
    c.save(); c.globalAlpha *= preview ? .5 : Math.max(0, 1 - age / .24);
    line(c, stroke.points, palette[2]!, width * .55);
    c.restore();
  }
  c.setLineDash(element === 'metal' ? [] : [10, 9, 3, 7]); c.lineDashOffset = -age * 34; line(c, stroke.points, palette[2]!, preview ? 0.8 : 1.5); c.setLineDash([]);
  if (!preview) for (let i = 0; i < stroke.marks.length; i++) {
    const p = stroke.marks[i]!;
    if (element === 'fire') { flame(c, p.x, p.y, (19 + i % 3 * 6) * Math.sin(Math.PI * (0.18 + t * 0.82)), time, i * 1.71); continue; }
    c.save(); c.translate(p.x, p.y); c.rotate(p.angle);
    if (element === 'water') { c.strokeStyle = palette[2]!; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-10, -3); c.bezierCurveTo(1, -10, 14, -2, 7, 2); c.stroke(); }
    if (element === 'wood') { line(c, [{ x: -5, y: 1 }, { x: 1, y: -5 }, { x: 5, y: -11 }], '#716340', 2); shape(c, [1, -5, 0, -14, 9, -13, 7, -7], '#9ebc76', '#32482e', 1); }
    if (element === 'earth') { const h = 4 + Math.sin(Math.PI * t) * 6; shape(c, [-7, 3, -4, -h, 3, -h - 2, 8, 0, 2, 5], '#9a9880', '#384239', 1); }
    if (element === 'metal' && i % 2 === 0) shape(c, [-11, 3, 7, -3, 15, -2, -1, 2], '#e7e1c2', '#6b827b', 0.5);
    c.restore();
  }
  const front = strokePoint(stroke, preview ? stroke.length : stroke.length * clamp(age / 0.2, 0, 1));
  if (preview || age < 0.24) {
    c.translate(front.x, front.y); c.rotate(front.angle);
    if (element === 'metal') shape(c, [-13, -2, 12, 0, -13, 2, -5, 0], palette[2]!, palette[0]!, 0.8);
    else { oval(c, 0, 0, preview ? 4 : 7, preview ? 2.4 : 4, palette[2]!); line(c, [{ x: -12, y: -4 }, { x: -4, y: 0 }, { x: -12, y: 4 }], palette[1]!, 1.6); }
  }
  c.restore();
}
