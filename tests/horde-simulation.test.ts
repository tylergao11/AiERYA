import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { distance, random, type Point } from '../src/core/math';
import { World } from '../src/game/world';
import { mapPoint } from '../src/game/map';
import type { Element, Wolf } from '../src/game/contracts';
import type { Boon, Fate } from '../src/game/roguelike';
import { OVERCOMES } from '../src/game/combat';
import { CAMPAIGN_WAVES, encounter } from '../src/game/encounters';

const circle=(x:number,z:number,r:number):Point[]=>Array.from({length:33},(_,i)=>({x:x+Math.cos(i/32*Math.PI*2)*r,z:z+Math.sin(i/32*Math.PI*2)*r}));
const layout:[Element,number,number,number][]=[['water',650,304,2.6],['fire',480,283,2.4],['metal',386,272,1.75],['wood',500,468,2.7],['water',423,395,2.5],['fire',360,335,2.3]];
function simulate(fate:Fate,tactical:boolean){
 const w=new World({roguelike:true,random:random(73451)});
 // Use the real five-choose-two opening. No injected starting gifts or rewards.
 const boons:readonly Boon[]=fate==='slayer'?['three','scar']:fate==='array'?['twinArray','fivefold']:['twins','mimic'];
 const draft=w.birthDraft;
 for(let n=0;!boons.every(b=>draft.candidates.some(d=>d.boon===b));n++){if(n>500)throw new Error('Opening pair was not drawn');draft.roll();}
 for(const boon of boons)expect(draft.toggle(draft.candidates.find(d=>d.boon===boon)!.serial)).toBe(true);
 expect(w.chooseBirth()).toBe(true);
 if(fate==='spirit')for(const s of w.mechanics.spirits)for(let i=0;i<5&&s.element!=='fire';i++)w.cycleSpirit(s.id);
 if(fate!=='slayer')for(const[e,x,y,r]of layout){const p=mapPoint(x,y);w.selected=e;expect(w.place(circle(p.x,p.z,r))).toBe(true);}
 w.startWave();let peak=0,casts=0,nextCast=0;
 const waves: { wave:number; seconds:number; health:number; progress:number; stage:number; peak:number; wallet:number; wards:number }[]=[];
 let wavePeak=0, waveStart=0;
 let remaining:Wolf[]=[];
 const timings:number[]=[];
 for(let frame=0;frame<30*1050 && w.phase!=='lost'&&w.phase!=='won';frame++){
  if(w.phase==='rest'){
   waves.push({wave:w.wave,seconds:Math.round(w.time-waveStart),health:w.health,progress:w.build.progress,stage:w.build.stage,peak:wavePeak,wallet:Math.round(w.spirit),wards:w.wards.length});wavePeak=0;waveStart=w.time;
   const priority=(id:string)=>id==='awaken'||id==='ascend'?100:id==='common-repair'&&w.health<75?90:id.startsWith(`${fate}-`)?80:id==='root-metal-pursuit'||id==='root-fire-ember'?65:id==='common-spell'&&fate==='slayer'?60:id==='common-regen'?50:0;
   let offers=[...w.build.offers].sort((a,b)=>priority(b.id)-priority(a.id));
   if(priority(offers[0]!.id)<60 && w.rerollRewards())offers=[...w.build.offers].sort((a,b)=>priority(b.id)-priority(a.id));
   w.chooseUpgrade(offers[0]!.id);
   if(fate!=='slayer')for(const[e,x,y,r]of layout){const p=mapPoint(x,y),ward=w.wards.find(a=>distance(a,p)<.1);if(ward&&ward.health/ward.maxHealth<.7&&w.spirit>=14)w.dismissWard(ward.id);if(!w.wards.some(a=>distance(a,p)<.1)){w.selected=e;w.place(circle(p.x,p.z,r));}}
   while(w.health<=80&&w.repairCamp()){}
   w.startWave();
  }
  const alive=w.wolves.filter(v=>v.action!=='dead');peak=Math.max(peak,alive.length);wavePeak=Math.max(wavePeak,alive.length);
  remaining=alive;
  if(tactical && w.ultimate.available && (w.wave===10 ? alive.some(v=>v.kind==='king'&&distance(v,w.camp)<18) || w.health<30 : alive.length>=40 || w.health<40)) w.startUltimate();
  if((w.ultimate.active ? frame%18===0 : w.time>=nextCast)&&alive.length){
   let target=[...alive].sort((a,b)=>distance(a,w.camp)-distance(b,w.camp))[0]!;
   if(fate==='spirit'){
    const focused=alive.find(v=>v.id===w.mechanics.commands.targetId);
    if(focused&&!(distance(target,w.camp)<5&&distance(focused,w.camp)>8))target=focused;
    else w.mechanics.commands.command(target);
    if(!w.ultimate.active&&!w.mechanics.commands.ready&&w.mechanics.spirits.every(s=>w.mechanics.commands.amount(s.id)>=1)){nextCast=w.time+.15;w.tick(1/30);continue;}
   }
   if(fate==='array'&&!w.ultimate.active&&w.spirit<84&&distance(target,w.camp)>5){nextCast=w.time+.15;w.tick(1/30);continue;}
   let element:Element='metal';let at=target;
   if(tactical){
    const counter=alive.find(v=>w.enemyAbilities.counterAura(v) && (w.enemyAbilities.casting(v.id) || distance(v,w.camp)<12));
    const burning=alive.find(v=>v.burning>.4&&alive.filter(b=>distance(v,b)<3.2).length>=3);
    if(counter){at=counter;element=(Object.keys(OVERCOMES)as Element[]).find(e=>OVERCOMES[e]===w.enemyAbilities.counterAura(counter))!;}
    else if(burning){at=burning;element=burning.burning*burning.burnDps>12?'water':'wood';}
    else if(alive.filter(v=>distance(v,target)<3.2).length>=3) element='fire';
    else if(fate!=='slayer'&&w.spirit<35){nextCast=w.time+.25;}
   }
   if(tactical && fate==='array' && !alive.some(v=>w.enemyAbilities.casting(v.id))) {
    const node=w.mechanics.arrays.nodes.filter(n=>(w.mechanics.arrays.charge(n.id)?.energy??0)>=20 && alive.some(v=>w.wardAffects(v,n.ward)))
      .sort((a,b)=>(w.mechanics.arrays.charge(b.id)?.energy??0)-(w.mechanics.arrays.charge(a.id)?.energy??0))[0];
    if(node){w.selected=node.ward.element;if(w.invoke([{x:node.x-2,z:node.z},{x:node.x+2,z:node.z}])){casts++;nextCast=w.time+.6;w.tick(1/30);continue;}}
   }
   const neighbor=alive.filter(v=>v!==at&&distance(v,at)<5).sort((a,b)=>distance(a,at)-distance(b,at))[0];
   const length=tactical ? w.ultimate.active || at.kind==='king'&&w.spirit>=6 ? 8 : element!=='metal' || at.kind==='elite' || at.kind==='king' ? 4 : neighbor ? 4 : Math.max(.4,Math.min(4,at.hp/50.4*4+.05)) : 4;
   const direction=tactical&&neighbor?{x:(neighbor.x-at.x)/(distance(neighbor,at)||1),z:(neighbor.z-at.z)/(distance(neighbor,at)||1)}:{x:1,z:0};
   const path=[{x:at.x-direction.x*length*.25,z:at.z-direction.z*length*.25},{x:at.x+direction.x*length*.75,z:at.z+direction.z*length*.75}];w.selected=element;
   if(w.spirit>=w.strokeCost(path)&&w.invoke(path)){casts++;nextCast=w.time+.6;}
  }
  const start=performance.now();w.tick(1/30);timings.push(performance.now()-start);
 }
 timings.sort((a,b)=>a-b);
 waves.push({wave:w.wave,seconds:Math.round(w.time-waveStart),health:w.health,progress:w.build.progress,stage:w.build.stage,peak:wavePeak,wallet:Math.round(w.spirit),wards:w.wards.length});
 return{fate,tactical,phase:w.phase,wave:w.wave,health:w.health,kills:w.kills,casts,peak,seconds:Math.round(w.time),logicP95:timings[Math.floor(timings.length*.95)],damage:{...w.combatTotals},waves,survivors:remaining.filter(v=>v.action!=='dead').map(v=>({kind:v.kind,skill:v.eliteSkill,affixes:v.affixes,hp:v.hp,x:v.x,z:v.z}))};
}
describe('real horde progression without granted energy or damage',()=>{
 it('compares simple metal spam with element-aware play across the three starting paths',()=>{
  const path=process.env.WAVE_PATH as Fate|undefined;
  const results=path?[simulate(path,true)]:[simulate('slayer',false),simulate('slayer',true),simulate('array',true),simulate('spirit',true)];
  writeFileSync(`artifacts/balance/horde-${path??'simulation'}.json`,JSON.stringify(results,null,2));console.info('HORDE_RESULTS',JSON.stringify(results));
  for(const r of results){expect(r.peak).toBeLessThanOrEqual(96);expect(Number.isFinite(r.logicP95)).toBe(true);}
  const total=Array.from({length:CAMPAIGN_WAVES},(_,i)=>encounter(i+1).count).reduce((n,c)=>n+c,0);
  for(const r of results.filter(r=>r.tactical)){expect(r.phase).toBe('won');expect(r.wave).toBe(CAMPAIGN_WAVES);expect(r.health).toBeGreaterThan(0);expect(r.kills).toBeGreaterThanOrEqual(total);
   if(r.fate==='slayer')expect(r.damage.reaction).toBeGreaterThan(0);
   if(r.fate==='array')expect(r.damage.ward+r.damage.companion).toBeGreaterThan(r.damage.spell);
   if(r.fate==='spirit')expect(r.damage.companion).toBeGreaterThan(1000);
  }
 },180000);
});
