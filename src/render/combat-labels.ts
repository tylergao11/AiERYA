import type { Pixel } from './projection';
export interface LabelRect { x: number; y: number; width: number; height: number }
export interface CombatLabel { p: Pixel; text: string; color: string; alpha: number; size: number; priority: number; width: number }
const overlaps = (a: LabelRect, b: LabelRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
/** Local alternatives keep labels near their source; low-priority overflow is omitted. */
export function layoutCombatLabels(labels: readonly CombatLabel[], reserved: readonly LabelRect[] = [], options: { spacing?: number; limit?: number; sideLanes?: boolean } = {}): CombatLabel[] {
  const spacing = options.spacing ?? 1, limit = options.limit ?? 24;
  const occupied = [...reserved], result: CombatLabel[] = [];
  const positions:readonly (readonly [number,number])[] = [[0,0],[0,-19],[0,-38],[-34,-19],[34,-19],[0,-57],...(options.sideLanes?[[-64,0],[64,0],[-64,-24],[64,-24]] as const:[])];
  for (const label of [...labels].sort((a, b) => b.priority - a.priority)) {
    if (result.length >= limit) break;
    for (const [dx, dy] of positions) {
      const p = { x: label.p.x + dx * spacing, y: label.p.y + dy * spacing }, box = { x: p.x - label.width / 2 - 3, y: p.y - label.size - 2, width: label.width + 6, height: label.size + 6 };
      if (box.x < 8 || box.x + box.width > 1592 || box.y < 18 || box.y > 970 || occupied.some(r => overlaps(box, r))) continue;
      occupied.push(box); result.push({ ...label, p }); break;
    }
  }
  return result;
}
