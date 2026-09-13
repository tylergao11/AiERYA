import { describe, expect, it } from 'vitest';
import type { Element, Wolf } from '../src/game/contracts';
import { World } from '../src/game/world';
import { elementalReaction, planCombatStroke, strokeWardContact } from '../src/game/combat';

const enemy=(id:number,x:number,z=4):Wolf=>({id,x,z,hp:1000,maxHp:1000,speed:0,heading:0,action:'run',age:0,attack:0,hit:0,
  burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
const square=(x:number)=>[{x:x-1,z:2},{x:x+1,z:2},{x:x+1,z:6},{x:x-1,z:6},{x:x-1,z:2}];
const path=[{x:-10,z:4},{x:6,z:4}];
describe('a stroke resolves every intersected enemy and formation',()=>{
  it.each(['metal','wood','water','fire','earth'] as Element[])('%s hits all ten targets once even when the stroke doubles back',element=>{
    const w=new World();w.startWave();w.selected=element;w.wolves=Array.from({length:10},(_,i)=>enemy(900+i,-8+i*1.2));
    const hits:number[]=[];w.events.on('damage',e=>{if(e.source==='spell')hits.push(e.targetId);});
    expect(w.draw([...path,...[...path].reverse()])).toBe(true);
    expect(w.wolves.every(w=>w.hp<1000)).toBe(true);expect(new Set(hits).size).toBe(10);expect(hits).toHaveLength(10);expect(w.spirit).toBe(4);
  });
  it('buffs both formations while resolving both wet enemies as separate mud contacts',()=>{
    const w=new World();w.selected='metal';expect(w.place(square(-8))).toBe(true);expect(w.place(square(4))).toBe(true);
    w.startWave();w.selected='earth';w.wolves=[enemy(900,-8),enemy(901,4)];
    for(const wolf of w.wolves){wolf.wet=2;wolf.slowAmount=.3;}
    const reactions:string[]=[];w.events.on('reaction',e=>reactions.push(`${e.wardId??e.targetId}:${e.name}`));
    w.draw(path);expect(w.wards.every(w=>w.empowered===8&&w.edgeCharges===12)).toBe(true);
    expect(w.wolves.every(w=>w.hp<1000&&w.wet===0)).toBe(true);expect(w.reactionEffects.zones).toHaveLength(2);
    expect(reactions).toHaveLength(4);
  });
  it('creates separate same-element reactions in distant packs and only the strongest overlapping hit per victim',()=>{
    const w=new World();w.startWave();w.wolves=[enemy(900,-8),enemy(901,4),enemy(902,-7.8)];
    const reaction=elementalReaction('wood','earth')!;
    w.reactionEffects.resolve([{reaction,at:{x:-8,z:4},power:1,sourceId:'a'}, {reaction,at:{x:4,z:4},power:1,sourceId:'b'}, {reaction,at:{x:-8,z:4},power:2,sourceId:'c'}]);
    expect(w.wolves.map(w=>1000-w.hp)).toEqual([24,12,24]);
  });
  it('converts the roots of every directly contacted wolf instead of consuming only the first',()=>{
    const w=new World();w.startWave();w.selected='metal';w.wolves=[enemy(900,-8),enemy(901,4)];
    for(const wolf of w.wolves){wolf.rooted=1;wolf.aura='wood';wolf.auraTime=2;}
    w.draw(path);expect(w.wolves.every(w=>w.rooted===0)).toBe(true);
    expect(w.combatTotals.reaction).toBeCloseTo((24+12)*4);
  });
  it('recognizes the thickness of a brush grazing a long formation edge',()=>{
    const ward={points:[{x:-12,z:0},{x:12,z:0},{x:12,z:8},{x:-12,z:8}]};
    expect(strokeWardContact(planCombatStroke([{x:-1,z:-1},{x:1,z:-1}])!,ward)).not.toBeNull();
    expect(strokeWardContact(planCombatStroke([{x:-1,z:-2},{x:1,z:-2}])!,ward)).toBeNull();
  });
  it('releases both charged main array eyes contacted by one stroke',()=>{
    const w=new World({roguelike:true});expect(w.chooseDestiny({serial:1,fate:'array',boon:'twinArray',tier:'ordinary',roots:['metal']})).toBe(true);
    expect(w.place(square(-8))).toBe(true);expect(w.place(square(4))).toBe(true);w.startWave();w.wolves=[enemy(900,-8),enemy(901,4)];
    for(let i=0;i<4;i++){w.time+=.25;for(const [j,ward]of w.wards.entries())w.hitRogue(w.wolves[j]!,60,'metal',{kind:'array',wardId:ward.id});}
    const positions:number[]=[];w.events.on('arrayEffect',e=>{if(e.kind==='release')positions.push(e.at.x);});w.draw(path);
    expect(positions.sort((a,b)=>a-b)).toEqual(w.wards.map(w=>w.x).sort((a,b)=>a-b));expect(w.combatTotals.ward).toBeGreaterThan(0);
  });
});
