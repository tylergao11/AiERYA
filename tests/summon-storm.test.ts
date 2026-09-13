import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import type { Element, Wolf } from '../src/game/contracts';
import { SUMMON } from '../src/game/summon-balance';
import { SummonStorm } from '../src/render/summon-storm';
import { SummonCommandArt } from '../src/render/summon-command-art';
import { SummonLabels } from '../src/render/summon-labels';
import { toArt } from '../src/render/projection';
import { SceneImpact } from '../src/render/impact-motion';

const path=[{x:-2,z:8},{x:2,z:8}];
function setup(){
  const world=new World({roguelike:true});
  world.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['wood','water']});world.startWave();
  world.mechanics.spirits.forEach((s,i)=>Object.assign(s,{x:-4-i,z:8,age:2,cast:0}));
  const wolf:Wolf={id:9981,x:0,z:8,hp:10000,maxHp:10000,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null};world.wolves=[wolf];
  const art=new SummonStorm(world,s=>{const p=toArt(s);return{x:p.x+20,y:p.y-70};});
  const queue=(elements:Element[])=>{expect(world.startUltimate()).toBe(true);for(const e of elements)expect(world.queueUltimateStroke(path,e)).toBe(true);};
  const release=()=>{world.tick(3);world.tick(.28);};
  return {world,art,wolf,queue,release};
}

describe('summoner time-stop storage presentation without a match',()=>{
  it('keeps storage release quiet and reserves the screen impulse for the real pet hit',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:false}));
    const {world,art,queue,release}=setup(),impact=new SceneImpact(world);
    queue(['earth']);release();expect(impact.update(.016,false)).toEqual({x:0,y:0});
    const s=world.mechanics.spirits[0]!,wolf=world.wolves[0]!;
    world.mechanics.attackEvent('impact',s,wolf,.2,'earth');
    // Wood's native hit is light; the actual union contact owns the heavy impulse.
    world.events.emit('summonImpact',{spiritId:s.id,targetId:wolf.id,from:s,at:wolf,element:'earth',radius:3.5,strength:2.8,union:true,echo:false});
    expect(Math.abs(impact.update(.016,false).x)).toBeGreaterThan(0);impact.dispose();art.dispose();vi.unstubAllGlobals();
  });
  it('stores distinct strokes, then acknowledges real reserves without inventing hits or moving the clock',()=>{
    const {world,art,wolf,queue,release}=setup();queue(['wood','water','fire']);
    expect(art.frame()!.paths.map(p=>p.element)).toEqual(['wood','water','fire']);expect(art.frame()!.receipts).toEqual([]);
    const before=[world.time,world.health,world.spirit,wolf.hp],bodies=structuredClone(world.mechanics.spirits);
    release();const f=art.frame()!;
    expect(f.receipts).toHaveLength(f.troops.length*3);
    for(const s of f.troops){expect(s.stock).toBe(6);expect(f.receipts.filter(r=>r.id===s.id).map(r=>r.element)).toEqual(['wood','water','fire']);}
    expect([world.time,world.health,world.spirit,wolf.hp]).toEqual(before);
    expect(world.mechanics.spirits.map(s=>[s.x,s.z])).toEqual(bodies.map(s=>[s.x,s.z]));
    expect(art.frame()).toEqual(f);world.tick(.58);expect(art.frame()).toBeNull();expect(world.time).toBe(before[0]);art.dispose();
  });
  it('shows only capacity actually accepted and does not make a full pet receive extra magic',()=>{
    const {world,art,queue,release}=setup();world.selected='metal';world.invoke([{x:-4,z:8},{x:4,z:8}]);
    expect(world.mechanics.commands.amount(world.mechanics.spirits[0]!.id)).toBe(4);
    queue(Array.from({length:16},()=> 'fire' as const));release();
    for(const s of art.frame()!.troops){
      expect(s.stock).toBe(SUMMON.ultimateCapacity);
      expect(art.frame()!.receipts.filter(r=>r.id===s.id).reduce((n,r)=>n+r.amount,0)).toBe(12);
    }
    const before=art.frame()!.receipts.length;
    // Further capacity-free notifications cannot create an extra visible transfer.
    world.events.emit('summonOrder',{kind:'infuse',element:'fire',at:path[1]!,points:path,spiritIds:world.mechanics.spirits.map(s=>s.id)});
    expect(art.frame()!.receipts).toHaveLength(before);art.dispose();
  });
  it('retains a genuine pending union while merging duplicate click-path and caption effects',()=>{
    const {world,art,queue,release}=setup(),command=new SummonCommandArt(world,toArt),labels=new SummonLabels(world);
    world.mechanics.commands.resonance=100;queue(['water','fire']);release();
    expect(art.frame()!.receipts.filter(r=>r.union)).toHaveLength(world.mechanics.spirits.length);
    expect(command.entries).toEqual([]);expect(labels.labels(1,()=>10)).toEqual([]);
    expect(art.frame()!.troops.every(s=>s.union)).toBe(true);art.dispose();command.dispose();labels.dispose();
  });
  it('follows real receiving anchors and removes a retired spirit from pending transfers',()=>{
    const {world,art,queue,release}=setup();queue(['fire']);release();
    const s=world.mechanics.spirits[0]!,old=art.frame()!.receipts.find(r=>r.id===s.id)!.to;
    s.x+=2;expect(art.frame()!.receipts.find(r=>r.id===s.id)!.to.x-old.x).toBeCloseTo(56);
    world.mechanics.spirits.splice(0,1);expect(art.frame()!.receipts.some(r=>r.id===s.id)).toBe(false);art.dispose();
  });
  it('handles an empty ultimate, cancellation, the next wave and disposal without stale receipts',()=>{
    const {world,art,queue,release}=setup();queue([]);release();expect(art.frame()!.count).toBe(0);expect(art.frame()!.receipts).toEqual([]);
    world.phase='prepare';world.events.emit('phase',{phase:'prepare'});expect(art.frame()).toBeNull();world.startWave();
    queue(['earth']);release();expect(art.frame()!.receipts.length).toBeGreaterThan(0);world.reset();expect(art.frame()).toBeNull();art.dispose();
  });
  it.each(['slayer','array'] as const)('preserves the existing %s mixed-flow ultimate',fate=>{
    const {world,art}=setup();world.reset();
    world.birthDraft.candidates=[{serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['water']},
      fate==='slayer'?{serial:2,fate,tier:'ordinary',boon:'three',roots:['fire']}:{serial:2,fate,tier:'ordinary',boon:'twinArray',roots:['fire']}];
    world.birthDraft.toggle(1);world.birthDraft.toggle(2);expect(world.chooseBirth()).toBe(true);world.startWave();world.startUltimate();
    expect(world.mechanics.commands.stormOnly).toBe(false);expect(art.frame()).toBeNull();art.dispose();
  });
});
