import type { World } from '../game/world';
import type { Element } from '../game/contracts';
import type { ArrayEvent } from '../game/array-momentum';
import { ARRAY } from '../game/array-balance';
import { GENERATES, OVERCOMES } from '../game/combat';
import type { Point } from '../core/math';
import { ART, toArt } from './projection';
import { glow, out, ritual, ring, sat, SPELL_INK, spellBody, spellHit, strokeInk } from './array-spell-art';
import { wardContours } from '../game/ward-geometry';
import { ArraySpellTextures } from './array-spell-textures';
import { paintArraySupport } from './array-support';

const TAU=Math.PI*2;
export const ARRAY_TINT:Record<Element,string>={wood:'#b3ca8f',fire:'#e8a369',earth:'#d2b488',metal:'#d3dfd5',water:'#8bc6cf'};
const GLYPHS:Record<Element,string>={wood:'木',fire:'火',earth:'土',metal:'金',water:'水'};
type Visual=ArrayEvent&{age:number;power:number;size:number;order:number;contours:Point[][]};
type Constellation={age:number;points:{x:number;y:number}[];energy:number};
const major=(e:ArrayEvent)=>e.kind==='release'||e.kind==='harmony'||e.kind==='echo';
const life=(e:ArrayEvent)=>major(e)?1.55:e.kind==='transfer'?.85:.7;
const path=(c:CanvasRenderingContext2D,points:readonly {x:number;y:number}[],color:string,width=1)=>{if(points.length<2)return;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
/** A shared, scalable motif also used on the live array eyes. Each silhouette is
 * different: blades, leaves, flowing arcs, flame tongues and a layered hexagon. */
export function paintArraySeal(c:CanvasRenderingContext2D,element:Element,r:number,time=0):void {
  c.strokeStyle=ARRAY_TINT[element];c.fillStyle=ARRAY_TINT[element];c.lineWidth=1.5;c.lineCap='round';
  for(let i=0;i<(element==='earth'?2:5);i++){
    c.save();c.rotate(i*TAU/5+(element==='water'?time*.22:0));c.beginPath();
    if(element==='metal'){c.moveTo(0,-r);c.lineTo(3,-r*.25);c.lineTo(0,2);c.lineTo(-3,-r*.25);c.closePath();c.fill();}
    else if(element==='wood'){c.moveTo(0,0);c.quadraticCurveTo(-r*.65,-r*.6,0,-r);c.quadraticCurveTo(r*.7,-r*.4,0,0);c.stroke();}
    else if(element==='water'){c.arc(0,0,r*.7,-1.7,-.3);c.quadraticCurveTo(r*.25,r*.25,0,0);c.stroke();}
    else if(element==='fire'){c.moveTo(-r*.12,0);c.quadraticCurveTo(-r*.5,-r*.5,0,-r);c.quadraticCurveTo(-r*.12,-r*.33,r*.22,-r*.14);c.closePath();c.fill();}
    else{const size=r*(1-i*.36);for(let j=0;j<7;j++){const a=j*TAU/6;c.lineTo(Math.cos(a)*size,Math.sin(a)*size);}c.stroke();}
    c.restore();
  }
}
export class ArrayPainter {
  private readonly textures=new ArraySpellTextures();
  private visuals:Visual[]=[];
  private constellations:Constellation[]=[];
  private readonly off:(()=>void)[];
  private readonly reduced=matchMedia('(prefers-reduced-motion: reduce)');
  setAtlas(atlas:HTMLImageElement):void{this.textures.setAtlas(atlas);}
  constructor(private readonly world:World){this.off=[world.events.on('arrayEffect',e=>this.receive(e)),world.events.on('reset',()=>this.clear()),world.events.on('phase',e=>{if(e.phase!=='battle')this.clear();})];}
  private clear():void{this.visuals=[];this.constellations=[];}
  private receive(e:ArrayEvent):void{
    const isMajor=major(e),same=this.visuals.filter(v=>major(v)===isMajor);
    // Repeated feed/marks cannot evict a paid release. Bound the expensive bodies independently.
    if(same.length>=(isMajor?12:20)){const old=same[0]!;this.visuals.splice(this.visuals.indexOf(old),1);}
    const power=sat(e.energy/ARRAY.capacity),node=isMajor?this.world.mechanics.arrays.nodes.find(n=>Math.hypot(n.x-e.at.x,n.z-e.at.z)<.15):undefined;
    const contours=node?wardContours(node.ward).map(c=>c.map(p=>({...p}))):[];
    const order=e.kind==='transfer'?this.visuals.filter(v=>v.kind==='transfer'&&v.age<.04).length%5:0;
    this.visuals.push({...e,at:{...e.at},to:e.to?{...e.to}:undefined,targets:e.targets.map(p=>({...p})),age:0,power,size:72+power*108,order,contours});
    if(e.kind==='harmony'||e.label.includes('周天')){
      const recent=this.visuals.filter(v=>major(v)&&v.age<.1),points=recent.map(v=>toArt(v.at)).filter((p,i,a)=>a.findIndex(q=>Math.hypot(p.x-q.x,p.y-q.y)<12)===i);
      if(points.length>1){const current=this.constellations.find(v=>v.age<.1);if(current){current.points=points.slice(0,8);current.energy=Math.max(current.energy,power);}else{if(this.constellations.length>=3)this.constellations.shift();this.constellations.push({age:0,points:points.slice(0,8),energy:power});}}
    }
  }
  update(dt:number):void{const step=Math.max(0,dt);for(const e of this.visuals)e.age+=step;this.visuals=this.visuals.filter(e=>e.age<life(e));for(const s of this.constellations)s.age+=step;this.constellations=this.constellations.filter(s=>s.age<1.65);}
  dispose():void{this.off.forEach(off=>off());this.clear();}
  ground(c:CanvasRenderingContext2D,stroke:readonly Point[]):void{
    const system=this.world.mechanics.arrays;if(!system.active)return;
    c.save();c.lineCap='round';
    for(const f of system.fields){const p=toArt(f);c.save();c.translate(p.x,p.y);c.globalAlpha=Math.min(.38,f.remaining*.3);ritual(c,f.radius*ART.unitX,SPELL_INK[f.element].body,0,.3);c.restore();}
    // The player's actual drawing lights up underneath the decorative spell.
    for(const node of system.nodes){
      const energy=system.charge(node.id)?.energy??0;if(energy<ARRAY.ready)continue;
      const p=toArt(node),power=energy/ARRAY.capacity,muted=node.ward.suppressed>0||this.world.enemyAbilities.silenced(node);
      const breath=this.reduced.matches?1:.85+Math.sin(this.world.time*2.3+node.id)*.15;
      c.save();c.translate(p.x,p.y);c.globalAlpha=(muted?.07:.17+power*.18)*breath;
      glow(c,0,0,60+power*60,SPELL_INK[node.ward.element].body,.42);
      ritual(c,40+power*46,SPELL_INK[node.ward.element].light,this.reduced.matches?0:this.world.time*.07,power);c.restore();
      c.save();c.globalAlpha=muted?.06:.2+power*.32;c.strokeStyle=SPELL_INK[node.ward.element].body;c.lineWidth=2+power*2;for(const contour of wardContours(node.ward))path(c,contour.map(p=>toArt(p)),SPELL_INK[node.ward.element].body,2+power*2);c.restore();
    }
    const touched=this.world.phase==='battle'?system.touched(stroke):[];
    for(let i=1;i<touched.length;i++){
      const a=touched[i-1]!,b=touched[i]!,generating=GENERATES[a.ward.element]===b.ward.element;
      c.setLineDash(generating?[]:[5,7]);path(c,[toArt(a),toArt(b)],generating?'#d7edb3':'#89908c80',generating?3.5:1);c.setLineDash([]);
      if(generating){const p=toArt(a),q=toArt(b),k=this.reduced.matches?.5:(this.world.time*.8)%1;c.fillStyle='#f4ffd5';c.beginPath();c.arc(p.x+(q.x-p.x)*k,p.y+(q.y-p.y)*k,5,0,TAU);c.fill();}
    }
    this.concordance(c);
    for(const e of this.visuals){if(!major(e))continue;const p=toArt(e.at),ink=SPELL_INK[e.element],fade=1-sat((e.age-.55)/.95),expansion=out(e.age/.22);
      c.save();c.globalAlpha=fade*(this.reduced.matches?.45:.8);c.translate(p.x,p.y);
      glow(c,0,0,e.size*1.4,ink.body,.4*(1-sat(e.age/1.2)));
      c.fillStyle=ink.dark+'40';c.beginPath();c.ellipse(0,0,e.size*.9,e.size*.43,0,0,TAU);c.fill();
      ritual(c,e.size*(.7+expansion*.3),ink.light,this.reduced.matches?0:e.age*.16,e.power);c.restore();
      c.save();c.globalAlpha=fade*.75;for(const contour of e.contours)path(c,contour.map(p=>toArt(p)),ink.light,3.5);c.restore();
      c.save();c.translate(p.x,p.y);c.globalAlpha=fade*(e.kind==='echo'?.58:.9);const age=this.reduced.matches?.3:Math.max(.025,e.age);if(!this.textures.paint(c,e.style,e.size,age,true))spellBody(c,e.style,e.size,age,true);c.restore();
    }
    c.restore();
  }
  private concordance(c:CanvasRenderingContext2D):void{
    for(const s of this.constellations){const cx=s.points.reduce((v,p)=>v+p.x,0)/s.points.length,cy=s.points.reduce((v,p)=>v+p.y,0)/s.points.length;
      const r=Math.min(520,Math.max(...s.points.map(p=>Math.hypot(p.x-cx,(p.y-cy)/.48)))+95),fade=1-sat((s.age-.4)/1.2);
      c.save();c.globalAlpha=fade*.6;c.translate(cx,cy);glow(c,0,0,r*1.08,'#ead190',.22);this.textures.harmony(c,r,this.reduced.matches?0:s.age);ritual(c,r,'#f4d897',this.reduced.matches?0:s.age*.055);c.restore();
      c.save();c.globalAlpha=fade*.9;
      const ordered=s.points.slice().sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));
      path(c,[...ordered,ordered[0]!],'#685137',9);path(c,[...ordered,ordered[0]!],'#ffe9ae',3);
      for(const p of ordered){c.save();c.translate(p.x,p.y);ring(c,45+out(s.age/.3)*28,'#ffefc5',3);c.restore();}c.restore();
    }
  }
  eyes(c:CanvasRenderingContext2D,stroke:readonly Point[]):void{
    const system=this.world.mechanics.arrays;if(!system.active)return;
    const nodes=system.nodes,touched=this.world.phase==='battle'?system.touched(stroke):[];c.save();
    const investment=touched.length?(this.world.quoteStroke(stroke)?.stroke.investment??0):0;
    for(const node of nodes){const p=toArt(node),s=system.charge(node.id),energy=s?.energy??0,ready=energy>=ARRAY.ready,selected=touched.some(n=>n.id===node.id);
      const muted=node.ward.suppressed>0||this.world.enemyAbilities.silenced(node);
      c.save();c.translate(p.x,p.y);c.globalAlpha=muted?.3:1;c.scale(1,.68);
      c.fillStyle='#0c171bc9';c.beginPath();c.ellipse(0,0,23,23,0,0,TAU);c.fill();
      c.strokeStyle=selected?'#f1e0b9':'#c0aa753d';c.lineWidth=selected?2:1;c.beginPath();c.arc(0,0,25,0,TAU);c.stroke();
      c.strokeStyle=ARRAY_TINT[node.ward.element];c.lineWidth=3;c.beginPath();c.arc(0,0,25,-Math.PI/2,-Math.PI/2+TAU*energy/ARRAY.capacity);c.stroke();
      c.globalAlpha*=ready?.95:.55;paintArraySeal(c,node.ward.element,15,this.world.time);c.restore();
      if(selected||ready||energy>0){c.font='14px "KaiTi",serif';c.textAlign='center';c.strokeStyle='#071116';c.lineWidth=4;c.fillStyle=muted?'#929790':ready?'#ede0ba':'#b6c2ad';
        const generating=GENERATES[this.world.selected]===node.ward.element||GENERATES[node.ward.element]===this.world.selected;
        const releasing=OVERCOMES[this.world.selected]===node.ward.element||this.world.selected===node.ward.element;
        const action=selected?releasing?(energy<ARRAY.ready?' · 蓄势不足':investment*ARRAY.capacity<ARRAY.ready?' · 笔势不足':!system.hasTargets(node.id)?' · 待敌入阵':OVERCOMES[this.world.selected]===node.ward.element?' · 相克放势':' · 引阵放势'):generating?' · 相生养势':' · 受克':'';
        const label=`${GLYPHS[node.ward.element]} · ${Math.floor(energy)}${action}`;c.strokeText(label,p.x,p.y-72);c.fillText(label,p.x,p.y-72);
        if(s&&s.memory.length>1){c.font='10px "KaiTi",serif';s.memory.forEach((e,i)=>{c.fillStyle=ARRAY_TINT[e];c.fillText(GLYPHS[e],p.x+(i-(s.memory.length-1)/2)*13,p.y+28);});}
      }
    }
    for(const r of system.remnants){const p=toArt(r);c.save();c.translate(p.x,p.y);c.rotate(.3);c.globalAlpha=Math.min(1,r.remaining);c.strokeStyle=ARRAY_TINT[r.element];c.strokeRect(-10,-10,20,20);paintArraySeal(c,r.element,7);c.restore();}
    c.restore();
  }
  paint(c:CanvasRenderingContext2D):void{
    const system=this.world.mechanics.arrays;if(!system.active)return;
    c.save();c.lineCap='round';c.lineJoin='round';
    paintArraySupport(c,this.world,system.support.fields,this.reduced.matches);
    for(const mark of system.marks){const wolf=this.world.wolves.find(w=>w.id===mark.targetId&&w.action!=='dead');if(!wolf)continue;const p=toArt(wolf);c.save();c.translate(p.x,p.y-25);c.globalAlpha=.8;paintArraySeal(c,mark.element,9,this.world.time);c.restore();}
    for(const e of this.visuals){const p=toArt(e.at),t=e.age,ink=SPELL_INK[e.element];c.save();
      if(e.kind==='transfer'&&e.to){const q=toArt(e.to),progress=this.reduced.matches?1:sat((t-e.order*.055)/.32),points=[];c.globalAlpha=1-sat((t-.4)/.45);
        for(let j=0;j<=32*progress;j++){const k=j/32;points.push({x:p.x+(q.x-p.x)*k,y:p.y+(q.y-p.y)*k-Math.sin(k*Math.PI)*48});}
        path(c,points,ink.dark,12);path(c,points,ink.body,7);path(c,points,ink.light,2.5);
        for(let i=0;i<5;i++){const k=Math.max(0,progress-i*.045),x=p.x+(q.x-p.x)*k,y=p.y+(q.y-p.y)*k-Math.sin(k*Math.PI)*48;c.fillStyle=ink.light;c.beginPath();c.arc(x,y,5-i*.7,0,TAU);c.fill();}
        if(progress>.92){c.translate(q.x,q.y);ring(c,25+out((t-.3)/.3)*45,ink.light,3);glow(c,0,0,70,ink.body,.6);}c.restore();continue;
      }
      if(!major(e)){c.globalAlpha=1-sat(t/.7);c.translate(p.x,p.y);ring(c,20+out(t/.4)*42,ink.body,2);if(e.kind==='feed'){glow(c,0,-15,45,ink.body,.6);paintArraySeal(c,e.element,22);}c.restore();continue;}
      const fade=1-sat((t-.55)/1),displayTime=this.reduced.matches?.3:Math.max(.025,t);
      c.globalAlpha=fade*(e.kind==='echo'?.58:.9);c.translate(p.x,p.y);
      if(!this.textures.paint(c,e.style,e.size,displayTime,false))spellBody(c,e.style,e.size,displayTime);
      if(t<.45){c.globalAlpha*=1-sat(t/.45);ring(c,e.size*(.35+out(t/.3)*.8),ink.light,4);}
      c.restore();
      for(const [i,target] of e.targets.slice(0,12).entries()){const q=toArt(target);
        if((e.style==='metal'||e.style==='splinter')&&t<.42){c.save();c.globalAlpha=1-sat(t/.42);
          const sx=p.x+(i-1)*35,sy=p.y-130,beam=c.createLinearGradient(sx,sy,q.x,q.y);beam.addColorStop(0,ink.body+'00');beam.addColorStop(.5,ink.body+'90');beam.addColorStop(1,ink.light);
          c.fillStyle=beam;c.beginPath();c.moveTo(sx-12,sy);c.quadraticCurveTo((sx+q.x)/2-10,sy,q.x,q.y-12);c.quadraticCurveTo((sx+q.x)/2+10,sy,sx+12,sy);c.closePath();c.fill();
          c.beginPath();c.moveTo(sx,sy);c.quadraticCurveTo((sx+q.x)/2,sy,q.x,q.y-12);strokeInk(c,ink.light,3+e.power*2);c.restore();}
        spellHit(c,e.style,e.element,q.x,q.y,t,i,e.power);
      }
      // One label per source; follow-up hits never pile text onto their primary.
      if(!this.visuals.some(v=>v!==e&&major(v)&&v.age<e.age&&Math.hypot(v.at.x-e.at.x,v.at.z-e.at.z)<1.5)){
        c.save();c.globalAlpha=Math.min(1,t*14)*fade;c.font=`${e.kind==='harmony'?25:23}px "KaiTi","STKaiti",serif`;c.textAlign='center';
        const label=e.label.replace('纯阵合鸣 · ','').replace('五行归一 · ',''),y=p.y+e.size*.48+36+(this.reduced.matches?0:t*8),width=c.measureText(label).width;
        const band=c.createLinearGradient(p.x-width/2-26,y,p.x+width/2+26,y);band.addColorStop(0,'#0b211d00');band.addColorStop(.2,'#0b211dc9');band.addColorStop(.8,'#0b211dc9');band.addColorStop(1,'#0b211d00');c.fillStyle=band;c.fillRect(p.x-width/2-26,y-25,width+52,36);
        c.strokeStyle='#102019';c.lineWidth=4;c.fillStyle=ink.light;c.strokeText(label,p.x,y);c.fillText(label,p.x,y);c.restore();
      }
    }
    c.restore();
  }
}
