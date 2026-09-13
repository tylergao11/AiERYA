import { clamp, segmentDistance, segmentsIntersect, type Point } from '../core/math';

/** The same crossing (including endpoints and collinear overlap) drives preview and release. */
export function returnCrossing(current: readonly Point[], saved: readonly Point[]): Point | null {
  for (let i = 1; i < current.length; i++) for (let j = 1; j < saved.length; j++) {
    const a = current[i - 1]!, b = current[i]!, c = saved[j - 1]!, d = saved[j]!;
    if (Math.max(a.x,b.x) + 1e-9 < Math.min(c.x,d.x) || Math.max(c.x,d.x) + 1e-9 < Math.min(a.x,b.x)
      || Math.max(a.z,b.z) + 1e-9 < Math.min(c.z,d.z) || Math.max(c.z,d.z) + 1e-9 < Math.min(a.z,b.z) || !segmentsIntersect(a,b,c,d)) continue;
    const rx=b.x-a.x, rz=b.z-a.z, sx=d.x-c.x, sz=d.z-c.z, denominator=rx*sz-rz*sx;
    if (Math.abs(denominator)>1e-12) {
      const t=clamp(((c.x-a.x)*sz-(c.z-a.z)*sx)/denominator,0,1);
      return {x:a.x+rx*t,z:a.z+rz*t};
    }
    const point = [a,b].find(p=>segmentDistance(p,c,d)<1e-9) ?? [c,d].find(p=>segmentDistance(p,a,b)<1e-9);
    if(point)return {...point};
  }
  return null;
}
