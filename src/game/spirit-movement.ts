import { distance, segmentDistance, type Point } from '../core/math';
import type { Ward, Wolf } from './contracts';
import type { RunSpirit } from './rogue-combat';
import { ROGUE } from './rogue-balance';
import { spiritProfile } from './spirit-profile';
import { wolfClear, wolfSegmentClear } from './wolf-collision';
import { wardContains, wardContours } from './ward-geometry';
import { mapPoint } from './map';

const B = ROGUE.spirit;
interface Route { target: Point; points: Point[]; retry: number; walls: string }
/** Both fighting styles respect solid ground, walls and line of sight. */
export class SpiritMovement {
  private readonly routes = new Map<number, Route>();
  private anchors = new WeakMap<Ward, { key: string; at: Point }>();
  clear(): void { this.routes.clear(); this.anchors = new WeakMap(); }
  anchor(ward: Ward, wards: readonly Ward[]): Point {
    const key = wards.filter(w => w.element === 'earth' && w.health > 0).map(w => `${w.id}:${w.x}:${w.z}`).join('|') + `:${ward.x}:${ward.z}`;
    let entry = this.anchors.get(ward);
    if (!entry || entry.key !== key) { entry = { key, at: SpiritMovement.ground(ward, wards) }; this.anchors.set(ward, entry); }
    return entry.at;
  }
  remove(id: number): void { this.routes.delete(id); }
  /** A bound spirit protects the drawing plus its existing border allowance.
   * Its displaced, walkable home point is only a return destination. */
  static defends(ward: Ward, target: Point): boolean {
    if (distance(ward, target) > ward.radius + B.arrayRange) return false;
    return wardContains(target, ward) || wardContours(ward).some(ring => ring.some((p, i) =>
      segmentDistance(target, p, ring[(i + 1) % ring.length]!) <= B.arrayRange));
  }
  static reach(spirit: RunSpirit): number { return spiritProfile(spirit).reach; }
  static canHit(spirit: RunSpirit, target: Point, wards: readonly Ward[], extra = 0): boolean {
    return distance(spirit, target) <= this.reach(spirit) + extra && wolfSegmentClear(spirit, target, .08, wards);
  }
  /** Camp companions enter the right-hand clearing, with room between bodies.
   * Array-bound births still use their drawing's own ground anchor. */
  static spawn(slot: number, wards: readonly Ward[], companions: readonly Point[]): Point {
    const home=mapPoint(960+(slot%2)*40,420+(slot%3)*95);
    const free=(p:Point)=>p.x>=1&&wolfClear(p,B.bodyRadius,wards)&&companions.every(s=>distance(s,p)>=3);
    if(free(home))return home;
    for(let ring=1;ring<=40;ring++)for(let n=0;n<24;n++){
      const angle=n*Math.PI/12,p={x:home.x+Math.cos(angle)*ring*.4,z:home.z+Math.sin(angle)*ring*.4};
      if(free(p))return p;
    }
    return this.ground(home,wards);
  }
  static ground(at: Point, wards: readonly Ward[]): Point {
    if (wolfClear(at, B.bodyRadius, wards)) return { x: at.x, z: at.z };
    for (let ring = 1; ring <= 80; ring++) for (let n = 0; n < 24; n++) {
      const angle = n * Math.PI / 12, p = { x: at.x + Math.cos(angle) * ring * .25, z: at.z + Math.sin(angle) * ring * .25 };
      if (wolfClear(p, B.bodyRadius, wards)) return p;
    }
    return { x: at.x, z: at.z };
  }
  step(spirit: RunSpirit, target: Wolf | Point, dt: number, wards: readonly Ward[], returning = false, speed = 1): void {
    if (!wolfClear(spirit, B.bodyRadius, wards)) Object.assign(spirit, SpiritMovement.ground(spirit, wards));
    const profile = spiritProfile(spirit), reach = returning ? .3 : profile.reach * .8;
    const separation = distance(spirit, target);
    if (!returning && profile.style === 'ranged' && separation < profile.standOff - .5) {
      // A short checked retreat, never a teleport through a wall or off the clearing.
      const angle = Math.atan2(spirit.z - target.z, spirit.x - target.x);
      for (const turn of [0, .55, -.55, 1.1, -1.1]) {
        const step = Math.min(dt * B.moveSpeed * speed, profile.standOff - separation);
        const p = { x: spirit.x + Math.cos(angle + turn) * step, z: spirit.z + Math.sin(angle + turn) * step };
        if (wolfSegmentClear(spirit, p, B.bodyRadius, wards)) { Object.assign(spirit, p); return; }
      }
      return;
    }
    if (separation <= reach && wolfSegmentClear(spirit, target, .08, wards)) return;
    const old = this.routes.get(spirit.id); if (old) old.retry -= dt;
    const walls = wards.filter(w => w.element === 'earth' && w.health > 0).map(w => `${w.id}:${w.x.toFixed(1)}:${w.z.toFixed(1)}`).join('|');
    let points: Point[];
    if (wolfSegmentClear(spirit, target, B.bodyRadius, wards)) points = [target];
    else {
      if (!old || old.retry <= 0 && (distance(old.target, target) > .75 || !old.points.length) || old.walls !== walls) {
        this.routes.set(spirit.id, { target: { x: target.x, z: target.z }, points: route(spirit, target, wards, reach), retry: .65, walls });
      }
      points = this.routes.get(spirit.id)!.points;
      while (points.length > 1 && distance(spirit, points[0]!) < .22) points.shift();
    }
    const next = points[0]; if (!next) return;
    const d = distance(spirit, next), step = Math.min(d, dt * B.moveSpeed * speed); if (d < .01) return;
    const end = { x: spirit.x + (next.x - spirit.x) / d * step, z: spirit.z + (next.z - spirit.z) / d * step };
    if (wolfSegmentClear(spirit, end, B.bodyRadius, wards)) { spirit.x = end.x; spirit.z = end.z; }
    else { const cached = this.routes.get(spirit.id); if (cached) { cached.points = []; cached.retry = 0; } }
  }
}

