import { distance, type Point } from '../core/math';
import type { Ward } from './contracts';
import { wallAt, walkable } from './terrain';

/** One field per target, shared by all wolves. Terrain changes invalidate the field. */
export class NavigationField {
  private readonly width = 45;
  private readonly depth = 40;
  private readonly origin: Point = { x: -22, z: -19 };
  private costs = new Float32Array(this.width * this.depth);
  // Heap distances must keep the same precision as stored distances. Rounding
  // them to Float32 can incorrectly discard valid queue entries at river bends.
  private distances = new Float64Array(this.costs.length);
  private target: Point = { x: 0, z: 0 };

  rebuild(target: Point, wards: readonly Ward[]): void {
    this.target = target;
    this.distances.fill(Infinity);
    for (let i = 0; i < this.costs.length; i++) {
      const p = this.point(i);
      this.costs[i] = !walkable(p) ? Infinity : wallAt(p, wards) ? 12 : 1;
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
        const cost = d + this.costs[next]! * (dx && dz ? 1.414 : 1);
        if (cost < this.distances[next]!) { this.distances[next] = cost; push([next, cost]); }
      }
    }
  }

  direction(p: Point): Point {
    if (distance(p, this.target) < 1.4) return this.target;
    const index = this.index(p), x = index % this.width, z = Math.floor(index / this.width);
    let best = index, score = this.distances[index]!;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || x + dx < 0 || x + dx >= this.width || z + dz < 0 || z + dz >= this.depth) continue;
      const next = index + dz * this.width + dx;
      if (dx && dz && (!Number.isFinite(this.costs[index + dx]) || !Number.isFinite(this.costs[index + dz * this.width]))) continue;
      if (this.distances[next]! < score) { best = next; score = this.distances[next]!; }
    }
    return this.point(best);
  }
  private index(p: Point): number { return Math.max(0, Math.min(this.depth - 1, Math.round(p.z - this.origin.z))) * this.width + Math.max(0, Math.min(this.width - 1, Math.round(p.x - this.origin.x))); }
  private point(i: number): Point { return { x: i % this.width + this.origin.x, z: Math.floor(i / this.width) + this.origin.z }; }
}
