import type { Element } from '../game/contracts';
import type { ArrayStyle } from '../game/array-momentum';

type C = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;
export const sat = (n: number): number => Math.max(0, Math.min(1, n));
export const out = (n: number): number => 1 - (1 - sat(n)) ** 3;
export const SPELL_INK: Record<Element, { light: string; body: string; dark: string }> = {
  metal: { light: '#fff7d6', body: '#dfc58c', dark: '#26343a' },
  wood: { light: '#e5ffc0', body: '#8dc77b', dark: '#193c32' },
  water: { light: '#dcffff', body: '#72d9de', dark: '#124655' },
  fire: { light: '#fff1b6', body: '#f69b51', dark: '#873827' },
  earth: { light: '#ffe7a7', body: '#caab76', dark: '#54432c' },
};

export function ring(c: C, r: number, color: string, width = 2, squash = .48): void {
  c.beginPath(); c.ellipse(0, 0, Math.max(.01, r), Math.max(.01, r * squash), 0, 0, TAU);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

/** Double-stroked ink gives the spell a silhouette against both sand and water.
 * Local gradients replace full-screen blur and keep concurrent arrays bounded. */
export function strokeInk(c: C, color: string, width: number, dark = '#112a2b'): void {
  c.strokeStyle = dark; c.lineWidth = width + 3; c.stroke();
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

export function glow(c: C, x: number, y: number, r: number, color: string, alpha: number, squash = .55): void {
  if (r <= 0 || alpha <= 0) return;
  c.save(); c.translate(x, y); c.scale(1, squash); c.globalAlpha *= alpha;
  const light = c.createRadialGradient(0, 0, 0, 0, 0, r);
  light.addColorStop(0, color); light.addColorStop(.26, color + '90'); light.addColorStop(1, color + '00');
  c.fillStyle = light; c.fillRect(-r, -r, r * 2, r * 2); c.restore();
}

/** Decorative seal, never a targeting outline. The actual hand-drawn footprint
 * is painted separately by ArrayPainter. */
export function ritual(c: C, r: number, color: string, phase: number, strength = 1): void {
  c.save(); c.scale(1, .48); c.rotate(phase); c.strokeStyle = color;
  for (const scale of [1, .91, .67]) {
    c.lineWidth = scale === 1 ? 2.5 : 1.2; c.beginPath(); c.arc(0, 0, r * scale, 0, TAU); c.stroke();
  }
  for (let i = 0; i < 32; i++) {
    const a = i * TAU / 32, long = i % 4 === 0;
    c.beginPath(); c.moveTo(Math.cos(a) * r * .93, Math.sin(a) * r * .93);
    c.lineTo(Math.cos(a) * r * (long ? .81 : .87), Math.sin(a) * r * (long ? .81 : .87)); c.stroke();
  }
  if (strength > .4) {
    c.beginPath();
    for (let i = 0; i <= 5; i++) { const a = i * TAU * 2 / 5 - Math.PI / 2; const x = Math.cos(a) * r * .67, y = Math.sin(a) * r * .67; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  }
  c.restore();
}

function blade(c: C, x: number, y: number, angle: number, length: number, width: number): void {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.beginPath(); c.moveTo(0, -length); c.lineTo(width, -length * .18); c.lineTo(3, 8); c.lineTo(-3, 8); c.lineTo(-width, -length * .18); c.closePath();
  const steel=c.createLinearGradient(-width,0,width,0);steel.addColorStop(0,'#3a564fea');steel.addColorStop(.45,'#e7e9c6');steel.addColorStop(.52,'#ffffe6');steel.addColorStop(1,'#a09b76');
  c.fillStyle = steel; c.fill(); strokeInk(c, '#f4e4af', 1.8);
  c.beginPath(); c.moveTo(0, -length + 6); c.lineTo(0, 5); c.strokeStyle = '#fffde0'; c.lineWidth = 2; c.stroke();
  c.beginPath(); c.moveTo(-width * 1.5, 3); c.lineTo(width * 1.5, 3); c.stroke(); c.restore();
}

function swords(c: C, r: number, t: number, splinter: boolean): void {
  const rise = out(t / .12), spread = .8 + out(t / .45) * .2;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + i * Math.PI / 8, x = Math.cos(a) * r * spread, y = Math.sin(a) * r * .47 - 18;
    glow(c,x,y-40,45,'#e4ddb1',.24,1.3);
    blade(c, x, y, (i - 4) * .12, r*(.47 + Math.sin(i * 1.7) * .11) * rise, 4+r/60);
  }
  if (splinter) {
    for (let i = 0; i < 15; i++) {
      const a = i * 2.4, k = out(t / .32), x = Math.cos(a) * r * k, y = Math.sin(a) * r * .5 * k;
      c.save(); c.translate(x, y - 12); c.rotate(a); c.fillStyle = i % 2 ? '#9bca7c' : '#ead9a0';
      c.beginPath(); c.moveTo(-3, 9); c.lineTo(0, -22); c.lineTo(5, 5); c.closePath(); c.fill(); c.restore();
    }
  }
}

function roots(c: C, r: number, t: number, stone: boolean, back:boolean): void {
  const lift = out(t / .15), squeeze = out((t - .12) / .45);
  for (let i = 0; i < 7; i++) {
    const a = (i + .2) * TAU / 7, x = Math.cos(a) * r * .86, y = Math.sin(a) * r * .37;
    if((y<0)!==back)continue;
    const endX = x * (.34 - squeeze * .22), endY = -r * (.76 + (i % 3) * .12) * lift;
    c.beginPath(); c.moveTo(x - 12, y + 9);
    c.bezierCurveTo(x * 1.22, y - r * .43 * lift, endX - 35, endY - 20, endX, endY);
    c.bezierCurveTo(endX - 14, endY + 22, x * .55, y - r * .24, x + 11, y + 8); c.closePath();
    const bark=c.createLinearGradient(x-15,y,endX,endY);bark.addColorStop(0,stone?'#424b38dd':'#284b32dd');bark.addColorStop(.6,'#608357d0');bark.addColorStop(1,'#b6d08a70');
    c.fillStyle = bark; c.fill(); strokeInk(c, '#b7e48f', 2.4, '#142e29');
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x * .92, endY * .63, endX, endY + 3);
    c.strokeStyle = '#e5ffd0'; c.lineWidth = 1.6; c.stroke();
    for (let j = 0; j < 2; j++) {
      const k = .35 + j * .27, lx = x * (1 - k) + endX * k, ly = y * (1 - k) + endY * k;
      c.beginPath(); c.moveTo(lx, ly); c.quadraticCurveTo(lx + 28, ly - 28, lx + 36, ly - 9); c.quadraticCurveTo(lx + 15, ly + 6, lx, ly); c.fillStyle = '#91ba67'; c.fill();
    }
  }
}

function tide(c: C, r: number, t: number, mud: boolean, back:boolean): void {
  const pull = 1 - out(t / .22) * .28 + out((t - .22) / .35) * .38;
  for (let band = 0; band < 3; band++) {
    if((band===2)!==back)continue;
    const rad = r * (.45 + band * .25) * pull, phase = t * 2.3 + band * 2.09;
    c.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = phase + i / 48 * TAU * .84, wave = Math.sin(i / 48 * Math.PI);
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad * .43 - wave * r * (.38 + band * .28);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    for (let i = 48; i >= 0; i--) { const a = phase + i / 48 * TAU * .84; c.lineTo(Math.cos(a) * rad * .84, Math.sin(a) * rad * .43 * .84); }
    c.closePath();const water=c.createLinearGradient(0,-r*.75,0,r*.3);water.addColorStop(0,mud?'#dbc79090':'#d6ffffb8');water.addColorStop(.4,mud?'#8c7e50a0':'#3195a5ac');water.addColorStop(1,'#124a5510');c.fillStyle=water;c.fill();strokeInk(c, mud ? '#dbc898' : '#b5ffff', 2.5);
    for (let i = 0; i < 7; i++) {
      const a = phase + i * .7, x = Math.cos(a) * rad, y = Math.sin(a) * rad * .43 - 18 - (i % 3) * 14;
      c.fillStyle = mud ? '#ead49c' : '#e7ffff'; c.beginPath(); c.ellipse(x, y, 2.5, 5 + i % 3, a, 0, TAU); c.fill();
    }
  }
}

function flames(c: C, r: number, t: number, molten: boolean, back:boolean): void {
  const lift = out(t / .14) * (1 - sat((t - .65) / .8) * .7);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4, x = Math.cos(a) * r * .73, y = Math.sin(a) * r * .36;
    if((y<0)!==back)continue;
    const height = r * (.6 + (i % 4) * .19) * lift, width = 12 + r * .075;
    const curl = Math.sin(t * 9 + i) * width;
    for (let layer = 0; layer < 3; layer++) {
      const s = 1 - layer * .28, h = height * s, w = width * s;
      c.beginPath(); c.moveTo(x - w, y);
      c.bezierCurveTo(x - w * 1.5, y - h * .38, x + curl - w, y - h * .58, x + curl, y - h);
      c.bezierCurveTo(x + curl + 2, y - h * .45, x + w * 1.7, y - h * .4, x + w, y); c.closePath();
      const fire=c.createLinearGradient(x,y,x+curl,y-h);fire.addColorStop(0,layer===0?'#c7542770':layer===1?'#f9ae50a0':'#ffefb9d8');fire.addColorStop(.34,layer===0?'#e27c3390':layer===1?'#ffc770d0':'#fff6cddd');fire.addColorStop(.8,layer===0?'#bf532b66':layer===1?'#fbc888b0':'#fff1bba0');fire.addColorStop(1,'#fff0c000');
      c.fillStyle=fire;c.fill();
    }
    glow(c,x,y-15,width*2.7,'#ffb657',.2,.65);
    for(let j=0;j<3;j++){const rise=(t*.9+i*.17+j*.23)%1;c.fillStyle=j%2?'#ffe6a5':'#ffbd6a';c.beginPath();c.ellipse(x+Math.sin(i+j+rise*4)*25,y-rise*height*1.2,1.5,3.5,-.3,0,TAU);c.fill();}
    if (molten) blade(c, x, y - height * .25, .25 * Math.sin(i), 32, 4);
  }
}

