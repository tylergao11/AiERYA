import type { Point } from '../core/math';
import type { Element } from '../game/contracts';
import type { World } from '../game/world';
import type { RunSpirit } from '../game/rogue-combat';
import { COLORS, flame, glow, line, oval, shape } from './ink';
import { ART, toArt, type Pixel } from './projection';
import { paintSpiritMaterial } from './spirit-material';
import { paintSummonUnion, paintSummonClaws, summonImpactSeconds, type SummonImpactArt } from './summon-impact-art';
import { SummonImpactBuffer } from './summon-impact-buffer';
import { SummonCommandArt } from './summon-command-art';
import { SummonArmament } from './summon-armament';
import { makeSummonTechniqueArt, paintSummonCoordination, summonTechniqueSeconds, type SummonTechniqueArt } from './summon-technique-art';

export function paintCommandStroke(c:CanvasRenderingContext2D,points:readonly Point[],element:Element,alpha=1):void {
  if(points.length<2)return;
  const path=points.map(p=>toArt(p)),end=path.at(-1)!,prev=path.at(-2)!,angle=Math.atan2(end.y-prev.y,end.x-prev.x);
  c.save();c.globalAlpha*=alpha;line(c,path,'#102021b0',6);line(c,path,COLORS[element],2.2);
  c.translate(end.x,end.y);c.rotate(angle);shape(c,[0,0,-13,-5,-9,0,-13,5],COLORS[element],'#27352d',1);c.restore();
}
type ImpactFX=SummonImpactArt;
type TechniqueFX=SummonTechniqueArt;

