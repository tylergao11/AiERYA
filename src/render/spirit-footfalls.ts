import type { Pixel } from './projection';
import { line, oval } from './ink';

interface Footfall { at:Pixel; direction:Pixel; wood:boolean; beast:boolean; scale:number; side:-1|1; age:number }
/** Dust starts at a planted foot and stays on that piece of ground as its owner moves away. */
export class SpiritFootfalls {
  private marks:Footfall[]=[];
  add(at:Pixel,direction:Pixel,wood:boolean,beast:boolean,scale:number,side:-1|1):void {
    if(this.marks.length>=16)this.marks.shift();
    const length=Math.hypot(direction.x,direction.y)||1;
    this.marks.push({at:{...at},direction:{x:direction.x/length,y:direction.y/length},wood,beast,scale,side,age:0});
  }
  update(dt:number):void {const step=Number.isFinite(dt)?Math.max(0,dt):0;this.marks=this.marks.filter(m=>{m.age+=step;return m.age<.36;});}
  paint(c:CanvasRenderingContext2D):void {
    for(const m of this.marks){
      const t=m.age/.36,fade=(1-t)**2,weight=m.beast?1.3:m.wood?.7:1;
      c.save();c.translate(m.at.x,m.at.y);c.scale(m.scale,m.scale);
      c.globalAlpha=.15*fade;oval(c,0,1,weight*(6+t*7),2+t*2,'#6a614d');
      for(let n=0;n<3;n++){
        const spread=(n-1)*5,reach=t*(10+n*4),x=-m.direction.x*reach-m.direction.y*spread,y=-m.direction.y*reach*.4+m.direction.x*spread*.4-Math.sin(t*Math.PI)*(2+n);
        c.globalAlpha=fade*(m.wood?.28:.25);
        if(m.wood)line(c,[{x,y},{x:x+3*m.side,y:y-1}],n%2?'#a4ad80':'#bba780',1.3);
        else oval(c,x,y,weight*(1.5+t*2),.8+t*.5,n%2?'#b7a68a':'#988d78');
      }
      c.restore();
    }
  }
  clear():void {this.marks=[];}
}
