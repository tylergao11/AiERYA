import type { Element } from '../game/contracts';
import { oval, shape } from './ink';
import { paintSpiritEntry } from './spirit-entry';

/** Small material details belong to the body, not a persistent skill circle. */
export function paintSpiritPresence(c: CanvasRenderingContext2D, element: Element, age: number, scale: number, beast: boolean): void {
  c.save(); c.scale(scale,scale);
  paintSpiritEntry(c,element,age,beast);
  c.globalAlpha=Math.min(1,age*2)*.56;
  if (element==='fire'&&!beast) {
    for(let n=0;n<5;n++){const t=(age*.55+n/5)%1,x=-21+n*10+Math.sin(t*5+n)*8;
      c.globalAlpha=(1-t)*.55;shape(c,[x,-14-t*70,x+2,-22-t*70,x+4,-15-t*70,x+1,-9-t*70],'#d99353','#ab5936',.5);}
  } else if(element==='water'&&!beast) {
    for(let n=0;n<3;n++){const t=(age*.42+n/3)%1,x=Math.sin(t*5+n)*22;
      c.globalAlpha=Math.sin(t*Math.PI)*.45;oval(c,x,-12-t*70,1.5,3,'#a5d1ce');}
  }
  c.restore();
}
