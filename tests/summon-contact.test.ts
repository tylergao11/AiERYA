import {afterEach,describe,expect,it,vi} from 'vitest';
import {World} from '../src/game/world';
import type {GameEvents,Wolf} from '../src/game/contracts';
import {RoguePainter} from '../src/render/rogue';
import {SpiritPoses} from '../src/render/spirit-pose';
import * as spiritVfx from '../src/render/spirit-vfx';
import {SummonPainter} from '../src/render/summon';

afterEach(()=>vi.restoreAllMocks());
function setup(){
  const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['metal']});w.startWave();
  const [main,twin]=w.mechanics.spirits;Object.assign(main!,{x:-6,z:4,element:'wood'});Object.assign(twin!,{x:-6,z:4,element:'metal'});
  const target:Wolf={id:917,x:-1,z:4,hp:10000,maxHp:10000,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null};
  w.wolves=[target];return {w,main:main!,twin:twin!,target};
}
describe('real summon contact attribution without advancing a battle',()=>{
  it('preserves another companion native contact at the same point and clears flights at wave end',()=>{
    const {w,main,twin,target}=setup(),painter=new RoguePainter(w);
    const draw=vi.spyOn(spiritVfx,'paintSpiritAttack').mockImplementation(()=>{});
    vi.spyOn(SummonPainter.prototype,'paint').mockImplementation(()=>{});
    const ctx={} as CanvasRenderingContext2D;
    w.events.emit('summonImpact',{at:target,from:main,spiritId:main.id,targetId:target.id,element:'earth',radius:3,strength:1,union:false,echo:false});
    const native={stage:'impact' as const,spiritId:main.id,targetId:target.id,at:main,to:target,element:'wood' as const,style:'melee' as const,duration:.35,heavy:false};
    w.events.emit('spiritAttack',native);w.events.emit('spiritAttack',{...native,spiritId:twin.id,element:'metal',style:'ranged'});
    painter.paint(ctx);expect(draw).toHaveBeenCalledTimes(1);expect(draw.mock.calls[0]![1].spiritId).toBe(twin.id);
    w.events.emit('spiritAttack',{...native,stage:'launch',spiritId:twin.id});
    w.events.emit('phase',{phase:'rest'});draw.mockClear();painter.paint(ctx);expect(draw).not.toHaveBeenCalled();painter.dispose();
  });
  it('carries the actual caster and target through all five empowered contacts',()=>{
    for(const element of ['metal','wood','water','fire','earth'] as const){
      const {w,twin,target}=setup(),events:GameEvents['summonImpact'][]=[];w.events.on('summonImpact',e=>events.push(e));w.selected=element;
      expect(w.invoke([{x:-3,z:4},{x:1,z:4}])).toBe(true);
      const hp=target.hp;w.mechanics.commands.land(twin,target,w.mechanics.commands.take(twin));
      expect(target.hp).toBeLessThan(hp);expect(events[0]).toMatchObject({spiritId:twin.id,targetId:target.id,element,from:{x:twin.x,z:twin.z}});
    }
  });
  it('does not snap a nearby melee body into its contact pose for another pet hit',()=>{
    const {w,main,twin,target}=setup(),painter=new RoguePainter(w),contact=vi.spyOn(SpiritPoses.prototype,'contact');
    const event={from:{x:twin.x,z:twin.z},at:target,spiritId:twin.id,targetId:target.id,element:'earth' as const,radius:2.8,strength:1,union:false,echo:false};
    w.events.emit('summonImpact',event);expect(contact).not.toHaveBeenCalled();
    w.events.emit('summonImpact',{...event,spiritId:main.id});expect(contact).toHaveBeenCalledExactlyOnceWith(main);
    w.events.emit('summonImpact',{...event,spiritId:main.id,echo:true});expect(contact).toHaveBeenCalledTimes(1);painter.dispose();
  });
});
