import { clamp } from '../core/math';
import type { Element } from '../game/contracts';
import type { RunSpirit } from '../game/rogue-combat';
import { ULTIMATE } from '../game/ultimate';
import type { World } from '../game/world';
import { COLORS, line, oval } from './ink';
import { ART, toArt, type Camera2D, type Pixel } from './projection';
import { paintSpiritMaterial } from './spirit-material';

interface Receipt { id: number; element: Element; from: Pixel; amount: number; union: boolean }
/** Only real accepted storage produces a transfer, even when many strokes hit the cap. */
export class SummonStorm {
  private readonly stock = new Map<number, number>();
  private readonly united = new Set<number>();
  private receipts: Receipt[] = [];
  private readonly reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  private disposed = false;
  private readonly off: (() => void)[];
  constructor(private readonly world: World, private readonly receiver: (s: RunSpirit) => Pixel) {
    this.off = [world.events.on('ultimate', e => {
      if(e.stage !== 'start')return;
      this.clear();
      for(const s of world.mechanics.commands.troops){
        this.stock.set(s.id, world.mechanics.commands.amount(s.id));
        if(world.mechanics.commands.united(s.id))this.united.add(s.id);
      }
    }), world.events.on('summonOrder', e => {
      const command = world.mechanics.commands;
      if(!command.stormOnly || world.ultimate.stage !== 'release' || !e.element)return;
      for(const id of e.spiritIds){
        const now = command.amount(id), amount = Math.max(0, now - (this.stock.get(id) ?? 0));
        const union = command.united(id) && !this.united.has(id);
        this.stock.set(id, now); if(command.united(id))this.united.add(id);
        if(amount > 1e-8 || union)this.receipts.push({id,element:e.element,from:toArt(e.points?.at(-1) ?? e.at),amount,union});
      }
    }), world.events.on('phase',()=>this.clear()), world.events.on('reset',()=>this.clear())];
  }
  frame() {
    const u=this.world.ultimate,command=this.world.mechanics.commands;
    if(this.disposed || !command.stormOnly || this.world.phase !== 'battle' || !u.active)return null;
    const troops=command.troops.map(s=>({id:s.id,at:this.receiver(s),stock:command.amount(s.id),union:command.united(s.id)}));
    return {drawing:u.stage==='drawing',elapsed:u.elapsed,remaining:u.remaining,count:u.strokes.length,
      paths:u.strokes.map(s=>({element:s.element,points:s.stroke.points.map(p=>toArt(p))})),troops,
      receipts:this.receipts.flatMap(r=>{const recipient=troops.find(s=>s.id===r.id);return recipient?[{...r,from:{...r.from},to:recipient.at}]:[]})};
  }
  paint(c:CanvasRenderingContext2D,camera:Camera2D,ratio:number):boolean {
    const f=this.frame();if(!f){this.clear();return false;}
    const age=f.drawing?0:f.elapsed-ULTIMATE.windupSeconds;
    const releasing=age>=0&&!f.drawing,fade=f.drawing?1:1-clamp((f.elapsed-.63)/.22,0,1);
    c.save();c.fillStyle=`rgba(9,23,28,${.27*fade})`;c.fillRect(0,0,ART.width,ART.height);
    for(const path of f.paths){
      const dissolve=releasing?1-clamp(age/.32,0,1):1;
      c.save();c.globalAlpha=fade*dissolve*.75;
      line(c,path.points,'#112825',6);line(c,path.points,COLORS[path.element],2.5);
      const p=path.points.at(-1);if(p)oval(c,p.x,p.y,3.5,3.5,'#e8d5a9');c.restore();
    }
    if(releasing){
      for(const [index,r] of f.receipts.entries()){
        const t=clamp((age-index/Math.max(1,f.receipts.length)*.1)/.34,0,1);
        const bend={x:(r.from.x+r.to.x)/2,y:Math.min(r.from.y,r.to.y)-35};
        const at=(v:number)=>({x:(1-v)**2*r.from.x+2*(1-v)*v*bend.x+v*v*r.to.x,y:(1-v)**2*r.from.y+2*(1-v)*v*bend.y+v*v*r.to.y});
        c.save();c.globalAlpha=fade*Math.min(1,.4+r.amount*.3);
        if(!this.reduced.matches && t>0 && t<1){
          const trail=Array.from({length:7},(_,n)=>at(Math.max(0,t-n*.023)));
          line(c,trail,COLORS[r.element],3);line(c,trail.slice(0,3),'#ead8b0',1.2);
          const p=at(t);paintSpiritMaterial(c,r.element,0,p.x,p.y,38,23,Math.atan2(r.to.y-bend.y,r.to.x-bend.x),.5);
        }
        if((t>=.85 || this.reduced.matches) && !f.receipts.slice(index+1).some(next=>next.id===r.id)){
          const a=this.reduced.matches?.5:clamp((t-.85)/.15,0,1);
          paintSpiritMaterial(c,r.element,0,r.to.x,r.to.y,43+12*a,32,0,.4*a);
        }
        c.restore();
      }
    }
    c.restore();
    // Screen-space title remains legible on phones and never moves the game camera.
    const view=camera.viewport??{x:0,y:0,width:camera.width,height:camera.height},small=view.height<450;
    const portrait=view.height>view.width,fieldTop=Math.max(view.y,camera.offsetY),fieldBottom=Math.min(view.y+view.height,camera.offsetY+ART.height*camera.scale);
    const title=f.drawing?'停时 · 蓄令':f.count?'群灵齐发':'停时结束';
    const detail=f.drawing?`${f.remaining.toFixed(1)} 秒 · ${f.count} 笔待入灵`:
      !f.count?'未蓄笔画':releasing?`${f.troops.length} 灵已蓄 · 解除停时后依次出手`:'笔画收束 · 将入群灵';
    const width=Math.min(view.width-24,320),height=54,x=view.x+view.width/2;
    const y=portrait?Math.max(fieldTop+10,fieldBottom-height-10):view.y+60;
    c.save();c.setTransform(ratio,0,0,ratio,0,0);c.globalAlpha=fade;
    c.fillStyle='#152726df';c.fillRect(x-width/2,y,width,height);c.fillStyle='#b49e70';c.fillRect(x-width/2,y,2,height);
    c.textAlign='center';c.fillStyle='#e0cc9f';c.font=`${small?19:22}px KaiTi,serif`;c.fillText(title,x,y+22);
    c.fillStyle='#b8c6b9';c.font='12px "Microsoft YaHei",sans-serif';c.fillText(detail,x,y+42);c.restore();
    return true;
  }
  clear():void {this.stock.clear();this.united.clear();this.receipts=[];}
  dispose():void {this.disposed=true;this.off.forEach(off=>off());this.clear();}
}
