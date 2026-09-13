import { describe,expect,it } from 'vitest';
import { World } from '../src/game/world';
import type { Element,Wolf } from '../src/game/contracts';
import { distance } from '../src/core/math';
import { REWARDS,OPPORTUNITIES,type Boon } from '../src/game/roguelike';
import { SpiritMovement } from '../src/game/spirit-movement';
import { SUMMON } from '../src/game/summon-balance';
import { ECONOMY } from '../src/game/economy';

const wolf=(id=999,x=-1,z=4,hp=10000):Wolf=>({id,x,z,hp,maxHp:hp,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
const line=(x=-1,z=4,len=4)=>[{x:x-len/2,z},{x:x+len/2,z}];
function setup(boon:Boon='mimic',element:Element='fire'){
  const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'spirit',tier:boon==='beast'?'unusual':'ordinary',boon,roots:[element]});
  w.mechanics.spirits.forEach((s,i)=>Object.assign(s,{x:-6,z:4+i*.5}));w.startWave();w.wolves=[wolf()];return w;
}
const tick=(w:World,seconds:number)=>{for(let n=0;n<Math.ceil(seconds*60);n++)w.mechanics.tick(1/60);};
function learn(w:World,id:string){const r=REWARDS.find(r=>r.id===id)!;w.build.offers=[{...r,detail:r.detail(1),level:1,tag:'test'}];expect(w.build.choose(id,w.health)).toBeTruthy();}
function acquire(w:World,boon:Boon){w.build.offers=[OPPORTUNITIES.find(r=>r.boon===boon)!];expect(w.build.choose(`opportunity-${boon}`,w.health)).toBeTruthy();w.mechanics.upgraded();}

describe('summoner command ownership and energy',()=>{
  it('free focus and rally neither spend mana nor grant damage, resonance or attack resets',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!;s.cooldown=1;s.cast=.3;const start=w.spirit;
    for(let n=0;n<10;n++)expect(w.mechanics.commands.command(w.wolves[0]!)).toBe(true);
    expect(w.spirit).toBe(start);expect(s.cooldown).toBe(1);expect(w.wolves[0]!.hp).toBe(10000);expect(w.mechanics.commands.resonance).toBe(0);
    expect(w.mechanics.commands.command({x:-10,z:7})).toBe(true);expect(w.mechanics.commands.targetId).toBeNull();tick(w,1);expect(s.x).toBeLessThan(-6);
  });
  it('an infused stroke does no remote damage and does not change native element',()=>{
    const w=setup('twins','metal'),s=w.mechanics.spirits[0]!,t=w.wolves[0]!;w.selected='fire';const invoke:any[]=[];w.events.on('invoke',e=>invoke.push(e));
    expect(w.invoke(line())).toBe(true);expect(w.spirit).toBe(100-ECONOMY.strokePrice);expect(t.hp).toBe(10000);expect(invoke).toHaveLength(0);expect(s.element).toBe('metal');
    tick(w,.21);expect(t.hp).toBe(10000);tick(w,.3);expect(t.hp).toBeLessThan(10000);expect(t.burning).toBeGreaterThan(0);expect(w.combatTotals.companion).toBeGreaterThan(0);expect(w.combatTotals.spell).toBe(0);
  });
  it('quotes capacity before charging and retains old expiry on a different-element order',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!;w.selected='fire';expect(w.invoke(line())).toBe(true);expect(w.mechanics.commands.amount(s.id)).toBe(2);
    expect(w.invoke(line(-1,4,20))).toBe(true);expect(w.spirit).toBe(100-2*ECONOMY.strokePrice);expect(w.mechanics.commands.amount(s.id)).toBe(4);
    expect(w.quoteStroke(line())!.cost).toBe(0);expect(w.invoke(line())).toBe(false);expect(w.spirit).toBe(100-2*ECONOMY.strokePrice);
    w.wolves=[];tick(w,7);w.mechanics.commands.take(s);w.selected='water';expect(w.invoke(line())).toBe(true);expect(w.spirit).toBe(100-2.5*ECONOMY.strokePrice);
    tick(w,1.1);expect(w.mechanics.commands.amount(s.id)).toBeCloseTo(1);expect(w.mechanics.commands.element(s.id)).toBe('water');
  });
  it('tiny strokes pay and empower proportionally, without rounding to a complete attack',()=>{
    const w=setup('twins');expect(w.invoke(line(-1,4,.4))).toBe(true);expect(w.spirit).toBeCloseTo(100-.1*ECONOMY.strokePrice);
    const shot=w.mechanics.commands.take(w.mechanics.spirits[0]!)!;expect(shot.amount).toBeCloseTo(.2);expect(w.mechanics.commands.amount(w.mechanics.spirits[0]!.id)).toBe(0);
  });
  it('only learns other-path skills to break purity; pet elements, common and root rewards are allowed',()=>{
    const w=setup('twins');w.mechanics.spirits[1]!.element='water';expect(w.build.pureSummoner).toBe(true);
    learn(w,'common-regen');learn(w,'root-water-ripple');learn(w,'spirit-seal');expect(w.build.pureSummoner).toBe(true);
    learn(w,'slayer-edge');expect(w.build.pureSummoner).toBe(false);
    const mixed=setup();acquire(mixed,'living');expect(mixed.build.pureSummoner).toBe(false);
  });
  it('mixed slayer keeps its direct hit and also issues the pet order',()=>{
    const w=setup();acquire(w,'three');w.selected='metal';const hp=w.wolves[0]!.hp;expect(w.invoke(line())).toBe(true);
    expect(w.wolves[0]!.hp).toBeLessThan(hp);expect(w.combatTotals.spell).toBeGreaterThan(0);expect(w.mechanics.commands.amount(w.mechanics.spirits[0]!.id)).toBeGreaterThan(0);
  });
});

