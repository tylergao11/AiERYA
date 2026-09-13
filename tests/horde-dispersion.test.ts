import { expect,it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { World } from '../src/game/world';
import { planCombatStroke,strokeTouches } from '../src/game/combat';
it('keeps the incoming horde spread across several local cuts',()=>{
 const w=new World();w.wave=5;w.health=100000;w.startWave();const samples:{seconds:number;alive:number;largestCut:number;fraction:number}[]=[];
 for(let f=1;f<=30*20;f++){
  w.tick(1/30);if(f%120)continue;const alive=w.wolves.filter(v=>v.action!=='dead');if(alive.length<25)continue;let largest=0;
  for(const at of alive)for(let a=0;a<12;a++){const angle=a*Math.PI/12,dx=Math.cos(angle)*4,dz=Math.sin(angle)*4;
   const cut=planCombatStroke([{x:at.x-dx,z:at.z-dz},{x:at.x+dx,z:at.z+dz}])!;largest=Math.max(largest,alive.filter(v=>strokeTouches(v,cut)).length);
  }
  samples.push({seconds:f/30,alive:alive.length,largestCut:largest,fraction:largest/alive.length});
 }
 writeFileSync('artifacts/balance/horde-dispersion.json',JSON.stringify(samples,null,2));
 expect(samples.length).toBeGreaterThanOrEqual(3);for(const s of samples){expect(s.fraction).toBeLessThan(.5);expect(s.largestCut).toBeGreaterThan(1);}
},30000);
