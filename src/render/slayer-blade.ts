import { clamp } from '../core/math';
import { line, shape } from './ink';

/** A tapered brush-cut silhouette; the edge stays sharp without a blurred canvas filter. */
export function blade(c: CanvasRenderingContext2D, length: number, width: number, color: string): void {
  c.beginPath(); c.moveTo(-length * .64, width * .12);
  c.bezierCurveTo(-length * .24, -width * .32, length * .08, -width * .92, length * .57, -width * .36);
  c.bezierCurveTo(length * .2, -width * .44, -length * .04, width * .62, -length * .5, width * .42);
  c.lineTo(-length * .31, width * .06); c.closePath(); c.fillStyle = color; c.fill();
}

/** The two sides of the marked opening snap apart at the actual follow-up contact. */
export function paintOpeningImpact(c: CanvasRenderingContext2D, age: number, life: number, angle: number, reduced: boolean): void {
  const t = clamp(age / life, 0, 1), travel = reduced ? 3 : 15 * (1 - Math.pow(1 - t, 3));
  c.save(); c.rotate(angle); c.globalAlpha *= (1 - t) ** 1.25;
  for (const side of [-1, 1]) {
    c.save(); c.translate(0, side * (4 + travel)); c.scale(1, side);
    const edge = [{x:-18,y:2},{x:-7,y:-5},{x:1,y:2},{x:13,y:-5},{x:21,y:-1}];
    line(c,edge,'#152322',4);line(c,edge,'#f6cb95',2);
    c.restore();
  }
  blade(c, reduced ? 48 : 44 + Math.sin(Math.min(1, t * 3) * Math.PI) * 25, 3, '#fff1c8');
  if (!reduced) for (let i = 0; i < 6; i++) {
    const a = i * 2.399, r = 14 + travel * (1 + i % 2);
    c.save(); c.translate(Math.cos(a) * r, Math.sin(a) * r); c.rotate(a);
    shape(c, [-7 * (1 - t), 0, 0, -2, 7 * (1 - t), 0, 0, 2], '#fff1c8', '#c78459', .7); c.restore();
  }
  c.restore();
}

/** A short hooked edge points back along the returning blade, only at real contact. */
export function paintReturnImpact(c: CanvasRenderingContext2D, age: number, life: number, angle: number, reduced: boolean): void {
  const t=clamp(age/life,0,1);
  c.save();c.rotate(angle);c.globalAlpha*=(1-t)**1.3;
  blade(c,94,10,'#132523');blade(c,84,5,'#b6d8b9');blade(c,78,2,'#fff3d5');
  for(const side of [-1,1]) {
    const edge=[{x:-30,y:side*12},{x:-5,y:side*17},{x:19,y:side*5}];
    line(c,edge,'#142724',4);line(c,edge,'#e1e8bf',1.7);
  }
  if(!reduced)for(let i=0;i<3;i++){
    c.save();c.translate(-10-t*(24+i*9),(i-1)*(8+t*15));c.rotate((i-1)*.35);
    blade(c,(12+i*4)*(1-t),1.8,'#e4edcf');c.restore();
  }
  c.restore();
}

export function paintSlayerImpact(c: CanvasRenderingContext2D, age: number, life: number, angle: number, level: number, kills: number, tint: string, pure: boolean, reduced: boolean): void {
  const t = clamp(age / life, 0, 1), fade = Math.pow(1 - t, 1.25);
  const size = (pure ? 370 : 98 + level * 44 + Math.min(8, kills) * 5);
  // One local accent, not a full-screen flash. Reduced motion keeps the static edge only.
  c.save(); c.rotate(angle); c.globalAlpha *= fade;
  if (!reduced && level >= 2) {
    c.save(); c.globalAlpha *= .13 * Math.max(0, 1 - age / .18);
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, size * .62);
    glow.addColorStop(0, '#fff1c9'); glow.addColorStop(.25, tint); glow.addColorStop(1, tint + '00');
    c.fillStyle = glow; c.fillRect(-size, -size, size * 2, size * 2); c.restore();
  }
  const count = pure ? 2 : 1;
  for (let i = 0; i < count; i++) {
    c.save();
    // The perpendicular cut follows the original, each with its own sweep and taper.
    c.rotate(i * Math.PI / 2);
    const reveal = reduced ? 1 : clamp((age + .055 - i * .025) / .13, 0, 1);
    c.translate(reduced ? 0 : (reveal - .6) * size * .12, 0);
    c.scale(.56 + reveal * .44, 1);
    blade(c, size * 1.1, 15 + level * 8, '#101d21');
    blade(c, size, 10 + level * 6, tint);
    blade(c, size * .97, 5 + level * 3, '#fff5db');
    if (!reduced && age > .09) {
      c.save(); c.translate(-size * .07, 12 + t * 18); c.globalAlpha *= .22 * (1 - t);
      blade(c, size * .87, 4, tint); c.restore();
    }
    c.restore();
  }
  if (!reduced && level >= 2) {
    // Directional steel fragments peel away from the cut; the budget is fixed per impact.
    for (let i = 0; i < (pure ? 18 : 10); i++) {
      const a = i * 2.399, travel = 12 + (1 - Math.pow(1 - t, 3)) * size * (.12 + (i % 3) * .06);
      const x = Math.cos(a) * travel, y = Math.sin(a) * travel * .55;
      c.save(); c.translate(x, y); c.rotate(a + .4);
      const length = (7 + i % 4 * 4) * (1 - t), width = 1.5 + (i % 2);
      shape(c, [-length, 0, 0, -width, length * .8, 0, -length * .2, width], i % 3 ? tint : '#fff4d1', '#23302b', .7);
      c.restore();
    }
  }
  c.restore();
}
