import {afterEach,describe,expect,it,vi} from 'vitest';
import {World} from '../src/game/world';
import type {Element,GameEvents,Wolf} from '../src/game/contracts';
import {SPIRIT_DAMAGE,SPIRIT_SKILLS} from '../src/game/rogue-balance';
import {SpiritFields,spiritFieldState} from '../src/render/spirit-fields';

afterEach(()=>vi.restoreAllMocks());
const wolf=(id:number,x:number,z=5,hp=1000):Wolf=>({id,x,z,hp,maxHp:hp,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
function setup(element:Element,beast=false){
  const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'spirit',tier:beast?'unusual':'ordinary',boon:beast?'beast':'mimic',roots:[element]});w.startWave();
  const s=w.mechanics.spirits[0]!;Object.assign(s,{x:-6,z:5});const target=wolf(810,-4.6);w.wolves=[target];
  const effects:GameEvents['spiritAbility'][]=[];w.events.on('spiritAbility',e=>effects.push(e));
  const attack=()=>w.mechanics.spiritSkills.attack(s,target,SPIRIT_DAMAGE[element],{kind:'spirit',spiritId:s.id});return {w,s,target,effects,attack};
}
describe('native companion abilities report their actual consequences without running a match',()=>{
  it('shows precisely the two targets actually pierced, never the unreachable or off-line wolf',()=>{
    const {w,target,effects,attack}=setup('metal');const first=wolf(811,-3.5),second=wolf(812,-2.4),out=wolf(813,4),aside=wolf(814,-3.5,8);w.wolves.push(first,second,out,aside);
    expect(attack()).toBe(true);expect(effects).toHaveLength(1);expect(effects[0]).toMatchObject({kind:'pierce',at:{x:target.x,z:5},targets:[{x:first.x,z:5},{x:second.x,z:5}]});expect(first.hp).toBeLessThan(1000);expect(second.hp).toBeLessThan(1000);expect(out.hp).toBe(1000);expect(aside.hp).toBe(1000);
  });
  it('makes the third fire feather detonate once, with real splash and no duplicate generic ring',()=>{
    const {w,s,target,effects,attack}=setup('fire'),near=wolf(811,-3.7);w.wolves.push(near);const generic:GameEvents['rogueEffect'][]=[];w.events.on('rogueEffect',e=>generic.push(e));
    attack();expect(w.mechanics.spiritSkills.brands.get(target.id)?.stacks).toBe(1);attack();expect(w.mechanics.spiritSkills.brands.get(target.id)?.stacks).toBe(2);expect(effects).toHaveLength(0);expect(near.hp).toBe(1000);
    attack();expect(effects).toHaveLength(1);expect(effects[0]).toMatchObject({kind:'fireburst',spiritId:s.id,stacks:3,radius:SPIRIT_SKILLS.fire.radius});expect(w.mechanics.spiritSkills.brands.has(target.id)).toBe(false);expect(near.hp).toBeLessThan(1000);expect(generic).toHaveLength(0);
  });
  it('allows a real death ignition but does not recursively ignite a splash victim',()=>{
    const {w,s,target,effects,attack}=setup('fire'),near=wolf(811,-3.7,5,1);w.wolves.push(near);target.hp=1;w.mechanics.spiritSkills.brands.set(near.id,{owner:s.id,stacks:2,remaining:4});
    attack();expect(target.action).toBe('dead');expect(near.action).toBe('dead');expect(effects).toHaveLength(1);expect(effects[0]?.stacks).toBe(1);expect(w.mechanics.spiritSkills.brands.size).toBe(0);
  });
  it('resolves a local stomp and emits no ground impact for a rejected remote attack',()=>{
    const {w,s,target,effects,attack}=setup('earth');target.x=3;expect(attack()).toBe(false);expect(effects).toHaveLength(0);expect(target.hp).toBe(1000);
    target.x=-4.6;const near=wolf(811,-6.4,5.8);w.wolves.push(near);expect(attack()).toBe(true);expect(near.hp).toBeLessThan(1000);expect(effects[0]).toMatchObject({kind:'stomp',at:{x:s.x,z:s.z},radius:2});expect(effects[0]!.targets).toHaveLength(2);
  });
  it.each([false,true])('keeps heavy stone contact distinct from ancestor claws (ancestor=%s)',beast=>{
    const {w,attack}=setup('earth',beast),attacks:GameEvents['spiritAttack'][]=[];w.events.on('spiritAttack',e=>attacks.push(e));attack();
    expect(attacks.find(e=>e.stage==='impact')).toMatchObject({heavy:true,ancestor:beast,style:'melee',element:'earth'});
  });
  it.each(['wood','water'] as const)('%s field presentation respects suppression, lifetime and ownership without extending gameplay',element=>{
    const {w,s,attack}=setup(element);attack();const field=w.mechanics.spiritSkills.fields[0]!;expect(spiritFieldState(w,field)).toBe('active');
    const before=structuredClone({field,spirit:s,wolves:w.wolves,time:w.time});const art=new SpiritFields(w);art.update(.5);art.update(.5);expect({field,spirit:s,wolves:w.wolves,time:w.time}).toEqual(before);
    const silence=vi.spyOn(w.enemyAbilities,'silenced').mockReturnValue(true);expect(spiritFieldState(w,field)).toBe('suppressed');silence.mockRestore();
    if(element==='wood'){s.x-=3;expect(spiritFieldState(w,field)).toBe('gone');s.x+=3;}
    field.remaining=0;expect(spiritFieldState(w,field)).toBe('gone');field.remaining=1;w.mechanics.spirits.length=0;expect(spiritFieldState(w,field)).toBe('gone');art.clear();
  });
});
