import { clamp } from '../core/math';
import { COMBAT } from '../game/combat';
import { ULTIMATE, type StoredStroke, type TimeStopUltimate } from '../game/ultimate';
import { COLORS, line } from './ink';
import { ART, toArt } from './projection';
import { paintStroke, strokeGeometry, type StrokeGeometry } from './stroke';

/** Retained brushwork becomes the release effect; graphics never determine hits. */
export class UltimatePainter {
  private readonly geometry = new Map<StoredStroke, StrokeGeometry>();
  constructor(private readonly ultimate: TimeStopUltimate) {}
  paint(c: CanvasRenderingContext2D): void {
    const u = this.ultimate;
    if (!u.active) { this.geometry.clear(); return; }
    const releasing = u.stage === 'release', impact = u.elapsed - ULTIMATE.windupSeconds;
    const burst = releasing ? clamp(impact / (ULTIMATE.releaseSeconds - ULTIMATE.windupSeconds),0,1) : 0;
    const fade = releasing && impact >= 0 ? (1-burst)**0.7 : 1;
    c.save(); c.fillStyle = `rgba(4,17,31,${(releasing ? .3 : .4)*fade})`; c.fillRect(0,0,ART.width,ART.height);
    const halo = c.createRadialGradient(ART.width/2,ART.height/2,70,ART.width/2,ART.height/2,750);
    halo.addColorStop(0,'#36687900'); halo.addColorStop(1,`rgba(56,110,140,${.35*fade})`);
    c.fillStyle=halo; c.fillRect(0,0,ART.width,ART.height);
    for (const stored of u.strokes) {
      let geometry=this.geometry.get(stored);
      if (!geometry) { geometry=strokeGeometry(stored.stroke.points.map(p=>toArt(p))); this.geometry.set(stored,geometry); }
      const color=COLORS[stored.element]; c.save(); c.globalAlpha=fade;
      if (releasing) {
        c.save(); c.translate(ART.x,ART.y); c.scale(ART.unitX,ART.unitY);
        const points=stored.stroke.points.map(p=>({x:p.x,y:p.z}));
        c.globalAlpha*=impact<0?.1:.26; c.lineCap='round';c.lineJoin='round';
        line(c,points,color,COMBAT.strokeWidth*2*(impact<0?1:ULTIMATE.width));
        if (stored.stroke.loop) { c.beginPath(); stored.stroke.loop.forEach((p,i)=>i?c.lineTo(p.x,p.z):c.moveTo(p.x,p.z)); c.closePath();c.fillStyle=color;c.fill(); }
        c.restore(); c.shadowColor=color;c.shadowBlur=22;
        line(c,geometry.points,color,impact<0?8+u.elapsed*35:22+burst*24);
        line(c,geometry.points,'#fff1c8',impact<0?2:9*(1-burst)); c.shadowBlur=0;
        if (impact>=0) for (const [i,p] of geometry.marks.entries()) {
          const rise=Math.sin(burst*Math.PI)*(65+i%4*18); c.globalAlpha=fade*(.35+i%3*.12);
          line(c,[{x:p.x,y:p.y+9},{x:p.x+Math.sin(i*2.7)*rise*.2,y:p.y-rise}],i%2?color:'#fff4d7',2.8);
        }
      } else {
        c.shadowColor=color;c.shadowBlur=12; line(c,geometry.points,color,7);c.shadowBlur=0;
        paintStroke(c,geometry,stored.element,u.elapsed,0,1,true);
      }
      c.restore();
    }
    if (releasing && impact>=0) {
      c.save(); c.globalAlpha=Math.max(0,1-impact/.17)*.38; c.fillStyle='#fff2ce';c.fillRect(0,0,ART.width,ART.height);c.restore();
      c.save();c.globalAlpha=fade*.5;c.strokeStyle='#f5dfad';c.lineWidth=5*(1-burst);
      c.beginPath();c.ellipse(ART.width/2,ART.height/2,140+burst*1050,70+burst*550,0,0,Math.PI*2);c.stroke();c.restore();
    }
    c.globalAlpha=fade;c.textAlign='center';c.fillStyle='#f3dfad';c.shadowColor='#132b3b';c.shadowBlur=14;
    c.font='32px "Noto Serif SC", serif';c.fillText(releasing?'万 象 齐 发':'须 臾 · 停 时',ART.width/2,108);
    c.font='17px "Noto Serif SC", serif';c.fillText(releasing?`${u.strokes.length} 笔 · 双倍效果`:`${u.remaining.toFixed(1)} 秒  ·  ${u.strokes.length} 笔已蓄  ·  自由划线`,ART.width/2,140);
    c.restore();
  }
}
