import { distance, type Point } from '../core/math';
import type { Ward } from './contracts';
import { CLEARING } from './map';
import { wolfGround, wolfSegmentClear, wolfWall } from './wolf-collision';
import { WOLF_KINDS } from './wolves';

/** One field per target, shared by all wolves. Terrain changes invalidate the field. */
export class NavigationField {
  private readonly fields = new Map<number, BodyNavigationField>();
  private target: Point = { x: 0, z: 0 };
  private wards: readonly Ward[] = [];
  rebuild(target: Point, wards: readonly Ward[]): void {
    this.target = { ...target }; this.wards = wards; this.fields.clear();
    this.field(WOLF_KINDS.normal.radius);
  }
  direction(p: Point, radius: number = WOLF_KINDS.normal.radius): Point { return this.field(radius).direction(p); }
  route(from: Point, radius: number = WOLF_KINDS.normal.radius): Point[] { return this.field(radius).route(from); }
  private field(radius: number): BodyNavigationField {
    let field = this.fields.get(radius);
    if (!field) { field = new BodyNavigationField(radius); field.rebuild(this.target, this.wards); this.fields.set(radius, field); }
    return field;
  }
}

class BodyNavigationField {
  private readonly origin: Point = { x: Math.floor(Math.min(...CLEARING.map(p => p.x))), z: Math.floor(Math.min(...CLEARING.map(p => p.z))) };
  private readonly width = Math.ceil(Math.max(...CLEARING.map(p => p.x))) - this.origin.x + 1;
  private readonly depth = Math.ceil(Math.max(...CLEARING.map(p => p.z))) - this.origin.z + 1;
  private costs = new Float32Array(this.width * this.depth);
  // Heap distances must keep the same precision as stored distances. Rounding
  // them to Float32 can incorrectly discard valid queue entries at river bends.
  private distances = new Float64Array(this.costs.length);
  private target: Point = { x: 0, z: 0 };
  private wards: readonly Ward[] = [];
  constructor(private readonly radius: number) {}

  rebuild(target: Point, wards: readonly Ward[]): void {
    this.target = target; this.wards = wards;
    this.distances.fill(Infinity);
    for (let i = 0; i < this.costs.length; i++) {
      const p = this.point(i);
      this.costs[i] = !wolfGround(p, this.radius) ? Infinity : wolfWall(p, this.radius, wards) ? 18 : 1;
    }
    const start = this.index(target), heap: [number, number][] = [[start, 0]];
    this.distances[start] = 0;
    const push = (entry: [number, number]) => {
      heap.push(entry); let child = heap.length - 1;
      while (child > 0) { const parent = (child - 1) >> 1; if (heap[parent]![1] <= entry[1]) break; heap[child] = heap[parent]!; child = parent; }
      heap[child] = entry;
    };
    const pop = (): [number, number] => {
      const first = heap[0]!, last = heap.pop()!;
      if (heap.length) { let parent = 0; while (parent * 2 + 1 < heap.length) {
        let child = parent * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1]![1] < heap[child]![1]) child++;
        if (last[1] <= heap[child]![1]) break;
        heap[parent] = heap[child]!; parent = child;
      } heap[parent] = last; }
      return first;
    };
    while (heap.length) {
      const [index, d] = pop();
      if (d > this.distances[index]!) continue;
      const x = index % this.width, z = Math.floor(index / this.width);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || x + dx < 0 || x + dx >= this.width || z + dz < 0 || z + dz >= this.depth) continue;
        const next = index + dz * this.width + dx;
        if (dx && dz && (!Number.isFinite(this.costs[index + dx]) || !Number.isFinite(this.costs[index + dz * this.width]))) continue;
        if (!Number.isFinite(this.costs[next]) || !wolfGround({ x: this.point(index).x + dx / 2, z: this.point(index).z + dz / 2 }, this.radius)) continue;
        const cost = d + this.costs[next]! * (dx && dz ? 1.414 : 1);
        if (cost < this.distances[next]!) { this.distances[next] = cost; push([next, cost]); }
      }
    }
  }

  direction(p: Point): Point {
    // The grid finds detours; visible targets use a continuous straight approach.
    // Include walls here so a sealed formation is attacked instead of bypassed.
    if (wolfSegmentClear(p, this.target, this.radius, this.wards)) return this.target;
    const index = this.index(p), x = index % this.width, z = Math.floor(index / this.width);
    const candidates: { next: number; score: number }[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || x + dx < 0 || x + dx >= this.width || z + dz < 0 || z + dz >= this.depth) continue;
      const next = index + dz * this.width + dx;
      if (dx && dz && (!Number.isFinite(this.costs[index + dx]) || !Number.isFinite(this.costs[index + dz * this.width]))) continue;
      const candidate = this.point(next);
      const cost = this.distances[next]! + distance(p, candidate) * 0.35;
      if (Number.isFinite(cost)) candidates.push({ next, score: cost });
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const candidate of candidates) if (wolfSegmentClear(p, this.point(candidate.next), this.radius)) return this.point(candidate.next);
    return this.point(index);
  }
  /** A read-only preview of the same field used by enemy movement. */
  route(from: Point): Point[] {
    const points: Point[] = [{ ...from }];
    for (let i = 0; i < 120; i++) {
      const last = points.at(-1)!;
      if (distance(last, this.target) < 1.8) break;
      const next = this.direction(last);
      if (distance(last, next) < 0.01) break;
      points.push({ ...next });
    }
    return points;
  }
  private index(p: Point): number { return Math.max(0, Math.min(this.depth - 1, Math.round(p.z - this.origin.z))) * this.width + Math.max(0, Math.min(this.width - 1, Math.round(p.x - this.origin.x))); }
  private point(i: number): Point { return { x: i % this.width + this.origin.x, z: Math.floor(i / this.width) + this.origin.z }; }
}
