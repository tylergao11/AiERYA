import { clamp } from '../core/math';
import type { GameEvents } from '../game/contracts';
import { COLORS, glow, line, shape } from './ink';
import { toArt, type Pixel } from './projection';

type Feast=GameEvents['beastFeast'] & { age:number; start:Pixel; delay:number; flight:number };
export const BEAST_FEAST_LIMIT=8;

/** A few broken strands leave the defeated body and accelerate into the living beast. */
export class BeastFeastArt {
  private motes:Feast[]=[];
  add(event:GameEvents['beastFeast']):void {
    if(this.motes.length>=BEAST_FEAST_LIMIT)this.motes.shift();
    const at=toArt(event.at);
    this.motes.push({...event,at:{...event.at},start:{x:at.x,y:at.y-16},age:0,delay:event.marks>=event.goal?0:.1,flight:event.marks>=event.goal?.18:.36});
  }
  update(dt:number):void {
    const step=Number.isFinite(dt)?Math.max(0,dt):0;
    this.motes=this.motes.filter(e=>{e.age+=step;return e.age<e.delay+e.flight+.18;});
  }
  paint(c:CanvasRenderingContext2D,source:(id:number)=>Pixel|undefined):void {
    for(const e of this.motes){
      const end=source(e.spiritId);if(!end)continue;
      const t=clamp((e.age-e.delay)/e.flight,0,1),arrival=clamp((e.age-e.delay-e.flight)/.18,0,1);
      c.save();
      if(t<1)for(let n=0;n<3;n++){
        const control={x:(e.start.x+end.x)*.5+(n-1)*12,y:Math.min(e.start.y,end.y)-54-n*10};
        const point=(v:number)=>({x:(1-v)**2*e.start.x+2*(1-v)*v*control.x+v*v*end.x,y:(1-v)**2*(e.start.y+n*3)+2*(1-v)*v*control.y+v*v*end.y});
        const head=clamp(t*1.13-n*.055,0,1)**2,tail=Math.max(0,head-.17),points=Array.from({length:6},(_,i)=>point(tail+(head-tail)*i/5));
        c.globalAlpha=Math.min(1,t*9)*(1-n*.18);
        line(c,points,'#26342c',3.4-n*.35);line(c,points,n===0?'#dcc99a':'#a29471',1.5-n*.25);
        const p=point(head),size=(4.8-n*.7)*(1-t*.45);
        shape(c,[p.x-size,p.y,p.x,p.y-size*1.5,p.x+size*.8,p.y,p.x,p.y+size*.5],'#ddc89b','#52604a',.7);
      }
      if(e.age>=e.delay+e.flight){
        const fade=1-arrival;
        glow(c,end.x,end.y,18-12*arrival,COLORS[e.element],fade*.12);
        for(let n=0;n<3;n++){
          const a=n*2.399+e.targetId,r=12*fade;
          c.globalAlpha=fade*.65;
          line(c,[{x:end.x+Math.cos(a)*r,y:end.y+Math.sin(a)*r*.6},{x:end.x+Math.cos(a)*r*.35,y:end.y+Math.sin(a)*r*.2}],'#d8c493',1.3);
        }
      }
      c.restore();
    }
  }
  clear():void {this.motes=[];}
}
