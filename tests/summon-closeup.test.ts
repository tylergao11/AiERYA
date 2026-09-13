import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { Camera2D } from '../src/render/projection';
import { SummonCloseup, SUMMON_CLOSEUP } from '../src/render/summon-closeup';
import { SlayerCloseup } from '../src/render/slayer-closeup';
import { ArrayCloseup } from '../src/render/array-closeup';
import type { Wolf } from '../src/game/contracts';

afterEach(()=>vi.unstubAllGlobals());
const from={x:-7,z:5},at={x:-1,z:5};
function setup(width=1280,height=720,reduced=false,beast=false){
  vi.stubGlobal('matchMedia',()=>({matches:reduced}));
  const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'spirit',tier:beast?'unusual':'ordinary',boon:beast?'beast':'twins',roots:[beast?'earth':'fire']});world.startWave();
  const camera=new Camera2D();camera.resize(width,height);
  const closeup=new SummonCloseup(world);
  const order=()=>world.events.emit('summonOrder',{kind:'union',at,element:'fire',spiritIds:world.mechanics.spirits.map(s=>s.id),pure:true});
  const impact=(union=true,echo=false)=>world.events.emit('summonImpact',{from,at,element:'fire',radius:3.5,strength:2.8,union,echo});
  return {world,camera,closeup,order,impact};
}
const state=(camera:Camera2D)=>({scale:camera.scale,x:camera.offsetX,y:camera.offsetY});

