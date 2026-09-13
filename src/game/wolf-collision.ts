import { distance, inside, segmentDistance, segmentsIntersect, type Point } from '../core/math';
import type { Ward, Wolf } from './contracts';
import { CLEARING, RIVER } from './map';
import { ROCKS } from './terrain';
import { wolfProfile } from './wolves';
import { wardContours } from './ward-geometry';
import { EARTH_WALL, earthWallAt } from './earth-wall';

function nearEdge(p: Point, polygon: readonly Point[], radius: number): boolean {
  for (let i = 0; i < polygon.length; i++) if (segmentDistance(p, polygon[i]!, polygon[(i + 1) % polygon.length]!) < radius) return true;
  return false;
}
const riverMinX = Math.min(...RIVER.map(p => p.x));
export function wolfGround(p: Point, radius: number): boolean {
  return inside(p, CLEARING) && !nearEdge(p, CLEARING, radius)
    && (p.x < riverMinX - radius || (!inside(p, RIVER) && !nearEdge(p, RIVER, radius)))
    && !ROCKS.some(rock => distance(p, rock) < rock.radius + radius);
}
export function wolfWall(p: Point, radius: number, wards: readonly Ward[]): Ward | undefined {
  return wards.find(w => earthWallAt(p, w, radius));
}
export function wolfClear(p: Point, radius: number, wards: readonly Ward[]): boolean {
  return wolfGround(p, radius) && !wolfWall(p, radius, wards);
}
function segmentNearEdge(a: Point, b: Point, polygon: readonly Point[], margin: number): boolean {
  return polygon.some((c, i) => {
    const d = polygon[(i + 1) % polygon.length]!;
    if (Math.max(a.x,b.x) + margin < Math.min(c.x,d.x) || Math.min(a.x,b.x) - margin > Math.max(c.x,d.x)
      || Math.max(a.z,b.z) + margin < Math.min(c.z,d.z) || Math.min(a.z,b.z) - margin > Math.max(c.z,d.z)) return false;
    return segmentsIntersect(a,b,c,d) || Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b)) < margin;
  });
}
/** Swept body clearance across the whole segment, including narrow corners and long sightlines. */
export function wolfSegmentClear(a: Point, b: Point, radius: number, wards: readonly Ward[] = []): boolean {
  if (!wolfGround(a,radius) || !wolfGround(b,radius) || segmentNearEdge(a,b,CLEARING,radius)) return false;
  if (Math.max(a.x,b.x) >= riverMinX - radius && segmentNearEdge(a,b,RIVER,radius)) return false;
  if (ROCKS.some(rock => segmentDistance(rock,a,b) < rock.radius + radius)) return false;
  return !wards.some(ward => ward.element === 'earth' && ward.health > 0 && segmentDistance(ward,a,b) <= ward.radius + EARTH_WALL.rim + radius
    && (earthWallAt(a,ward,radius) || earthWallAt(b,ward,radius) || wardContours(ward).some(ring => segmentNearEdge(a,b,ring,EARTH_WALL.rim + radius))));
}
export function moveWolf(wolf: Wolf, dx: number, dz: number, wards: readonly Ward[]): number {
  if (Math.abs(dx) + Math.abs(dz) < 0.000001) return 0;
  const radius = wolfProfile(wolf).radius, start = { x: wolf.x, z: wolf.z };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
  for (let i = 0; i < steps; i++) {
    const x = wolf.x + dx / steps, z = wolf.z + dz / steps;
    if (wolfClear({ x, z }, radius, wards)) { wolf.x = x; wolf.z = z; }
    else if (wolfClear({ x, z: wolf.z }, radius, wards)) wolf.x = x;
    else if (wolfClear({ x: wolf.x, z }, radius, wards)) wolf.z = z;
  }
  return distance(start, wolf);
}
export function separateWolves(wolves: readonly Wolf[], wards: readonly Ward[]): void {
  // Bounded position relaxation. Every correction obeys the same terrain collider.
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < wolves.length; i++) {
    const a = wolves[i]!; if (a.action === 'dead' || a.motion?.pose === 'vault') continue;
    for (let j = i + 1; j < wolves.length; j++) {
      const b = wolves[j]!; if (b.action === 'dead' || b.motion?.pose === 'vault') continue;
      const gap = wolfProfile(a).radius + wolfProfile(b).radius;
      if (Math.abs(a.x - b.x) >= gap || Math.abs(a.z - b.z) >= gap) continue;
      const d = distance(a, b);
      if (d >= gap - 0.005) continue;
      const angle = (a.id * 2.4 + b.id) % (Math.PI * 2);
      const dx = d > 0.001 ? (b.x - a.x) / d : Math.cos(angle), dz = d > 0.001 ? (b.z - a.z) / d : Math.sin(angle);
      const correction = (gap - d) * 0.51;
      const moved = moveWolf(a, -dx * correction, -dz * correction, wards);
      moveWolf(b, dx * (gap - d - moved), dz * (gap - d - moved), wards);
    }
  }
  // Reserve the incoming landing footprint while the elite is airborne.
  for (const jumper of wolves) if (jumper.motion?.pose === 'vault' && jumper.motion.vault) {
    const end = jumper.motion.vault.end;
    for (const other of wolves) {
      if (other === jumper || other.action === 'dead' || other.motion?.pose === 'vault') continue;
      const d = distance(other, end), gap = wolfProfile(jumper).radius + wolfProfile(other).radius + 0.2;
      if (d >= gap) continue;
      const dx = d > 0.001 ? (other.x - end.x) / d : 1, dz = d > 0.001 ? (other.z - end.z) / d : 0;
      moveWolf(other, dx * (gap - d), dz * (gap - d), wards);
    }
  }
}
export function wolfSpawn(entrance: Point, radius: number, wolves: readonly Wolf[], wards: readonly Ward[]): Point | null {
  for (let i = 0; i < 80; i++) {
    const r = Math.sqrt(i) * 0.38, angle = i * 2.39996;
    const p = { x: entrance.x + Math.cos(angle) * r, z: entrance.z + Math.sin(angle) * r };
    if (wolfClear(p, radius, wards) && wolves.every(w => w.action === 'dead' || distance(p, w) >= radius + wolfProfile(w).radius + 0.1)) return p;
  }
  return null;
}