describe('earned summoner mechanics',()=>{
  it('pincer is shared by the original order and never repeats for every pet pair',()=>{
    const w=setup('twins','metal');learn(w,'spirit-pincer');acquire(w,'mimic');
    const effects:string[]=[];w.events.on('summonTechnique',e=>effects.push(e.kind));w.selected='metal';w.invoke(line());tick(w,1.7);
    expect(effects.filter(s=>s==='pincer')).toHaveLength(1);
  });
  it('hunt follows an actual ordered kill, keeping finite stock and attack cooldown',()=>{
    const w=setup('twins','metal');learn(w,'spirit-hunt');const t=w.wolves[0]!,next=wolf(1000,-.5,6);t.hp=1;w.wolves.push(next);
    w.selected='metal';w.invoke(line());const s=w.mechanics.spirits[0]!;const shot=w.mechanics.commands.take(s)!;s.cooldown=.8;
    w.mechanics.commands.land(s,t,shot);expect(t.action).toBe('dead');expect(w.mechanics.commands.targetId).toBe(next.id);
    expect(w.mechanics.commands.movingSpeed).toBeCloseTo(SUMMON.movement*SUMMON.pursuitSpeed);expect(s.cooldown).toBe(.8);expect(w.mechanics.commands.amount(s.id)).toBe(1);
  });
  it('beast sweep hits up to three frontal neighbors while leaving rear enemies untouched',()=>{
    const w=setup('beast','earth');learn(w,'spirit-sweep');const s=w.mechanics.spirits[0]!;s.x=-2.7;s.z=4;
    w.wolves.push(wolf(1000,-1.7,4.6),wolf(1001,-1.6,3.4),wolf(1002,-1.4,4.8),wolf(1003,-1.3,3.2),wolf(1004,-3.7,4));
    w.selected='metal';w.invoke(line());w.mechanics.commands.land(s,w.wolves[0]!,w.mechanics.commands.take(s));
    expect(w.wolves.slice(1,5).filter(t=>t.hp<10000)).toHaveLength(3);expect(w.wolves[5]!.hp).toBe(10000);
  });
  it('fury counts original kills, pays out once, and never feeds on summoned wolves',()=>{
    const w=setup('beast');learn(w,'spirit-fury');const s=w.mechanics.spirits[0]!;s.x=-2.7;s.z=4;
    w.selected='metal';w.invoke(line());const shot=w.mechanics.commands.take(s)!;
    for(let n=0;n<3;n++){const t=wolf(2000+n,-1,4,1);w.wolves=[t];w.mechanics.commands.land(s,t,shot);}
    expect(w.mechanics.commands.fury).toBe(3);const events:number[]=[],owners:{spiritId?:number;targetId?:number}[]=[];w.events.on('summonImpact',e=>events.push(e.strength));w.events.on('summonTechnique',e=>{if(e.kind==='fury')owners.push(e);});
    const t=wolf();w.wolves=[t];w.mechanics.commands.land(s,t,shot);expect(events[0]).toBeCloseTo(1.6);expect(w.mechanics.commands.fury).toBe(0);expect(owners).toHaveLength(1);expect(owners[0]).toMatchObject({spiritId:s.id,targetId:t.id});
    const extra={...wolf(3000,-1,4,1),summoned:true};w.wolves=[extra];w.mechanics.commands.land(s,extra,shot);expect(w.mechanics.commands.fury).toBe(0);
  });
  it('seal replays the old element before the new hit, without replacing the next stored seal',()=>{
    const w=setup('twins','metal');learn(w,'spirit-seal');const s=w.mechanics.spirits[0]!,t=w.wolves[0]!;
    const events:{element:Element;echo:boolean}[]=[];w.events.on('summonImpact',e=>events.push(e));
    for(const element of ['fire','water','wood']as const){w.selected=element;w.invoke(line());w.mechanics.commands.land(s,t,w.mechanics.commands.take(s));}
    expect(events.map(e=>[e.element,e.echo])).toEqual([['fire',false],['fire',true],['water',false],['water',true],['wood',false]]);
  });
  it('a learned mimic echo redirects once to a living legal neighbor and does not earn resonance',()=>{
    const run=(earned:boolean)=>{const w=setup('mimic','metal');if(earned)learn(w,'spirit-echo');const s=w.mechanics.spirits[0]!,t=w.wolves[0]!,next=wolf(1000,-1,5);w.wolves.push(next);
      w.selected='metal';w.invoke(line());w.mechanics.commands.land(s,t,w.mechanics.commands.take(s));t.action='dead';t.hp=0;
      const resonance=w.mechanics.commands.resonance;const events:boolean[]=[];w.events.on('summonImpact',e=>events.push(e.echo));
      for(let n=0;n<60;n++)w.mechanics.commands.tick(1/60);
      expect(w.mechanics.commands.resonance).toBe(resonance);return {hp:next.hp,echoes:events.filter(Boolean).length};};
    expect(run(false)).toEqual({hp:10000,echoes:0});expect(run(true).hp).toBeLessThan(10000);expect(run(true).echoes).toBe(1);
  });
  it('stored reaction swords wait for pet contact and consume at most one sword per order',()=>{
    const w=setup('twins','metal');const tactics=w.mechanics.tactics;tactics.swords=3;tactics.swordRemaining=8;
    w.selected='fire';w.invoke(line());expect(tactics.swords).toBe(3);tick(w,1.7);expect(tactics.swords).toBe(2);
  });
});
describe('resonance, physical attacks and lifecycle',()=>{
  it('earns resonance from real contacts, holds ready, and spends it on the next substantial order',()=>{
    const w=setup('twins');w.mechanics.commands.command(w.wolves[0]!);
    for(let n=0;n<30&&!w.mechanics.commands.ready;n++){if(w.spirit>=12)w.invoke(line());tick(w,1);}
    expect(w.mechanics.commands.ready).toBe(true);w.wolves=[];tick(w,10);expect(w.mechanics.commands.ready).toBe(true);
    w.wolves=[wolf()];w.spirit=100;expect(w.invoke(line(-1,4,.4))).toBe(true);expect(w.mechanics.commands.ready).toBe(true);
    expect(w.invoke(line())).toBe(true);expect(w.mechanics.commands.resonance).toBe(0);expect(w.mechanics.spirits.every(s=>w.mechanics.commands.united(s.id))).toBe(true);
  });
  it('a single ancestor can earn a full meter without another pet',()=>{
    const w=setup('beast','earth');w.mechanics.commands.command(w.wolves[0]!);tick(w,32);expect(w.mechanics.commands.ready).toBe(true);
  });
  it('pure summoning grants an additional follow-up; mixed summoning keeps the first union',()=>{
    const run=(mixed:boolean)=>{const w=setup('twins');if(mixed)learn(w,'slayer-edge');w.mechanics.commands.resonance=100;const events:{union:boolean;echo:boolean}[]=[];w.events.on('summonImpact',e=>events.push(e));w.invoke(line());tick(w,1.2);return events;};
    const pure=run(false),mixed=run(true);expect(pure.filter(e=>e.union)).toHaveLength(2);expect(pure.filter(e=>e.echo).length).toBeGreaterThan(0);expect(mixed.filter(e=>e.union)).toHaveLength(2);expect(mixed.filter(e=>e.echo)).toHaveLength(0);
  });
  it('a blocked melee command travels legally before striking, rather than teleporting damage',()=>{
    const w=setup('beast','earth'),s=w.mechanics.spirits[0]!;s.x=-12;s.z=4;
    w.phase='prepare';w.selected='earth';expect(w.place([{x:-10,z:2},{x:-8,z:2},{x:-8,z:6},{x:-10,z:6},{x:-10,z:2}])).toBe(true);w.phase='battle';w.wolves=[wolf(999,-5,4)];
    w.mechanics.commands.resonance=100;w.selected='metal';expect(w.invoke(line(-5))).toBe(true);tick(w,.5);expect(w.wolves[0]!.hp).toBe(10000);
    tick(w,8);expect(w.wolves[0]!.hp).toBeLessThan(10000);expect(SpiritMovement.canHit(s,w.wolves[0]!,w.wards)).toBe(true);
  });
  it('silence does not prevent an explicit retreat, but cancels pending attack contact',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!;w.invoke(line());tick(w,.1);w.enemyAbilities.zones.push({x:s.x,z:s.z,radius:3.6,remaining:5});tick(w,.5);expect(w.wolves[0]!.hp).toBe(10000);
    const before={x:s.x,z:s.z};expect(w.mechanics.commands.command({x:-12,z:8})).toBe(true);tick(w,1.2);expect(distance(before,s)).toBeGreaterThan(3.6);
  });
  it('retargeting cancels the old windup without resetting attack cooldown',()=>{
    const w=setup('twins'),old=w.wolves[0]!,next=wolf(1000,-2,6);w.wolves.push(next);w.mechanics.commands.command(old);tick(w,.1);
    const cooldown=w.mechanics.spirits[0]!.cooldown;w.mechanics.commands.command(next);expect(w.mechanics.spirits[0]!.cooldown).toBe(cooldown);tick(w,.2);expect(old.hp).toBe(10000);
  });
  it('wave cleanup removes orders, pending echoes, movement and meter together',()=>{
    const w=setup();w.invoke(line());tick(w,.48);const hp=w.wolves[0]!.hp;w.mechanics.endBattle();
    expect(w.mechanics.commands.resonance).toBe(0);expect(w.mechanics.commands.targetId).toBeNull();expect(w.mechanics.commands.rally).toBeNull();expect(w.mechanics.commands.amount(w.mechanics.spirits[0]!.id)).toBe(0);
    w.phase='rest';tick(w,.3);expect(w.wolves[0]!.hp).toBe(hp);
  });
  it('all five orders resolve from a pet contact, with their advertised feedback',()=>{
    for(const element of ['metal','wood','water','fire','earth'] as const){const w=setup('twins','metal');w.wolves.push(wolf(1000,-.5,4.4));w.selected=element;w.invoke(line());tick(w,.65);const t=w.wolves.find(t=>t.id===w.mechanics.commands.targetId)!;
      expect(t.hp).toBeLessThan(10000);
      if(element==='metal')expect(t.reactions!.exposed).toBeGreaterThan(0);
      if(element==='wood')expect(t.rooted).toBeGreaterThan(0);
      if(element==='water'){const neighbor=w.wolves.find(v=>v!==t)!;expect(Math.hypot(neighbor.vx,neighbor.vz)).toBeGreaterThan(0);}
      if(element==='fire')expect(t.burning).toBeGreaterThan(0);
      if(element==='earth')expect(t.reactions!.weakened).toBeGreaterThan(0);
    }
  });
  it('storm storage is finite and replay never causes immediate remote pet damage',()=>{
    const w=setup('twins');w.startUltimate();for(let n=0;n<16;n++)w.queueUltimateStroke(line(-1,4,8),'fire');w.tick(3);w.tick(.28);
    expect(w.wolves[0]!.hp).toBe(10000);expect(w.mechanics.commands.amount(w.mechanics.spirits[0]!.id)).toBeLessThanOrEqual(SUMMON.ultimateCapacity);
  });
});
