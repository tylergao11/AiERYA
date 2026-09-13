import { describe,expect,it } from 'vitest';
import { World } from '../src/game/world';
import { affixSpeed,affixAttack,rollAffixes,tickAffixes } from '../src/game/elite-affixes';
import { encounter,ENCOUNTERS } from '../src/game/encounters';
import { random } from '../src/core/math';
import type { Wolf } from '../src/game/contracts';
const wolf=():Wolf=>({id:999,x:-6,z:4,kind:'elite',affixes:[],hp:100,maxHp:100,speed:2.5,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
describe('elite wolf affixes',()=>{
 it('combines speed and low-health rage without exponential stacking',()=>{const a=wolf();a.affixes=['swift','rage'];expect(affixSpeed(a)).toBe(1.45);a.hp=39;expect(affixSpeed(a)).toBeCloseTo(1.45*1.25);expect(affixAttack(a)).toBe(1.5);tickAffixes(a,1);expect(affixSpeed(a)).toBeCloseTo(1.45*1.25);});
 it('real damage delays regeneration; death and time stop cannot heal',()=>{
  const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'spirit',boon:'twins',roots:['water'],tier:'ordinary'});w.startWave();const a=wolf();a.affixes=['regen'];w.wolves=[a];
  w.hitRogue(a,10,'metal',{kind:'trigger',noProc:true});const hp=a.hp;tickAffixes(a,2);expect(a.hp).toBe(hp);tickAffixes(a,1.1);expect(a.hp).toBeGreaterThan(hp);
  const healed=a.hp;w.startUltimate();w.tick(1);expect(a.hp).toBe(healed);a.hp=0;tickAffixes(a,10);expect(a.hp).toBe(0);
 });
 it('split resolves once through actual death, children scatter and never mint currency',()=>{
  const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'spirit',boon:'twins',roots:['water'],tier:'ordinary'});w.startWave();w.spirit=90;const a=wolf();a.affixes=['split'];w.wolves=[a];
  w.hitRogue(a,1000,'metal',{kind:'trigger',noProc:true});expect(w.spirit).toBe(94);const children=w.wolves.filter(v=>v!==a);expect(children).toHaveLength(2);
  expect(Math.hypot(children[0]!.x-children[1]!.x,children[0]!.z-children[1]!.z)).toBeGreaterThan(2);
  for(const child of children)w.hitRogue(child,1000,'metal',{kind:'trigger',noProc:true});w.hitRogue(a,1000,'metal',{kind:'trigger',noProc:true});expect(w.spirit).toBe(94);expect(w.wolves).toHaveLength(3);
 });
 it('death reinforcements respect the same live limit',()=>{
  const w=new World();w.startWave();const a=wolf();a.affixes=['split'];w.wolves=[a,...Array.from({length:ENCOUNTERS.aliveLimit-1},(_,i)=>({...wolf(),id:i+1,x:20,z:i}))];
  w.hitRogue(a,1000,'metal',{kind:'trigger',noProc:true});expect(w.wolves.filter(v=>v.action!=='dead').length).toBeLessThanOrEqual(ENCOUNTERS.aliveLimit);
 });
 it('introduces combinations later, excludes giant plus regeneration, and keeps normals the majority',()=>{
  const rng=random(145);const seen=new Set<string>();
  for(let i=0;i<200;i++){const a=rollAffixes(8,rng);a.forEach(k=>seen.add(k));expect(a.length).toBeGreaterThan(0);expect(a.length).toBeLessThanOrEqual(2);expect(a.includes('giant')&&a.includes('regen')).toBe(false);expect(rollAffixes(1,rng)).toHaveLength(1);}
  expect(seen.size).toBe(5);
  for(let n=1;n<=10;n++){const p=encounter(n),elites=p.spawns.filter(t=>t.kind==='elite');expect(elites.length).toBeGreaterThanOrEqual(n===1?2:n===10?28:5);expect(elites.length/p.count).toBeLessThan(.12);expect(elites.every(e=>e.affixes.length>0)).toBe(true);}
 });
});
