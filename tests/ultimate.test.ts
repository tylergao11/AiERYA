import { describe, expect, it, vi } from 'vitest';
import type { Element, Wolf } from '../src/game/contracts';
import { World } from '../src/game/world';
import { ULTIMATE } from '../src/game/ultimate';

const slash = [{x:-8,z:4},{x:-4,z:4}];
const square = [{x:-8,z:2},{x:-4,z:2},{x:-4,z:6},{x:-8,z:6},{x:-8,z:2}];
const wolf = (id = 900, x = -6, z = 4): Wolf => ({id,x,z,hp:1000,maxHp:1000,speed:2.3,heading:0,action:'run',age:0,attack:0,
  hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
function battle(element: Element = 'metal'): World { const w=new World();w.startWave();w.selected=element;w.wolves=[wolf()];return w; }
function release(w: World): void { w.tick(ULTIMATE.captureSeconds);w.tick(ULTIMATE.windupSeconds); }

describe('three-second time-stop ultimate', () => {
  it('is available only during battle, once per wave, with reset and wave refill', () => {
    const w=new World();expect(w.startUltimate()).toBe(false);w.startWave();expect(w.startUltimate()).toBe(true);
    expect(w.startUltimate()).toBe(false);w.tick(4);expect(w.startUltimate()).toBe(false);
    w.phase='prepare';w.startWave();expect(w.startUltimate()).toBe(true);w.reset();
    expect(w.ultimate.active).toBe(false);expect(w.ultimate.strokes).toHaveLength(0);expect(w.ultimate.available).toBe(true);
  });
  it('freezes wolves, burning, wards, cooldowns, spirit, spawning and battle time', () => {
    const w=new World();w.selected='wood';expect(w.place(square)).toBe(true);w.startWave();
    const enemy=wolf();enemy.burning=2;enemy.burnDps=12;enemy.wet=1;w.wolves=[enemy];
    const before=structuredClone(enemy),ward=structuredClone(w.wards[0]),spirit=w.spirit;
    w.startUltimate();for(let i=0;i<150;i++)w.tick(1/60);
    expect(w.time).toBe(0);expect(w.ultimate.remaining).toBeCloseTo(.5);expect(w.wolves).toHaveLength(1);
    expect(enemy).toEqual(before);expect(w.wards[0]).toEqual(ward);expect(w.spirit).toBe(spirit);const elapsed=w.ultimate.elapsed;w.tick(0);expect(w.ultimate.elapsed).toBe(elapsed);
  });
  it('stores continuous free casts despite zero spirit, then doubles every hit once', () => {
    const w=battle();w.wolves.push(wolf(901,-5.8));w.spirit=0;const invoke=vi.fn();w.events.on('invoke',invoke);w.startUltimate();
    for(let i=0;i<3;i++)expect(w.draw(slash)).toBe(true);
    expect(w.wolves[0]!.hp).toBe(1000);expect(invoke).not.toHaveBeenCalled();expect(w.ultimate.strokes).toHaveLength(3);
    w.tick(3);expect(w.ultimate.stage).toBe('release');expect(w.wolves[0]!.hp).toBe(1000);
    w.tick(.28);expect(w.wolves.map(w=>1000-w.hp)).toEqual([96,48]);expect(invoke).toHaveBeenCalledTimes(3);
    w.tick(.4);expect(invoke).toHaveBeenCalledTimes(3);expect(w.spirit).toBe(0);});
  it('widens the actual hit footprint and retains each stroke element independently', () => {
    const w=battle('metal'),elements: Element[]=[];w.events.on('invoke',e=>elements.push(e.element));w.wolves=[wolf(900,-6,6.5),wolf(901,-6,7.2)];w.startUltimate();w.draw(slash);w.selected='water';w.draw(slash);release(w);
    expect(w.wolves[0]!.hp).toBeLessThan(1000);expect(elements).toEqual(['metal','water']);expect(w.wolves[0]!.wet).toBeGreaterThan(0);
    expect(w.wolves[1]!.hp).toBe(1000);
  });
  it.each(['metal','fire','wood','water','earth'] as const)('doubles %s damage and its appropriate persistent effect', element => {
    const plain=battle(element),ultimate=battle(element);plain.draw(slash);ultimate.startUltimate();ultimate.draw(slash);release(ultimate);
    const a=plain.wolves[0]!,b=ultimate.wolves[0]!;
    expect(1000-b.hp).toBeCloseTo((1000-a.hp)*2);
    if(element==='fire'){expect(b.burnDps).toBeCloseTo(a.burnDps*2);expect(b.burning).toBe(a.burning);}
    if(element==='wood')expect(b.rooted).toBeCloseTo(a.rooted*2);
    if(element==='water'){expect(b.wet).toBeCloseTo(a.wet*2);expect(b.slowAmount).toBe(a.slowAmount);}
  });
  it('doubles wall repair and buff duration while retaining maximum health', () => {
    const make=(ultimate:boolean)=>{const w=new World();w.selected='earth';w.place(square);const wall=w.wards[0]!;wall.health=10;w.startWave();w.selected='fire';if(ultimate)w.startUltimate();w.draw(slash);if(ultimate)release(w);return wall;};
    const a=make(false),b=make(true);expect(b.health-10).toBeCloseTo((a.health-10)*2);expect(b.empowered).toBe(a.empowered*2);expect(b.health).toBeLessThanOrEqual(b.maxHealth);
  });
  it('doubles steam once, consumes its burn, and supports an empty or cancelled ultimate', () => {
    const make=(ult:boolean)=>{const w=battle('water'),enemy=w.wolves[0]!;enemy.burning=2;enemy.burnDps=12;if(ult)w.startUltimate();w.draw(slash);if(ult)release(w);return w;};
    const a=make(false),b=make(true);expect(b.combatTotals.steam).toBe(a.combatTotals.steam*2);expect(b.wolves[0]!.burning).toBe(0);
    const empty=battle(),event=vi.fn();empty.events.on('invoke',event);empty.startUltimate();empty.tick(4);expect(event).not.toHaveBeenCalled();expect(empty.ultimate.active).toBe(false);
    empty.phase='prepare';empty.startWave();empty.startUltimate();empty.draw(slash);empty.reset();empty.tick(4);expect(event).not.toHaveBeenCalled();
  });
  it('copies input before release and resumes simulation only after the release window', () => {
    const w=battle(),path=structuredClone(slash);w.startUltimate();w.draw(path);path[0]!.x=30;release(w);expect(w.wolves[0]!.hp).toBe(968);
    w.tick(.58);expect(w.time).toBe(0);expect(w.ultimate.active).toBe(false);w.tick(.1);expect(w.time).toBe(.1);
  });
});
