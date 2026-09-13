import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { ELEMENTS, type Element, type Wolf } from '../src/game/contracts';
import { GENERATES, planCombatStroke } from '../src/game/combat';
import { ARRAY_SUPPORT } from '../src/game/array-balance';
import { BOONS, OPPORTUNITIES, type Boon } from '../src/game/roguelike';
import { arrayGuide } from '../src/ui/array-guide';
import { rewardExample } from '../src/ui/reward-examples';
import { boonArt, rewardArt } from '../src/ui/manuscript-art';

const loop=(x=-6,z=4)=>[{x:x-2,z:z-2},{x:x+2,z:z-2},{x:x+2,z:z+2},{x:x-2,z:z+2},{x:x-2,z:z-2}];
const enemy=(id=900,x=-5.5,z=4):Wolf=>({id,x,z,hp:1000,maxHp:1000,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
function setup(element:Element='wood',boon:Boon='fivefold'){
 const w=new World({roguelike:true});expect(w.chooseDestiny({serial:1,fate:'array',boon,tier:boon==='living'?'unusual':'ordinary',roots:[element]})).toBe(true);
 w.selected=element;expect(w.place(loop())).toBe(true);const ward=w.wards[0]!;w.startWave();w.wolves=[enemy(900,element==='earth'?-4.05:-5.5)];return{w,ward,a:w.mechanics.arrays};
}
function cast(w:World,element:Element,investment=1){const ward=w.wards[0]!,stroke=planCombatStroke([{x:ward.x-2,z:ward.z},{x:ward.x+2,z:ward.z}])!;
 w.mechanics.arrays.resolve(w.mechanics.arrays.plan(stroke,element,w.mechanics.beginCast(false,3*investment,investment)));}

describe('array builds remain terrain and activate elemental utility',()=>{
 it.each(['fivefold','twinArray','living'] as const)('%s never creates a companion before or after either breakthrough',boon=>{
  const{w,ward}=setup('earth',boon);const cost=w.spirit;for(const stage of [0,1,2]){w.build.stage=stage;w.mechanics.upgraded();expect(w.wards[0]).toBe(ward);expect(w.mechanics.spirits).toEqual([]);expect(w.availableMainSlot).toBe(boon==='twinArray'?1:undefined);}
  expect(w.spirit).toBe(cost);expect(w.build.roots).toEqual(ELEMENTS);
  expect(w.notice).not.toMatch(/阵灵|化灵|宝宝/);
 });
 it('keeps mixed summon units, but array affinity alone does not activate summon rewards',()=>{
  const{w}=setup();const might=w.build.rewardPool(50).find(r=>r.reward.id==='spirit-might')!.reward;expect(might.dormant).toContain('需御灵机缘');
  const twins=OPPORTUNITIES.find(r=>r.boon==='twins')!;w.phase='rest';w.build.offers=[twins];w.chooseUpgrade(twins.id);expect(w.build.has('twins')).toBe(true);
  expect(w.mechanics.spirits.map(s=>s.role)).toEqual(['main','twin']);
 });
 it('removes the old boon from both opening and opportunity catalogs and all array descriptions',()=>{
  expect(BOONS).not.toHaveProperty('arraySpirit');expect(OPPORTUNITIES.some(r=>r.id==='opportunity-arraySpirit')).toBe(false);
  const{w}=setup();const text=arrayGuide(w)+BOONS.fivefold.detail+boonArt('fivefold');expect(text).not.toMatch(/阵灵|宝宝|化灵/);
  expect(boonArt('fivefold')).toContain('data-illustration');expect(boonArt('fivefold')).not.toContain('talent-paintings');
  const r={id:'awaken',title:'五行通脉',detail:'',tag:'',level:1};expect(rewardExample(r,w.build).result).toContain('原位保留');expect(rewardArt(r,w.build)).not.toContain('destiny-progress-paintings:4');
 });
 it.each(ELEMENTS)('%s support has its own utility without direct damage or autonomous actors',element=>{
  const{w,ward,a}=setup(element,'twinArray'),target=w.wolves[0]!,incoming=ELEMENTS.find(e=>GENERATES[e]===element)!;
  ward.health=ward.maxHealth/2;if(element==='fire'){target.burning=2;target.burnDps=10;target.burnBaseDps=10;}
  cast(w,incoming);expect(a.support.fields.map(f=>f.element)).toEqual([element]);expect(target.hp).toBe(1000);expect(w.mechanics.spirits).toHaveLength(0);
  if(element==='metal')expect(target.reactions?.exposure).toBe(ARRAY_SUPPORT.exposure);
  if(element==='wood')expect(target.rooted).toBeGreaterThan(0);
  if(element==='water'){expect(target.vx).toBeLessThan(0);expect(target.wet).toBeGreaterThan(0);}
  if(element==='fire')expect(target.burning).toBe(3.5);
  if(element==='earth'){expect(ward.health).toBeGreaterThan(ward.maxHealth/2);expect(a.support.guards(ward)).toBe(true);expect(target.reactions?.weakness).toBe(ARRAY_SUPPORT.weakness);}
 });
 it('water into wood applies both gathering and binding, but reverse generation only feeds momentum',()=>{
  const{w,a}=setup();cast(w,'water');expect(a.support.fields.map(f=>f.element)).toEqual(['water','wood']);expect(w.wolves[0]!.vx).toBeLessThan(0);expect(w.wolves[0]!.rooted).toBeGreaterThan(0);
  a.endBattle();cast(w,'fire');expect(a.support.fields).toHaveLength(0);
 });
 it('awakening relays once to the nearest next generation array with no extra mana or entity',()=>{
  const{w,a,ward}=setup();w.phase='prepare';w.selected='fire';expect(w.place(loop(1))).toBe(true);w.selected='earth';expect(w.place(loop(8))).toBe(true);
  w.phase='battle';w.wolves.push(enemy(901,1.5,4),enemy(902,9.95,4));w.build.stage=1;w.mechanics.upgraded();const mana=w.spirit;
  cast(w,'water');expect(a.support.fields.map(f=>[f.ward.element,f.element])).toEqual([['wood','water'],['wood','wood'],['fire','fire']]);expect(w.wards[0]).toBe(ward);expect(w.spirit).toBe(mana);expect(w.mechanics.spirits).toHaveLength(0);
 });
 it('requires targets, adequate paid investment and obeys per-array cooldown instead of short-stroke spam',()=>{
  const{w,a}=setup();cast(w,'water',.1);expect(a.support.fields).toHaveLength(0);cast(w,'water',.25);expect(a.support.fields[0]!.duration).toBe(.75);
  cast(w,'water');expect(a.support.fields[0]!.duration).toBe(.75);a.tick(.8);expect(a.support.fields).toHaveLength(0);cast(w,'water');expect(a.support.fields).toHaveLength(0);
  a.tick(2);w.wolves=[];cast(w,'water');expect(a.support.fields).toHaveLength(0);
 });
 it('earth can repair a damaged empty formation without producing momentum',()=>{
  const{w,ward,a}=setup('earth');w.wolves=[];ward.health/=2;cast(w,'fire');expect(ward.health).toBeGreaterThan(ward.maxHealth/2);expect(a.total).toBe(0);
 });
 it('fire extends each existing burn once and spreads only to two local targets',()=>{
  const{w,a}=setup('fire','twinArray');w.wolves=[enemy(),enemy(901),enemy(902),enemy(903),enemy(904,3,4)];const main=w.wolves[0]!;main.burning=2;main.burnDps=10;main.burnBaseDps=10;
  cast(w,'wood');expect(w.wolves.filter(t=>t.burning>0)).toHaveLength(3);const bank=a.total;a.tick(.4);expect(main.burning).toBe(3.5);expect(w.wolves[3]!.burning).toBe(0);expect(w.wolves[4]!.burning).toBe(0);expect(a.total).toBe(bank);
 });
 it('never shortens a pre-existing long burn, even when it exceeds the auxiliary extension cap',()=>{
  const{w}=setup('fire','twinArray'),target=w.wolves[0]!;target.burning=9;target.burnDps=10;cast(w,'wood');expect(target.burning).toBe(9);
 });
 it('utility respects the actual drawing boundary and silence, expires and clears across phases',()=>{
  const{w,a,ward}=setup('metal','twinArray');w.wolves.push(enemy(901,-3.8,6.1));cast(w,'earth');expect(w.wolves[1]!.reactions?.exposed??0).toBe(0);
  w.enemyAbilities.zones.push({...ward,radius:5,remaining:5,ownerId:50});w.wolves[0]!.reactions!.exposed=0;a.tick(.4);expect(w.wolves[0]!.reactions!.exposed).toBe(0);
  a.endBattle();expect(a.support.fields).toEqual([]);cast(w,'earth');expect(a.support.fields).toEqual([]);w.enemyAbilities.clear();cast(w,'earth');expect(a.support.fields).toHaveLength(1);
  w.wards=[];a.tick(.01);expect(a.support.fields).toHaveLength(0);w.reset();expect(a.support.fields).toHaveLength(0);
 });
 it('Five Element Afterglow turns a paid release into local utility without summoning',()=>{
  const{w,ward,a}=setup('metal','twinArray');w.phase='rest';const r=w.build.rewardPool(50).find(e=>e.reward.id==='array-invoke')!.reward;w.build.offers=[r];w.chooseUpgrade(r.id);w.phase='battle';
  for(let i=0;i<3;i++){w.time+=.25;w.hitRogue(w.wolves[0]!,70,'metal',{kind:'array',wardId:ward.id});}
  cast(w,'metal');expect(a.support.fields.map(f=>f.element)).toEqual(['metal']);expect(w.mechanics.spirits).toHaveLength(0);
 });
});
