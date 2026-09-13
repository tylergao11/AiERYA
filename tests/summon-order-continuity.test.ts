import {describe,expect,it} from 'vitest';
import {World} from '../src/game/world';
import {REWARDS,type Boon} from '../src/game/roguelike';
import type {GameEvents,Wolf} from '../src/game/contracts';
import {summonStatus} from '../src/ui/summon-status';

const wolf=(id=710,x=-4.6,z=5,hp=1000):Wolf=>({id,x,z,hp,maxHp:hp,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
function setup(boon:Boon='beast'){
  const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'spirit',tier:boon==='beast'?'unusual':'ordinary',boon,roots:['earth']});w.startWave();
  const s=w.mechanics.spirits[0]!;Object.assign(s,{x:-6,z:5});if(boon==='mimic')s.element='metal';w.wolves=[wolf()];return {w,s,cmd:w.mechanics.commands,target:w.wolves[0]!};
}
function learn(w:World,id:string){const reward=REWARDS.find(r=>r.id===id)!;w.build.offers=[{...reward,level:1,tag:'test',detail:reward.detail(1)}];expect(w.build.choose(id,w.health)).not.toBeNull();}
const line=[{x:-6.6,z:5},{x:-2.6,z:5}];

describe('orders and chained summoner rewards stay tied to a real attack',()=>{
  it.each([0,3])('a lethal old seal does not spend fury, invent a new seal or award primary-hit resonance (fury=%s)',fury=>{
    const {w,s,cmd,target}=setup();learn(w,'spirit-seal');learn(w,'spirit-fury');
    w.selected='fire';expect(w.invoke(line)).toBe(true);cmd.land(s,target,cmd.take(s));
    cmd.fury=fury;target.hp=1;w.selected='water';expect(w.invoke(line)).toBe(true);
    const impacts:GameEvents['summonImpact'][]=[],techniques:GameEvents['summonTechnique'][]=[];w.events.on('summonImpact',e=>impacts.push(e));w.events.on('summonTechnique',e=>techniques.push(e));const resonance=cmd.resonance;
    cmd.land(s,target,cmd.take(s));expect(target.action).toBe('dead');expect(impacts.map(e=>[e.element,e.echo])).toEqual([['fire',true]]);
    expect(cmd.fury).toBe(fury);expect(techniques.some(e=>e.kind==='fury')).toBe(false);expect(cmd.resonance).toBe(resonance);
    const next=wolf(711);w.wolves=[next];w.selected='metal';expect(w.invoke(line)).toBe(true);impacts.length=0;cmd.land(s,next,cmd.take(s));
    expect(impacts.map(e=>[e.element,e.echo])).toEqual([['metal',false]]);expect(impacts[0]!.strength).toBeCloseTo(fury===3?1.6:1);expect(cmd.fury).toBe(0);
  });
  it('does not create a redirecting mimic echo for the new order that never landed',()=>{
    const {w,s,cmd,target}=setup('mimic');learn(w,'spirit-seal');learn(w,'spirit-echo');w.selected='fire';w.invoke(line);cmd.land(s,target,cmd.take(s));
    // Drain that successful hit's own echo; no battle AI or world time is advanced.
    cmd.tick(.25);cmd.tick(.11);
    const next=wolf(711,-4.2,5.6);w.wolves.push(next);target.hp=1;w.selected='water';w.invoke(line);cmd.land(s,target,cmd.take(s));
    expect(target.action).toBe('dead');const hp=next.hp,resonance=cmd.resonance;cmd.tick(.25);cmd.tick(.11);
    expect(next.hp).toBe(hp);expect(cmd.resonance).toBe(resonance);
  });
  it('a new rally drops old per-pet targets immediately while retaining the attack cooldown',()=>{
    const {w,s,cmd,target}=setup('twins');cmd.command(target);for(const pet of cmd.troops){pet.targetId=target.id;pet.cast=.3;pet.cooldown=.8;}
    expect(cmd.command({x:-10,z:9})).toBe(true);
    for(const pet of cmd.troops){expect(pet.targetId).toBeNull();expect(pet.cast).toBe(0);expect(pet.cooldown).toBe(.8);expect(summonStatus(w,pet).state).toBe('集合');}
    expect(cmd.destination(s)).not.toBeNull();
  });
});
