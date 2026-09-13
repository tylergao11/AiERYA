import { clamp } from '../core/math';
import type { Element } from '../game/contracts';
import type { RunSpirit } from '../game/rogue-combat';
import { spiritRestriction } from '../game/spirit-restrictions';
import type { World } from '../game/world';
import { COLORS, flame, line, oval, shape } from './ink';
import { toArt, type Pixel } from './projection';
import { paintSpiritMaterial } from './spirit-material';

interface Action { element: Element; age: number; duration: number; release: boolean }
export interface ArmamentFrame {
  id: number; at: Pixel; feet: Pixel; angle: number; element?: Element; stock: number;
  ready: boolean; united: boolean; restricted: boolean; expiring: boolean;
  windup: number; release: number; clock: number; scale: number;
}

/** Finite orders live on the real weapon anchor. Drawing cannot spend or refresh them. */
export class SummonArmament {
  private readonly actions = new Map<number, Action>();
  private clock = 0;
  private disposed = false;
  private readonly reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  private readonly off: (() => void)[];
  constructor(private readonly world: World, private readonly anchor: (s: RunSpirit) => Pixel, private readonly weapon: (s: RunSpirit) => Pixel) {
    this.off = [world.events.on('spiritAttack', e => {
      if(e.echo || !e.empowered || e.stage !== 'windup' || world.phase !== 'battle')return;
      if(!world.mechanics.spirits.some(s => s.id === e.spiritId))return;
      this.actions.set(e.spiritId, { element: e.element, age: 0, duration: Math.max(.01, e.duration), release: false });
    }), world.events.on('summonImpact', e => { if(!e.echo)this.release(e.spiritId, e.element, true); }),
    world.events.on('spiritAttack', e => {
      if(e.stage === 'launch' && e.empowered && !e.echo)this.release(e.spiritId, e.element, false);
    }), world.events.on('phase', () => this.clear()), world.events.on('reset', () => this.clear())];
  }
  private release(id: number | undefined, element: Element, meleeOnly: boolean): void {
    if(id === undefined || this.world.phase !== 'battle')return;
    const owner = this.world.mechanics.spirits.find(s => s.id === id);
    if(!owner || spiritRestriction(this.world, owner))return;
    // Ranged weapons release at launch; a distant hit must not fire the mouth twice.
    if(meleeOnly && owner.size < 1.7 && owner.element !== 'wood' && owner.element !== 'earth')return;
    this.actions.set(owner.id, { element, age: 0, duration: .16, release: true });
  }
  update(dt: number): void {
    if(this.disposed || this.world.phase !== 'battle' || !this.world.mechanics.commands.active){this.clear();return;}
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0; this.clock += step;
    for(const [id, action] of this.actions){
      const owner = this.world.mechanics.spirits.find(s => s.id === id);
      action.age += step;
      if(!owner || spiritRestriction(this.world, owner) || action.age >= action.duration || !action.release && owner.cast <= 0)this.actions.delete(id);
    }
  }
  frames(): ArmamentFrame[] {
    const command = this.world.mechanics.commands;
    if(this.disposed || !command.active || this.world.phase !== 'battle')return [];
    return command.troops.flatMap(s => {
      const action = this.actions.get(s.id), stock = command.amount(s.id), united = command.united(s.id);
      const element = command.element(s.id) ?? (action?.release ? action.element : undefined);
      if(!element && !command.ready)return [];
      const feet = this.anchor(s), at = this.weapon(s), target = this.world.wolves.find(w => w.id === s.targetId && w.action !== 'dead');
      const aim = target ? toArt(target, .7) : { x: at.x + (Math.sign(at.x - feet.x) || 1) * 30, y: at.y };
      const expiry = command.expiry(s.id), restricted = !!spiritRestriction(this.world, s);
      return [{ id: s.id, feet, at, element, stock, united, ready: command.ready, restricted,
        angle: Math.atan2(aim.y - at.y, aim.x - at.x), expiring: united ? expiry.union : stock > 0 && expiry.stock >= stock - 1e-8,
        windup: !restricted && action && !action.release ? clamp(action.age / action.duration, 0, 1) : 0,
        release: !restricted && action?.release ? 1 - action.age / action.duration : 0,
        clock: this.reduced.matches ? 0 : this.clock + s.id * .37,
        scale: s.role === 'main' && this.world.build.has('beast') ? 1.18 : 1 }];
    });
  }
  paint(c: CanvasRenderingContext2D): void {
    for(const frame of this.frames())paintArmament(c, frame, this.reduced.matches);
  }
  clear(): void { this.actions.clear(); this.clock = 0; }
  dispose(): void { this.disposed = true; this.off.forEach(off => off()); this.clear(); }
}

