import {describe,it,expect,vi} from 'vitest';
import {World} from '../src/game/world';
import type {GameEvents,Wolf} from '../src/game/contracts';
import {ROGUE} from '../src/game/rogue-balance';
import {BeastFeastArt,BEAST_FEAST_LIMIT} from '../src/render/beast-feast';
import {SpiritArt} from '../src/render/spirit-art';
import {summonStatus} from '../src/ui/summon-status';

const victim=(id:number,summoned=false):Wolf=>({id,x:-3,z:8,hp:1,maxHp:1,summoned,kind:'normal',speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
function setup(){const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'spirit',boon:'beast',tier:'unusual',roots:['earth']});w.startWave();w.wolves=[];return {w,s:w.mechanics.spirits[0]!};}
function canvas(){return {globalAlpha:1,save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),closePath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),fill:vi.fn(),arc:vi.fn(),createRadialGradient:()=>({addColorStop:vi.fn()})} as unknown as CanvasRenderingContext2D;}

describe('ancestor feeding is owned by real kills and connects to evolution',()=>{
  it('ignores summoned and manual kills, then snapshots the main beast eligible victim',()=>{
    const {w,s}=setup(),events:GameEvents['beastFeast'][]=[];w.events.on('beastFeast',e=>events.push(e));
    const summoned=victim(601,true),manual=victim(602),prey=victim(603);w.wolves=[summoned,manual,prey];
    w.hitRogue(summoned,100,'earth',{kind:'spirit',spiritId:s.id});w.hitRogue(manual,100,'earth',{kind:'manual'});expect(events).toEqual([]);
    w.hitRogue(prey,100,'water',{kind:'spirit',spiritId:s.id});expect(prey.action).toBe('dead');expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({spiritId:s.id,targetId:603,element:'earth',marks:1,goal:ROGUE.spirit.beastKills,at:{x:-3,z:8}});
    prey.x=10;expect(events[0]!.at.x).toBe(-3);expect(summonStatus(w,s).growth?.marks).toBe(1);
  });
  it('announces the last absorbed mark before the existing evolution and stops collecting afterwards',()=>{
    const {w,s}=setup(),order:string[]=[];w.mechanics.beastMarks=ROGUE.spirit.beastKills-1;const size=s.size;
    w.events.on('beastFeast',()=>order.push('feed'));w.events.on('spiritTransition',e=>{if(e.kind==='evolve')order.push('evolve');});
    const prey=victim(604);w.wolves=[prey];w.hitRogue(prey,100,'earth',{kind:'spirit',spiritId:s.id});expect(order).toEqual(['feed','evolve']);
    expect(s.size).toBeCloseTo(size*1.35);expect(summonStatus(w,s).label).toContain('已蜕变');
    const another=victim(605);w.wolves=[another];w.hitRogue(another,100,'earth',{kind:'spirit',spiritId:s.id});expect(order).toEqual(['feed','evolve']);
  });
  it('keeps corpse origins fixed, follows the living endpoint and bounds the short trails',()=>{
    const event:GameEvents['beastFeast']={spiritId:1,targetId:2,at:{x:-3,z:8},element:'earth',marks:1,goal:12};
    const a=new BeastFeastArt(),b=new BeastFeastArt();a.add(event);b.add({...event,at:{...event.at}});event.at.x=50;a.update(.2);b.update(.2);
    const ca=canvas(),cb=canvas();a.paint(ca,()=>({x:500,y:300}));b.paint(cb,()=>({x:500,y:300}));expect(vi.mocked(ca.moveTo).mock.calls).toEqual(vi.mocked(cb.moveTo).mock.calls);
    const moved=canvas();a.paint(moved,()=>({x:650,y:300}));expect(vi.mocked(moved.moveTo).mock.calls).not.toEqual(vi.mocked(ca.moveTo).mock.calls);
    for(let i=0;i<30;i++)a.add(event);const source=vi.fn(()=>({x:500,y:300}));a.paint(canvas(),source);expect(source).toHaveBeenCalledTimes(BEAST_FEAST_LIMIT);
    a.update(.8);source.mockClear();a.paint(canvas(),source);expect(source).not.toHaveBeenCalled();a.add(event);a.clear();a.paint(canvas(),source);expect(source).not.toHaveBeenCalled();
  });
  it('clears a spirit trail on phase exit without changing gameplay or replaying it on return',()=>{
    const {w,s}=setup(),art=new SpiritArt(w);s.age=2;art.update(0);const before=[w.time,w.health,w.spirit,w.kills,w.mechanics.beastMarks,s.x,s.z];
    art.feast({spiritId:s.id,targetId:2,at:{x:-3,z:8},element:'earth',marks:2,goal:12});art.update(.1);const c=canvas();art.feastEffects(c);expect(c.moveTo).toHaveBeenCalled();
    expect([w.time,w.health,w.spirit,w.kills,w.mechanics.beastMarks,s.x,s.z]).toEqual(before);w.phase='rest';art.update(0);w.phase='battle';vi.mocked(c.moveTo).mockClear();art.feastEffects(c);expect(c.moveTo).not.toHaveBeenCalled();art.clear();
  });
});