function rock(c: C, x: number, y: number, size: number, height: number): void {
  c.beginPath(); c.moveTo(x - size, y); c.lineTo(x - size * .8, y - height); c.lineTo(x + size * .2, y - height - size * .4); c.lineTo(x + size, y - height * .7); c.lineTo(x + size, y); c.closePath();
  c.fillStyle = '#61503de8'; c.fill(); strokeInk(c, '#d8b981', 2);
  c.beginPath(); c.moveTo(x - size * .8, y - height); c.lineTo(x, y - height * .68); c.lineTo(x + size, y - height * .7); c.moveTo(x, y - height * .68); c.lineTo(x + size * .1, y - 4);
  c.strokeStyle = '#f0d394'; c.lineWidth = 2; c.stroke();
}

function mountain(c: C, r: number, t: number, back:boolean): void {
  for (let i = 0; i < 9; i++) {
    const a = i * TAU / 9, grow = out((t - i * .014) / .15), x = Math.cos(a) * r * .86, y = Math.sin(a) * r * .37;
    if((y<0)!==back)continue;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(x * .42, y * .5 - 8); c.lineTo(x, y); strokeInk(c, '#e1c28e', 2);
    rock(c, x, y, 15 + i % 3 * 5, (42 + i % 4 * 19) * grow);
  }
  if(!back)return;
  const drop = (1 - out(t / .12)) * r, width = 79.2, base = -r*.317 - drop;
  c.save(); c.translate(0, base); c.rotate(-.08);c.scale(r/180,r/180);
  const stone=c.createLinearGradient(-width,-135,width,0);stone.addColorStop(0,'#bc9962d9');stone.addColorStop(.3,'#5e533ccf');stone.addColorStop(1,'#342f29c9');
  c.fillStyle=stone;c.beginPath();c.moveTo(-width,-135);c.lineTo(width,-135);c.lineTo(width+13,-119);c.lineTo(width+13,9);c.lineTo(-width+12,9);c.lineTo(-width,0);c.closePath();c.fill();
  c.strokeStyle='#f1d18b';c.lineWidth=3;c.strokeRect(-width,-135,width*2,135);c.lineWidth=1.5;c.strokeRect(-width+8,-127,width*2-16,119);
  c.fillStyle='#ffedb4';c.font='bold 86px "KaiTi","STKaiti",serif';c.textAlign='center';c.fillText('镇',0,-35);
  c.beginPath();c.moveTo(-width+12,9);c.lineTo(width+13,9);c.lineTo(width+13,-119);c.stroke();c.restore();
}

