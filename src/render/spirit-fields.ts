import {clamp,distance} from '../core/math';
import type {World} from '../game/world';
import type {SpiritField} from '../game/spirit-abilities';
import {SPIRIT_SKILLS} from '../game/rogue-balance';
import {ART,toArt} from './projection';
import {glow,line,oval,shape} from './ink';
import {paintSpiritMaterial} from './spirit-material';

/** A suppressed owner keeps its field footprint, but loses the active current / root motion. */
export function spiritFieldState(world:World,field:SpiritField):'active'|'suppressed'|'gone'{
  const owner=world.mechanics.spirits.find(s=>s.id===field.owner);
  if(world.phase!=='battle'||field.remaining<=0||!owner||field.kind==='wood'&&distance(owner,field)>field.radius)return 'gone';
  const ward=owner.wardId===undefined?undefined:world.wards.find(w=>w.id===owner.wardId);
  return world.enemyAbilities.silenced(owner)||owner.wardId!==undefined&&(!ward||ward.health<=0||ward.suppressed>0)?'suppressed':'active';
}

/** Illustrated ground frames use a separate asset; projectiles retain their own silhouettes. */
export class SpiritFields {
  private sheet?:HTMLImageElement;
  private clock=0;
  private readonly ages=new Map<SpiritField,number>();
  constructor(private readonly world:World){}
  setAsset(sheet:HTMLImageElement):void{this.sheet=sheet;}
  clear():void{this.clock=0;this.ages.clear();}
  update(dt:number):void{
    const step=Math.max(0,Number.isFinite(dt)?dt:0);this.clock+=step;
    const live=this.world.mechanics.spiritSkills.fields;
    for(const field of this.ages.keys())if(!live.includes(field))this.ages.delete(field);
    for(const field of live){const old=this.ages.get(field)??0;this.ages.set(field,old+(spiritFieldState(this.world,field)==='active'?step:0));}
  }
  private texture(c:CanvasRenderingContext2D,kind:'wood'|'water',frame:number,radius:number,alpha:number,rotation=0):void{
    const sheet=this.sheet;if(!sheet)return;
    const w=sheet.naturalWidth/2,h=sheet.naturalHeight/3,a=Math.floor(frame)%3,b=(a+1)%3,t=frame-Math.floor(frame);
    c.save();c.rotate(rotation);c.globalCompositeOperation='screen';
    for(const [row,weight]of [[a,1-t],[b,t]]as const){if(weight<.01)continue;c.globalAlpha=alpha*weight;c.drawImage(sheet,kind==='wood'?0:w,row*h,w,h,-radius,-radius,radius*2,radius*2);}
    c.restore();
  }
  ground(c:CanvasRenderingContext2D):void{
    for(const field of this.world.mechanics.spiritSkills.fields){
      const state=spiritFieldState(this.world,field);if(state==='gone')continue;
      const age=this.ages.get(field)??0,active=state==='active',wood=field.kind==='wood';
      const fade=Math.min(1,age/.16,field.remaining/.28)*(active?1:.3),p=toArt(field),r=field.radius*ART.unitX;
      const grow=.68+.32*(1-Math.exp(-age*12));
      c.save();c.translate(p.x,p.y);c.scale(grow,grow*ART.unitY/ART.unitX);
      // Soil and depth provide a material base, without a sharp spell-circle boundary.
      const shade=c.createRadialGradient(0,0,r*.08,0,0,r*.96);shade.addColorStop(0,wood?'#22302388':'#0a303bca');shade.addColorStop(.65,wood?'#29302455':'#12404c99');shade.addColorStop(1,'#18353b00');c.globalAlpha=fade;c.fillStyle=shade;c.fillRect(-r,-r,r*2,r*2);
      const frame=wood?Math.min(2,age*3):age*4;
      this.texture(c,field.kind,frame,r,fade*(wood?.84:.76),wood?field.owner*.7:age*.18);
      if(!this.sheet){
        for(let n=0;n<5;n++){const a=n*1.256+age*(wood?0:.7);c.beginPath();c.moveTo(Math.cos(a)*r*.18,Math.sin(a)*r*.18);c.bezierCurveTo(Math.cos(a+.7)*r*.5,Math.sin(a+.7)*r*.5,Math.cos(a+.5)*r*.72,Math.sin(a+.5)*r*.72,Math.cos(a)*r*.85,Math.sin(a)*r*.85);c.strokeStyle=wood?'#8b9569':'#81b7bd';c.lineWidth=wood?3:1.5;c.stroke();}
      }
      if(active)for(let n=0;n<7;n++){
        const travel=(age*(wood?.19:.7)+n*.143)%1,a=n*2.399+age*(wood?.12:1.4),d=r*(wood?.25+travel*.65:.88-travel*.73),x=Math.cos(a)*d,y=Math.sin(a)*d;
        c.globalAlpha=fade*Math.sin(travel*Math.PI)*.7;
        if(wood){c.save();c.translate(x,y);c.rotate(a);shape(c,[-3,0,0,-2,5,0,0,2],'#a7b080');c.restore();}
        else line(c,[{x,y},{x:x+Math.sin(a)*6,y:y-Math.cos(a)*6}],'#afd0ca',1.6);
      }
      c.restore();
    }
  }
  paint(c:CanvasRenderingContext2D,screenScale=1):void{
    if(this.world.phase!=='battle')return;
    // A low foreground lip crosses feet, so a wolf standing in water does not hide the entire current.
    for(const field of this.world.mechanics.spiritSkills.fields){
      if(field.kind!=='water'||spiritFieldState(this.world,field)!=='active')continue;
      const age=this.ages.get(field)??0,fade=Math.min(1,age/.16,field.remaining/.28),p=toArt(field),r=field.radius*ART.unitX;
      c.save();c.translate(p.x,p.y);c.scale(1,ART.unitY/ART.unitX);c.beginPath();c.rect(-r,0,r*2,r);c.clip();
      this.texture(c,'water',age*4,r,fade*.3,age*.18);c.restore();
    }
    // Roots wrap only enemies actually touched and currently bound; other wolves stay clear.
    const bound=new Set<number>();
    for(const field of this.world.mechanics.spiritSkills.fields)if(field.kind==='wood'&&spiritFieldState(this.world,field)==='active')for(const id of field.touched)bound.add(id);
    for(const wolf of this.world.wolves){
      if(wolf.action==='dead')continue;const p=toArt(wolf);
      if(bound.has(wolf.id)&&wolf.rooted>0){
        c.save();c.globalAlpha=Math.min(.72,wolf.rooted*3);const sway=Math.sin(this.clock*3+wolf.id)*.04;
        paintSpiritMaterial(c,'wood',1,p.x,p.y-11,48,51,sway,.8);c.restore();
      }
      const brand=this.world.mechanics.spiritSkills.brands.get(wolf.id);if(!brand||brand.remaining<=0||!this.world.mechanics.spirits.some(s=>s.id===brand.owner))continue;
      const fade=Math.min(1,brand.remaining/.35),stacks=clamp(brand.stacks,1,SPIRIT_SKILLS.fire.stacks);
      c.save();c.globalAlpha=fade;c.translate(p.x,p.y-49);const size=clamp(20/(27*Math.max(.05,screenScale)),1,2.5);c.scale(size,size);glow(c,0,0,12+stacks*2,'#d88449',.12*stacks);
      // Three feather notches show the actual fuse. Unfilled sockets stay dark.
      for(let n=0;n<3;n++){
        const x=(n-1)*9,y=Math.abs(n-1)*2,lit=n<stacks;
        shape(c,[x-3,y+5,x-2,y-4,x+2,y-7,x+3,y+2,x,y+5],lit?'#d99756':'#293132', '#172225',1.2);
        if(lit)line(c,[{x:x-1,y:y+2},{x:x+1,y:y-4}],'#ecd5a0',.9);
      }
      oval(c,0,10,13,1.5,'#322b26');c.restore();
    }
  }
}
