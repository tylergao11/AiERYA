import type { Pixel } from './projection';

export const INK = '#081820';
export const COLORS = { wood: '#a7d475', fire: '#ff8c42', earth: '#d6ad71', metal: '#f9e2a0', water: '#6ce4de' } as const;

export function shape(c: CanvasRenderingContext2D, points: readonly number[], fill: string, stroke = INK, line = 2): void {
  if (points.length < 4) return;
  c.beginPath(); c.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i]!, points[i + 1]!);
  c.closePath(); c.fillStyle = fill; c.fill(); if (line > 0) { c.strokeStyle = stroke; c.lineWidth = line; c.lineJoin = 'round'; c.stroke(); }
}
export function line(c: CanvasRenderingContext2D, points: readonly Pixel[], color: string, width: number, closed = false): void {
  if (points.length < 2) return;
  c.beginPath(); c.moveTo(points[0]!.x, points[0]!.y); for (const point of points.slice(1)) c.lineTo(point.x, point.y);
  if (closed) c.closePath(); c.strokeStyle = color; c.lineWidth = width; c.lineCap = c.lineJoin = 'round'; c.stroke();
}
export function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = color; c.fill();
}
export function glow(c: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, opacity = 1): void {
  const g = c.createRadialGradient(x, y, 0, x, y, radius); g.addColorStop(0, color); g.addColorStop(1, color.slice(0, 7) + '00');
  c.save(); c.globalAlpha *= opacity; c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2); c.restore();
}

/** The same illustrated flame frames serve camp, formations and burning actors. */
const fireSheets = new WeakMap<CanvasRenderingContext2D, HTMLImageElement>();
export function registerFlames(context: CanvasRenderingContext2D, atlas: HTMLImageElement): void { fireSheets.set(context, atlas); }
export function flame(c: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, seed = 0): void {
  const atlas = fireSheets.get(c); if (!atlas || size <= 0) return;
  const cellW = atlas.naturalWidth / 4, cellH = atlas.naturalHeight / 3;
  const phase = time * (10 + Math.sin(seed * 4.1) * 1.2) + seed * 3.7;
  const frame = Math.floor(phase) % 12, mix = phase - Math.floor(phase);
  const height = size * (1.23 + Math.sin(time * 3.1 + seed) * 0.035), width = height * (0.87 + Math.sin(seed) * 0.08);
  c.save(); c.translate(x, y); c.scale(Math.sin(seed * 7) < 0 ? -1 : 1, 1);
  c.globalCompositeOperation = 'screen';
  const opacity = c.globalAlpha;
  for (let i = 0; i < 2; i++) {
    const index = (frame + i) % 12;
    c.globalAlpha = opacity * (i ? mix : 1 - mix);
    c.drawImage(atlas, index % 4 * cellW, Math.floor(index / 4) * cellH, cellW, cellH, -width / 2, -height * 0.94, width, height);
  }
  c.restore();
}