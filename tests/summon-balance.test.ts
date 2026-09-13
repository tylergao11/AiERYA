import { describe,expect,it } from 'vitest';
import { writeFileSync,mkdirSync } from 'node:fs';
import { World } from '../src/game/world';
import { distance,random } from '../src/core/math';
import type { Element } from '../src/game/contracts';
import type { Boon } from '../src/game/roguelike';
import { OVERCOMES } from '../src/game/combat';

function simulate(boon:Boon,active:boolean,seed=73451,partner?:Boon){
 const w=new World({roguelike:true,random:random(seed)});
 if(partner){w.birthDraft.candidates=[boon,partner].map((b,i)=>({serial:i+1,fate:'spirit',tier:b==='beast'?'unusual':'ordinary',boon:b,roots:[b==='beast'?'earth':i?'water':'fire']}));w.birthDraft.toggle(1);w.birthDraft.toggle(2);expect(w.chooseBirth()).toBe(true);}
 else w.chooseDestiny({serial:1,fate:'spirit',tier:boon==='beast'?'unusual':'ordinary',boon,roots:[boon==='beast'?'earth':'fire']});
 if(boon==='twins')w.mechanics.spirits[1]!.element='water';
 w.startWave();let casts=0,unions=0,nextCast=0;const rewards:string[]=[];
 w.events.on('summonOrder',e=>{if(e.kind==='union')unions++;});
 for(let frame=0;frame<60*210&&w.phase!=='lost';frame++){
  if(w.phase==='rest'){
   if(w.wave===3)break;
   const score=(id:string)=>id==='awaken'||id==='ascend'?100:id==='common-repair'&&w.health<65?95:id==='spirit-might'?90:id==='spirit-harmony'?85:id==='common-regen'?75:id.startsWith('spirit-')?70:30;
   const pick=[...w.build.offers].sort((a,b)=>score(b.id)-score(a.id))[0]!;rewards.push(pick.id);w.chooseUpgrade(pick.id);while(w.health<=80&&w.repairCamp()){}w.startWave();
  }
  const alive=w.wolves.filter(w=>w.action!=='dead');
  if(active&&alive.length){
   const target=[...alive].sort((a,b)=>distance(a,w.camp)-distance(b,w.camp))[0]!;
   const marked=alive.find(t=>t.id===w.mechanics.commands.targetId);
   if(!marked||distance(target,w.camp)<5&&distance(marked,w.camp)>8)w.mechanics.commands.command(target);
   const focus=marked??target;
   if(w.time>=nextCast&&(w.mechanics.commands.ready||w.mechanics.spirits.some(s=>w.mechanics.commands.amount(s.id)<1))){
    let element:Element=focus.kind==='elite'||focus.kind==='king'?'metal':alive.filter(t=>distance(t,focus)<3).length>=2?'fire':'metal';
    const aura=w.enemyAbilities.counterAura(focus);
    if(aura)element=(Object.keys(OVERCOMES)as Element[]).find(e=>OVERCOMES[e]===aura)!;
    else if(focus.burning*focus.burnDps>10)element='water';
    const path=[{x:focus.x-2,z:focus.z},{x:focus.x+2,z:focus.z}];w.selected=element;
    if(w.spirit>=w.strokeCost(path)&&w.invoke(path)){casts++;nextCast=w.time+.7;}
   }
  }
  w.tick(1/60);
 }
 return {boon,partner,active,seed,phase:w.phase,wave:w.wave,health:Number(w.health.toFixed(1)),kills:w.kills,casts,unions,seconds:Math.round(w.time),rewards,damage:{...w.combatTotals}};
}
describe('summoner-only real encounters, without wards or granted energy',()=>{
 it('measures active command value and the three starting builds',()=>{
  const results=[simulate('twins',false,73451,'mimic'),simulate('twins',true,73451,'mimic'),simulate('beast',true,73451,'twins'),simulate('mimic',true,73451,'beast')];
  mkdirSync('artifacts/balance',{recursive:true});writeFileSync('artifacts/balance/summon-campaign.json',JSON.stringify(results,null,2));console.info('SUMMON_CAMPAIGN',JSON.stringify(results));
  for(const result of results){expect(result.damage.spell).toBe(0);expect(result.damage.ward).toBe(0);}
  expect(results[1]!.kills).toBeGreaterThan(results[0]!.kills);
  for(const result of results.slice(1)){expect(result.unions).toBeGreaterThan(0);expect(result.phase).toBe('rest');expect(result.wave).toBe(3);}
 },60000);
});
