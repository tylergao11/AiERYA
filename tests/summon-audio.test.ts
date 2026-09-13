import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/game/world';
import { SummonAudio, SUMMON_AUDIO_VOICES } from '../src/audio/summon-audio';
import { SUMMON_AUDIO_RATE, SUMMON_SPRITE, SUMMON_SPRITE_SECONDS } from '../src/audio/summon-bank';
class Param{value=1;cancelScheduledValues=vi.fn();setTargetAtTime=vi.fn();}
class Node{gain=new Param();pan=new Param();threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();connect=vi.fn();disconnect=vi.fn();start=vi.fn();stop=vi.fn();buffer:unknown;onended:(()=>void)|null=null;}
class Context extends EventTarget{state='running';currentTime=1;sources:Node[]=[];createDynamicsCompressor=()=>new Node();createGain=()=>new Node();createStereoPanner=()=>new Node();createBufferSource=()=>{const n=new Node();this.sources.push(n);return n;};decodeAudioData=vi.fn(async()=>({duration:SUMMON_SPRITE_SECONDS,length:Math.ceil(SUMMON_SPRITE_SECONDS*24000),numberOfChannels:1}));}
async function setup(){const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['fire']});world.startWave();const ctx=new Context(),duck=vi.fn(),audio=new SummonAudio(world,{load:async()=>new ArrayBuffer(8),duck});await audio.attach(ctx as unknown as AudioContext,new Node() as unknown as AudioNode);const at={x:2,z:5},from={x:-4,z:5};const order=()=>world.events.emit('summonOrder',{kind:'union',at,element:'fire',spiritIds:[world.mechanics.spirits[0]!.id],pure:true});const hit=(union=false,echo=false)=>world.events.emit('summonImpact',{at,from,element:'fire',radius:3,strength:1,union,echo});return {world,ctx,audio,duck,order,hit,at,from};}
const offsets=(cue:string)=>[0,1].map(v=>SUMMON_SPRITE.get(`${cue}:${v}`)!.offset);
const played=(ctx:Context,cue:string)=>ctx.sources.filter(s=>offsets(cue).includes(s.start.mock.calls[0]?.[1] as number));

