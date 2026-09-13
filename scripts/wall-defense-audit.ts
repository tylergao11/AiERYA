import { distance, random } from '../src/core/math';
import { World } from '../src/game/world';
import { mapPoint } from '../src/game/map';
import type { Element } from '../src/game/contracts';
import type { Destiny, Fate } from '../src/game/roguelike';
import { REWARDS } from '../src/game/roguelike';

function defense(seed: number, manual: boolean, summon: 'twins' | 'beast', mixed = false) {
  const w = new World({roguelike:true,random:random(seed)}), destiny: Destiny = {serial:1,fate:'spirit',boon:summon,roots:['metal'],tier:summon==='beast'?'unusual':'ordinary'};
  w.build.beginPair([destiny,{serial:2,fate:'array',boon:'fivefold',roots:['earth'],tier:'ordinary'}]);w.phase='prepare';w.mechanics.initialize();
  let placed=0, casts=0;
  const positions=[[650,304,2.6],[480,283,2.4],[386,272,1.75],[500,468,2.7],[423,395,2.5],[360,335,2.3]];
  const types: Element[] = mixed ? ['water','fire','metal','wood','water','fire'] : ['earth','earth','earth','earth','earth','earth'];
  const picked:string[]=[];
  for(let frame=0;frame<300*30&&w.phase!=='lost'&&w.phase!=='won';frame++){
    if(w.phase==='prepare'){
      positions.forEach(([x,y,r],i)=>{const p=mapPoint(x!,y!);w.selected=types[i]!;if(w.place(Array.from({length:25},(_,n)=>({x:p.x+Math.cos(n/24*Math.PI*2)*r!,z:p.z+Math.sin(n/24*Math.PI*2)*r!}))))placed++;});
      w.startWave();
    }
    if(w.phase==='rest'){
      const score=(id:string)=>id==='awaken'||id==='ascend'?100:id==='common-repair'&&w.health<60?90:REWARDS.find(r=>r.id===id&&w.build.is(r.lane as Fate))?50:id.startsWith('reaction-')?40:10;
      const chosen=[...w.build.offers].sort((a,b)=>score(b.id)-score(a.id))[0]!;picked.push(chosen.id);w.chooseUpgrade(chosen.id);
    }
    if(w.phase!=='battle')continue;
    if(manual&&w.invocationCooldown<=0){
      const target=w.wolves.filter(v=>v.action!=='dead').sort((a,b)=>Number(w.enemyAbilities.casting(b.id))-Number(w.enemyAbilities.casting(a.id))||distance(a,w.camp)-distance(b,w.camp))[0];
      if(target){
        const element: Element = target.burning>.2?'water':target.rooted>.1?'metal':target.wet>.1?'wood':target.aura==='metal'?'fire':'fire';
        w.selected=element;if(w.invoke([{x:target.x-1,z:target.z},{x:target.x+1,z:target.z}]))casts++;
      }
    }
    w.tick(1/30);
  }
  return {seed,manual,summon,mixed,phase:w.phase,wave:w.wave,seconds:Math.round(w.time),health:w.health,kills:w.kills,placed,remainingWards:w.wards.length,casts,spirit:w.spirit,picked,damage:w.combatTotals};
}
export function audit(){return [1729,7166].flatMap(seed=>(['twins','beast'] as const).flatMap(s=>[defense(seed,false,s),defense(seed,true,s),defense(seed,true,s,true)]));}
