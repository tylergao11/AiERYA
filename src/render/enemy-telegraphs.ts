import type { World } from '../game/world';
import { ENEMY_SKILLS } from '../game/enemy-abilities';
import { ART, toArt } from './projection';
import { line } from './ink';

/** Reads accepted enemy casts and their real area; never invents a danger radius. */
export class EnemyTelegraphs {
  constructor(private readonly world: World) {}
  ground(c: CanvasRenderingContext2D): void {
    for (const zone of this.world.enemyAbilities.zones) {
      const p = toArt(zone); c.save(); c.globalAlpha = Math.min(1, zone.remaining * 2);
      c.beginPath(); c.ellipse(p.x, p.y, zone.radius * ART.unitX, zone.radius * ART.unitY, 0, 0, Math.PI * 2); c.fillStyle = zone.spiritsOnly ? '#45606920' : '#52475420'; c.fill(); c.strokeStyle = zone.spiritsOnly ? '#9bbcc5aa' : '#a99aa3aa'; c.lineWidth = 1.5; c.setLineDash([7,5]); c.stroke(); c.setLineDash([]);
      for(let i=0;i<6;i++){const a=i*Math.PI/3,x=p.x+Math.cos(a)*zone.radius*ART.unitX*.85,y=p.y+Math.sin(a)*zone.radius*ART.unitY*.85;line(c,[{x:x-3,y:y-5},{x:x+3,y:y+5}], '#ac9da7',1.5);}
      c.restore();
    }
    for (const cue of this.world.enemyAbilities.cues) {
      const t = Math.max(0, Math.min(1, 1 - cue.remaining / cue.duration));
      const p = toArt(cue.at), radius = cue.skill === 'silence' ? ENEMY_SKILLS.silenceRadius : cue.skill === 'hunt' ? ENEMY_SKILLS.huntRadius : cue.skill === 'break' ? ENEMY_SKILLS.breakRadius : cue.skill === 'mend' ? ENEMY_SKILLS.mendRadius : cue.skill === 'rush' ? ENEMY_SKILLS.rushRadius : 1.5;
      c.save(); c.beginPath(); c.ellipse(p.x,p.y,radius*ART.unitX,radius*ART.unitY,0,0,Math.PI*2);c.fillStyle=cue.skill==='silence'?'#9a83951d':'#b36b4d17';c.fill();c.strokeStyle='#d7a889';c.lineWidth=1.3;c.setLineDash([5,4]);c.stroke();c.setLineDash([]);
      c.beginPath();c.ellipse(p.x,p.y,radius*ART.unitX,radius*ART.unitY,0,-Math.PI/2,-Math.PI/2+Math.PI*2*t);c.lineWidth=3;c.stroke();
      if(cue.skill==='break')for(let i=0;i<4;i++){const a=i*Math.PI/2,r=radius*(1-t*.35),x=p.x+Math.cos(a)*r*ART.unitX,y=p.y+Math.sin(a)*r*ART.unitY;line(c,[{x:x-4,y:y-3},{x,y:y+3},{x:x+4,y:y-3}],'#d7a889',1.5);}
      c.restore();
    }
  }
  paint(c: CanvasRenderingContext2D): void {
    for (const cue of this.world.enemyAbilities.cues) {
      const wolf=this.world.wolves.find(w=>w.id===cue.id);if(!wolf)continue;
      const p=toArt(wolf),t=Math.min(1,1-cue.remaining/cue.duration),label=cue.skill==='call'?'唤群':cue.skill==='silence'?'封灵':cue.skill==='hunt'?'猎灵':cue.skill==='mend'?'血祭回生':cue.skill==='rush'?'突袭营地':'狼王破阵';
      c.save();c.font='600 12px "Microsoft YaHei UI",sans-serif';c.textAlign='center';c.fillStyle='#302218';c.fillRect(p.x-37,p.y-69,74,23);c.fillStyle='#ddbea2';c.fillText(label,p.x,p.y-53);c.fillStyle='#d0a078';c.fillRect(p.x-37,p.y-45,74*t,2);c.restore();
    }
  }
}