function route(start: Point, target: Point, wards: readonly Ward[], reach: number): Point[] {
  const key = (p: Point) => `${p.x},${p.z}`, origin = { x: Math.round(start.x), z: Math.round(start.z) };
  // Start from a reachable grid point, never snap the actual companion through an obstacle.
  const starts = [-1, 0, 1].flatMap(x => [-1, 0, 1].map(z => ({ x: origin.x + x, z: origin.z + z }))).filter(p => wolfSegmentClear(start, p, B.bodyRadius, wards));
  interface Node { p: Point; g: number; score: number; parent?: Node }
  const open: Node[] = starts.map(p => ({ p, g: distance(start, p), score: distance(start, p) + distance(p, target) }));
  const visited = new Map<string, number>();
  for (const n of open) visited.set(key(n.p), n.g);
  for (let tries = 0; open.length && tries < 1400; tries++) {
    let best = 0; for (let i = 1; i < open.length; i++) if (open[i]!.score < open[best]!.score) best = i;
    const node = open[best]!; open[best] = open.at(-1)!; open.pop();
    if (node.g > (visited.get(key(node.p)) ?? Infinity)) continue;
    if (distance(node.p, target) <= reach && wolfSegmentClear(node.p, target, .08, wards)) {
      const result: Point[] = []; for (let n: Node | undefined = node; n; n = n.parent) result.unshift(n.p); return result;
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const p = { x: node.p.x + dx, z: node.p.z + dz }, g = node.g + Math.hypot(dx, dz), id = key(p);
      if (g >= (visited.get(id) ?? Infinity) || !wolfSegmentClear(node.p, p, B.bodyRadius, wards)) continue;
      visited.set(id, g); open.push({ p, g, score: g + distance(p, target), parent: node });
    }
  }
  return [];
}
