import type {GameEvents} from '../game/contracts';
import {ART,toArt} from './projection';
import {line,oval,shape} from './ink';
import {paintSpiritMaterial} from './spirit-material';

export type SpiritAbilityFX=GameEvents['spiritAbility']&{age:number};
export const spiritAbilityDuration=(kind:SpiritAbilityFX['kind'])=>kind==='fireburst'?.68:kind==='stomp'?.56:.3;

export function paintSpiritAbility(c:CanvasRenderingContext2D,e:SpiritAbilityFX,ground:boolean):void{
  const duration=spiritAbilityDuration(e.kind),t=Math.min(1,e.age/duration),fade=(1-t)**1.25,p=toArt(e.at),r=e.radius*ART.unitX;
  if(t>=1||ground!==(e.kind==='stomp'))return;
  c.save();c.globalAlpha=fade;
  if(e.kind==='pierce'){
    // The already-resolved path stays behind the main target, without a second fake projectile.
    let from=toArt(e.at,.7);
    for(const point of e.targets){const to=toArt(point,.7),a=Math.atan2(to.y-from.y,to.x-from.x);line(c,[from,to],'#3f392cd0',5);line(c,[from,to],'#d4c694',1.8);paintSpiritMaterial(c,'metal',1,to.x,to.y,66*(1+t*.3),43,a,.75);from=to;}
  }else if(e.kind==='fireburst'){
    const grow=1-(1-Math.min(1,t*4))**3,strength=.7+Math.min(3,e.stacks??1)*.1,width=Math.max(78,r*2)*(.5+grow*.5)*strength;
    // A low spreading flame bed and an upward plume replace the old labelled circle.
    paintSpiritMaterial(c,'fire',1,p.x,p.y-10,width,width*.42,0,.65);
    paintSpiritMaterial(c,'fire',2,p.x,p.y-width*.55,width*.9,width*1.28,0,.88);
    if(t<.3)for(let n=0;n<Math.min(3,e.stacks??1);n++){const x=p.x+(n-1)*(9+t*18),y=p.y-49-t*38;shape(c,[x-3,y+4,x-1,y-7,x+3,y-10,x+4,y,x,y+4],'#f0c584','#873f28',.8);}
    for(let n=0;n<12;n++){const a=n*2.399,d=r*(.2+t*.82),x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d*.58-Math.sin(t*Math.PI)*(18+n%4*6);line(c,[{x,y},{x:x-Math.cos(a)*5,y:y+6}],'#e6ad65',1.2);}
  }else{
    const spread=Math.min(1,t*4),squash=ART.unitY/ART.unitX;
    c.translate(p.x,p.y);c.scale(1,squash);
    // Fissures and debris remain inside the real stomp radius.
    oval(c,0,0,r*spread,r*.77*spread,'#55463622');
    for(let n=0;n<9;n++){
      const a=n*2.399+e.spiritId*.4,d=r*(.55+(n%3)*.15)*spread,x=Math.cos(a)*d,y=Math.sin(a)*d;
      const points=[{x:Math.cos(a)*r*.12,y:Math.sin(a)*r*.12},{x:x*.5-Math.sin(a)*8,y:y*.5+Math.cos(a)*8},{x,y}];
      line(c,points,'#26302c',3.1);line(c,points.map(p=>({x:p.x+1.2,y:p.y-1.2})),'#bdac83',1.2);
      c.save();c.translate(x,y-Math.sin(t*Math.PI)*(7+n%3*3)/squash);c.scale(1,1/squash);c.rotate(a+t*.6);shape(c,[-3,1,-1,-4,5,-2,4,3,0,4],n%2?'#a99573':'#c0ad87','#384039',.8);c.restore();
    }
  }
  c.restore();
}