function steam(c: C, r: number, t: number, back:boolean): void {
  tide(c, r, t, false,back);
  if(!back)return;
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, rise = out(t / .25), x = Math.cos(a) * r * .67, y = Math.sin(a) * r * .29 - rise * r * (.55 + (i % 3) * .18);
    c.save(); c.globalAlpha *= .6 * (1 - sat(t / 1.3));
    const vapor = c.createRadialGradient(x, y, 1, x, y, r * .35); vapor.addColorStop(0, '#f5edd9bc'); vapor.addColorStop(1, '#d1f8ee00');
    c.fillStyle = vapor; c.fillRect(x - r * .35, y - r * .35, r * .7, r * .7); c.restore();
  }
}

export function spellBody(c: C, style: ArrayStyle, r: number, t: number, back=false): void {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  if(!back)c.globalAlpha*=.76;
  if (style === 'metal' || style === 'splinter') {if(back)swords(c, r, t, style === 'splinter');}
  else if (style === 'wood' || style === 'rupture') { if (style === 'rupture'&&back) for (let i = 0; i < 6; i++) rock(c, Math.cos(i) * r * .6, Math.sin(i) * r * .3, 13, 26); roots(c, r, t, style === 'rupture',back); }
  else if (style === 'water' || style === 'mud') { tide(c, r, t, style === 'mud',back); if (style === 'mud'&&back) for (let i = 0; i < 6; i++) rock(c, Math.cos(i) * r * .8, Math.sin(i) * r * .35, 9, 20); }
  else if (style === 'fire' || style === 'melt') flames(c, r, t, style === 'melt',back);
  else if (style === 'steam') steam(c, r, t,back);
  else mountain(c, r, t,back);
  c.restore();
}

