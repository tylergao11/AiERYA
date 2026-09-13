import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { ELEMENTS, type Element, type Wolf } from '../src/game/contracts';
import { SummonArmament } from '../src/render/summon-armament';
import { toArt } from '../src/render/projection';

afterEach(() => vi.unstubAllGlobals());
function setup(element: Element = 'water') {
  const world = new World({ roguelike: true });
  world.chooseDestiny({ serial: 1, fate: 'spirit', tier: 'ordinary', boon: 'mimic', roots: [element] });world.startWave();
  const spirit=world.mechanics.spirits[0]!;Object.assign(spirit,{x:-6,z:8,age:2,cast:0});
  const target:Wolf={id:9871,x:-4.6,z:8,hp:10000,maxHp:10000,speed:0,heading:0,action:'run',age:0,attack:0,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null};world.wolves=[target];spirit.targetId=target.id;
  let pose=0;
  const art=new SummonArmament(world,toArt,s=>{const p=toArt(s);return {x:p.x+22+pose,y:p.y-62};});
  const infuse=(order:Element,length=4)=>{world.selected=order;expect(world.invoke([{x:-2,z:8},{x:-2+length,z:8}])).toBe(true);};
  const windup=()=>{spirit.cast=.4;world.mechanics.attackEvent('windup',spirit,target,.2,world.mechanics.commands.element(spirit.id));};
  return {world,spirit,target,art,infuse,windup,pose:(value:number)=>{pose=value;}};
}

describe('weapon-bound finite orders, without running a match',()=>{
  it.each(ELEMENTS)('keeps the %s infusion distinct from the native water body and follows its real anchor',element=>{
    const {world,spirit,art,infuse,pose}=setup();infuse(element);art.update(.1);
    const start=art.frames()[0]!,state=[world.spirit,world.time,world.mechanics.commands.amount(spirit.id)],body=structuredClone(spirit);
    expect(start).toMatchObject({element,stock:2,united:false,restricted:false});expect(spirit.element).toBe('water');
    art.frames();art.update(0);expect(art.frames()[0]).toEqual(start);expect(spirit).toEqual(body);
    expect([world.spirit,world.time,world.mechanics.commands.amount(spirit.id)]).toEqual(state);
    spirit.x+=2;pose(11);expect(art.frames()[0]!.at.x-start.at.x).toBeCloseTo(67);
    world.mechanics.spirits.length=0;art.update(.01);expect(art.frames()).toEqual([]);art.dispose();
  });
  it('uses real fractional stock and switches material without refreshing old expiry',()=>{
    const {world,art,infuse}=setup();infuse('fire',1);expect(art.frames()[0]!.stock).toBeCloseTo(.5);
    world.mechanics.commands.tick(6.1);expect(art.frames()[0]!.expiring).toBe(true);
    infuse('water',1);expect(art.frames()[0]).toMatchObject({element:'water',stock:1,expiring:false});
    world.mechanics.commands.tick(2.1);expect(art.frames()[0]!.stock).toBeCloseTo(.5);
    world.mechanics.commands.tick(6);expect(art.frames()).toEqual([]);art.dispose();
  });
  it('releases a ranged coating at launch, fades spent stock, and does not flash again at distant impact',()=>{
    const {world,spirit,target,art,infuse,windup}=setup();infuse('fire',1);windup();art.update(.1);
    expect(art.frames()[0]!.windup).toBeCloseTo(.5);
    const shot=world.mechanics.commands.take(spirit)!;expect(shot.amount).toBeCloseTo(.5);
    world.mechanics.attackEvent('launch',spirit,target,.3,shot.element);expect(art.frames()[0]).toMatchObject({element:'fire',stock:0,release:1});
    art.update(.17);expect(art.frames()).toEqual([]);
    world.events.emit('summonImpact',{from:spirit,at:target,spiritId:spirit.id,targetId:target.id,element:shot.element,union:false,echo:false,strength:1,radius:1});
    expect(art.frames()).toEqual([]);art.dispose();
  });
  it('releases melee only on real contact and clears sealed anticipation without spending stock',()=>{
    const {world,spirit,target,art,infuse,windup}=setup('wood');infuse('earth',1);windup();art.update(.08);
    const blocked=vi.spyOn(world.enemyAbilities,'silenced').mockReturnValue(true);art.update(.01);
    expect(art.frames()[0]).toMatchObject({restricted:true,windup:0,release:0,stock:.5});
    blocked.mockRestore();windup();art.update(.1);expect(art.frames()[0]!.release).toBe(0);
    world.mechanics.commands.land(spirit,target,world.mechanics.commands.take(spirit));
    expect(art.frames()[0]).toMatchObject({stock:0,release:1});art.update(.17);expect(art.frames()).toEqual([]);art.dispose();
  });
  it('separates full resonance from an actually armed union and clears at phase changes',()=>{
    const {world,spirit,art,infuse}=setup();world.mechanics.commands.resonance=100;
    expect(art.frames()[0]).toMatchObject({element:undefined,ready:true,united:false,stock:0});
    infuse('metal');expect(art.frames()[0]).toMatchObject({element:'metal',ready:false,united:true,stock:2});
    world.mechanics.commands.tick(10.1);expect(art.frames()[0]!.expiring).toBe(true);
    world.phase='rest';world.events.emit('phase',{phase:'rest'});expect(art.frames()).toEqual([]);
    world.phase='battle';art.dispose();expect(art.frames()).toEqual([]);
    world.mechanics.attackEvent('windup',spirit,{id:1,x:0,z:8} as Wolf,.2,'metal');expect(art.frames()).toEqual([]);
  });
  it('holds decorative motion still for reduced-motion users and never accepts echo releases',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    const {world,spirit,target,art,infuse}=setup('earth');infuse('water');art.update(.1);const frame=art.frames()[0]!;
    art.update(.3);expect(art.frames()[0]!.clock).toBe(frame.clock);
    world.events.emit('summonImpact',{from:spirit,at:target,spiritId:spirit.id,targetId:target.id,element:'water',radius:1,strength:1,echo:true,union:false});
    expect(art.frames()[0]!.release).toBe(0);art.dispose();
  });
});
