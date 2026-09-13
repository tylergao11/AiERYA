import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import type { Element, Wolf } from '../src/game/contracts';
import { distance } from '../src/core/math';
import { wolfClear, wolfSegmentClear } from '../src/game/wolf-collision';
import { SpiritMovement } from '../src/game/spirit-movement';
import { ROGUE } from '../src/game/rogue-balance';
import { OPPORTUNITIES } from '../src/game/roguelike';

const loop = (x = -6, z = 4) => [{x:x-2,z:z-2},{x:x+2,z:z-2},{x:x+2,z:z+2},{x:x-2,z:z+2},{x:x-2,z:z-2}];
const wolf = (x: number, z: number): Wolf => ({id:999,x,z,hp:1000,maxHp:1000,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
const step = (w: World, seconds: number) => { for (let n=0;n<Math.ceil(seconds*60);n++) w.mechanics.tick(1/60); };
function setup(element: Element, beast = false): World {
  const w = new World({roguelike:true}); w.chooseDestiny({serial:1,fate:'spirit',tier:beast?'unusual':'ordinary',boon:beast?'beast':'mimic',roots:[element]});
  Object.assign(w.mechanics.spirits[0]!,{x:-6,z:4}); w.startWave(); return w;
}
describe('spirit fighting styles and accepted-hit timing', () => {
  it.each(['wood','earth'] as const)('%s closes the distance and winds up before doing melee damage', element => {
    const w=setup(element), s=w.mechanics.spirits[0]!, target=wolf(-1,4); w.wolves=[target];
    step(w,.2); expect(s.x).toBeGreaterThan(-6); expect(target.hp).toBe(1000);
    while(!s.cast) step(w,1/60);
    expect(distance(s,target)).toBeLessThanOrEqual(SpiritMovement.reach(s)); expect(target.hp).toBe(1000);
    step(w,.2); expect(target.hp).toBeLessThan(1000);
  });
  it.each(['metal','water','fire'] as const)('%s launches from a distance; damage follows the flight', element => {
    const w=setup(element), s=w.mechanics.spirits[0]!, target=wolf(-1,4); w.wolves=[target]; const events:string[]=[];
    w.events.on('spiritAttack',e=>events.push(e.stage)); step(w,1/60); expect(events).toEqual(['windup']); expect(target.hp).toBe(1000);
    step(w,.21); expect(events).toContain('launch'); expect(target.hp).toBe(1000);
    step(w,.3); expect(events).toContain('impact'); expect(target.hp).toBeLessThan(1000); expect(distance(s,target)).toBeGreaterThan(3);
    if(element==='water') expect(distance(w.mechanics.spiritSkills.fields[0]!,target)).toBeLessThan(.1);
  });
  it('a wolf leaving melee reach during windup is not struck at a distance', () => {
    const w=setup('earth'), s=w.mechanics.spirits[0]!, target=wolf(s.x+1.2,s.z); w.wolves=[target]; step(w,1/60); target.x+=8; step(w,.3); expect(target.hp).toBe(1000);
  });
  it('ranged retreats are checked against ground and solid earth walls', () => {
    const w=setup('fire'), s=w.mechanics.spirits[0]!, target=wolf(-5,4); const before=distance(s,target);
    w.phase='prepare';w.selected='earth';expect(w.place(loop(-10,4))).toBe(true);expect(w.wards).toHaveLength(1);
    const movement = new SpiritMovement(); for(let i=0;i<60;i++){const old={x:s.x,z:s.z};movement.step(s,target,1/60,w.wards);expect(wolfSegmentClear(old,s,ROGUE.spirit.bodyRadius,w.wards)).toBe(true);}
    expect(distance(s,target)).toBeGreaterThan(before); expect(wolfClear(s,ROGUE.spirit.bodyRadius,w.wards)).toBe(true);
  });
  it('ends pending attacks at the wave boundary', () => {
    const w=setup('fire'), target=wolf(-1,4); w.wolves=[target];step(w,.23);w.mechanics.endBattle();step(w,.25);expect(target.hp).toBe(1000);
  });
});
describe('array awakening preserves hand-drawn terrain', () => {
  it.each(['fivefold','living'] as const)('%s keeps collision, investment and slot through both stages',boon=>{
    const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'array',tier:boon==='living'?'unusual':'ordinary',boon,roots:['earth']});expect(w.place(loop())).toBe(true);
    const ward=w.wards[0]!,energy=w.spirit;for(const stage of [1,2]){w.build.stage=stage;w.mechanics.upgraded();expect(w.wards[0]).toBe(ward);expect(wolfClear(ward,.4,w.wards)).toBe(false);expect(w.mechanics.spirits).toHaveLength(0);expect(w.spirit).toBe(energy);expect(w.availableMainSlot).toBeUndefined();}
    expect(w.dismissWard(ward.id)).toBe(true);
  });
  it('a formation drawn after awakening remains available for manual activation',()=>{
    const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'array',tier:'unusual',boon:'living',roots:['wood']});w.build.stage=1;expect(w.place(loop())).toBe(true);expect(w.wards).toHaveLength(1);expect(w.mechanics.spirits).toHaveLength(0);
  });
  it('acquiring fivefold preserves an already placed array with no restoration or duplicate',()=>{
    const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'array',tier:'unusual',boon:'living',roots:['earth']});w.place(loop());const original=w.wards[0]!;w.build.stage=1;w.mechanics.upgraded();
    w.phase='rest';w.build.offers=[OPPORTUNITIES.find(r=>r.boon==='fivefold')!];w.chooseUpgrade('opportunity-fivefold');expect(w.build.has('fivefold')).toBe(true);w.mechanics.upgraded();expect(w.wards).toEqual([original]);expect(w.mechanics.spirits).toHaveLength(0);
  });
});
