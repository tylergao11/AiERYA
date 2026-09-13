import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import type { RunSpirit } from '../src/game/rogue-combat';
import type { Element, GameEvents } from '../src/game/contracts';
import { SpiritPoses } from '../src/render/spirit-pose';
import { SpiritArt } from '../src/render/spirit-art';
import { SpiritFootfalls } from '../src/render/spirit-footfalls';

const actor=(element:Element='earth',size=1):RunSpirit=>({id:1,role:'main',element,size,x:0,z:5,power:1,age:1,cooldown:0,targetId:null,cast:0,energy:0});
function walking(fps:number,element:Element='earth',size=1){
  const s=actor(element,size),poses=new SpiritPoses(),steps:number[]=[];poses.update([s],0,()=>undefined);
  for(let i=0;i<fps*3;i++){s.x+=3.8/fps;poses.update([s],1/fps,()=>undefined,(_,side)=>steps.push(side));}
  return {s,poses,steps};
}
describe('summon foot contact follows real distance and planted gait frames',()=>{
  it('has the same alternating contacts at 30, 60 and 120 FPS',()=>{
    const runs=[30,60,120].map(fps=>walking(fps).steps);expect(runs[0]).toEqual(runs[1]);expect(runs[1]).toEqual(runs[2]);expect(runs[0]).toEqual([1,-1,1,-1,1,-1]);
    expect(walking(60,'wood').steps.length).toBeGreaterThan(runs[0]!.length);expect(walking(60,'earth',1.75).steps.length).toBeLessThan(runs[0]!.length);
  });
  it.each(['metal','water','fire'] as const)('does not give a flying %s spirit footsteps',element=>{expect(walking(60,element).steps).toEqual([]);});
  it('never turns a teleport, pause, stationary settle or attack into a walking burst',()=>{
    const {s,poses}=walking(60),step=vi.fn();
    for(let i=0;i<60;i++)poses.update([s],1/60,()=>undefined,step);
    s.x+=20;poses.update([s],1/60,()=>undefined,step);s.x+=.1;poses.update([s],0,()=>undefined,step);
    s.cast=.8;for(let i=0;i<90;i++){s.x+=.05;poses.update([s],1/60,()=>undefined,step);}
    expect(step).not.toHaveBeenCalled();
  });
  it('emits cosmetic contacts for a moving silenced beast, preserving its identity under a water order',()=>{
    const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'spirit',boon:'beast',tier:'unusual',roots:['earth']});w.startWave();w.wolves=[];
    const s=w.mechanics.spirits[0]!;Object.assign(s,{x:-8,z:5,age:2,cast:0});const art=new SpiritArt(w),steps:GameEvents['spiritStep'][]=[];
    w.events.on('spiritStep',e=>steps.push(e));w.selected='water';w.invoke([{x:-3,z:6},{x:1,z:6}]);vi.spyOn(w.enemyAbilities,'silenced').mockReturnValue(true);
    const state=[w.time,w.spirit,w.health,w.kills,w.mechanics.commands.amount(s.id)];art.update(0);
    for(let i=0;i<100;i++){s.x+=.05;art.update(1/60);}
    expect(steps.length).toBeGreaterThan(1);expect(steps[0]).toMatchObject({spiritId:s.id,element:'earth',ancestor:true,side:1});
    expect([w.time,w.spirit,w.health,w.kills,w.mechanics.commands.amount(s.id)]).toEqual(state);
    w.phase='rest';const count=steps.length;for(let i=0;i<60;i++){s.x+=.05;art.update(1/60);}expect(steps).toHaveLength(count);art.clear();
  });
  it('keeps bounded dust on the old ground point and clears it without moving a body',()=>{
    const marks=new SpiritFootfalls(),at={x:400,y:500},direction={x:1,y:0};marks.add(at,direction,false,true,1,1);at.x=900;direction.x=-1;
    const c={save:vi.fn(),restore:vi.fn(),translate:vi.fn(),scale:vi.fn(),beginPath:vi.fn(),ellipse:vi.fn(),fill:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn()} as unknown as CanvasRenderingContext2D;
    marks.paint(c);expect(c.translate).toHaveBeenCalledWith(400,500);vi.mocked(c.translate).mockClear();
    for(let i=0;i<30;i++)marks.add(at,direction,true,false,1,-1);marks.paint(c);expect(c.translate).toHaveBeenCalledTimes(16);
    marks.update(.4);vi.mocked(c.translate).mockClear();marks.paint(c);expect(c.translate).not.toHaveBeenCalled();marks.add(at,direction,true,false,1,1);marks.clear();marks.paint(c);expect(c.translate).not.toHaveBeenCalled();
  });
});
