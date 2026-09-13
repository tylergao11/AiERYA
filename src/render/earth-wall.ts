import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { clamp, random, type Point } from '../core/math';
import type { Ward } from '../game/contracts';
import { EARTH_WALL } from '../game/earth-wall';
import { wardContains, wardRegions } from '../game/ward-geometry';
import { ART, toArt, type Pixel } from './projection';
import { elementState } from './element-state';

export const EARTH_WALL_ART = Object.freeze({ height: 58, roofBand: 0.9 });
interface RoofPart { kind: 'roof'; z: number; contours: Pixel[][]; path?: Path2D; grains: Pixel[] }
interface FacePart { kind: 'face'; z: number; a: Pixel; b: Pixel; footA: Pixel; footB: Pixel; seed: number; light: number }
export type EarthWallPart = RoofPart | FacePart;

function contourPath(contours: readonly (readonly Pixel[])[]): Path2D {
  const path = new Path2D();
  for (const contour of contours) {
    path.moveTo(contour[0]!.x, contour[0]!.y);
    for (const p of contour.slice(1)) path.lineTo(p.x,p.y);
    path.closePath();
  }
  return path;
}
function signedArea(ring: readonly Point[]): number {
  return ring.reduce((sum,p,i)=>{ const q=ring[(i+1)%ring.length]!; return sum+p.x*q.z-q.x*p.z; },0)/2;
}
function corners(ring: readonly Point[]): Point[] {
  return ring.filter((p,i) => {
    const a=ring[(i+ring.length-1)%ring.length]!,b=ring[(i+1)%ring.length]!;
    return Math.abs((p.x-a.x)*(b.z-p.z)-(p.z-a.z)*(b.x-p.x)) > 1e-8;
  }).map(p=>({...p}));
}

