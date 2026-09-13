import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { AudioMixer } from '../src/audio/mixer';
import { DEFAULT_AUDIO, normalizeAudio, readAudioPreferences, saveAudioPreferences } from '../src/audio/preferences';
import { ForestScore, ScoreDirector, type ScoreState } from '../src/audio/score';
import { AUDIO_TRACKS, SOUND_CUES, type SoundCue } from '../src/audio/catalog';
import { ForestAudio } from '../src/audio/forest-audio';
import { World } from '../src/game/world';
import type { Wolf } from '../src/game/contracts';
import { CAMP } from '../src/game/terrain';
import { Soundscape } from '../src/ui/audio';
import { SlayerAudio } from '../src/ui/slayer-audio';
import { SummonAudio } from '../src/audio/summon-audio';
import { audioShouldPause } from '../src/audio/pause-policy';

class Parameter {value=1;setValueAtTime=vi.fn();linearRampToValueAtTime=vi.fn();setTargetAtTime=vi.fn();cancelScheduledValues=vi.fn();cancelAndHoldAtTime=vi.fn();}
class Node {gain=new Parameter();pan=new Parameter();frequency=new Parameter();Q=new Parameter();playbackRate=new Parameter();threshold=new Parameter();knee=new Parameter();ratio=new Parameter();attack=new Parameter();release=new Parameter();connect=vi.fn();disconnect=vi.fn();start=vi.fn();stop=vi.fn();onended:(()=>void)|null=null;buffer:unknown;}
class Context {
  static instances:Context[]=[];
  constructor(){Context.instances.push(this);}
  state='suspended';currentTime=1;destination=new Node();sources:Node[]=[];
  createGain=()=>new Node();createDynamicsCompressor=()=>new Node();createStereoPanner=()=>new Node();
  createWaveShaper=()=>new Node();
  createBiquadFilter=()=>new Node();
  createBufferSource=()=>{const source=new Node();this.sources.push(source);return source;};
  resume=vi.fn(async()=>{this.state='running';});suspend=vi.fn(async()=>{this.state='suspended';});close=vi.fn(async()=>{this.state='closed';});
  decodeAudioData=vi.fn(async()=>({duration:120,length:2880000,numberOfChannels:1}));
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const state=(patch:Partial<ScoreState>={}):ScoreState=>({phase:'battle',alive:25,nearCamp:0,elites:1,king:false,health:100,wave:1,...patch});
async function mixer(){vi.stubGlobal('AudioContext',Context);vi.stubGlobal('OfflineAudioContext',Context);const m=new AudioMixer();await m.unlock();m.buffers.set('forest-cues',{duration:34} as AudioBuffer);return m;}

describe('global audio preferences and pressure music',()=>{
  it('keeps birth, rewards and result cues running while respecting pause and background tabs',()=>{
    for(const phase of ['destiny','rest','won','lost'] as const){expect(audioShouldPause(phase,true,false,false)).toBe(false);expect(audioShouldPause(phase,true,true,false)).toBe(true);}
    for(const phase of ['prepare','battle'] as const){expect(audioShouldPause(phase,true,false,false)).toBe(true);expect(audioShouldPause(phase,false,false,false)).toBe(false);expect(audioShouldPause(phase,true,false,true)).toBe(false);expect(audioShouldPause(phase,true,true,true)).toBe(true);}
  });
  it('clamps untrusted preferences and survives blocked storage',()=>{
    expect(normalizeAudio({master:9,music:-2,effects:NaN,ambience:'loud',muted:'false'})).toEqual({...DEFAULT_AUDIO,master:1,music:0});
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}});
    expect(readAudioPreferences()).toEqual(DEFAULT_AUDIO);expect(()=>saveAudioPreferences({...DEFAULT_AUDIO,muted:true})).not.toThrow();
  });
  it('persists zero volume and mute explicitly across reads',()=>{
    const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k),setItem:(k:string,v:string)=>data.set(k,v)});
    saveAudioPreferences({...DEFAULT_AUDIO,music:0,muted:true});expect(readAudioPreferences()).toEqual({...DEFAULT_AUDIO,music:0,muted:true});
  });
  it('uses real pressure with hysteresis and immediately obeys game phase',()=>{
    const d=new ScoreDirector();expect(d.update(state(),.1)).toBe('battle');
    for(let i=0;i<70;i++)d.update(state({alive:96,nearCamp:8,elites:6}),.1);
    expect(d.level).toBe('pressure');d.update(state({alive:0,elites:0}),.1);expect(d.level).toBe('pressure');
    for(let i=0;i<100;i++)d.update(state({alive:0,elites:0}),.1);expect(d.level).toBe('battle');
    expect(d.update(state({king:true}),.1)).toBe('king');expect(d.update(state({phase:'rest',king:true}),.1)).toBe('quiet');
    expect(d.update(state({phase:'lost'}),.1)).toBe('lost');d.reset();expect(d.pressure).toBe(0);
  });
});
describe('shared mixer lifecycle and voice pressure',()=>{
  it('a pre-gesture load does not poison subsequent asset loading',async()=>{
    vi.stubGlobal('AudioContext',Context);vi.stubGlobal('OfflineAudioContext',Context);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)})));
    const m=new AudioMixer();expect(await m.load('wind')).toBeNull();await m.unlock();expect(await m.load('wind')).not.toBeNull();m.dispose();
  });
  it('keeps one context across unlocks and routes through separate buses',async()=>{
    const m=await mixer(),context=m.context;await m.unlock();expect(m.context).toBe(context);expect(Object.keys(m.buses).sort()).toEqual(['ambience','effects','music']);m.dispose();expect(context!.state).toBe('closed');
  });
  it('bounds a burst of 200 simultaneous deaths and prioritizes danger',async()=>{
    const m=await mixer();for(let i=0;i<200;i++)m.play('wolf-death',{cooldown:0,priority:0});expect(m.diagnostics.activeVoices).toBe(18);expect(m.diagnostics.dropped).toBe(182);
    expect(m.play('danger',{priority:5})).toBe(true);expect(m.diagnostics.activeVoices).toBe(18);m.stopEffects();expect(m.diagnostics.activeVoices).toBe(0);m.dispose();
  });
  it('does not emit muted/paused cues or replay stopped cues on resume',async()=>{
    const m=await mixer();m.play('king');m.pause(true);expect(m.diagnostics.activeVoices).toBe(0);expect(m.play('bite')).toBe(false);m.pause(false);await Promise.resolve();expect(m.play('bite')).toBe(true);m.setPreferences({muted:true});expect(m.play('danger')).toBe(false);m.dispose();await m.unlock();expect(m.context!.state).toBe('closed');
  });
  it('drops low priority sounds when all voices are more important',async()=>{
    const m=await mixer();for(let i=0;i<18;i++)m.play('king',{cooldown:0,priority:5});expect(m.play('footstep',{priority:0})).toBe(false);m.dispose();
  });
  it('zero master or effects clears current cues before volume is restored',async()=>{
    const m=await mixer();
    for(const patch of [{master:0},{effects:0}]){
      m.setPreferences({master:1,effects:1});expect(m.play('king')).toBe(true);
      m.setPreferences(patch);expect(m.diagnostics.activeVoices).toBe(0);expect(m.play('danger')).toBe(false);
      m.setPreferences({master:1,effects:1});expect(m.diagnostics.activeVoices).toBe(0);
    }
    m.dispose();
  });
  it('decodes each asset once and tries a fallback after codec failure',async()=>{
    const m=await mixer();Context.instances.at(-1)!.decodeAudioData.mockRejectedValueOnce(Error('codec'));
    const fetch=vi.fn(async(_url:string)=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)}));vi.stubGlobal('fetch',fetch);
    const [a,b]=await Promise.all([m.load('wind'),m.load('wind')]);expect(a).toBe(b);expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls[0]![0]).toContain('.ogg');expect(fetch.mock.calls[1]![0]).toContain('.mp3');m.dispose();
  });
  it('failed media stays non-blocking and retries on a later gesture',async()=>{
    const m=await mixer();const fetch=vi.fn(async()=>({ok:false,arrayBuffer:async()=>new ArrayBuffer(2)}));vi.stubGlobal('fetch',fetch);
    expect(await m.load('wind')).toBeNull();expect(m.diagnostics.failed).toEqual(['wind']);
    fetch.mockResolvedValue({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});await m.unlock();await m.load('wind');expect(m.diagnostics.failed).toEqual([]);expect(m.buffers.has('wind')).toBe(true);m.dispose();
  });
  it('late music stems join the same musical clock and never duplicate loops',async()=>{
    const m=await mixer(),ctx=m.context as unknown as Context;
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)})));
    const score=new ForestScore(m);await Promise.all(['night-theme','war-drums','tightening-strings','wind','river','embers'].map(name=>m.load(name as keyof typeof AUDIO_TRACKS)));
    expect(ctx.sources).toHaveLength(6);const starts=ctx.sources.map(s=>s.start.mock.calls[0]!);expect(starts.every(s=>Math.abs(Number(s[0])-Number(s[1])-1.06)<.00001)).toBe(true);
    score.update(state(),.1);score.reset();score.update(state({phase:'prepare'}),.1);expect(ctx.sources).toHaveLength(6);score.dispose();expect(ctx.sources.every(s=>s.stop.mock.calls.length===1)).toBe(true);m.dispose();
  });
});
describe('audio assets are complete and their cue atlas is isolated',()=>{
  it('ships both codecs and three aligned two-minute music stems',()=>{
    for(const name of Object.keys(AUDIO_TRACKS))for(const extension of ['ogg','mp3'])expect(statSync(`public/audio/${name}.${extension}`).size).toBeGreaterThan(1000);
    for(const name of ['night-theme','war-drums','tightening-strings'] as const)expect(AUDIO_TRACKS[name].seconds).toBe(120);
  });
  it('keeps every cue inside its own non-overlapping window with silent gaps',()=>{
    const wav=readFileSync('artifacts/audio/forest-cues.wav'),rate=wav.readUInt32LE(24),channels=wav.readUInt16LE(22);
    const clips=Object.values(SOUND_CUES);for(let n=0;n<clips.length;n++){
      const cue=clips[n]!,end=cue.offset+cue.duration,next=n+1<clips.length?clips[n+1]!.offset:AUDIO_TRACKS['forest-cues'].seconds;
      expect(end).toBeLessThanOrEqual(next);let energy=0;
      for(let i=Math.round(cue.offset*rate);i<Math.floor(end*rate);i++)energy+=Math.abs(wav.readInt16LE(44+i*channels*2));expect(energy).toBeGreaterThan(100);
      for(let i=Math.ceil(end*rate)+1;i<Math.floor(next*rate)-1;i++)expect(wav.readInt16LE(44+i*channels*2)).toBe(0);
    }
  });
});
describe('enemy audio observes actual actions and keeps flow audio ownership',()=>{
  const wolf=():Wolf=>({id:900,x:-6,z:4,kind:'elite',hp:100,maxHp:100,speed:2,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null});
  function fixture(){const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'spirit',boon:'twins',roots:['water'],tier:'ordinary'});world.startWave();const m=new AudioMixer();const play=vi.spyOn(m,'play');const host=new EventTarget() as HTMLElement;const forest=new ForestAudio(world,m,host);return {world,m,play,forest};}
  it('only sounds rage on threshold entry and regeneration when HP actually rises',()=>{
    const {world,m,play,forest}=fixture(),a=wolf();a.affixes=['rage','regen'];world.wolves=[a];forest.update(.1,.1);expect(play).not.toHaveBeenCalled();a.hp=39;forest.update(.1,.1);expect(play.mock.calls.filter(v=>v[0]==='rage')).toHaveLength(1);
    for(let i=0;i<20;i++)forest.update(.1,.1);expect(play.mock.calls.filter(v=>v[0]==='rage')).toHaveLength(1);a.hp=40;forest.update(.1,.1);expect(play.mock.calls.filter(v=>v[0]==='regen')).toHaveLength(1);forest.dispose();m.dispose();
  });
  it('emits split once only on actual spawned children and no duplicate flow sounds',()=>{
    const {world,m,play,forest}=fixture(),a=wolf();a.affixes=['split'];world.wolves=[a];world.hitRogue(a,1000,'metal',{kind:'trigger',noProc:true});expect(play.mock.calls.filter(v=>v[0]==='split')).toHaveLength(1);
    play.mockClear();world.events.emit('slayerFinisher',{at:{x:0,z:0},element:'metal'});world.events.emit('summonReady',undefined);expect(play).not.toHaveBeenCalled();forest.dispose();m.dispose();
  });
  it('does not sound a released enemy spell after a successful interruption',()=>{
    const {world,m,play,forest}=fixture(),a=wolf();a.eliteSkill='call';world.wolves=[a];world.enemyAbilities.tick(3);expect(play.mock.calls.map(v=>v[0] as SoundCue)).toContain('howl');
    play.mockClear();expect(world.enemyAbilities.interrupt(a.id,1)).toBe(true);world.enemyAbilities.tick(1.3);expect(play.mock.calls.map(v=>v[0])).toEqual(['interrupt']);forest.dispose();m.dispose();
  });
  it('repair sound requires a successful currency transaction',()=>{
    const {world,m,play,forest}=fixture();world.phase='prepare';world.health=80;world.spirit=29;
    expect(world.repairCamp()).toBe(false);expect(play).not.toHaveBeenCalled();world.spirit=30;
    expect(world.repairCamp()).toBe(true);expect(world.health).toBe(100);expect(world.spirit).toBe(0);expect(play.mock.calls.map(v=>v[0])).toEqual(['repair']);forest.dispose();m.dispose();
  });
  it('a stable low-health camp does not repeatedly alarm, but further damage can alert again',()=>{
    const {world,m,play,forest}=fixture(),a=wolf();a.x=CAMP.x+1;a.z=CAMP.z;world.wolves=[a];world.health=30;
    forest.update(.1,.1);expect(play.mock.calls.filter(v=>v[0]==='danger')).toHaveLength(1);
    for(let i=0;i<600;i++)forest.update(.1,.1);
    expect(play.mock.calls.filter(v=>v[0]==='danger')).toHaveLength(1);
    world.health=20;forest.update(.1,.1);expect(play.mock.calls.filter(v=>v[0]==='danger')).toHaveLength(2);
    world.events.emit('reset',undefined);forest.update(.1,.1);expect(play.mock.calls.filter(v=>v[0]==='danger')).toHaveLength(3);
    forest.dispose();m.dispose();
  });
});

