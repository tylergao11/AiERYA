import type { ArrayAssist } from '../game/array-support';
import type { World } from '../game/world';
import { ARRAY_SUPPORT_NAMES } from '../game/array-balance';
import { wardContours } from '../game/ward-geometry';
import { toArt } from './projection';

const TINT={metal:'#e8e2b4',wood:'#b9df87',water:'#8ad8e5',fire:'#ffa262',earth:'#e3c384'};
/** Utility follows the original painted footprint; each element has a distinct physical gesture. */
export function paintArraySupport(c:CanvasRenderingContext2D,world:World,fields:readonly ArrayAssist[],reduced:boolean):void{
  for(const f of fields){
    if(f.ward.suppressed>0||world.enemyAbilities.silenced(f.ward))continue;
    const t=reduced?0:world.time,p=toArt(f.ward),fade=Math.min(1,f.remaining*2);
    c.save();c.strokeStyle=TINT[f.element];c.fillStyle=TINT[f.element];c.lineWidth=2;c.globalAlpha=fade*.55;
    for(const contour of wardContours(f.ward)){
      c.beginPath();contour.forEach((point,i)=>{const q=toArt(point);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});c.closePath();
      c.setLineDash(f.element==='earth'?[14,4]:f.element==='metal'?[3,8]:[]);c.lineDashOffset=-t*18;c.stroke();
    }
    c.setLineDash([]);
    const targets=world.wolves.filter(w=>w.action!=='dead'&&world.wardAffects(w,f.ward)).slice(0,12);
    for(const [i,target]of targets.entries()){
      const q=toArt(target);c.save();c.translate(q.x,q.y);const sway=Math.sin(t*3+i);
      c.globalAlpha=fade*.8;c.beginPath();
      if(f.element==='metal'){
        // Split plates visibly expose a gap, rather than another projectile.
        c.moveTo(-6,-29);c.lineTo(-19,-20);c.lineTo(-15,-9);c.moveTo(6,-29);c.lineTo(19,-20);c.lineTo(15,-9);c.stroke();
      }else if(f.element==='wood'){
        for(const side of [-1,1]){c.moveTo(side*21,5);c.bezierCurveTo(side*6,-16,side*28,-20+sway*2,side*8,-31);c.stroke();}
      }else if(f.element==='water'){
        c.ellipse(0,2,26,10,0,t+i,t+i+4.4);c.stroke();c.beginPath();c.moveTo(0,0);c.lineTo((p.x-q.x)*.24,(p.y-q.y)*.24);c.stroke();
      }else if(f.element==='fire'){
        for(let j=0;j<3;j++){const y=-8-((t*19+j*11+i*3)%37);c.fillRect((j-1)*10+sway*3,y,3,7);}
      }else{
        c.moveTo(-19,-8);c.lineTo(-15,-29);c.lineTo(0,-38);c.lineTo(15,-29);c.lineTo(19,-8);c.stroke();
      }
      c.restore();
    }
    const layers=fields.filter(other=>other.ward===f.ward),index=layers.indexOf(f);
    c.globalAlpha=fade;c.font='13px KaiTi,serif';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#11231c';
    const label=ARRAY_SUPPORT_NAMES[f.element],y=p.y+46+index*20;
    c.strokeText(label,p.x,y);c.fillText(label,p.x,y);c.globalAlpha=fade*.65;
    c.fillRect(p.x-32,y+5,64*f.remaining/f.duration,2);c.restore();
  }
}