/** Cosmetic events use simulation positions and radii; never manufacture contacts. */
export class SummonPainter {
  private readonly commands:SummonCommandArt;
  private readonly armament:SummonArmament;
  private readonly impacts=new SummonImpactBuffer();
  private techniques:TechniqueFX[]=[];
  private readonly off:(()=>void)[];
  constructor(private readonly world:World,anchor:(spirit:RunSpirit)=>Pixel=s=>toArt(s),receiver:(spirit:RunSpirit)=>Pixel=s=>{const p=anchor(s);return{x:p.x,y:p.y-60};}){
    this.commands=new SummonCommandArt(world,receiver);
    this.armament=new SummonArmament(world,anchor,receiver);
    this.off=[world.events.on('summonImpact',e=>{const owner=e.spiritId===undefined?world.mechanics.spirits.find(s=>Math.hypot(s.x-e.from.x,s.z-e.from.z)<.1):world.mechanics.spirits.find(s=>s.id===e.spiritId);this.impacts.add(e,!!owner&&(owner.size>=1.7||owner.element==='wood'||owner.element==='earth'),owner?.role==='main'&&world.build.has('beast'));}),
    world.events.on('summonTechnique',e=>{this.impacts.feature(e);if(this.techniques.length>=20)this.techniques.shift();this.techniques.push(makeSummonTechniqueArt(e,(id,at)=>{const s=world.mechanics.spirits.find(s=>s.id===id);if(!s)return;const p=receiver(s),now=toArt(s),then=toArt(at);return{x:then.x+p.x-now.x,y:then.y+p.y-now.y};}));}),
    world.events.on('reset',()=>this.clear()),world.events.on('phase',e=>{if(e.phase!=='battle')this.clear();})];
  }
  private clear():void {this.commands.clear();this.armament.clear();this.impacts.clear();this.techniques=[];}
  hasImpact(at:Point,spiritId?:number,targetId?:number):boolean {return this.impacts.hasNativeDuplicate(at,spiritId,targetId);}
  update(dt:number):void {this.commands.update(dt);this.armament.update(dt);this.impacts.update(dt);this.techniques=this.techniques.filter(e=>{e.age+=dt;return e.age<summonTechniqueSeconds(e);});}
  ground(c:CanvasRenderingContext2D):void {
    for(const e of this.impacts.entries)if(e.union)paintSummonUnion(c,e,true);
    this.commands.ground(c);
  }
  paint(c:CanvasRenderingContext2D):void {
    this.armament.paint(c);
    for(const e of this.commands.entries)if(e.points&&e.element)paintCommandStroke(c,e.points,e.element,Math.max(0,1-e.age/.3));
    for(const e of this.impacts.entries)this.impact(c,e);
    for(const e of this.techniques)this.technique(c,e);
    this.commands.paint(c);
  }
  private technique(c:CanvasRenderingContext2D,e:TechniqueFX):void {
    if(paintSummonCoordination(c,e))return;
    const p=toArt(e.at,.7),from=toArt(e.from,.7),t=Math.min(1,e.age/.85),fade=(1-t)**1.3,color=COLORS[e.element];
    c.save();c.globalAlpha=fade*.8;c.lineCap='round';
    if(e.kind==='hunt'){
      const bend={x:(from.x+p.x)/2,y:Math.min(from.y,p.y)-30};c.beginPath();c.moveTo(from.x,from.y);c.quadraticCurveTo(bend.x,bend.y,p.x,p.y);c.strokeStyle='#b9c7a0';c.lineWidth=1.7;c.setLineDash([5,6]);c.stroke();c.setLineDash([]);
      const q=Math.min(1,t*2.5),x=(1-q)**2*from.x+2*(1-q)*q*bend.x+q*q*p.x,y=(1-q)**2*from.y+2*(1-q)*q*bend.y+q*q*p.y;shape(c,[x-5,y-3,x+6,y,x-5,y+3],'#d3ce9e');
    }else if(e.kind==='fury'){
      for(let n=-1;n<=1;n++){c.beginPath();c.moveTo(p.x-46+n*11,p.y-24);c.quadraticCurveTo(p.x+7+n*9,p.y-4,p.x+30+n*7,p.y+31);c.strokeStyle=n?'#c2ac82':'#f1dec0';c.lineWidth=n?3:5;c.stroke();}
    }else if(e.kind==='furyReady'){
      for(let n=-1;n<=1;n++){const x=p.x+n*14;shape(c,[x,p.y-55,x+5,p.y-47,x,p.y-37,x-5,p.y-47],'#d8bc82','#614d35',1);}
    }else{
      for(let n=0;n<2;n++){c.beginPath();c.arc(p.x,p.y,14+n*10+t*18,-1.4,1.1);c.strokeStyle=color;c.lineWidth=1.2;c.stroke();}
    }
    // CombatFeedback owns all technique titles and their collision layout.
    c.restore();
  }
  private impact(c:CanvasRenderingContext2D,e:ImpactFX):void {
    if(e.union&&!e.echo&&!e.accent){paintSummonUnion(c,e,false);return;}
    const p=toArt(e.at,.45),life=summonImpactSeconds(e),t=e.age/life,fade=(1-t)**1.2,color=COLORS[e.element];
    const size=Math.min(100,Math.max(18,e.radius*ART.unitX))*(.45+Math.min(1,t*3)*.55),weight=Math.min(1,e.strength);
    c.save();c.globalAlpha=fade*weight*(e.echo?.36:e.accent?.48:1);glow(c,p.x,p.y,size*.65,color,.2);
    const bloom=1-Math.pow(1-Math.min(1,t*4),3),fullWidth=e.accent||e.echo?Math.min(90,size*1.2):Math.max(118,size*1.6);
    const angle=e.element==='metal'?Math.atan2(e.at.z-e.from.z,e.at.x-e.from.x)*.4:0;
    if(paintSpiritMaterial(c,e.element,1,p.x,p.y-12,fullWidth*(.55+bloom*.45),fullWidth*(e.element==='metal'?.58:.86)*(.5+bloom*.5),angle,Math.min(1,(1-t)*2.4)/Math.max(.01,fade))){
      c.globalAlpha=fade*weight*(e.echo?.25:e.accent?.4:.85);
      for(let n=0;n<6;n++){const a=n*2.399,travel=47*t,x=p.x+Math.cos(a)*travel,y=p.y+Math.sin(a)*travel*.55-Math.sin(t*Math.PI)*18;
        line(c,[{x,y},{x:x+Math.cos(a)*5,y:y+Math.sin(a)*4}],color,n%3===0?2.4:1.2);}
      c.restore();paintSummonClaws(c,e);return;
    }
    if(e.element==='fire'){
      for(let n=0;n<4;n++){const a=n*2.4;flame(c,p.x+Math.cos(a)*size*.45*t,p.y+Math.sin(a)*size*.2*t,Math.max(8,size*.7*(1-t)),this.world.time,n+e.at.x);}
      for(let n=0;n<9;n++){const a=n*2.399;oval(c,p.x+Math.cos(a)*size*t,p.y+Math.sin(a)*size*.5*t-24*t,2*(1-t),3*(1-t),'#f1c783');}
    }else if(e.element==='metal'){
      const angle=Math.atan2(e.at.z-e.from.z,e.at.x-e.from.x);
      c.translate(p.x,p.y);c.rotate(angle*.6);
      for(let n=-1;n<=1;n++){const y=n*9;shape(c,[-size*.7,y+5,size*(.4+t),y-4,size*.4,y+3,-size*.7,y+5],n?'#ccbd83':'#fff0c3','#54472c',.7);}
      line(c,[{x:-9,y:-24*(1-t)},{x:4,y:19*(1-t)}],'#f6eccb',2);
    }else if(e.element==='wood'){
      for(let n=0;n<6;n++){const a=n*Math.PI/3,x=p.x+Math.cos(a)*size*.65,y=p.y+Math.sin(a)*size*.32;
        c.beginPath();c.moveTo(x,y+10);c.quadraticCurveTo(x+Math.cos(a)*12,y-35*Math.sin(Math.min(1,t*3)*Math.PI/2),p.x+Math.cos(a)*8,p.y);c.strokeStyle=n%2?'#c0d799':'#709b67';c.lineWidth=2.5;c.stroke();
        shape(c,[x,y-9,x+9,y-17,x+4,y-4], '#a4c38b','#42614a',1);}
    }else if(e.element==='water'){
      for(let n=0;n<3;n++){c.beginPath();c.ellipse(p.x,p.y,size*(.4+n*.2),size*(.18+n*.08),0,t*6+n*2,t*6+n*2+Math.PI*1.3);c.strokeStyle=n===1?'#d5f0df':'#8ebdc5';c.lineWidth=4*(1-t)+1;c.stroke();}
      for(let n=0;n<6;n++){const a=n*2.4+t*2;oval(c,p.x+Math.cos(a)*size*.7*(1-t),p.y+Math.sin(a)*size*.35*(1-t)-8,2,3,'#c2e2df');}
    }else{
      for(let n=0;n<7;n++){const a=n*2.399,x=p.x+Math.cos(a)*size*t,y=p.y+Math.sin(a)*size*.45*t,rock=7*(1-t);
        shape(c,[x-rock,y,x-rock*.4,y-rock,x+rock*.6,y-rock*.7,x+rock,y+3,x,y+rock*.35],n%2?'#a28b69':'#cebd92','#574d3b',1.4);
        line(c,[{x:p.x,y:p.y+8},{x:p.x+(x-p.x)*.5,y:y+6},{x:x+7,y:y+10}],'#655841',1.8);}
    }
    c.restore();paintSummonClaws(c,e);
  }
  dispose():void {this.off.forEach(off=>off());this.commands.dispose();this.armament.dispose();this.clear();}
}
