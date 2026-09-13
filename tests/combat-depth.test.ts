import { describe, expect, it } from 'vitest';
import { distance, random, type Point } from '../src/core/math';
import { World } from '../src/game/world';
import { ELEMENTS, type Element, type Wolf } from '../src/game/contracts';
import type { Boon, Fate } from '../src/game/roguelike';
import { ROGUE as B, SPIRIT_DAMAGE, SPIRIT_SKILLS as S, SLAYER_DAMAGE } from '../src/game/rogue-balance';
import { SpiritMovement } from '../src/game/spirit-movement';
import { wolfClear } from '../src/game/wolf-collision';
import { elementalReaction, planCombatStroke } from '../src/game/combat';
import { ENEMY_SKILLS } from '../src/game/enemy-abilities';

const line = [{ x: -8, z: 4 }, { x: -4, z: 4 }];
const shape = (x = -6, z = 4, rx = 2, rz = 2): Point[] => [[-rx,-rz],[rx,-rz],[rx,rz],[-rx,rz],[-rx,-rz]].map(([dx,dz])=>({x:x+dx!,z:z+dz!}));
function run(fate: Fate = 'slayer', boon: Boon = 'scar', root: Element = 'metal') {
  const w = new World({roguelike:true, random:random(2151)});
  w.chooseDestiny({serial:1,fate,boon,roots:[root],tier:['debt','living','beast'].includes(boon)?'unusual':'ordinary'}); return w;
}
const wolf = (id = 900, x = -6, z = 4, hp = 1000): Wolf => ({id,x,z,hp,maxHp:hp,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
function learn(w: World, id: string) { w.phase='rest'; for(let n=0;n<1000;n++)if(w.build.rollOffers(w.health).some(r=>r.id===id)){w.chooseUpgrade(id);return;} throw Error(id); }
function tick(w: World, seconds: number) { for(let n=0;n<Math.round(seconds*60);n++)w.tick(1/60); }
function cast(w: World, e: Element, points = line) { w.selected=e;expect(w.invoke(points)).toBe(true); }

describe('combat economy and earned elemental tactics',()=>{
  it('companion kill recovery settles once per death, independently of natural recovery',()=>{
    const w=run('spirit','mimic');w.startWave();w.spirit=20;w.mechanics.spirits[0]!.cooldown=100;
    tick(w,.5);expect(w.spirit).toBeCloseTo(20+w.regeneration*.5);const before=w.spirit;
    const v=wolf(900,-6,4,1);w.wolves=[v];w.hitRogue(v,2,'metal',{kind:'spirit',spiritId:w.mechanics.spirits[0]!.id});
    expect(w.spirit).toBeCloseTo(before+w.killSpirit);const received=w.spirit;w.hitRogue(v,2,'metal',{kind:'manual'});expect(w.spirit).toBe(received);
  });
  it('slayers retain natural recovery and length has one actual price at commit',()=>{
    const w=run();w.startWave();w.spirit=20;tick(w,.5);expect(w.spirit).toBeCloseTo(20+w.regeneration*.5);
    const long=[{x:-14,z:4},{x:2,z:4}],cost=w.strokeCost(long);expect(cost).toBeGreaterThan(w.strokeCost(line));expect(w.strokeCost(line)).toBeGreaterThan(0);
    w.spirit=cost-1;expect(w.invoke(long)).toBe(false);expect(w.spirit).toBe(cost-1);w.spirit=cost+10;expect(w.invoke(long)).toBe(true);expect(w.spirit).toBe(10);
  });
  it('ancient gifts cannot mint arbitrary investment or restore spent health',()=>{
    const w=run('array','fivefold');expect(w.place(shape(),99999)).toBe(true);expect(w.wards[0]!.power.investment).toBe(14);
    w.wards[0]!.health=30;w.undo();expect(w.mainPlacementCost).toBe(14);expect(w.place(shape(),1)).toBe(true);expect(w.wards[0]!.power.investment).toBe(1);expect(w.wards[0]!.paidCost).toBe(1);expect(w.spirit).toBe(99);
  });
  it('generation applies the shared damage and status strengths in combat',()=>{
    const w=run('slayer','scar','fire');w.startWave();const v=wolf();v.aura='wood';v.auraTime=3;w.wolves=[v];cast(w,'fire');
    expect(1000-v.hp).toBeCloseTo(SLAYER_DAMAGE.fire*w.build.affinityPower('fire')*B.tactics.generationDamage*planCombatStroke(line)!.multiplier);expect(v.burnDps).toBeGreaterThan(0);
  });
  it('three different generations earn one free stroke; repeat relations and derived casts cannot fill the cycle',()=>{
    const w=run();learn(w,'reaction-cycle');w.startWave();const v=wolf();w.wolves=[v];
    for(let n=0;n<3;n++){v.aura='earth';v.auraTime=3;cast(w,'metal');} expect(w.mechanics.tactics.generation.size).toBe(1);expect(w.mechanics.tactics.freeCast).toBe(false);
    const origin=w.mechanics.beginCast(false);
    w.mechanics.tactics.reactions([{reaction:elementalReaction('water','metal')!,at:v,power:1}],{...origin,kind:'derived'});expect(w.mechanics.tactics.generation.size).toBe(1);
    v.aura='metal';v.auraTime=3;cast(w,'water');v.aura='wood';v.auraTime=3;v.wet=0;cast(w,'fire');
    expect(w.mechanics.tactics.freeCast).toBe(true);const before=w.spirit;expect(w.invoke([])).toBe(false);expect(w.mechanics.tactics.freeCast).toBe(true);cast(w,'earth');expect(w.spirit).toBe(before);expect(w.mechanics.tactics.freeCast).toBe(false);
  });
  it('steam leaves temporary mist that wets new entrants and clears on restart',()=>{
    const w=run();learn(w,'reaction-steam');w.startWave();const v=wolf();v.burning=1;v.burnDps=12;w.wolves=[v];cast(w,'water');
    expect(w.mechanics.tactics.fields[0]?.kind).toBe('mist');const entrant=wolf(901,-5.5,4);w.wolves.push(entrant);w.mechanics.tactics.tick(.1);expect(entrant.wet).toBeGreaterThan(0);
    w.reset();expect(w.mechanics.tactics.fields).toHaveLength(0);
  });
  it('a persistent vortex catches mired enemies once and cannot refresh root locks',()=>{
    const w=run();learn(w,'reaction-vortex');w.startWave();const v=wolf();v.wet=2;w.wolves=[v];cast(w,'metal');
    v.reactions={exposed:0,exposure:0,weakened:0,weakness:0,mired:1,mireSlow:.65,edge:0,edgeCharges:0,edgePower:0};
    w.mechanics.tactics.tick(.1);expect(v.rooted).toBeGreaterThan(0);v.rooted=.1;w.mechanics.tactics.tick(.1);expect(v.rooted).toBe(.1);
  });
  it('forge stocks three finite swords, spends them only on later non-metal casts and expires',()=>{
    const w=run();learn(w,'reaction-forge');w.startWave();const v=wolf();v.aura='metal';v.auraTime=3;w.wolves=[v];cast(w,'fire');
    expect(w.mechanics.tactics.swords).toBe(3);cast(w,'metal');expect(w.mechanics.tactics.swords).toBe(3);cast(w,'wood');expect(w.mechanics.tactics.swords).toBe(2);
    w.mechanics.tactics.tick(6.1);expect(w.mechanics.tactics.swords).toBe(0);
  });
  it('cutting wood emits a bounded pair of blades with no recursive pursuit',()=>{
    const w=run();learn(w,'reaction-cut');learn(w,'root-metal-pursuit');w.startWave();
    const v=wolf(),a=wolf(901,-6,7.5,1),b=wolf(902,-6,8.2,1),c=wolf(903,-6,8.8,1000);v.rooted=1;v.aura='wood';v.auraTime=3;w.wolves=[v,a,b,c];
    const beams:number[]=[];w.events.on('rogueEffect',e=>{if(e.label==='斩木飞刃')beams.push(e.to!.z);});cast(w,'metal');
    expect(beams).toHaveLength(B.tactics.cutTargets);expect(c.hp).toBe(1000);expect(w.wolves.filter(v=>v.action==='dead')).toHaveLength(2);
  });
  it('releases every accepted ultimate stroke and all finite slayer follow-ups',()=>{
    const w=run('slayer','three');for(let n=0;n<3;n++)learn(w,'slayer-edge');learn(w,'awaken');for(let n=0;n<3;n++)learn(w,'slayer-return');learn(w,'ascend');w.startWave();
    let casts=0;w.events.on('invoke',()=>casts++);w.startUltimate();
    for(let n=0;n<B.limits.storedStrokes;n++)expect(w.queueUltimateStroke(line,'metal')).toBe(true);
    expect(w.queueUltimateStroke(line,'metal')).toBe(false);const spirit=w.spirit;
    w.tick(3);w.tick(.3);expect(casts).toBe(B.limits.storedStrokes);w.tick(.6);w.mechanics.tick(.5);
    expect(casts).toBe(B.limits.storedStrokes*4+Math.floor(B.limits.storedStrokes/B.slayer.riftEvery));expect(w.spirit).toBe(spirit);
  });
  it('a return stroke killing an enemy now triggers pursuit without recursive pursuit',()=>{
    const w=run();learn(w,'root-metal-pursuit');learn(w,'slayer-return');learn(w,'slayer-return');learn(w,'awaken');w.startWave();
    const direct=SLAYER_DAMAGE.metal*w.build.affinityPower('metal')*planCombatStroke(line)!.multiplier;
    const first=wolf(900,-6,4,direct*(1+B.slayer.returnPower*.5)), second=wolf(901,-6,7,1), third=wolf(902,-6,10,1);w.wolves=[first,second,third];cast(w,'metal');
    expect(first.action).not.toBe('dead');w.mechanics.tick(.3);expect(first.action).toBe('dead');expect(second.action).toBe('dead');expect(third.action).not.toBe('dead');
  });
});

describe('spirit reach and enemy counterplay',()=>{
  it('metal pierces along its trajectory rather than hitting every nearby enemy',()=>{
    const w=run('spirit','mimic','metal');w.startWave();const s=w.mechanics.spirits[0]!;s.x=-8;s.z=4;
    const v=wolf(),behind=wolf(901,-5,4),offAxis=wolf(902,-5,6);w.wolves=[v,behind,offAxis];
    expect(w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE.metal,{kind:'spirit',spiritId:s.id})).toBe(true);
    expect(behind.hp).toBeLessThan(1000);expect(offAxis.hp).toBe(1000);
  });
  it('wood leaves a root field that catches an entrant and disappears when its owner leaves',()=>{
    const w=run('spirit','mimic','wood');w.startWave();const s=w.mechanics.spirits[0]!;s.x=-7;s.z=4;
    const v=wolf();w.wolves=[v];w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE.wood,{kind:'spirit',spiritId:s.id});
    const entrant=wolf(901,-6.8,4.5);w.wolves.push(entrant);w.mechanics.spiritSkills.tick(.1);expect(entrant.rooted).toBeGreaterThan(0);
    s.x=-14;w.mechanics.spiritSkills.tick(.1);expect(w.mechanics.spiritSkills.fields).toHaveLength(0);
  });
  it('water leaves a vortex at impact that pulls and wets new entrants',()=>{
    const w=run('spirit','mimic','water');w.startWave();const s=w.mechanics.spirits[0]!;s.x=-8;s.z=4;
    const v=wolf(900,-4,4);w.wolves=[v];w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE.water,{kind:'spirit',spiritId:s.id});
    const entrant=wolf(901,-3.3,4.6);w.wolves.push(entrant);w.mechanics.spiritSkills.tick(.1);
    expect(w.mechanics.spiritSkills.fields[0]).toMatchObject({kind:'water',x:v.x,z:v.z});expect(entrant.wet).toBeGreaterThan(0);expect(Math.hypot(entrant.vx,entrant.vz)).toBeGreaterThan(0);
  });
  it('fire detonates its stacked brands and consumes them instead of copying a basic attack',()=>{
    const w=run('spirit','mimic','fire');w.startWave();const s=w.mechanics.spirits[0]!;s.x=-8;s.z=4;
    const v=wolf(),near=wolf(901,-5,4);w.wolves=[v,near];
    for(let i=0;i<S.fire.stacks-1;i++)w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE.fire,{kind:'spirit',spiritId:s.id});
    expect(near.hp).toBe(1000);w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE.fire,{kind:'spirit',spiritId:s.id});
    expect(near.hp).toBeLessThan(1000);expect(w.mechanics.spiritSkills.brands.has(v.id)).toBe(false);
  });
  it('earth weakens and knocks back nearby enemies while repairing only an adjacent wall',()=>{
    const w=run('spirit','mimic','earth');w.place(shape(-6,4,1,2));w.place(shape(3,4,1,2));w.startWave();
    const s=w.mechanics.spirits[0]!;s.x=-8.5;s.z=4;const v=wolf(900,-9,4);w.wolves=[v];
    const [near,far]=w.wards;near!.health=near!.maxHealth/2;far!.health=far!.maxHealth/2;const a=near!.health,b=far!.health;
    w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE.earth,{kind:'spirit',spiritId:s.id});
    expect(v.reactions!.weakened).toBeGreaterThan(0);expect(Math.hypot(v.vx,v.vz)).toBeGreaterThan(0);expect(near!.health).toBeGreaterThan(a);expect(far!.health).toBe(b);
  });
  it('missed windups do not earn resonance; a retained full meter can release an ordered union',()=>{
    const w=run('spirit','mimic');for(let n=0;n<3;n++)learn(w,'spirit-might');learn(w,'awaken');for(let n=0;n<3;n++)learn(w,'spirit-command');learn(w,'ascend');w.startWave();
    w.mechanics.spirits.forEach(s=>s.cooldown=100);const main=w.mechanics.spirits[0]!,v=wolf();main.x=-10;main.z=4;main.cooldown=0;w.wolves=[v];w.mechanics.commands.command(v);
    w.mechanics.tick(.01);expect(w.mechanics.commands.resonance).toBe(0);v.action='dead';w.mechanics.tick(.4);expect(w.mechanics.commands.resonance).toBe(0);
    v.action='run';main.cooldown=0;main.cast=0;w.mechanics.commands.resonance=100;const impacts:boolean[]=[];w.events.on('summonImpact',e=>impacts.push(e.union));
    expect(w.invoke([{x:v.x-2,z:v.z},{x:v.x+2,z:v.z}])).toBe(true);expect(w.mechanics.commands.resonance).toBe(0);
    w.mechanics.tick(.01);w.mechanics.tick(.21);w.mechanics.tick(.4);expect(impacts.filter(Boolean)).toHaveLength(1);expect(v.hp).toBeLessThan(1000);
  });
  it('silence blocks an independent spirit and its death-triggered brand explosion',()=>{
    const w=run('spirit','mimic','fire');w.startWave();const s=w.mechanics.spirits[0]!,v=wolf(),near=wolf(901,-5,4);w.wolves=[v,near];
    s.x=v.x-2;s.z=v.z;w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE.fire,{kind:'spirit',spiritId:s.id});expect(w.mechanics.spiritSkills.brands.has(v.id)).toBe(true);
    w.enemyAbilities.zones.push({x:s.x,z:s.z,radius:3,remaining:5,ownerId:77});const hp=v.hp;expect(w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE.fire,{kind:'spirit',spiritId:s.id})).toBe(false);expect(v.hp).toBe(hp);
    w.mechanics.spiritSkills.died(v,{kind:'manual'});expect(near.hp).toBe(1000);
  });
  it.each(ELEMENTS)('%s spirit must actually reach its target before dealing damage',element=>{
    const w=run('spirit','mimic',element);w.startWave();const s=w.mechanics.spirits[0]!,v=wolf();s.x=-16;s.z=4;w.wolves=[v];
    w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE[element],{kind:'spirit',spiritId:s.id});expect(v.hp).toBe(1000);
    s.x=-7;s.z=4;w.mechanics.spiritSkills.attack(s,v,SPIRIT_DAMAGE[element],{kind:'spirit',spiritId:s.id});expect(v.hp).toBeLessThan(1000);
  });
  it('spirits route around a solid earth wall and cannot hit through it',()=>{
    const w=run('spirit','beast');w.selected='earth';expect(w.place(shape(-6,4,1,2))).toBe(true);w.startWave();const s=w.mechanics.spirits[0]!,v=wolf(900,-3.5,4);
    s.x=-8.5;s.z=4;w.wolves=[v];expect(SpiritMovement.canHit(s,v,w.wards,10)).toBe(false);
    for(let n=0;n<240;n++){w.mechanics.movement.step(s,v,1/60,w.wards);expect(wolfClear(s,B.spirit.bodyRadius,w.wards)).toBe(true);}
    expect(distance(s,v)).toBeLessThan(SpiritMovement.reach(s));expect(SpiritMovement.canHit(s,v,w.wards)).toBe(true);
  });
  it('caller elites summon only four finite non-summoning reinforcements',()=>{
    const w=run();w.startWave();const v=wolf(900,-6,4);v.kind='elite';v.eliteSkill='call';w.wolves=[v];
    for(let i=0;i<40*20;i++)w.enemyAbilities.tick(.05);
    expect(w.wolves.filter(v=>v.summoned)).toHaveLength(4);expect(w.wolves.filter(v=>v.summoned).every(v=>v.kind==='normal')).toBe(true);
  });
  it('silence has a visible windup, stops wards, then expires',()=>{
    const w=run('array','living');w.selected='fire';w.place(shape());w.startWave();const v=wolf(900,-3,4);v.kind='elite';v.eliteSkill='silence';w.wolves=[v];
    w.enemyAbilities.tick(2.5);expect(w.enemyAbilities.cues[0]?.skill).toBe('silence');expect(w.enemyAbilities.zones).toHaveLength(0);
    w.enemyAbilities.tick(ENEMY_SKILLS.silenceDelay);w.enemyAbilities.tick(.01);expect(w.wards[0]!.suppressed).toBeGreaterThan(0);expect(w.enemyAbilities.silenced(w.wards[0]!)).toBe(true);
    w.enemyAbilities.tick(ENEMY_SKILLS.silenceSeconds);expect(w.enemyAbilities.zones).toHaveLength(0);
  });
  it('overcoming an elite during its windup interrupts the actual summon',()=>{
    const w=run();w.startWave();const v=wolf();v.kind='elite';v.eliteSkill='call';v.aura='wood';v.auraTime=3;v.rooted=1;w.wolves=[v];
    w.enemyAbilities.tick(2.5);expect(w.enemyAbilities.casting(v.id)).toBe(true);cast(w,'metal');expect(w.enemyAbilities.casting(v.id)).toBe(false);
    w.enemyAbilities.tick(1);expect(w.wolves.filter(v=>v.summoned)).toHaveLength(0);
  });
  it('king breaks nearby walls after a windup and never damages remote walls',()=>{
    const w=run('array','living');w.selected='earth';w.place(shape());w.place(shape(3,4));w.startWave();const v=wolf(900,-2.9,4);v.kind='king';w.wolves=[v];
    const near=w.wards[0]!,far=w.wards[1]!,before=near.health,remote=far.health;
    w.enemyAbilities.tick(1.5);expect(w.enemyAbilities.casting(v.id)).toBe(true);expect(near.health).toBe(before);
    w.enemyAbilities.tick(ENEMY_SKILLS.breakDelay);expect(near.health).toBeLessThan(before);expect(far.health).toBe(remote);
  });
});