/** Local, directional silhouettes keep each infusion readable without recolouring the body. */
export function paintArmament(c: CanvasRenderingContext2D, f: ArmamentFrame, reduced = false): void {
  const color = f.element ? COLORS[f.element] : '#d2bd8e';
  const pulse = reduced ? 1 : 1 + Math.sin(f.clock * 3.2) * .04;
  const fading = f.expiring && !reduced ? .55 + .22 * Math.sin(f.clock * 7) : 1;
  const released = f.release > 0 ? f.release : 1;
  const stockWeight = f.united || !f.element ? 1 : f.stock > 0 ? .35 + .65 * Math.min(1, f.stock) : released;
  const opacity = f.restricted ? .16 : (f.united ? .85 : .64) * fading * stockWeight;
  c.save(); c.translate(f.at.x, f.at.y); c.rotate(f.angle);
  c.globalAlpha *= opacity; const size = f.scale * pulse * (f.united ? 1.2 : 1) * (1 - (reduced ? 0 : f.windup) * .16);
  c.scale(size, size);
  if(!f.element){
    line(c, [{ x: -9, y: -13 }, { x: -16, y: 0 }, { x: -9, y: 13 }], color, 2);
    line(c, [{ x: 5, y: -9 }, { x: 10, y: 0 }, { x: 5, y: 9 }], color, 1.3);
  }else if(f.element === 'metal'){
    for(const n of [-1, 0, 1]){
      const y = n * 9, reach = n === 0 ? 36 : 23;
      shape(c, [-13, y, 6, y - 4, reach, y, 4, y + 3], n === 0 ? '#b5a276' : '#766c53', '#343930', 1.5);
      line(c, [{ x: -5, y }, { x: reach - 2, y }], '#ead9b0', 1.5);
    }
  }else if(f.element === 'wood'){
    c.beginPath(); c.moveTo(-20, 7); c.bezierCurveTo(-5, 24, 13, 11, 8, -1); c.bezierCurveTo(3, -18, 21, -20, 28, -8);
    c.strokeStyle = '#304333'; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#8caa72'; c.lineWidth = 2.5; c.stroke();
    for(const [x,y,flip] of [[-9,12,1],[8,-9,-1],[25,-10,1]]){
      c.beginPath(); c.moveTo(x!, y!); c.quadraticCurveTo(x!-2, y!-11*flip!, x!+12, y!-9*flip!); c.quadraticCurveTo(x!+10,y!,x!,y!);c.fillStyle='#a1b987';c.fill();
    }
  }else if(f.element === 'water'){
    for(const n of [-1,1]){
      const bend = 15 + Math.sin(f.clock * 4 + n) * 3;
      c.beginPath();c.moveTo(-23,n*5);c.bezierCurveTo(-3,n*bend,18,n*bend,28,0);c.bezierCurveTo(10,n*(bend-5),-8,n*(bend-8),-23,n*5);
      c.fillStyle=n<0?'#538b93':'#7db5b7';c.fill();c.strokeStyle='#c4dfd4';c.lineWidth=1.2;c.stroke();
    }
    for(let n=0;n<3;n++){const t=(f.clock*.6+n/3)%1;oval(c,-15+t*36,Math.sin(t*5+n)*13,1.7,2.7,'#b5d8d2');}
  }else if(f.element === 'fire'){
    if(!f.restricted)flame(c,1,10,24,f.clock*1.2,f.id);
    for(const n of [-1,0,1]){
      const y=n*8,tip=25+Math.sin(f.clock*9+n)*5+(n===0?11:0);
      c.beginPath();c.moveTo(-18,y);c.bezierCurveTo(-7,y-13,7,y+5,tip,y-3);c.bezierCurveTo(13,y+9,-8,y+10,-18,y);
      c.fillStyle=n===0?'#d58b45':'#a6502d';c.strokeStyle='#6f3b2a';c.lineWidth=1;c.fill();c.stroke();
    }
    c.beginPath();c.moveTo(-10,2);c.quadraticCurveTo(6,-6,24,0);c.quadraticCurveTo(1,6,-10,2);c.fillStyle='#ebc28a';c.fill();
  }else{
    for(const n of [-1,0,1]){
      // Leave the mouth / knuckle visible between the charged fragments.
      const x=n===0?25:0,y=n*13;
      shape(c,[x-8,y-3,x-3,y-7,x+7,y-4,x+9,y+3,x+1,y+6,x-7,y+3],n===0?'#b1a080':'#82735b','#3e4035',1.5);
      line(c,[{x:x-6,y:y-3},{x:x-2,y:y-5},{x:x+5,y:y-2}],'#dfcfa9',1.2);
    }
  }
  if(f.element && !f.restricted)paintSpiritMaterial(c,f.element,0,6,0,54,32,0,.35);
  if(f.united && !f.restricted){
    line(c,[{x:-31,y:-17},{x:-23,y:-10}], '#e6d5ac',2);
    line(c,[{x:-31,y:17},{x:-23,y:10}], '#e6d5ac',2);
  }
  if(f.release > 0 && !f.restricted && !reduced){
    c.globalAlpha *= f.release;
    for(const n of [-1,0,1]){const x=24+(1-f.release)*26;line(c,[{x,y:n*8},{x:x+12*f.release,y:n*10}],color,1.8);}
  }
  c.restore();
  c.save();c.globalAlpha*=f.restricted?.25:.65;
  for(let n=0;n<Math.min(4,Math.ceil(f.stock));n++){
    const x=f.feet.x+(n-1.5)*7,amount=clamp(f.stock-n,0,1);
    oval(c,x,f.feet.y+8,2.5,1.8,'#394438');oval(c,x-(1-amount)*2,f.feet.y+8,2*amount,1.3,color);
  }
  c.restore();
}
