import type { Element } from '../game/contracts';
import type { Pixel } from './projection';
import { COLORS, glow, line, oval, shape } from './ink';
import { paintSpiritMaterial } from './spirit-material';

/** Short material strokes accompany existing hits; no new targeting or damage. */
export function paintSpiritStrike(c: CanvasRenderingContext2D, from: Pixel, to: Pixel, element: Element, age: number, ancestor: boolean, phase?: 'flight' | 'impact', duration = .22, force = 1): void {
  const t = Math.min(1, age / duration), dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy), color = COLORS[element];
  if (age > Math.max(.6,duration)) return;
  const angle=Math.atan2(dy,dx);
  if(phase==='flight'){
    const head={x:from.x+dx*t,y:from.y+dy*t},length=Math.min(120*force,Math.max(58,distance*.64));
    // The leading tip, rather than the sprite centre, follows the damage projectile.
    const trail={x:head.x-Math.cos(angle)*length*.36,y:head.y-Math.sin(angle)*length*.36};
    if(paintSpiritMaterial(c,element,0,trail.x,trail.y,length,(element==='metal'?43:element==='earth'?66:64)*force,angle,Math.min(1,(t+.15)*4))){
      c.save();c.globalAlpha*=.36;
      for(let n=0;n<3;n++){const back=length*(.35+n*.12),spread=(n-1)*7;
        line(c,[{x:head.x-Math.cos(angle)*back-Math.sin(angle)*spread,y:head.y-Math.sin(angle)*back+Math.cos(angle)*spread},{x:head.x-Math.cos(angle)*(back+13)-Math.sin(angle)*spread,y:head.y-Math.sin(angle)*(back+13)+Math.cos(angle)*spread}],color,1.7);}
      c.restore();return;
    }
  }else{
    const impactT=Math.min(1,age/Math.max(.25,duration)),grow=1-Math.pow(1-Math.min(1,impactT*4),3);
    const fade=Math.min(1,(1-impactT)*2.3),width=(ancestor?145:105)*(.52+grow*.48);
    if(paintSpiritMaterial(c,element,1,to.x,to.y-10,width,width*(element==='metal'?.65:.82),element==='metal'?angle*.35:0,fade)){
      if(ancestor){c.save();c.globalAlpha=fade;
        for(let n=-1;n<=1;n++){c.beginPath();c.moveTo(to.x-38+n*12,to.y-43);c.bezierCurveTo(to.x-32+n*12,to.y-8,to.x+6+n*12,to.y+21,to.x+35+n*12,to.y+31);c.strokeStyle='#26302bd0';c.lineWidth=8;c.stroke();c.strokeStyle='#e7d5ae';c.lineWidth=3.4;c.stroke();}c.restore();}
      return;
    }
  }
  if(distance<1)return;
  c.save(); c.translate(from.x, from.y); c.rotate(Math.atan2(dy, dx));
  const head = distance * (phase === 'flight' ? t : 1 - Math.pow(1 - t, 3)), tail = Math.max(0, head - Math.min(distance, 45));
  if (phase !== 'impact' && age < (phase === 'flight' ? duration : .25)) {
    c.globalAlpha *= Math.min(1, (age + .03) * 16) * (phase === 'flight' ? 1 : 1 - age / .3);
    if (element === 'metal') {
      for (const offset of [-5, 0, 5]) { shape(c, [tail, offset, head - 9, offset - 2, head + 5, offset, head - 9, offset + 2], '#ead7a1'); line(c, [{ x: tail, y: offset }, { x: head, y: offset }], '#fff2d2', .8); }
    } else if (element === 'wood') {
      const points = Array.from({ length: 9 }, (_, i) => ({ x: head * i / 8, y: Math.sin(i * 1.3 + t * 3) * 7 * Math.sin(Math.PI * i / 8) }));
      line(c, points, '#24352a', 5); line(c, points, '#83a971', 2);
      for (let i = 2; i < 8; i += 2) { const p = points[i]!; shape(c, [p.x - 6, p.y, p.x, p.y - 7, p.x + 4, p.y], color); }
    } else if (element === 'water') {
      c.beginPath(); c.moveTo(tail, 0); c.quadraticCurveTo((tail + head) / 2, -10, head + 6, 0); c.quadraticCurveTo((tail + head) / 2, 7, tail, 0); c.fillStyle = '#588b9abb'; c.fill();
      line(c, [{ x: tail + 6, y: 0 }, { x: head, y: -1 }], '#c2e0df', 1.8);
    } else if (element === 'fire') {
      shape(c, [tail, -2, head - 11, -7, head + 6, 0, head - 12, 6, tail + 10, 3, tail + 21, 0], '#c75328');
      shape(c, [tail + 12, 0, head - 7, -3, head + 4, 0, head - 8, 3], '#f2c372');
    } else {
      for (let i = 0; i < 3; i++) { const x = head - i * 13, y = (i % 2 * 2 - 1) * i * 4; shape(c, [x - 6, y, x - 2, y - 5, x + 6, y - 2, x + 3, y + 4, x - 4, y + 4], '#ad9770', '#36433c', 1.5); }
    }
  }
  c.restore();
  if (phase === 'flight') return;
  const impact = Math.max(0, 1 - age / .4);
  if (impact <= 0) return;
  c.save(); c.globalAlpha *= impact;
  glow(c, to.x, to.y, ancestor ? 37 : 23, color, .16 * impact);
  if (ancestor) {
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(to.x - 22 + i * 10, to.y - 25); c.quadraticCurveTo(to.x - 8 + i * 10, to.y - 2, to.x + 19 + i * 10, to.y + 15); c.strokeStyle = '#d7c096'; c.lineWidth = 3 * impact; c.stroke(); }
  } else {
    for (let i = 0; i < 5; i++) { const angle = i * 2.4, r = 7 + age * 46, p = { x: to.x + Math.cos(angle) * r, y: to.y + Math.sin(angle) * r * .65 }; line(c, [p, { x: p.x + Math.cos(angle) * 6 * impact, y: p.y + Math.sin(angle) * 6 * impact }], color, 1.8); }
  }
  if (element === 'earth') oval(c, to.x, to.y + 12, 13 + age * 35, 3 + age * 5, '#95846833');
  c.restore();
}
