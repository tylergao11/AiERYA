import type { ArrayStyle } from '../game/array-momentum';
import { out, sat } from './array-spell-art';

type C=CanvasRenderingContext2D;
type Motif='metal'|'wood'|'water'|'fire'|'earth'|'harmony';
export const ARRAY_ATLAS={metal:[0,0],wood:[1,0],water:[2,0],fire:[0,1],earth:[1,1],harmony:[2,1]} as const;
/** Original alpha atlas. Source pixels are never keyed, recoloured or trimmed;
 * only cell selection and the live spell's growth/occlusion are performed here. */
export class ArraySpellTextures {
  private atlas:HTMLImageElement|null=null;
  setAtlas(atlas:HTMLImageElement):void{this.atlas=atlas;}
  paint(c:C,style:ArrayStyle,r:number,t:number,back:boolean):boolean{
    if(!this.atlas)return false;
    const motif:Motif=style==='steam'||style==='mud'?'water':style==='splinter'||style==='melt'?'metal':style==='rupture'?'wood':style;
    c.save();
    if(style==='melt'){c.save();c.globalAlpha*=.6;this.cell(c,'fire',r*.92,t,back);c.restore();}
    if((style==='rupture'||style==='mud')&&!back){c.save();c.globalAlpha*=.8;this.cell(c,'earth',r,t,false);c.restore();}
    // Counter-spells change the silhouette: steam collapses the tide into a
    // pressure burst, while earth flattens water into a low blocked channel.
    if(style==='steam'){c.globalAlpha*=.52;c.scale(1.18,.4);}
    if(style==='mud'){c.globalAlpha*=.8;c.scale(1.12,.28);}
    this.cell(c,motif,r,t,back);c.restore();
    if(!back)this.fragments(c,style,r,t);
    if(style==='steam'&&back)this.vapor(c,r,t);
    return true;
  }
  harmony(c:C,r:number,t:number):void{
    if(!this.atlas)return;
    const [col,row]=ARRAY_ATLAS.harmony,w=this.atlas.naturalWidth/3,h=this.atlas.naturalHeight/2;
    c.save();c.globalAlpha*=.62;c.rotate(Math.sin(t*1.8)*.016);
    c.drawImage(this.atlas,col*w,row*h,w,h,-r*1.07,-r*.54,r*2.14,r*1.08);c.restore();
  }
  private cell(c:C,motif:Motif,r:number,t:number,back:boolean):void{
    const atlas=this.atlas!,[col,row]=ARRAY_ATLAS[motif],w=atlas.naturalWidth/3,h=atlas.naturalHeight/2;
    const rise=out(t/.15),size=r*2.3,growth=.78+rise*.22,anchor=.83;
    c.save();
    const squeeze=motif==='wood'?1-out((t-.16)/.5)*.09:1;
    c.scale(squeeze,(motif==='wood'||motif==='fire')?growth:1);
    if(motif==='water')c.transform(1,0,Math.sin(t*5)*.045,1,0,0);
    if(motif==='earth')c.translate(0,-(1-rise)*r*.7);
    if(back)c.drawImage(atlas,col*w,row*h,w,h,-size/2,-size*anchor,size,size);
    else{
      // Only the foreground roots, foam and rubble cross the enemy's feet.
      const cut=motif==='wood'?.68:motif==='fire'?.72:.74;
      c.globalAlpha*=motif==='water'?.64:.78;
      c.drawImage(atlas,col*w,row*h+h*cut,w,h*(1-cut),-size/2,size*(cut-anchor),size,size*(1-cut));
    }
    if(motif==='earth'&&back){
      c.save();c.translate(size*.06,size*(.405-anchor));c.transform(1,.05,-.04,1,0,0);
      c.font=`bold ${size*.145}px "KaiTi","STKaiti",serif`;c.textAlign='center';c.textBaseline='middle';c.strokeStyle='#4a3e2b';c.lineWidth=3;c.fillStyle='#f7d992';c.strokeText('镇',0,0);c.fillText('镇',0,0);c.restore();
    }
    c.restore();
  }
  private fragments(c:C,style:ArrayStyle,r:number,t:number):void{
    const woody=style==='wood'||style==='splinter'||style==='rupture',stone=style==='earth'||style==='mud'||style==='rupture',hot=style==='fire'||style==='melt';
    const count=hot?16:woody||stone?12:8;
    c.save();c.globalAlpha*=1-sat((t-.35)/.85);
    for(let i=0;i<count;i++){
      const a=i*2.399,travel=out((t-(i%3)*.025)/.5),x=Math.cos(a)*r*(.35+travel*.9),y=Math.sin(a)*r*.4*(.35+travel*.9)-(hot?t*r*.7:Math.sin(travel*Math.PI)*r*.45);
      c.save();c.translate(x,y);c.rotate(a+t*(i%2?2:-2));
      c.fillStyle=hot?'#ffd389':stone?'#d1b985':woody?'#adc979':'#c7f7ed';
      if(hot){c.fillRect(-1,-3,2,6+(i%3)*2);}else{c.beginPath();c.moveTo(0,-5-i%3);c.lineTo(3,0);c.lineTo(0,5);c.lineTo(-2,1);c.closePath();c.fill();}c.restore();
    }
    c.restore();
  }
  private vapor(c:C,r:number,t:number):void{
    c.save();c.globalAlpha*=.92*(1-sat(t/1.4));
    for(let i=0;i<7;i++){const a=i*2.4,x=Math.cos(a)*r*(.35+t*.25),y=Math.sin(a)*r*.2-out(t/.3)*r*(.48+i*.11),radius=r*(.36+t*.16);
      const g=c.createRadialGradient(x,y,0,x,y,radius);g.addColorStop(0,'#fffbece8');g.addColorStop(.35,'#e6e7d7b3');g.addColorStop(.7,'#b3ccc46b');g.addColorStop(1,'#d5f2e500');c.fillStyle=g;c.fillRect(x-radius,y-radius,radius*2,radius*2);}
    c.restore();
  }
}