describe('summon special-move framing without running combat',()=>{
  function furySetup(){
    const scene=setup(390,844,false,true),{world}=scene,s=world.mechanics.spirits[0]!;
    Object.assign(s,{x:-6,z:8});
    const target={id:812,x:-4.4,z:8,action:'run'} as Wolf;world.wolves=[target];
    world.mechanics.commands.fury=3;
    const windup=()=>world.mechanics.attackEvent('windup',s,target,.18,'earth');
    const hit=()=>world.events.emit('summonTechnique',{kind:'fury',from:s,at:target,element:'earth',spiritId:s.id,targetId:target.id});
    return {...scene,s,target,windup,hit};
  }
  it('frames a ready ancestor during its real windup and lands the punch on its confirmed contact',()=>{
    const {world,camera,closeup,windup,hit}=furySetup(),base=state(camera),game=[world.time,world.spirit,world.health,world.mechanics.commands.fury];
    windup();closeup.update(.12,camera);expect(closeup.active).toBe(true);expect(camera.scale).toBeGreaterThan(base.scale);
    const anticipation=state(camera);closeup.update(0,camera);expect(state(camera)).toEqual(anticipation);
    closeup.update(.06,camera);hit();closeup.update(.08,camera);expect(camera.scale).toBeGreaterThan(anticipation.scale);
    closeup.update(SUMMON_CLOSEUP.fury,camera);expect(closeup.active).toBe(false);expect(state(camera)).toEqual(base);
    expect([world.time,world.spirit,world.health,world.mechanics.commands.fury]).toEqual(game);closeup.dispose();
  });
  it('returns from an unconfirmed heavy windup without borrowing another target or ordinary impact',()=>{
    const {world,camera,closeup,s,target,windup}=furySetup(),base=state(camera);
    windup();closeup.update(.18,camera);
    world.events.emit('summonTechnique',{kind:'fury',from:s,at:{x:20,z:20},element:'earth',spiritId:s.id,targetId:999});
    world.events.emit('summonImpact',{from:s,at:target,element:'earth',spiritId:s.id,targetId:target.id,radius:3,strength:1,union:false,echo:false});
    closeup.update(SUMMON_CLOSEUP.furyWait+SUMMON_CLOSEUP.release-.18+.01,camera);
    expect(closeup.active).toBe(false);expect(state(camera)).toEqual(base);closeup.dispose();
  });
  it('requires a ready empowered main beast and does not frame a normal attack or echo',()=>{
    const {world,camera,closeup,s,target,windup}=furySetup(),base=state(camera);
    world.mechanics.commands.fury=2;windup();expect(closeup.active).toBe(false);
    world.mechanics.commands.fury=3;
    world.mechanics.attackEvent('windup',s,target,.18);expect(closeup.active).toBe(false);
    world.mechanics.attackEvent('windup',s,target,.18,'earth',true);expect(closeup.active).toBe(false);
    closeup.update(.2,camera);expect(state(camera)).toEqual(base);closeup.dispose();
    const ordinary=setup();ordinary.world.mechanics.commands.fury=3;
    ordinary.world.mechanics.attackEvent('windup',ordinary.world.mechanics.spirits[0]!,target,.2,'fire');
    expect(ordinary.closeup.active).toBe(false);ordinary.closeup.dispose();
  });
  it('cancels an anticipated heavy attack on drawing or seal and cannot reopen at its late contact',()=>{
    for(const reason of ['drawing','silenced'] as const){
      const {world,camera,closeup,s,windup,hit}=furySetup(),base=state(camera);
      windup();closeup.update(.12,camera);
      if(reason==='silenced')world.events.emit('spiritRestriction',{spiritId:s.id,at:s,element:'earth',state:'silenced'});
      closeup.update(0,camera,reason==='drawing');hit();closeup.update(.1,camera);
      expect(closeup.active).toBe(false);expect(state(camera)).toEqual(base);closeup.dispose();
    }
  });
  it('holds a delayed projectile, gives its real contact a beat, then restores the player view',()=>{
    const {world,camera,closeup,order}=setup(),s=world.mechanics.spirits[0]!,base=state(camera);
    Object.assign(s,from);world.mechanics.spirits.splice(1);
    order();world.events.emit('spiritAttack',{stage:'windup',spiritId:s.id,targetId:812,at:from,to:at,element:'water',style:'ranged',duration:.2,heavy:false,union:true});
    closeup.update(1.05,camera);expect(closeup.active).toBe(true);expect(camera.scale).toBeGreaterThan(base.scale);
    const waiting=state(camera);closeup.update(0,camera);expect(state(camera)).toEqual(waiting);
    world.events.emit('summonImpact',{from,at,spiritId:s.id,targetId:812,element:'water',radius:3.5,strength:2.8,union:true,echo:false});
    closeup.update(.08,camera);expect(closeup.active).toBe(true);expect(camera.scale).toBeGreaterThan(waiting.scale);
    closeup.update(SUMMON_CLOSEUP.impactHold+SUMMON_CLOSEUP.release,camera);expect(closeup.active).toBe(false);expect(state(camera)).toEqual(base);closeup.dispose();
  });
  it('returns after a missed special without waiting forever or accepting another target as its contact',()=>{
    const {world,camera,closeup,order}=setup(),s=world.mechanics.spirits[0]!,base=state(camera);
    Object.assign(s,from);world.mechanics.spirits.splice(1);order();
    world.events.emit('spiritAttack',{stage:'launch',spiritId:s.id,targetId:812,at:from,to:at,element:'fire',style:'ranged',duration:.4,heavy:false,union:true});
    closeup.update(.4,camera);
    world.events.emit('summonImpact',{from,at:{x:20,z:20},spiritId:s.id,targetId:900,element:'fire',radius:3.5,strength:2.8,union:true,echo:false});
    closeup.update(.65,camera);expect(closeup.active).toBe(true);
    closeup.update(SUMMON_CLOSEUP.wait+SUMMON_CLOSEUP.release,camera);expect(closeup.active).toBe(false);expect(state(camera)).toEqual(base);closeup.dispose();
  });
  it('keeps the casting body prominent when a nearby idle companion moves away',()=>{
    const {world,camera,closeup,order}=setup(),[s,twin]=world.mechanics.spirits;
    Object.assign(s!,from);Object.assign(twin!,{x:-6,z:5});order();
    world.events.emit('spiritAttack',{stage:'windup',spiritId:s!.id,targetId:812,at:from,to:at,element:'fire',style:'ranged',duration:.2,heavy:false,union:true});
    closeup.update(.12,camera);const framed=state(camera);
    Object.assign(twin!,{x:-12,z:12});closeup.update(.08,camera);expect(state(camera)).toEqual(framed);closeup.dispose();
  });
  it('yields when its windup owner is sealed, while unrelated companions cannot cancel it',()=>{
    const {world,camera,closeup,order}=setup(),[s,twin]=world.mechanics.spirits,before=state(camera);
    const event={stage:'windup' as const,spiritId:s!.id,targetId:812,at:from,to:at,element:'fire' as const,style:'ranged' as const,duration:.2,heavy:false,union:true};
    order();world.events.emit('spiritAttack',event);closeup.update(.12,camera);
    world.events.emit('spiritRestriction',{spiritId:twin!.id,at,element:'fire',state:'silenced'});expect(closeup.active).toBe(true);
    world.events.emit('spiritRestriction',{spiritId:s!.id,at,element:'fire',state:'silenced'});closeup.update(0,camera);expect(closeup.active).toBe(false);expect(state(camera)).toEqual(before);
    world.events.emit('spiritRestriction',{spiritId:s!.id,at,element:'fire',state:'free'});world.events.emit('spiritAttack',event);expect(closeup.active).toBe(false);closeup.dispose();
  });
  it('features a real evolution once, tracks its owner, and still yields to drawing',()=>{
    const {world,camera,closeup,order,impact}=setup(),s=world.mechanics.spirits[0]!;
    const transition={kind:'evolve' as const,spiritId:s.id,at:{x:s.x,z:s.z},element:s.element,ancestor:true,fromSize:1.75,toSize:2.36};
    order();impact();closeup.update(.6,camera);
    world.events.emit('spiritTransition',transition);closeup.update(.15,camera);expect(closeup.active).toBe(true);
    const focus=vi.spyOn(camera,'focus');s.x+=5;closeup.update(.08,camera);expect(focus.mock.calls.at(-1)![0]).not.toBeNull();
    closeup.update(SUMMON_CLOSEUP.evolution,camera);expect(closeup.active).toBe(false);
    world.events.emit('spiritTransition',{...transition,kind:'awaken'});expect(closeup.active).toBe(false);
    world.events.emit('spiritTransition',transition);closeup.update(.1,camera,true);expect(closeup.active).toBe(false);closeup.dispose();
  });
  it('frames the real union, preserves selected zoom and never changes game state',()=>{
    const {world,camera,closeup,order,impact}=setup();camera.changeZoom(-300);const before=state(camera),game=[world.time,world.spirit,world.health,world.kills];
    order();impact();closeup.update(.15,camera);expect(closeup.active).toBe(true);expect(camera.scale).toBeGreaterThan(before.scale);
    closeup.update(1,camera);expect(closeup.active).toBe(false);expect(state(camera)).toEqual(before);expect([world.time,world.spirit,world.health,world.kills]).toEqual(game);closeup.dispose();
  });
  it('films one order once even when pets hit late, but allows the next paid union',()=>{
    const {camera,closeup,order,impact}=setup();order();impact();closeup.update(.2,camera);
    for(let i=0;i<25;i++){impact();closeup.update(.1,camera);}expect(closeup.active).toBe(false);
    impact();expect(closeup.active).toBe(false);order();impact();expect(closeup.active).toBe(true);closeup.dispose();
  });
  it('leaves normal attacks, echoes, focus orders and minor procs at the normal view',()=>{
    const {world,camera,closeup,impact}=setup(),base=state(camera);
    impact(false);impact(true,true);world.events.emit('summonOrder',{kind:'focus',at,spiritIds:[]});
    for(const kind of ['pincer','seal','hunt','furyReady','echo'] as const)world.events.emit('summonTechnique',{kind,from,at,element:'fire'});
    closeup.update(.15,camera);expect(closeup.active).toBe(false);expect(state(camera)).toEqual(base);closeup.dispose();
  });
  it('gives the beast a shorter shot and lets a union take priority without restarting time',()=>{
    const {world,camera,closeup,order,impact}=setup();world.events.emit('summonTechnique',{kind:'fury',from,at,element:'earth'});closeup.update(.15,camera);expect(closeup.active).toBe(true);
    order();impact();closeup.update(SUMMON_CLOSEUP.union-.14,camera);expect(closeup.active).toBe(false);closeup.dispose();
  });
  it('drawing cancels immediately and a later impact from that order cannot steal the camera',()=>{
    const {world,camera,closeup,order,impact}=setup(),before=state(camera);order();impact();closeup.update(.12,camera);closeup.update(0,camera,true);expect(state(camera)).toEqual(before);
    impact();closeup.update(.2,camera);expect(closeup.active).toBe(false);expect(state(camera)).toEqual(before);
    world.events.emit('reset',undefined);order();impact();closeup.update(.12,camera);world.startUltimate();closeup.update(0,camera);expect(state(camera)).toEqual(before);closeup.dispose();
  });
  it.each([[390,844],[844,390],[1280,720]])('keeps map bounds and pointer projection aligned at %s x %s',(width,height)=>{
    const {camera,closeup,order,impact}=setup(width,height),base=camera.scale;order();impact();closeup.update(.15,camera);
    expect(camera.scale/base).toBeLessThanOrEqual((Math.min(width,height)<=600?height>width?2:SUMMON_CLOSEUP.mobileZoom:SUMMON_CLOSEUP.desktopZoom)+1e-8);
    for(const p of [from,at,{x:20,z:15}]){const q=camera.project(p),back=camera.unproject(q.x,q.y);expect(back.x).toBeCloseTo(p.x,8);expect(back.z).toBeCloseTo(p.z,8);}closeup.dispose();
  });
  it('makes the portrait caster prominent while retaining the enemy and restoring the exact player view',()=>{
    const {world,camera,closeup,order}=setup(390,844),s=world.mechanics.spirits[0]!;
    Object.assign(s,{x:-6,z:8,element:'water'});world.mechanics.spirits.splice(1);camera.changeZoom(-500);
    const before=state(camera),target={x:0,z:8};order();
    world.events.emit('spiritAttack',{stage:'windup',spiritId:s.id,targetId:812,at:s,to:target,element:'water',style:'ranged',duration:.2,heavy:false,union:true});
    closeup.update(.3,camera);
    world.events.emit('summonImpact',{from:s,at:target,spiritId:s.id,targetId:812,element:'water',radius:3.5,strength:2.8,union:true,echo:false});
    closeup.update(.08,camera);expect(camera.scale/before.scale).toBeGreaterThan(1.75);
    for(const point of [camera.project(s,7),camera.project(s),camera.project(target,3),camera.project(target)]){
      expect(point.x).toBeGreaterThan(24);expect(point.x).toBeLessThan(366);
      expect(point.y).toBeGreaterThan(80);expect(point.y).toBeLessThan(764);
    }
    closeup.update(0,camera,true);expect(state(camera)).toEqual(before);closeup.dispose();
  });
  it('fits long portrait shots and respects a smaller user navigation window',()=>{
    const {world,camera,closeup,order}=setup(390,844),s=world.mechanics.spirits[0]!;
    Object.assign(s,{x:-9,z:8,element:'water'});world.mechanics.spirits.splice(1);
    const target={x:9,z:8};order();
    world.events.emit('summonImpact',{from:s,at:target,spiritId:s.id,targetId:812,element:'water',radius:3.5,strength:2.8,union:true,echo:false});
    closeup.update(.2,camera);const closeScale=camera.scale;
    for(const point of [camera.project(s),camera.project(target)])expect(point.x).toBeGreaterThan(12);
    expect(camera.project(target).x).toBeLessThan(378);
    closeup.cancel();camera.navigate({x:0,y:282,width:390,height:260},1.85);const before=state(camera);
    world.events.emit('reset',undefined);order();
    world.events.emit('summonImpact',{from:s,at:target,spiritId:s.id,targetId:812,element:'water',radius:3.5,strength:2.8,union:true,echo:false});
    closeup.update(.2,camera);expect(camera.scale/before.scale).toBeLessThanOrEqual(SUMMON_CLOSEUP.mobileZoom);
    expect(closeScale).toBeGreaterThan(390/1600);
    closeup.update(0,camera,true);expect(state(camera)).toEqual(before);closeup.dispose();
  });
  it('keeps the default camera limit for other flows when a portrait shot opts into a larger frame',()=>{
    const camera=new Camera2D();camera.resize(390,844);const base=state(camera);
    camera.focus(at,2,1);expect(camera.scale/base.scale).toBe(1.5);
    camera.focus(at,2,1,2);expect(camera.scale/base.scale).toBe(2);
    const p=camera.project(from),back=camera.unproject(p.x,p.y);expect(back.x).toBeCloseTo(from.x);expect(back.z).toBeCloseTo(from.z);
    camera.focus(at,2,1,NaN);expect(camera.scale/base.scale).toBe(1.5);
    camera.focus(null);expect(state(camera)).toEqual(base);
  });
  it('does not reset an existing other-flow camera and ignores reduced-motion panning',()=>{
    const a=setup();a.order();a.impact();a.camera.focus(at,1.35,.8);const owned=state(a.camera);a.closeup.update(.1,a.camera,false,true);expect(state(a.camera)).toEqual(owned);expect(a.closeup.active).toBe(false);a.closeup.dispose();
    const b=setup(1280,720,true),before=state(b.camera);b.order();b.impact();b.closeup.update(.15,b.camera);expect(state(b.camera)).toEqual(before);b.closeup.dispose();
  });
  it('coexists with the full scene update order and disconnects on disposal',()=>{
    const {world,camera,closeup,order,impact}=setup(),base=camera.scale,slayer=new SlayerCloseup(world),array=new ArrayCloseup(world);
    order();impact();slayer.update(.12,camera);array.update(.12,camera,false,slayer.active);closeup.update(.12,camera,false,slayer.active||array.active);expect(camera.scale).toBeGreaterThan(base);
    closeup.dispose();order();impact();expect(closeup.active).toBe(false);slayer.dispose();array.dispose();
  });
  it('tracks the casting pet and moving target, then holds the real contact instead of following knockback',()=>{
    const {world,camera,closeup,order}=setup(),s=world.mechanics.spirits[0]!;
    Object.assign(s,from);world.mechanics.spirits.splice(1);
    const target={id:812,x:-1,z:5,action:'run'} as Wolf;world.wolves=[target];
    const focus=vi.spyOn(camera,'focus'),x=()=>focus.mock.calls.at(-1)![0]!.x;
    order();world.events.emit('spiritAttack',{stage:'windup',spiritId:s.id,targetId:target.id,at:from,to:at,element:'fire',style:'ranged',duration:.2,heavy:false,union:true});
    closeup.update(.12,camera);const initial=x();target.x=3;closeup.update(.08,camera);expect(x()).toBeGreaterThan(initial);
    world.events.emit('summonImpact',{from:s,at:{x:3,z:5},spiritId:s.id,targetId:target.id,element:'fire',radius:3.5,strength:2.8,union:true,echo:false});
    const contact=x();target.x=-16;closeup.update(.08,camera);expect(x()).toBeGreaterThanOrEqual(contact);
    closeup.dispose();
  });
  it('does not hand the closeup to an unrelated teammate impact or an echo windup',()=>{
    const {world,camera,closeup,order}=setup(),[s,twin]=world.mechanics.spirits;
    Object.assign(s!,from);Object.assign(twin!,{x:18,z:16});world.wolves=[];
    const event={stage:'windup' as const,spiritId:s!.id,targetId:812,at:from,to:at,element:'fire' as const,style:'ranged' as const,duration:.2,heavy:false,union:true};
    world.events.emit('spiritAttack',{...event,echo:true});expect(closeup.active).toBe(false);
    order();world.events.emit('spiritAttack',event);const focus=vi.spyOn(camera,'focus');closeup.update(.12,camera);const initial=focus.mock.calls.at(-1)![0];
    world.events.emit('summonImpact',{from:twin!,at:{x:23,z:15},spiritId:twin!.id,targetId:913,element:'fire',radius:3.5,strength:2.8,union:true,echo:false});
    closeup.update(.08,camera);expect(focus.mock.calls.at(-1)![0]).toEqual(initial);closeup.dispose();
  });
});