/** Impacts are anchored to confirmed hit positions, including narrow metal rays. */
export function spellHit(c: C, style: ArrayStyle, element: Element, x: number, y: number, t: number, index: number, power: number): void {
  const ink = SPELL_INK[element], fade = 1 - sat(t / .46); if (fade <= 0) return;
  c.save(); c.translate(x, y - 12); c.globalAlpha *= fade;
  glow(c, 0, 0, 35 + power * 24, ink.light, .35, .8);
  if (style === 'metal' || style === 'splinter' || style === 'melt') {
    c.rotate(-.65); c.beginPath(); c.moveTo(-36 - t * 35, 0); c.lineTo(36 + t * 35, 0); strokeInk(c, ink.light, 4);
  } else if (style === 'wood' || style === 'rupture') {
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, -i * 13, 22 - i * 4, 8, .2 * i, -.2, TAU - .7); strokeInk(c, '#dbffad', 3); }
  } else {
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + index, near = 8 + t * 25, far = near + 17 + power * 12;
      c.beginPath(); c.moveTo(Math.cos(a) * near, Math.sin(a) * near * .8); c.lineTo(Math.cos(a) * far, Math.sin(a) * far * .8); strokeInk(c, ink.light, i % 2 ? 2 : 3.5);
    }
  }
  c.restore();
}