describe('shared soundscape does not duplicate flow-owned contacts',()=>{
  it('keeps rapid hits silent in all three flow bridges, with dry feedback only in the legacy prototype',()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('fixture does not load media');}));
    const world=new World({roguelike:true}),m=new AudioMixer(),play=vi.spyOn(m,'play'),sound=new Soundscape(world,m);
    for(const fate of ['slayer','array','spirit'] as const){
      world.reset();world.chooseDestiny({serial:1,fate,tier:'ordinary',boon:fate==='slayer'?'three':fate==='array'?'fivefold':'twins',roots:['fire']});play.mockClear();
      for(let i=0;i<100;i++)world.events.emit('hit',{} as never);
      expect(play).not.toHaveBeenCalled();
    }
    world.reset();play.mockClear();world.events.emit('hit',{} as never);
    expect(play.mock.calls.map(v=>v[0])).toEqual(['impact']);sound.dispose();
  });
  it('zero effects and zero master also mute both attached skill players',()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('fixture does not load media');}));
    const slayer=vi.spyOn(SlayerAudio.prototype,'mute'),summon=vi.spyOn(SummonAudio.prototype,'mute');
    const m=new AudioMixer(),sound=new Soundscape(new World(),m);
    for(const patch of [{effects:0},{master:0},{muted:true}]){
      m.setPreferences({effects:1,master:1,muted:false});m.setPreferences(patch);
      expect(slayer).toHaveBeenLastCalledWith(true);expect(summon).toHaveBeenLastCalledWith(true);
    }
    m.setPreferences({effects:1,master:1,muted:false});expect(slayer).toHaveBeenLastCalledWith(false);expect(summon).toHaveBeenLastCalledWith(false);sound.dispose();
  });
});
