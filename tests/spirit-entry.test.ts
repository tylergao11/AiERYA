import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import type { GameEvents, Element } from '../src/game/contracts';
import { spiritEntryFrame, SPIRIT_ENTRY_SECONDS } from '../src/render/spirit-entry';
import { SpiritArt } from '../src/render/spirit-art';
import { SpiritMovement } from '../src/game/spirit-movement';
import { wolfClear } from '../src/game/wolf-collision';
import { ROGUE } from '../src/game/rogue-balance';
import { distance } from '../src/core/math';

describe('material-specific companion entrances',()=>{
  it('places camp melee companions on the right, including later reinforcements',()=>{
    const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['earth','wood']});
    world.build.stage=1;world.mechanics.upgraded();
    expect(world.mechanics.spirits).toHaveLength(3);
    for(const s of world.mechanics.spirits){
      expect(s.x).toBeGreaterThan(1);expect(wolfClear(s,ROGUE.spirit.bodyRadius,world.wards)).toBe(true);
      for(const other of world.mechanics.spirits)if(other!==s)expect(distance(s,other)).toBeGreaterThanOrEqual(3);
    }
    const beast=new World({roguelike:true});beast.chooseDestiny({serial:1,fate:'spirit',tier:'unusual',boon:'beast',roots:['earth']});
    expect(beast.mechanics.spirits[0]!.x).toBeGreaterThan(1);
  });
  it('finds another right-side spot when its arrival slot is occupied',()=>{
    const first=SpiritMovement.spawn(0,[],[]),next=SpiritMovement.spawn(0,[],[first]);
    expect(next.x).toBeGreaterThanOrEqual(1);expect(distance(first,next)).toBeGreaterThanOrEqual(3);
    expect(wolfClear(next,ROGUE.spirit.bodyRadius,[])).toBe(true);
  });
  it('gives flight, growth and heavy landing different motions, then settles fully',()=>{
    expect(spiritEntryFrame('fire',.1)).toMatchObject({mask:false,y:expect.any(Number)});
    expect(spiritEntryFrame('fire',.1).y).toBeLessThan(-8);
    expect(spiritEntryFrame('water',.1).y).toBeGreaterThan(0);
    expect(spiritEntryFrame('metal',.1).sx).toBeLessThan(1);
    expect(spiritEntryFrame('wood',.1).sy).toBeLessThan(1);
    for(const beast of [false,true]){
      expect(spiritEntryFrame('earth',.1,beast).y).toBeLessThan(0);
      const planted=spiritEntryFrame('earth',.3,beast);expect(planted.y).toBeCloseTo(0);expect(planted.sy).toBeLessThan(1);expect(planted.sx).toBeGreaterThan(1);
    }
    for(const element of ['metal','wood','water','fire','earth'] as Element[])for(const beast of [false,true]){
      expect(spiritEntryFrame(element,0,beast).opacity).toBe(0);
      for(const age of [SPIRIT_ENTRY_SECONDS,2,30,NaN])expect(spiritEntryFrame(element,age,beast)).toMatchObject({opacity:1,reveal:1,fade:0,y:expect.closeTo(0),sx:1,sy:1});
    }
  });
  it('keeps the fire mouth with the descending body without moving its entity or changing attack timing',()=>{
    const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'mimic',roots:['fire']});
    const s=world.mechanics.spirits[0]!,art=new SpiritArt(world),before=structuredClone(s),game=[world.time,world.spirit,world.health];
    art.update(0);const high=art.source(s);art.update(.4);const settled=art.source(s);
    expect(settled.y-high.y).toBeGreaterThan(20);expect(s).toEqual(before);expect([world.time,world.spirit,world.health]).toEqual(game);
    const paused=art.source(s);art.update(0);expect(art.source(s)).toEqual(paused);art.clear();
  });
  it('announces actual births by identity, and an ordinary reward never pretends to spawn them again',()=>{
    const world=new World({roguelike:true}),events:GameEvents['spiritSpawn'][]=[];
    world.events.on('spiritSpawn',e=>{expect(world.mechanics.spirits.some(s=>s.id===e.spiritId)).toBe(true);events.push(e);});
    world.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['fire','water']});
    expect(events.map(e=>e.role)).toEqual(['main','twin']);
    world.build.stage=1;world.mechanics.upgraded();world.mechanics.upgraded();expect(events.map(e=>e.role)).toEqual(['main','twin','support']);
    const start=events[0]!.at.x;world.mechanics.spirits[0]!.x+=2;expect(events[0]!.at.x).toBe(start);
  });
});
