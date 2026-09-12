export interface Point { x: number; z: number }
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);
export function random(seed: number): () => number {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
export function inside(p: Point, polygon: readonly Point[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}
export function area(points: readonly Point[]): number {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]!; return sum + p.x * q.z - q.x * p.z; }, 0)) / 2;
}
export function center(points: readonly Point[]): Point {
  return { x: points.reduce((s, p) => s + p.x, 0) / points.length, z: points.reduce((s, p) => s + p.z, 0) / points.length };
}
/** An interior anchor for concave player drawings; never turns the boundary into a circle. */
export function interiorPoint(points: readonly Point[]): Point {
  const mean = center(points);
  if (inside(mean, points)) return mean;
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  let best = points[0]!, clearance = -1;
  for (let x = 0; x < 22; x++) for (let z = 0; z < 22; z++) {
    const candidate = { x: minX + (maxX - minX) * (x + 0.5) / 22, z: minZ + (maxZ - minZ) * (z + 0.5) / 22 };
    if (!inside(candidate, points)) continue;
    const d = Math.min(...points.map((a, i) => segmentDistance(candidate, a, points[(i + 1) % points.length]!)));
    if (d > clearance) { best = candidate; clearance = d; }
  }
  return best;
}
export function resample(points: readonly Point[], spacing: number): Point[] {
  const result: Point[] = [];
  let remaining = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, length = distance(a, b);
    if (length < 0.001) continue;
    while (remaining <= length) { const t = remaining / length; result.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) }); remaining += spacing; }
    remaining -= length;
  }
  return result;
}
export function selfIntersects(points: readonly Point[]): boolean {
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  for (let i = 0; i < points.length; i++) for (let j = i + 2; j < points.length; j++) {
    if (i === 0 && j === points.length - 1) continue;
    const a = points[i]!, b = points[(i + 1) % points.length]!, c = points[j]!, d = points[(j + 1) % points.length]!;
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
  }
  return false;
}