describe('summon audio assets and lifecycle',()=>{
  it('merges stored ultimate orders into one infusion cue and reserves hit sounds for actual contact',async()=>{
    const {world,ctx,audio}=await setup();world.startUltimate();
    for(const element of ['fire','water','metal'] as const)world.queueUltimateStroke([{x:-2,z:8},{x:2,z:8}],element);
    world.tick(3);world.tick(.28);
    expect(played(ctx,'infuse')).toHaveLength(1);expect(played(ctx,'union-call')).toHaveLength(0);expect(played(ctx,'hit-fire')).toHaveLength(0);
    expect(ctx.sources).toHaveLength(1);expect(world.time).toBe(0);audio.dispose();
  });
  it('waits for the real audio context to resume, then announces the awakened body and new reinforcement once',async()=>{
    const {world,ctx,audio,duck,hit}=await setup();world.phase='rest';audio.pause(true);ctx.state='suspended';
    const support=world.mechanics.addSpirit('support','water');world.build.stage=1;world.mechanics.upgraded();hit();
    expect(ctx.sources).toHaveLength(0);world.phase='prepare';world.events.emit('phase',{phase:'prepare'});audio.pause(false);
    expect(ctx.sources).toHaveLength(0);world.phase='battle';world.events.emit('phase',{phase:'battle'});ctx.state='running';ctx.dispatchEvent(new Event('statechange'));
    expect(played(ctx,'spawn-fire')).toHaveLength(1);expect(played(ctx,'spawn-water')).toHaveLength(1);expect(played(ctx,'hit-fire')).toHaveLength(0);
    expect(played(ctx,'spawn-water')[0]!.connect.mock.calls[0]![0].gain.value).toBeCloseTo(.44/Math.sqrt(2));
    expect(played(ctx,'spawn-water')[0]!.connect.mock.calls[0]![0].connect.mock.calls[0]![0].pan.value).toBeCloseTo(support.x/26);
    ctx.dispatchEvent(new Event('statechange'));audio.pause(false);expect(ctx.sources).toHaveLength(2);expect(duck).toHaveBeenCalledOnce();audio.dispose();
  });
  it('announces simultaneous native bodies separately and never keys spawning off display copy',async()=>{
    const {world,ctx,audio,at}=await setup();
    world.mechanics.addSpirit('support','water');world.mechanics.addSpirit('support','wood');world.mechanics.addSpirit('support','water');
    expect(played(ctx,'spawn-water')).toHaveLength(1);expect(played(ctx,'spawn-wood')).toHaveLength(1);
    world.events.emit('rogueEffect',{kind:'evolve',at,element:'fire',label:'伴灵现身',radius:2});expect(played(ctx,'spawn-fire')).toHaveLength(0);audio.dispose();
  });
  it('drops cancelled or removed pending arrivals even when context resume finishes later',async()=>{
    const {world,ctx,audio}=await setup();world.phase='rest';audio.pause(true);ctx.state='suspended';
    const support=world.mechanics.addSpirit('support','water');world.mechanics.spirits.splice(world.mechanics.spirits.indexOf(support),1);
    world.phase='prepare';world.events.emit('phase',{phase:'prepare'});audio.pause(false);ctx.state='running';ctx.dispatchEvent(new Event('statechange'));expect(ctx.sources).toHaveLength(0);
    world.phase='rest';audio.pause(true);ctx.state='suspended';world.mechanics.addSpirit('support','wood');audio.mute(true);audio.mute(false);
    world.phase='prepare';audio.pause(false);ctx.state='running';ctx.dispatchEvent(new Event('statechange'));expect(ctx.sources).toHaveLength(0);audio.dispose();
  });
  it('bounds queued arrivals while preserving the main companion in a large awakening',async()=>{
    const {world,ctx,audio}=await setup();world.phase='rest';audio.pause(true);ctx.state='suspended';
    const main=world.mechanics.spirits[0]!;world.events.emit('spiritSpawn',{spiritId:main.id,at:main,element:main.element,ancestor:false,role:'main'});
    for(let n=0;n<10;n++)world.mechanics.addSpirit('support','water');expect(audio.diagnostics.pendingArrivals).toBe(8);
    world.phase='prepare';audio.pause(false);ctx.state='running';ctx.dispatchEvent(new Event('statechange'));
    expect(played(ctx,'spawn-fire')).toHaveLength(1);expect(played(ctx,'spawn-water')).toHaveLength(1);audio.dispose();
  });
  it('gives ordinary feeds a quiet reply, coalesces nearby kills and leaves the final mark to evolution',async()=>{
    const {world,ctx,audio,at}=await setup();world.reset();world.chooseDestiny({serial:2,fate:'spirit',tier:'unusual',boon:'beast',roots:['earth']});world.startWave();
    const spiritId=world.mechanics.spirits[0]!.id,event={spiritId,targetId:71,at,element:'earth' as const,marks:1,goal:12};
    world.events.emit('beastFeast',event);world.events.emit('beastFeast',{...event,marks:2});expect(played(ctx,'feed-beast')).toHaveLength(1);
    ctx.currentTime+=.3;world.events.emit('beastFeast',{...event,marks:12});expect(played(ctx,'feed-beast')).toHaveLength(1);
    audio.pause(true);world.events.emit('beastFeast',{...event,marks:3});audio.pause(false);world.phase='rest';world.events.emit('beastFeast',{...event,marks:4});expect(played(ctx,'feed-beast')).toHaveLength(1);audio.dispose();
  });
  it('keeps three native launches audible under one water order without duplicating the same material',async()=>{
    const {world,ctx,audio,at}=await setup();world.build.stage=1;world.mechanics.upgraded();audio.clear();ctx.sources=[];
    const pets=world.mechanics.spirits;pets.forEach((s,i)=>{s.element=(['fire','water','wood'] as const)[i]!;s.x=(i-1)*9;});
    const before=[world.time,world.health,world.spirit,world.kills];
    for(const s of pets){const event={stage:s.element==='wood'?'windup' as const:'launch' as const,spiritId:s.id,targetId:71,at:{x:s.x,z:s.z},to:at,element:'water' as const,style:s.element==='wood'?'melee' as const:'ranged' as const,duration:.2,heavy:false,empowered:true,union:true};world.events.emit('spiritAttack',event);world.events.emit('spiritAttack',event);}
    for(const material of ['fire','water','wood'])expect(played(ctx,`launch-${material}`)).toHaveLength(1);
    expect(ctx.sources).toHaveLength(3);
    const gains=ctx.sources.map(s=>s.connect.mock.calls[0]![0] as Node),pans=gains.map(g=>g.connect.mock.calls[0]![0] as Node);
    gains.forEach(g=>expect(g.gain.value).toBeCloseTo(.44/Math.sqrt(3)));expect(pans[0]!.pan.value).toBeLessThan(0);expect(pans[2]!.pan.value).toBeGreaterThan(0);
    ctx.currentTime+=.2;world.events.emit('summonImpact',{at,from:{x:-9,z:5},spiritId:pets[0]!.id,targetId:71,element:'water',radius:3.5,strength:2.8,union:true,echo:false});
    gains.forEach(g=>expect(g.gain.setTargetAtTime).toHaveBeenCalledWith(g.gain.value*.22,ctx.currentTime,.012));
    expect([world.time,world.health,world.spirit,world.kills]).toEqual(before);expect(audio.diagnostics.peakVoices).toBeLessThanOrEqual(SUMMON_AUDIO_VOICES);audio.dispose();
  });
  it('keeps a second pet contact at the same point and removes only the first pet native duplicate',async()=>{
    const {world,ctx,audio,at,from}=await setup(),[fire,wood]=world.mechanics.spirits;wood!.element='wood';
    world.events.emit('summonImpact',{at,from,spiritId:fire!.id,targetId:71,element:'fire',radius:3,strength:1,union:false,echo:false});
    for(const s of [wood!,fire!])world.events.emit('spiritAttack',{stage:'impact',spiritId:s.id,targetId:71,at:from,to:at,element:s.element,style:s.element==='wood'?'melee':'ranged',duration:.2,heavy:false});
    expect(played(ctx,'hit-fire')).toHaveLength(1);expect(played(ctx,'hit-wood')).toHaveLength(1);audio.dispose();
  });
  it('keeps a beast physical contact under water, but does not layer a second body slam over its main union',async()=>{
    const {world,ctx,audio,at,from,order}=await setup();world.reset();world.chooseDestiny({serial:2,fate:'spirit',tier:'unusual',boon:'beast',roots:['earth']});world.startWave();
    const spiritId=world.mechanics.spirits[0]!.id,event={at,from,spiritId,targetId:71,element:'water' as const,radius:3,strength:1,union:false,echo:false};
    world.events.emit('summonImpact',event);world.events.emit('spiritAttack',{stage:'impact',spiritId,targetId:71,at:from,to:at,element:'earth',style:'melee',duration:.2,heavy:true});
    expect(played(ctx,'hit-water')).toHaveLength(1);expect(played(ctx,'hit-beast')).toHaveLength(1);
    audio.clear();ctx.currentTime+=1;order();world.events.emit('summonImpact',{...event,union:true});
    expect(played(ctx,'union-beast')).toHaveLength(1);expect(played(ctx,'hit-beast')).toHaveLength(1);audio.dispose();
  });
  it('uses body-specific quiet footsteps, coalesces a group and never evicts attack voices for feet',async()=>{
    const {world,ctx,audio,at,hit}=await setup(),s=world.mechanics.spirits[0]!;
    const step=()=>world.events.emit('spiritStep',{spiritId:s.id,at,element:s.element,ancestor:false,side:1});
    s.element='wood';step();step();expect(played(ctx,'step-wood')).toHaveLength(1);
    ctx.currentTime+=.2;s.element='earth';step();expect(played(ctx,'step-earth')).toHaveLength(1);
    ctx.currentTime+=.2;s.element='fire';step();expect(played(ctx,'step-wood')).toHaveLength(1);expect(played(ctx,'step-earth')).toHaveLength(1);
    audio.clear();for(let i=0;i<8;i++){ctx.currentTime+=.2;hit();}const count=ctx.sources.length;s.element='earth';ctx.currentTime+=.2;step();expect(ctx.sources).toHaveLength(count);audio.dispose();
  });
  it('keeps ancestral footsteps through infusions and drops steps during pause, casting and wave changes',async()=>{
    const {world,ctx,audio,at}=await setup();world.reset();world.chooseDestiny({serial:2,fate:'spirit',boon:'beast',tier:'unusual',roots:['earth']});world.startWave();
    const s=world.mechanics.spirits[0]!,step=()=>world.events.emit('spiritStep',{spiritId:s.id,at,element:'water',ancestor:true,side:1});step();expect(played(ctx,'step-beast')).toHaveLength(1);
    s.cast=.3;ctx.currentTime+=.2;step();s.cast=0;audio.pause(true);step();audio.pause(false);ctx.currentTime+=.2;world.phase='rest';step();expect(played(ctx,'step-beast')).toHaveLength(1);audio.dispose();
  });
  it('does not play a two-imprint chord when the old imprint killed the target',async()=>{
    const {world,ctx,audio,at,from}=await setup(),spiritId=world.mechanics.spirits[0]!.id;
    world.events.emit('summonTechnique',{kind:'seal',at,from,spiritId,element:'fire'});expect(played(ctx,'seal')).toHaveLength(0);
    world.events.emit('summonTechnique',{kind:'seal',at,from,spiritId,element:'fire',toElement:'water'});expect(played(ctx,'seal')).toHaveLength(1);audio.dispose();
  });
  it('coalesces a group restriction, plays its release separately and drops paused transitions',async()=>{
    const {world,ctx,audio,at}=await setup();
    for(const s of world.mechanics.spirits)world.events.emit('spiritRestriction',{spiritId:s.id,at,element:s.element,state:'silenced'});
    expect(played(ctx,'blocked')).toHaveLength(1);
    for(const s of world.mechanics.spirits)world.events.emit('spiritRestriction',{spiritId:s.id,at,element:s.element,state:'free'});
    expect(played(ctx,'freed')).toHaveLength(1);
    audio.pause(true);ctx.currentTime+=1;world.events.emit('spiritRestriction',{spiritId:world.mechanics.spirits[0]!.id,at,element:'fire',state:'silenced'});
    audio.pause(false);expect(played(ctx,'blocked')).toHaveLength(1);audio.dispose();
  });
  it('plays a reward milestone when its panel closes, once, and drops it on reset or mute',async()=>{
    const {world,ctx,audio,duck,at}=await setup(),spiritId=world.mechanics.spirits[0]!.id;
    const event={kind:'ascend' as const,spiritId,at,element:'fire' as const,ancestor:false,fromSize:1,toSize:1};
    audio.pause(true);world.phase='rest';world.events.emit('spiritTransition',event);
    expect(ctx.sources).toHaveLength(0);
    world.phase='prepare';world.events.emit('phase',{phase:'prepare'});audio.pause(false);audio.pause(false);
    expect(played(ctx,'spawn-fire')).toHaveLength(1);expect(duck).toHaveBeenCalledOnce();
    audio.pause(true);world.phase='rest';world.events.emit('spiritTransition',event);world.events.emit('reset',undefined);world.phase='prepare';audio.pause(false);
    expect(played(ctx,'spawn-fire')).toHaveLength(1);
    audio.pause(true);world.phase='rest';world.events.emit('spiritTransition',event);audio.mute(true);audio.mute(false);world.phase='prepare';audio.pause(false);
    expect(played(ctx,'spawn-fire')).toHaveLength(1);audio.dispose();
  });
  it('ships the entire bank with safe peaks and silent clip edges',()=>{
    const wav=readFileSync('public/audio/summon-materials.wav');expect(wav.toString('ascii',0,4)).toBe('RIFF');expect(wav.readUInt32LE(24)).toBe(SUMMON_AUDIO_RATE);expect(wav.readUInt32LE(40)).toBe(wav.length-44);
    for(const clip of SUMMON_SPRITE.values()){
      const begin=Math.round(clip.offset*SUMMON_AUDIO_RATE),length=Math.round(clip.duration*SUMMON_AUDIO_RATE);let peak=0,energy=0;
      for(let i=0;i<length;i++){const sample=wav.readInt16LE(44+(begin+i)*2)/32767;peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
      expect(peak).toBeLessThan(.75);expect(Math.sqrt(energy/length)).toBeGreaterThan(.003);expect(wav.readInt16LE(44+begin*2)).toBe(0);expect(wav.readInt16LE(44+(begin+length-1)*2)).toBe(0);
    }
  });
  it('separates projectile launch from contact and skips the native duplicate after an order hit',async()=>{
    const {world,ctx,audio,hit,at,from}=await setup();const spiritId=world.mechanics.spirits[0]!.id;
    world.events.emit('spiritAttack',{stage:'launch',spiritId,targetId:1,at:from,to:at,element:'fire',style:'ranged',duration:.2,heavy:false});expect(played(ctx,'launch-fire')).toHaveLength(1);expect(played(ctx,'hit-fire')).toHaveLength(0);
    ctx.currentTime+=.2;hit();world.events.emit('spiritAttack',{stage:'impact',spiritId,targetId:1,at:from,to:at,element:'fire',style:'ranged',duration:.3,heavy:false});expect(played(ctx,'hit-fire')).toHaveLength(1);audio.dispose();
  });
  it('plays one full union impact per order and keeps echoes light',async()=>{
    const {ctx,audio,duck,order,hit}=await setup();order();hit(true);for(let i=0;i<3;i++){ctx.currentTime+=.15;hit(true);}hit(true,true);
    expect(played(ctx,'union-fire')).toHaveLength(1);expect(duck).toHaveBeenCalledOnce();expect(played(ctx,'echo')).toHaveLength(1);ctx.currentTime+=.5;order();hit(true);expect(played(ctx,'union-fire')).toHaveLength(2);audio.dispose();
  });
  it('limits simultaneous voices and reserves space for an important impact',async()=>{
    const {ctx,audio,order,hit}=await setup();for(let i=0;i<100;i++){ctx.currentTime+=.1;hit();}expect(audio.diagnostics.activeVoices).toBe(SUMMON_AUDIO_VOICES);order();hit(true);expect(played(ctx,'union-fire')).toHaveLength(1);expect(audio.diagnostics.peakVoices).toBeLessThanOrEqual(SUMMON_AUDIO_VOICES);audio.dispose();expect(audio.diagnostics.activeVoices).toBe(0);
  });
  it('clears sound on mute, pause, wave boundary and dispose without changing the world',async()=>{
    const {world,ctx,audio,hit}=await setup(),state=[world.time,world.health,world.spirit,world.kills];hit();audio.mute(true);const count=ctx.sources.length;hit();expect(ctx.sources).toHaveLength(count);expect(audio.diagnostics.activeVoices).toBe(0);
    audio.mute(false);ctx.currentTime+=.2;hit();audio.pause(true);hit();expect(audio.diagnostics.activeVoices).toBe(0);audio.pause(false);ctx.currentTime+=.2;hit();world.events.emit('phase',{phase:'rest'});expect(audio.diagnostics.activeVoices).toBe(0);audio.dispose();const end=ctx.sources.length;hit();expect(ctx.sources).toHaveLength(end);expect([world.time,world.health,world.spirit,world.kills]).toEqual(state);
  });
  it('does not queue a burst while locked or resume stale muted audio',async()=>{
    const {ctx,audio,hit}=await setup();ctx.state='suspended';hit();expect(ctx.sources).toHaveLength(0);ctx.state='running';expect(ctx.sources).toHaveLength(0);hit();expect(ctx.sources).toHaveLength(1);audio.dispose();
  });
  it('rejects missing and truncated banks, and tolerates disposal during loading',async()=>{
    const world=new World(),ctx=new Context(),audio=new SummonAudio(world,{load:async()=>{throw Error('missing');}});await audio.attach(ctx as unknown as AudioContext,new Node() as unknown as AudioNode);expect(audio.diagnostics.failed).toBe(true);audio.dispose();
    const short=new Context();short.decodeAudioData.mockResolvedValue({duration:1,length:24000,numberOfChannels:1});const truncated=new SummonAudio(world,{load:async()=>new ArrayBuffer(8)});await truncated.attach(short as unknown as AudioContext,new Node() as unknown as AudioNode);expect(truncated.diagnostics.failed).toBe(true);expect(truncated.diagnostics.ready).toBe(false);truncated.dispose();
    let finish!:(a:ArrayBuffer)=>void;const later=new SummonAudio(world,{load:()=>new Promise(r=>finish=r)});const pending=later.attach(ctx as unknown as AudioContext,new Node() as unknown as AudioNode);later.dispose();finish(new ArrayBuffer(8));await pending;expect(later.diagnostics.ready).toBe(false);
  });
  it('uses separate native ability cues, bounded per kind, and clears them with the wave',async()=>{
    const {world,ctx,audio,at}=await setup(),spiritId=world.mechanics.spirits[0]!.id;
    for(const kind of ['pierce','fireburst','stomp'] as const){const event={kind,spiritId,at,targets:[],radius:2};world.events.emit('spiritAbility',event);world.events.emit('spiritAbility',event);expect(played(ctx,kind)).toHaveLength(1);ctx.currentTime+=.2;}
    world.events.emit('phase',{phase:'rest'});expect(audio.diagnostics.activeVoices).toBe(0);audio.dispose();
  });
  it('gives all five union orders their own material and lets a union lead simultaneous fury',async()=>{
    const {world,ctx,audio,at,from,order}=await setup(),spiritId=world.mechanics.spirits[0]!.id;
    for(const element of ['metal','wood','water','fire','earth'] as const){
      ctx.currentTime+=1.3;order();
      world.events.emit('summonTechnique',{kind:'fury',at,from,element});
      const hit={at,from,spiritId,element,radius:3.5,strength:2.8,union:true,echo:false};
      world.events.emit('summonImpact',hit);world.events.emit('summonImpact',hit);
      expect(played(ctx,`union-${element}`)).toHaveLength(1);
    }
    expect(played(ctx,'union-hit')).toHaveLength(0);expect(audio.diagnostics.peakVoices).toBeLessThanOrEqual(SUMMON_AUDIO_VOICES);audio.dispose();
  });
  it('keeps ancestral weight when its union carries a different element',async()=>{
    const {world,ctx,audio,at,from,order}=await setup();
    world.reset();world.chooseDestiny({serial:2,fate:'spirit',tier:'unusual',boon:'beast',roots:['earth']});world.startWave();
    const spiritId=world.mechanics.spirits[0]!.id;order();
    world.events.emit('summonImpact',{at,from,spiritId,element:'water',radius:3.5,strength:2.8,union:true,echo:false});
    expect(played(ctx,'union-beast')).toHaveLength(1);expect(played(ctx,'hit-water')).toHaveLength(1);expect(played(ctx,'union-water')).toHaveLength(0);audio.dispose();
  });
});
