import type { RunSpirit } from '../game/rogue-combat';
import type { World } from '../game/world';
import type { Element, GameEvents } from '../game/contracts';
import { COLORS, glow, line, oval } from './ink';
import { ART, toArt, type Pixel } from './projection';
import { SpiritPoses, ancestorFrame, spiritAttackRow, spiritActionMotion, spiritMeleeBlend, type SpiritPose } from './spirit-pose';
import { paintSpiritPresence } from './spirit-presence';
import { spiritWalkContact, spiritWalkFrame, spiritWalkMuzzle } from './spirit-gait';
import { paintSpiritTransition, spiritTransitionFrame, SPIRIT_TRANSITION_SECONDS, type SpiritTransition } from './spirit-transition';
import { SpiritRestrictionArt } from './spirit-restriction-art';
import type { LabelRect } from './combat-labels';
import { SpiritFootfalls } from './spirit-footfalls';
import { BeastFeastArt } from './beast-feast';
import { spiritEntryFrame } from './spirit-entry';
import { paintEarthGait } from './earth-gait';

export interface SpiritSheets { spirits: HTMLImageElement; ancestor: HTMLImageElement; spiritWalk?: HTMLImageElement; spiritEffects?: HTMLImageElement; spiritGround?:HTMLImageElement }
const WIDTH: Record<Element, number> = { metal: 94, wood: 86, water: 91, fire: 96, earth: 94 };
const PRESENCE: Record<Element, number> = { metal: 1.38, wood: 1.5, water: 1.68, fire: 1.7, earth: 1.58 };
const bodyUnit=(element:Element,row:number)=>WIDTH[element]/307.2*(row===1?(element==='earth'?1.18:element==='wood'?1.08:1):1);
// Actual sword tips, antlers, mouths and fists in the two painted frames.
const MUZZLES:Record<Element,readonly [readonly [number,number],readonly [number,number]]>={
  metal:[[178,432],[285,751]],wood:[[546,197],[564,822]],water:[[885,232],[923,746]],fire:[[1183,185],[1184,729]],earth:[[1463,397],[1490,733]],
};

function bodyMotion(pose:SpiritPose,flight:boolean,beast:boolean,entry:ReturnType<typeof spiritEntryFrame>,walking:boolean,id:number,rigged=false){
  const motion=spiritActionMotion(pose.elapsed,pose.windup,pose.recovery),pull=motion.pull,strike=motion.strike*pose.force;
  const facing=Math.sign(pose.heading)||pose.facing,turn=1-Math.abs(pose.heading);
  const weight=walking?pose.walkWeight:0;
  const bob=flight?Math.sin(pose.age*2.5+id)*3.8-8:rigged?0:-Math.abs(Math.sin(pose.stride*Math.PI/2))*(beast?2.8:2.4)*weight;
  return {x:(flight?-7:beast?18:13)*strike-pull*6,y:bob+pull*(flight?3:7)-(beast?4:flight?4:2)*strike+entry.y+turn*2,
    rotation:flight?pull*-.06+strike*.035+Math.max(-.06,Math.min(.06,pose.vx*facing*.012)):rigged?0:Math.sin(pose.stride*Math.PI/2)*(beast?.008:.012)*weight,
    sx:(1+pull*.045+strike*.045)*(1-turn*.18)*entry.sx,sy:(1-pull*.09+strike*.03)*entry.sy,facing};
}
type Frame = { box: readonly [number, number, number, number]; foot: readonly [number, number]; contour?: readonly number[] };
// Generated silhouettes have staggered tails and whiskers. Read their actual gutters,
// retaining alpha and painted outlines; a cell-size crop would cut the dragon's jaw.
const FRAMES: Record<Element, readonly [Frame, Frame]> = {
  metal: [{ box: [0, 70, 308, 435], foot: [161, 474] }, { box: [0, 570, 310, 355], foot: [153, 888], contour: [0,570,310,570,310,785,286,824,286,925,0,925] }],
  wood: [{ box: [319, 65, 291, 456], foot: [461, 494] }, { box: [288, 596, 323, 338], foot: [452, 900], contour: [319,596,611,596,611,934,288,934,288,779,319,724] }],
  water: [{ box: [611, 73, 312, 451], foot: [765, 504] }, { box: [583, 560, 379, 395], foot: [750, 924], contour: [612,560,895,560,895,680,962,700,962,796,866,826,866,955,583,955,583,818,612,759] }],
  fire: [{ box: [923, 70, 285, 458], foot: [1067, 508] }, { box: [899, 531, 322, 436], foot: [1064, 936], contour: [899,531,1221,531,1221,842,1188,859,1188,967,899,967,899,819,963,796,963,695,907,673] }],
  earth: [{ box: [1210, 116, 326, 398], foot: [1373, 484] }, { box: [1192, 615, 344, 333], foot: [1347, 906], contour: [1226,615,1536,615,1536,948,1192,948,1192,850,1226,819] }],
};

