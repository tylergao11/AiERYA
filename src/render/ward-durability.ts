import type { World } from '../game/world';
import { toArt } from './projection';
import { wardSelectionHeight } from './ward-selection';

/** Remaining combat life, including formations currently embodied as spirits. */
export function paintWardDurability(c: CanvasRenderingContext2D, world: World, scale: number): void {
  if (!world.build.active) return;
  const nodes = [...world.wards.map(ward=>({ward,at:ward})), ...world.mechanics.spirits.flatMap(s=>s.originWard?[{ward:s.originWard,at:s}]:[])];
  c.save();
  for(const {ward,at} of nodes){
    const fraction=Math.max(0,Math.min(1,ward.health/ward.maxHealth)),p=toArt(at);
    const width=35/scale,height=3/scale,x=p.x-width/2,y=p.y-(at===ward?wardSelectionHeight(ward):36)-13/scale;
    c.fillStyle='#112622d9';c.fillRect(x-2/scale,y-2/scale,width+4/scale,height+4/scale);
    c.fillStyle=fraction<.25?'#ee9878':'#b9cda5';c.fillRect(x,y,width*fraction,height);
    if(world.phase==='prepare'||fraction<.25){
      c.font=`${10/scale}px "Microsoft YaHei UI",sans-serif`;c.textAlign='center';c.textBaseline='bottom';
      c.lineWidth=3/scale;c.strokeStyle='#10261f';
      const label=`耐久 ${Math.ceil(fraction*100)}%`;
      c.strokeText(label,p.x,y-3/scale);c.fillText(label,p.x,y-3/scale);
    }
  }
  c.restore();
}
