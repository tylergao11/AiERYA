import { area, clamp, distance, segmentDistance, type Point } from '../core/math';

function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3) return points.map(p => ({ ...p }));
  let farthest = tolerance, split = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i]!, points[0]!, points.at(-1)!);
    if (d > farthest) { farthest = d; split = i; }
  }
  if (split < 0) return [{ ...points[0]! }, { ...points.at(-1)! }];
  return [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)];
}

function intersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const dx = b.x - a.x, dz = b.z - a.z, ex = d.x - c.x, ez = d.z - c.z;
  const cross = dx * ez - dz * ex;
  if (Math.abs(cross) < 1e-9) return [a, b, c, d].find(p => segmentDistance(p, a, b) < 1e-8 && segmentDistance(p, c, d) < 1e-8) ?? null;
  const t = ((c.x - a.x) * ez - (c.z - a.z) * ex) / cross;
  const u = ((c.x - a.x) * dz - (c.z - a.z) * dx) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * dx, z: a.z + t * dz } : null;
}

/** Keep the dominant loop when a hand-drawn closing tail crosses itself. */
export function repairLoop(input: readonly Point[]): Point[] {
  let points = input.filter((p, i) => !i || distance(p, input[i - 1]!) > 1e-6).map(p => ({ ...p }));
  if (points.length > 1 && distance(points[0]!, points.at(-1)!) < 1e-6) points.pop();
  for (let attempt = 0; attempt < input.length; attempt++) {
    let repaired = false;
    for (let i = 0; i < points.length && !repaired; i++) for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const at = intersection(points[i]!, points[(i + 1) % points.length]!, points[j]!, points[(j + 1) % points.length]!);
      if (!at) continue;
      const a = [at, ...points.slice(i + 1, j + 1)], b = [at, ...points.slice(j + 1), ...points.slice(0, i + 1)];
      points = (area(a) >= area(b) ? a : b).filter((p, n, list) => !n || distance(p, list[n - 1]!) > 1e-6);
      if (points.length > 1 && distance(points[0]!, points.at(-1)!) < 1e-6) points.pop();
      repaired = true; break;
    }
    if (!repaired) break;
  }
  return points;
}

export function normalizeLoop(stroke: readonly Point[]): Point[] | null {
  if (stroke.length < 3 || stroke.length > 1201 || stroke.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) return null;
  const width = Math.max(...stroke.map(p => p.x)) - Math.min(...stroke.map(p => p.x));
  const depth = Math.max(...stroke.map(p => p.z)) - Math.min(...stroke.map(p => p.z));
  const diagonal = Math.hypot(width, depth), gap = distance(stroke[0]!, stroke.at(-1)!);
  const length = stroke.slice(1).reduce((sum, p, i) => sum + distance(p, stroke[i]!), 0);
  if (gap > clamp(diagonal * 0.4, 2.5, 6) || length < gap * 2) return null;
  const points = repairLoop(simplify(stroke, Math.min(0.12, diagonal * 0.02)));
  return points.length >= 3 && area(points) >= 0.01 ? points : null;
}
