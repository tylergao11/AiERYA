import { describe, expect, it } from 'vitest';
import { random, type Point } from '../src/core/math';
import { ELEMENTS, type Element, type Ward, type Wolf } from '../src/game/contracts';
import { World } from '../src/game/world';
import { planCombatStroke, OVERCOMES } from '../src/game/combat';
import { ARRAY, ARRAY_REWARDS } from '../src/game/array-balance';
import type { ArrayEvent } from '../src/game/array-momentum';
import type { Destiny } from '../src/game/roguelike';

const fate=(f:'array'|'spirit'='array',element:Element='metal',serial=1):Destiny=>({serial,fate:f,tier:'ordinary',boon:f==='array'?'fivefold':'twins',roots:[element]});
const square=(x=-6,z=4):Point[]=>[{x:x-2,z:z-2},{x:x+2,z:z-2},{x:x+2,z:z+2},{x:x-2,z:z+2},{x:x-2,z:z-2}];
const wolf=(id=999,x=-6,z=4,hp=100000):Wolf=>({id,x,z,hp,maxHp:hp,speed:0,heading:0,action:'run',age:0,attack:10,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
function setup(elements:Element[]=['fire'],pure=false){
  const w=new World({roguelike:true,random:random(1337)});
  w.build.beginPair([fate('array','metal'),fate(pure?'array':'spirit','water',2)]);w.phase='prepare';w.mechanics.initialize();
  const wards:Ward[]=[];
  const positions=[[-6,4],[1,4],[8,4],[8,-4],[1,-4]];
  elements.forEach((element,i)=>{const [x,z]=positions[i]!;w.selected=element;expect(w.place(square(x,z))).toBe(true);wards.push(w.wards.at(-1)!);});
  w.startWave();w.wolves=wards.map((n,i)=>wolf(900+i,n.x+.2,n.z));
  const events:ArrayEvent[]=[];w.events.on('arrayEffect',e=>events.push(e));
  return {w,a:w.mechanics.arrays,wards,events};
}
function feed(w:World,ward:Ward,times=4){for(let i=0;i<times;i++){w.time+=ARRAY.feedWindow;const target=w.wolves.find(t=>t.action!=='dead')!;w.hitRogue(target,1000,ward.element,{kind:'array',wardId:ward.id});}}
function learn(w:World,id:string){const entry=w.build.rewardPool(50).find(e=>e.reward.id===id);expect(entry,`offered ${id}`).toBeTruthy();w.build.offers=[entry!.reward];expect(w.build.choose(id,50)).toBeTruthy();}
function cast(w:World,element:Element,points:Point[],investment=1){const stroke=planCombatStroke(points)!;const credit=w.mechanics.beginCast(false,12*investment,investment);const plan=w.mechanics.arrays.plan(stroke,element,credit);w.mechanics.arrays.resolve(plan);return plan;}
function at(ward:Ward):Point[]{return[{x:ward.x-2,z:ward.z},{x:ward.x+2,z:ward.z}];}

describe('array momentum integration and shared boundaries',()=>{
  it('starts empty; records actual finite HP damage, with a per-eye rate cap',()=>{
    const {w,a,wards}=setup(),n=wards[0]!;expect(a.total).toBe(0);feed(w,n,1);expect(a.total).toBe(12);
    feed(w,n,12);expect(a.total).toBe(100);
    const fresh=setup();fresh.w.wolves[0]!.hp=1;fresh.w.hitRogue(fresh.w.wolves[0]!,10000,'fire',{kind:'array',wardId:fresh.wards[0]!.id});expect(fresh.a.total).toBeCloseTo(.18);
  });
  it('does not charge from secondary damage, unrelated summons, corpses or idle time',()=>{
    const {w,a,wards}=setup();const target=w.wolves[0]!;
    w.hitRogue(target,100,'fire',{kind:'array',wardId:wards[0]!.id,noProc:true});
    w.hitRogue(target,100,'fire',{kind:'spirit',spiritId:w.mechanics.spirits.find(s=>s.role==='main')!.id});
    target.action='dead';w.hitRogue(target,100,'fire',{kind:'array',wardId:wards[0]!.id});a.tick(3);expect(a.total).toBe(0);
  });
  it('requires paid manual casts, actual eye contact, sufficient investment and a live local target',()=>{
    const {w,a,wards,events}=setup();const n=wards[0]!;feed(w,n);
    expect(a.plan(planCombatStroke(at(n))!,'water',{kind:'derived'})).toBeNull();
    cast(w,'water',[{x:-9,z:7},{x:-3,z:7}]);expect(a.total).toBe(48);
    cast(w,'water',at(n),.1);expect(a.total).toBe(48);
    w.wolves=[];cast(w,'water',at(n));expect(a.total).toBe(48);expect(events.filter(e=>e.kind==='release')).toHaveLength(0);
  });
  it('shared mana is paid once in World.invoke; counters release after common suppression',()=>{
    const {w,a,wards,events}=setup(['fire'],true);feed(w,wards[0]!);w.selected='water';w.spirit=100;
    expect(w.invoke(at(wards[0]!))).toBe(true);expect(w.spirit).toBe(100-w.spellCost);
    expect(events.some(e=>e.kind==='release'&&e.style==='steam')).toBe(true);expect(a.total).toBe(0);
    expect(w.build.roots).toEqual(ELEMENTS);
  });
  it('routes in drawn order before spending, conserves transferred energy and carries memory',()=>{
    const {w,a,wards,events}=setup(['water','wood','fire']);feed(w,wards[0]!);
    cast(w,'water',wards.map(n=>({x:n.x,z:n.z})));
    const transfers=events.filter(e=>e.kind==='transfer');expect(transfers).toHaveLength(2);
    expect(transfers[0]!.energy).toBeCloseTo(33.6);expect(transfers[1]!.energy).toBeCloseTo((33.6+14/3)*.7);
    expect(events.some(e=>e.kind==='release'&&e.at.x===wards[2]!.x&&e.style==='steam')).toBe(true);
    expect(a.total).toBeLessThan(48+14);expect(a.charge(wards[1]!.id)!.memory).toEqual(expect.arrayContaining(['water','wood']));
  });
  it('short paid casts limit every release and a ticket resolves only once',()=>{
    const {w,a,wards,events}=setup();feed(w,wards[0]!,9);const plan=cast(w,'fire',at(wards[0]!),.25);
    expect(a.total).toBeCloseTo(75);a.resolve(plan);expect(a.total).toBeCloseTo(75);expect(events.filter(e=>e.kind==='release')).toHaveLength(1);
  });
  it('pure starting array fates of different elements trigger one independently paid partner',()=>{
    const {w,a,wards,events}=setup(['fire','wood','metal'],true);wards.forEach(n=>feed(w,n));expect(a.pure).toBe(true);
    cast(w,'fire',at(wards[0]!));expect(events.filter(e=>e.kind==='harmony')).toHaveLength(1);expect(a.total).toBe(48);
    learn(w,'opportunity-three');expect(a.pure).toBe(true);
    const mixed=setup(['fire','wood']);mixed.wards.forEach(n=>feed(mixed.w,n));cast(mixed.w,'fire',at(mixed.wards[0]!));expect(mixed.events.some(e=>e.kind==='harmony')).toBe(false);
  });
  it.each(ELEMENTS)('native %s has a mechanical identity',element=>{
    const {w,a,wards,events}=setup([element]),n=wards[0]!,target=w.wolves[0]!;feed(w,n);target.rooted=target.burning=target.wet=0;target.vx=target.vz=0;
    if(element==='water')target.x=n.x+1;
    if(element==='earth'){target.x=n.x+1.9;n.health=n.maxHealth/2;}
    cast(w,element,at(n));expect(events.some(e=>e.kind==='release'&&e.style===element)).toBe(true);
    if(element==='wood')expect(target.rooted).toBeGreaterThan(1);
    if(element==='water'){expect(a.fields).toHaveLength(1);expect(target.vx).toBeLessThan(0);}
    if(element==='fire')expect(target.burning).toBeGreaterThan(0);
    if(element==='earth'){expect(target.reactions?.weakened).toBeGreaterThan(0);expect(n.health).toBeGreaterThan(n.maxHealth/2);}
    if(element==='metal')expect(target.hp).toBeLessThan(target.maxHp-4000);
  });
  it.each(ELEMENTS)('%s overcoming has a separate named conversion',incoming=>{
    const {w,wards,events}=setup([OVERCOMES[incoming]]),n=wards[0]!;if(n.element==='earth')w.wolves[0]!.x=n.x+1.9;feed(w,n);
    cast(w,incoming,at(n));expect(events.some(e=>e.kind==='release'&&!ELEMENTS.includes(e.style as Element))).toBe(true);
  });
  it('retains paid momentum with one-off rewards, without changing common power or rates',()=>{
    const {w,a,wards}=setup(),n=wards[0]!,power=n.power.multiplier,cost=w.spellCost;learn(w,'array-density');feed(w,n);cast(w,'fire',at(n));
    expect(a.total).toBeCloseTo(48*.24);expect(n.power.multiplier).toBe(power);expect(w.spellCost).toBe(cost);
    expect(ARRAY_REWARDS.every(r=>r.max===1)).toBe(true);expect(w.build.rewardPool(50).some(e=>e.reward.id==='array-density')).toBe(false);
  });
  it('recalls three-element memory once; secondary effects cannot regenerate or spawn residues',()=>{
    const {w,a,wards,events}=setup(['water','wood','fire']);learn(w,'array-echo');learn(w,'array-invoke');feed(w,wards[0]!,6);
    cast(w,'water',wards.map(n=>({x:n.x,z:n.z})));const before=a.total;const fields=a.fields.length;a.tick(.4);
    expect(events.filter(e=>e.kind==='echo')).toHaveLength(1);expect(a.fields.length).toBe(fields);expect(a.total).toBe(before);a.tick(.5);expect(events.filter(e=>e.kind==='echo')).toHaveLength(1);
  });
  it('borrowed corpse remnants are single-use and never create descendants',()=>{
    const {w,a,wards}=setup();learn(w,'array-remnant');feed(w,wards[0]!);w.wolves[0]!.hp=1;cast(w,'fire',at(wards[0]!));expect(a.remnants).toHaveLength(1);
    const r=a.remnants[0]!;w.wolves=[wolf(1001,r.x,r.z,1)];cast(w,'fire',[{x:r.x-2,z:r.z},{x:r.x+2,z:r.z}]);expect(w.wolves[0]!.action).toBe('dead');expect(a.remnants).toHaveLength(0);
  });
  it('enemy-carried marks spend source energy and only transfer once in another generation array',()=>{
    const {w,a,wards}=setup(['water','wood']);learn(w,'array-messenger');feed(w,wards[0]!,1);expect(a.total).toBe(6);expect(a.marks).toHaveLength(1);
    const target=w.wolves[0]!;target.x=wards[1]!.x;target.z=wards[1]!.z;a.tick(.01);expect(a.marks).toHaveLength(0);expect(a.charge(wards[1]!.id)?.energy).toBe(9);a.tick(.01);expect(a.total).toBe(15);
  });
  it('keeps charged identity through awakening and clears disposed state on reset',()=>{
    const w=new World({roguelike:true});w.chooseDestiny({...fate(),boon:'twinArray'});w.selected='fire';expect(w.place(square())).toBe(true);const n=w.wards[0]!;w.startWave();w.wolves=[wolf()];feed(w,n);
    w.build.stage=1;w.mechanics.upgraded();expect(w.wards.some(a=>a.id===n.id)).toBe(true);expect(w.mechanics.spirits).toHaveLength(0);expect(w.mechanics.arrays.nodes.some(a=>a.id===n.id)).toBe(true);expect(w.mechanics.arrays.total).toBe(48);
    w.mechanics.arrays.endBattle();expect(w.mechanics.arrays.total).toBe(48);w.reset();expect(w.mechanics.arrays.total).toBe(0);
  });
  it('silence or removal blocks release; no-array games receive no array extension',()=>{
    const {w,a,wards,events}=setup();feed(w,wards[0]!);w.enemyAbilities.zones.push({...wards[0]!,radius:5,remaining:10,ownerId:77});cast(w,'fire',at(wards[0]!));expect(a.total).toBe(48);expect(events.some(e=>e.kind==='release')).toBe(false);
    w.wards=[];w.mechanics.spirits.length=0;a.sync();expect(a.total).toBe(0);
    const classic=new World();expect(classic.mechanics.arrays.active).toBe(false);expect(classic.mechanics.arrays.nodes).toHaveLength(0);
  });
  it('mixed array/summoner keeps command delivery while a manual line still releases an array',()=>{
    const {w,wards,events}=setup();feed(w,wards[0]!);w.selected='water';w.spirit=100;expect(w.invoke(at(wards[0]!))).toBe(true);
    expect(events.some(e=>e.kind==='release'&&e.style==='steam')).toBe(true);expect(w.mechanics.commands.amount(w.mechanics.spirits[0]!.id)).toBeGreaterThan(0);
  });
  it('ascending with five memories adds exactly five different terminal skills',()=>{
    const {w,a,wards,events}=setup(['water','wood','fire','earth','metal']);w.build.stage=2;feed(w,wards[0]!,9);
    cast(w,'metal',wards.map(n=>({x:n.x,z:n.z})));
    const bank=a.total;for(let i=0;i<60;i++)a.tick(1/60);
    const heaven=events.filter(e=>e.label.startsWith('周天合鸣'));expect(heaven).toHaveLength(5);expect(new Set(heaven.map(e=>e.style)).size).toBe(5);expect(a.total).toBe(bank);
  });
  it('primary releases retain common root kill effects without refilling array momentum',()=>{
    const {w,a,wards}=setup(['metal']);learn(w,'root-metal-pursuit');feed(w,wards[0]!);w.wolves[0]!.hp=1;
    const outside=wolf(1002,wards[0]!.x+3.5,wards[0]!.z);w.wolves.push(outside);cast(w,'metal',at(wards[0]!));
    expect(w.wolves[0]!.action).toBe('dead');expect(outside.hp).toBeLessThan(outside.maxHp);expect(a.total).toBe(0);
  });
  it('paid living-array migration carries its bank and can start one pure harmony',()=>{
    const {w,a,wards,events}=setup(['fire','wood'],true);learn(w,'opportunity-living');wards.forEach(n=>feed(w,n));
    w.wolves[0]!.x=-5.25;w.wolves[0]!.z=-4;const before=w.spirit;
    expect(w.moveMain(wards[0]!.id,{x:-6,z:-4})).toBe(true);expect(w.spirit).toBeLessThan(before);expect(a.total).toBe(0);
    expect(events.filter(e=>e.kind==='release')).toHaveLength(1);expect(events.filter(e=>e.kind==='harmony')).toHaveLength(1);
  });
  it('echo damage stays at its original footprint after the living source moves',()=>{
    const {w,a,wards,events}=setup(['fire']);learn(w,'opportunity-living');learn(w,'array-echo');
    const n=wards[0]!;feed(w,n);cast(w,'wood',at(n));cast(w,'earth',at(n));cast(w,'fire',at(n));
    expect(w.moveMain(n.id,{x:1,z:-4})).toBe(true);const hp=w.wolves[0]!.hp;a.tick(.4);
    expect(events.some(e=>e.kind==='echo'&&e.at.x===-6&&e.at.z===4)).toBe(true);expect(w.wolves[0]!.hp).toBeLessThan(hp);
  });
});