/** A continuous raised solid. Roof slices and faces share actor depth sorting. */
export class EarthWallMesh {
  readonly parts: EarthWallPart[] = [];
  constructor(ward: Ward) {
    const regions = wardRegions(ward).map(region => region.map((ring,i) => {
      const result = corners(ring), wantPositive = i === 0;
      if ((signedArea(result)>0) !== wantPositive) result.reverse();
      return result;
    }));
    const points = regions.flat(2), minX=Math.min(...points.map(p=>p.x)), maxX=Math.max(...points.map(p=>p.x));
    const minZ=Math.min(...points.map(p=>p.z)), maxZ=Math.max(...points.map(p=>p.z));
    const geometry: MultiPolygon = regions.map(region=>region.map(ring=>ring.map(p=>[p.x,p.z])));
    const rng=random(ward.id*3747), grains: Pixel[]=[];
    for(let i=0;i<1200 && grains.length<260;i++) {
      const p={x:minX+rng()*(maxX-minX),z:minZ+rng()*(maxZ-minZ)};
      if(wardContains(p,ward)) grains.push(toArt(p));
    }
    // Draw the cap by depth so wolves in front of a long diagonal wall stay in front.
    const bands=Math.max(1,Math.ceil((maxZ-minZ)/EARTH_WALL_ART.roofBand)), step=(maxZ-minZ)/bands;
    for(let i=0;i<bands;i++) {
      const z0=minZ+i*step, z1=minZ+(i+1)*step;
      const clipped=polygonClipping.intersection(geometry,[[[minX-1,z0],[maxX+1,z0],[maxX+1,z1],[minX-1,z1]]]);
      if(!clipped.length) continue;
      const contours=clipped.flatMap(region=>region.map(ring=>ring.slice(0,-1).map(([x,z])=>toArt({x,z}))));
      const y0=toArt({x:0,z:z0}).y, y1=toArt({x:0,z:z1}).y;
      this.parts.push({kind:'roof',z:(y0+y1)/2,contours,grains:grains.filter(p=>p.y>=y0&&p.y<y1)});
    }
    for(const region of regions) for(const ring of region) for(let i=0;i<ring.length;i++) {
      const a=ring[i]!, b=ring[(i+1)%ring.length]!, dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(length<1e-7 || dx>1e-7) continue; // Only the earth faces looking toward the camera are visible.
      const normal={x:dz/length,z:-dx/length}, pieces=Math.max(1,Math.ceil(length/1.2));
      for(let j=0;j<pieces;j++) {
        const p={x:a.x+dx*j/pieces,z:a.z+dz*j/pieces},q={x:a.x+dx*(j+1)/pieces,z:a.z+dz*(j+1)/pieces};
        const pa=toArt(p),pb=toArt(q), rim=EARTH_WALL.rim;
        this.parts.push({kind:'face',z:Math.max(pa.y,pb.y)+rim*ART.unitY,
          a:pa,b:pb,footA:toArt({x:p.x+normal.x*rim,z:p.z+normal.z*rim}),footB:toArt({x:q.x+normal.x*rim,z:q.z+normal.z*rim}),
          seed:rng(),light:clamp(0.55+normal.x*0.2+normal.z*0.22,0,1)});
      }
    }
  }
  paint(c: CanvasRenderingContext2D, part: EarthWallPart, ward: Ward, opacity: number): void {
    const growth=1-Math.pow(1-clamp(ward.age/0.55,0,1),3), height=EARTH_WALL_ART.height*growth*opacity;
    if(height<=0.01) return;
    const state=elementState(ward), health=clamp(ward.health/ward.maxHealth,0,1);
    const top=state==='weakened'?'#82745d':state==='enhanced'?'#aa8e5c':'#927b54';
    const dark=state==='weakened'?'#4f4d43':'#594934', light=state==='enhanced'?'#e0c189':'#c2a779';
    c.save(); c.globalAlpha*=opacity;
    if(part.kind==='roof') {
      part.path ??= contourPath(part.contours);
      c.translate(0,-height); c.fillStyle=top; c.fill(part.path,'evenodd');
      // Close subpixel seams between depth slices without outlining the bands.
      c.strokeStyle=top; c.lineWidth=1.2; c.stroke(part.path); c.clip(part.path,'evenodd');
      // Fine compressed earth, not freestanding rock sprites or a flat boundary decal.
      for(let i=0;i<part.grains.length;i++) {
        const p=part.grains[i]!, seed=Math.abs(Math.sin(p.x*12.9898+p.y*78.233)), s=1+seed*5;
        c.fillStyle=seed>.4?'#dac09224':'#413c3430'; c.beginPath();c.ellipse(p.x,p.y,s,s*0.38,seed*3,0,Math.PI*2);c.fill();
        if(i%3===0) {
          c.strokeStyle=health<0.6?'#483c32b0':'#6a583856'; c.lineWidth=health<0.6?1.7:0.9;
          c.beginPath();c.moveTo(p.x-s,p.y-3);c.lineTo(p.x,p.y);c.lineTo(p.x+4,p.y+5);c.lineTo(p.x+9,p.y+6);c.stroke();
        }
      }
    } else {
      const a={x:part.a.x,y:part.a.y-height}, b={x:part.b.x,y:part.b.y-height};
      c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineTo(part.footB.x,part.footB.y);c.lineTo(part.footA.x,part.footA.y);c.closePath();
      // Grade perpendicular to the shared top edge so adjacent pieces have identical shading.
      const dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy), sign=dx<0?-1:1;
      const nx=-dy/length*sign, ny=dx/length*sign;
      const depth=(part.footA.x-a.x)*nx+(part.footA.y-a.y)*ny;
      const shade=c.createLinearGradient(a.x,a.y,a.x+nx*depth,a.y+ny*depth);
      shade.addColorStop(0,part.light>0.65?'#96805a':'#7e694b');shade.addColorStop(0.55,state==='weakened'?'#6a6555':'#756045');shade.addColorStop(1,dark);
      c.fillStyle=shade;c.fill();c.strokeStyle=shade;c.lineWidth=1;c.stroke();c.save();c.clip();
      for(let layer=1;layer<4;layer++) {
        const t=layer/4, offset=Math.sin(part.a.x*0.015+layer)*1.4;
        c.strokeStyle=layer%2?'#d2b48633':'#3d372e45';c.lineWidth=1.4;
        c.beginPath();c.moveTo(a.x+(part.footA.x-a.x)*t,a.y+height*t+offset);c.lineTo(b.x+(part.footB.x-b.x)*t,b.y+height*t+offset);c.stroke();
      }
      if(part.seed<0.28 || health<0.75) {
        const x=(a.x+b.x)/2,y=(a.y+b.y)/2,t=0.32+(1-health)*0.58;
        c.strokeStyle=health<0.5?'#302e27':'#493e2f99';c.lineWidth=1+(1-health)*1.7;
        c.beginPath();c.moveTo(x,y);c.lineTo(x+4,y+height*t*0.35);c.lineTo(x-2,y+height*t*0.7);c.lineTo(x+2,y+height*t);c.stroke();
      }
      c.restore();c.strokeStyle=light;c.lineWidth=2;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
    }
    c.restore();
  }
}
