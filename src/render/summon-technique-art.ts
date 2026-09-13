import { clamp, type Point } from '../core/math';
import type { GameEvents } from '../game/contracts';
import { COLORS, line } from './ink';
import { toArt, type Pixel } from './projection';
import { paintSpiritMaterial } from './spirit-material';

export type SummonTechniqueArt = GameEvents['summonTechnique'] & { age: number; source: Pixel; partnerSource?: Pixel };
export function makeSummonTechniqueArt(event: GameEvents['summonTechnique'], source: (id: number, at: Point) => Pixel | undefined): SummonTechniqueArt {
  const resolve = (id: number | undefined, at: Point) => { const p = id === undefined ? undefined : source(id, at); return p ? { ...p } : toArt(at, .7); };
  return { ...event, at: { ...event.at }, from: { ...event.from }, age: 0, source: resolve(event.spiritId, event.from),
    partner: event.partner ? { ...event.partner, at: { ...event.partner.at } } : undefined,
    partnerSource: event.partner ? resolve(event.partner.spiritId, event.partner.at) : undefined };
}
export const summonTechniqueSeconds = (e: Pick<SummonTechniqueArt, 'kind' | 'toElement'>): number => e.kind === 'pincer' ? .62 : e.kind === 'seal' ? e.toElement ? .6 : .42 : .85;

/** These are trails left by real contacts, not additional projectiles or damage events. */
export function paintSummonCoordination(c: CanvasRenderingContext2D, e: SummonTechniqueArt): boolean {
  if (e.kind !== 'pincer' && e.kind !== 'seal') return false;
  const p = toArt(e.at, .7), t = clamp(e.age / summonTechniqueSeconds(e), 0, 1), fade = (1-t)**1.2;
  if (t >= 1) return true;
  c.save();
  if (e.kind === 'pincer') {
    const paths = e.partnerSource && e.partner
      ? [{ from: e.partnerSource, element: e.partner.element }, { from: e.source, element: e.element }]
      : [{ from: e.source, element: e.element }];
    for (const [n, path] of paths.entries()) {
      const dx = p.x-path.from.x, dy = p.y-path.from.y, length = Math.hypot(dx,dy)||1, ux = dx/length, uy = dy/length;
      const u = clamp(e.age/.34,0,1), reach = Math.min(235,length)*(1-u)**.6, side = n ? 1 : -1;
      if (reach > 1) {
        const start = {x:p.x-ux*reach,y:p.y-uy*reach};
        const bend = {x:(start.x+p.x)/2-uy*side*22,y:(start.y+p.y)/2+ux*side*22};
        c.save();c.globalAlpha *= (1-u)*.95;c.lineCap='round';
        for(const [color,width] of [['#1c302be0',7],[COLORS[path.element],4]] as const){c.beginPath();c.moveTo(start.x,start.y);c.quadraticCurveTo(bend.x,bend.y,p.x,p.y);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
        paintSpiritMaterial(c,path.element,0,p.x-ux*24-uy*side*10,p.y-uy*24+ux*side*10,68,33,Math.atan2(dy,dx),.68);c.restore();
      }
    }
    c.save();c.globalAlpha *= fade*.8;
    for(let n=0;n<6;n++){const a=n*Math.PI/3+.2,r=12+t*40;line(c,[{x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r*.58},{x:p.x+Math.cos(a)*(r+8),y:p.y+Math.sin(a)*(r+8)*.58}],'#d9c89b',1.7);}
    c.restore();
  } else {
    const elements = e.toElement ? [e.element,e.toElement] : [e.element];
    for(const [n,element] of elements.entries()) {
      const side=elements.length===1?0:n?1:-1, offset=side*(34+t*11), open=clamp((e.age-(n?.045:0))/.09,0,1);
      const x=p.x+offset,y=p.y-40-Math.sin(t*Math.PI)*8;
      c.save();c.globalAlpha *= fade*open*(n?.85:.64);
      paintSpiritMaterial(c,element,0,x,y,84*(.7+open*.3),56,side*.42,1);
      // Short mineral/ink strokes carry each material toward its shared contact.
      c.beginPath();c.moveTo(x,y+13);c.quadraticCurveTo(x+side*15,p.y-3,p.x+side*6,p.y+5);c.strokeStyle=COLORS[element];c.lineWidth=1.4;c.stroke();
      c.restore();
    }
  }
  c.restore();return true;
}