/** Illustrated silhouettes carry the design; particles only express the element and action. */
export class SpiritArt {
  private sheets?: SpiritSheets;
  readonly poses = new SpiritPoses();
  private readonly transitions = new Map<number, SpiritTransition>();
  private readonly restrictions = new SpiritRestrictionArt();
  private readonly footfalls = new SpiritFootfalls();
  private readonly feasts = new BeastFeastArt();
  constructor(private readonly world: World) {}
  setAssets(sheets: SpiritSheets): void { this.sheets = sheets; }
  feast(event:GameEvents['beastFeast']):void {
    if(this.world.phase==='battle'&&this.world.mechanics.spirits.some(s=>s.id===event.spiritId&&this.isAncestor(s)))this.feasts.add(event);
  }
  feastEffects(c:CanvasRenderingContext2D):void {
    if(this.world.phase!=='battle')return;
    this.feasts.paint(c,id=>{const s=this.world.mechanics.spirits.find(s=>s.id===id);return s&&this.source(s);});
  }
  transition(event: GameEvents['spiritTransition']): void {
    if (this.world.mechanics.spirits.some(s => s.id === event.spiritId)) this.transitions.set(event.spiritId, { ...event, age: 0 });
  }
  update(dt: number): void {
    if(this.world.phase!=='battle')this.footfalls.clear();else this.footfalls.update(dt);
    if(this.world.phase!=='battle')this.feasts.clear();else this.feasts.update(dt);
    this.poses.update(this.world.mechanics.spirits, dt, id => this.world.wolves.find(w => w.id === id)?.x,(s,side)=>{
      if(this.world.phase!=='battle')return;
      const beast=this.isAncestor(s),pose=this.poses.get(s),p=this.anchor(s),scale=this.scale(s);
      const contact=spiritWalkContact(s.element==='wood'?'wood':'earth',beast,side);
      const entry=spiritEntryFrame(s.element,pose.age-(s.originWard?.26:0),beast);
      const body=bodyMotion(pose,false,beast,entry,true,s.id,!beast&&s.element==='earth'),cs=Math.cos(body.rotation),sn=Math.sin(body.rotation);
      const x=contact.x*body.sx,y=contact.y*body.sy;
      const foot={x:p.x+body.facing*scale*(body.x+x*cs-y*sn),y:p.y+scale*(body.y+x*sn+y*cs)};
      this.footfalls.add(foot,{x:pose.vx*ART.unitX,y:pose.vz*ART.unitY},s.element==='wood'&&!beast,beast,scale,side);
      this.world.events.emit('spiritStep',{spiritId:s.id,at:{x:s.x,z:s.z},element:s.element,ancestor:beast,side});
    });
    this.restrictions.update(this.world, dt);
    for (const s of this.world.mechanics.spirits) if (this.restrictions.get(s.id)?.state) this.poses.cancel(s);
    for (const [id, e] of this.transitions) {
      const spirit = this.world.mechanics.spirits.find(s => s.id === id);
      e.age += Number.isFinite(dt) ? Math.max(0, dt) : 0;
      if (!spirit || e.age >= SPIRIT_TRANSITION_SECONDS) { this.transitions.delete(id); continue; }
      this.poses.get(spirit).growth = e.fromSize + (e.toSize - e.fromSize) * spiritTransitionFrame(e.age).growth;
    }
  }
  clear(): void { this.poses.clear(); this.transitions.clear(); this.restrictions.clear(); this.footfalls.clear(); this.feasts.clear(); }
  ground(c:CanvasRenderingContext2D):void {this.footfalls.paint(c);}
  isAncestor(spirit: RunSpirit): boolean { return spirit.role === 'main' && this.world.build.has('beast'); }
  private scale(spirit: RunSpirit): number {
    const growth = this.poses.get(spirit).growth;
    return this.isAncestor(spirit) ? growth / 1.75 * 1.42 : Math.max(spirit.role === 'support' ? .9 : 0, growth) * PRESENCE[spirit.element] * (spirit.role === 'array' ? .86 : 1);
  }
  anchor(spirit: RunSpirit): Pixel {
    const p = toArt(spirit), pose = this.poses.get(spirit), beast = this.isAncestor(spirit);
    // Ground melee coordinates are the contacting forefeet, not the middle of a long body.
    // Keep the painted torso behind the contact point so it does not swallow the wolf.
    const inset = (beast ? 43 : spirit.element === 'wood' || spirit.element === 'earth' ? 22 : 0) * this.scale(spirit);
    return { x: p.x - pose.heading * inset + pose.spread, y: p.y };
  }
  source(spirit: RunSpirit): Pixel {
    const p = this.anchor(spirit), pose = this.poses.get(spirit), beast = this.isAncestor(spirit);
    const scale = this.scale(spirit),flight=!beast&&['metal','water','fire'].includes(spirit.element);
    const entry=spiritEntryFrame(spirit.element,pose.age-(spirit.originWard?.26:0),beast);
    const walking=!flight&&pose.walkWeight>.01&&pose.elapsed>=pose.windup+pose.recovery&&!!this.sheets?.spiritWalk;
    const body=bodyMotion(pose,flight,beast,entry,walking,spirit.id,!beast&&spirit.element==='earth'&&!!this.sheets?.spiritWalk);
    let x=62,y=-66;
    if(!beast){
      const ground=(spirit.element==='wood'||spirit.element==='earth')&&!!this.sheets?.spiritWalk;
      const row=ground?1:spiritAttackRow(pose.elapsed,pose.windup,pose.recovery),frame=FRAMES[spirit.element][row]!,muzzle=MUZZLES[spirit.element][row]!,unit=bodyUnit(spirit.element,row);
      x=(muzzle[0]-frame.foot[0])*unit;y=(muzzle[1]-frame.foot[1])*unit*(ground?1:1+Math.sin(pose.age*2.2+spirit.id)*.01);
      if(ground){const walk=spiritWalkMuzzle(spirit.element as 'wood'|'earth',pose.stride),weight=spiritMeleeBlend(pose.elapsed,pose.windup,pose.recovery);x=walk.x+(x-walk.x)*weight;y=walk.y+(y-walk.y)*weight;}
    }
    x*=body.sx;y*=body.sy;const cs=Math.cos(body.rotation),sn=Math.sin(body.rotation);
    return {x:p.x+body.facing*scale*(body.x+x*cs-y*sn),y:p.y+scale*(body.y+x*sn+y*cs)};
  }
  labelBounds(spirit:RunSpirit):LabelRect {
    const p=this.anchor(spirit),scale=this.scale(spirit),beast=this.isAncestor(spirit);
    const width=(beast?200:WIDTH[spirit.element]*1.1)*scale,height=(beast?100:WIDTH[spirit.element]*1.5)*scale;
    return {x:p.x-width*.5,y:p.y-height,width,height:height+8};
  }
  paint(c: CanvasRenderingContext2D, spirit: RunSpirit): void {
    const sheets = this.sheets;
    if (!sheets) return;
    const p = this.anchor(spirit), pose = this.poses.get(spirit), beast = this.isAncestor(spirit), color = COLORS[spirit.element];
    const scale = this.scale(spirit);
    const motion=spiritActionMotion(pose.elapsed,pose.windup,pose.recovery);
    const attack = motion.active?Math.max(motion.pull*.5,motion.strike):0, birthTime = Math.max(0,pose.age-(spirit.originWard?.26:0));
    const entry=spiritEntryFrame(spirit.element,birthTime,beast),born=entry.opacity,reveal=entry.reveal;
    const flight = !beast && ['metal', 'water', 'fire'].includes(spirit.element);
    const walking = !flight && pose.walkWeight > .01 && !motion.active && !!sheets.spiritWalk;
    const body=bodyMotion(pose,flight,beast,entry,walking,spirit.id,!beast&&spirit.element==='earth'&&!!sheets.spiritWalk);
    const transition = this.transitions.get(spirit.id);
    const restriction = this.restrictions.get(spirit.id), restrictionWeight = restriction?.weight ?? 0;
    c.save(); c.translate(p.x, p.y);
    oval(c, 0, 1, (beast ? 61 : 25) * scale, (beast ? 15 : 7) * scale, '#06100e66');
    oval(c, 2, 1, (beast ? 42 : 17) * scale, (beast ? 8 : 4) * scale, '#08111155');
    c.save(); c.globalAlpha *= 1 - restrictionWeight * .8;
    paintSpiritPresence(c,spirit.element,birthTime,scale,beast);c.restore();
    if (transition) { c.save(); c.scale(scale, scale); paintSpiritTransition(c, transition, false); c.restore(); }
    if (attack > 0 || pose.age < .8) glow(c, 0, -4, (beast ? 72 : 36) * scale, color, (attack * .09 + Math.max(0, .8 - pose.age) * .1));
    c.globalAlpha *= born; c.scale(body.facing * scale, scale);
    if(entry.mask&&reveal<1){c.beginPath();c.rect(-240,-210*reveal,480,240);c.clip();}
    c.translate(body.x,body.y);c.rotate(body.rotation);c.scale(body.sx,body.sy);
    const paintBody = () => {
    if (!flight && sheets.spiritWalk && (!beast||!motion.active)) {
      // Keep the registered walking body at rest; swapping to a differently
      // proportioned idle sheet was visibly shrinking/growing on every stop.
      const frame=spiritWalkFrame(spirit.element==='wood'?'wood':'earth',beast,pose.stride);
      const blend=beast?0:spiritMeleeBlend(pose.elapsed,pose.windup,pose.recovery);
      if(blend<1){c.save();c.globalAlpha*=1-blend;if(!walking&&!motion.active&&spirit.element!=='earth')c.scale(1,1+Math.sin(pose.age*1.8+spirit.id)*.004);
        if(!beast&&spirit.element==='earth')paintEarthGait(c,sheets.spiritWalk,pose.stride);
        else c.drawImage(sheets.spiritWalk,frame.sx,frame.sy,frame.sw,frame.sh,frame.dx,frame.dy,frame.dw,frame.dh);c.restore();}
      if(blend>0){const hit=FRAMES[spirit.element][1],unit=bodyUnit(spirit.element,1),[sx,sy,sw,sh]=hit.box;
        c.save();c.globalAlpha*=blend;c.scale(unit,unit);c.translate(-hit.foot[0],-hit.foot[1]);
        if(hit.contour){c.beginPath();for(let i=0;i<hit.contour.length;i+=2){const x=hit.contour[i]!,y=hit.contour[i+1]!;if(i===0)c.moveTo(x,y);else c.lineTo(x,y);}c.closePath();c.clip();}
        c.drawImage(sheets.spirits,sx,sy,sw,sh,sx,sy,sw,sh);c.restore();}
    } else if (beast) {
      const atlas = sheets.ancestor, frame = ancestorFrame(pose.elapsed,pose.windup,pose.recovery);
      // Calibrated paws stay planted across the asymmetric claw and tail silhouettes.
      const rect = [[0, 0, 768, 512, 425, 480], [768, 0, 768, 512, 435, 480], [0, 512, 780, 512, 420, 448], [784, 512, 752, 512, 410, 455]][frame]!;
      const [sx, sy, sw, sh, px, py] = rect as [number, number, number, number, number, number], unit = 202 / 768;
      c.save(); c.scale(1, 1 + Math.sin(pose.age * 1.7) * .006);
      c.drawImage(atlas, sx, sy, sw, sh, -px * unit, -py * unit, sw * unit, sh * unit); c.restore();
    } else {
      const attackRow=spiritAttackRow(pose.elapsed,pose.windup,pose.recovery);
      const atlas = sheets.spirits, frame = FRAMES[spirit.element][attackRow]!;
      const [sx, sy, sw, sh] = frame.box, unit = bodyUnit(spirit.element,attackRow);
      c.save(); c.scale(1, 1 + Math.sin(pose.age * 2.2 + spirit.id) * .01);
      c.scale(unit, unit); c.translate(-frame.foot[0], -frame.foot[1]);
      if (frame.contour) { c.beginPath(); for (let i = 0; i < frame.contour.length; i += 2) { const x = frame.contour[i]!, y = frame.contour[i + 1]!; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.closePath(); c.clip(); }
      c.drawImage(atlas, sx, sy, sw, sh, sx, sy, sw, sh);
      if (spirit.element === 'metal') {
        // Thin travelling reflections keep the three steel edges legible at phone scale.
        const edges = attackRow ? [[187,669,293,682],[131,739,278,750],[165,810,278,821]] : [[107,253,105,416],[177,230,176,449],[234,284,234,417]];
        c.globalAlpha *= .55 + Math.sin(pose.age * 2) * .1;
        for (const [x1, y1, x2, y2] of edges) line(c, [{ x: x1!, y: y1! }, { x: x2!, y: y2! }], '#d7d6ba', 2.5);
      }
      c.restore();
    }
    };
    c.globalAlpha *= 1 - restrictionWeight * .25;paintBody();
    if (transition) {
      const flash = spiritTransitionFrame(transition.age).flash;
      if (flash > 0) { c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha *= flash; paintBody(); c.restore(); }
    }
    if (beast && this.world.mechanics.beastEvolved) {
      // Keep the evolved mineral trail present while standing and walking as well as attacking.
      for (let i = 0; i < 4; i++) { const t = (pose.age * .48 + i / 4) % 1; c.globalAlpha = (1 - t) * .42 * born;
        const x = -49 + i * 30 + Math.sin(t * 4 + i) * 4; line(c, [{ x, y: -5 - t * 22 }, { x: x + 2, y: -12 - t * 25 }], color, 1.4); }
    }
    c.restore();
    this.restrictions.paint(c, spirit, this.source(spirit));
    if (transition) { c.save(); c.translate(p.x, p.y); c.scale(scale, scale); paintSpiritTransition(c, transition, true); c.restore(); }
    // Keep element legible without an oversized floating pet name.
    if (beast || spirit.role === 'array') { c.save(); c.globalAlpha = .7; c.strokeStyle = color; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(p.x - 3, p.y + 12); c.lineTo(p.x, p.y + 9); c.lineTo(p.x + 3, p.y + 12); c.lineTo(p.x, p.y + 15); c.closePath(); c.stroke(); c.restore(); }
    if (this.world.build.stage >= 2 && spirit.role === 'main' && !this.world.mechanics.commands.active) {
      c.fillStyle = '#0d1b1cc9'; c.fillRect(p.x - 23, p.y + 19, 46, 3); c.fillStyle = color; c.fillRect(p.x - 23, p.y + 19, 46 * Math.min(1, spirit.energy / 8), 2);
    }
  }
}
