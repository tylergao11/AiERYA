import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { ArrayAudio, ARRAY_VOICES } from '../src/audio/array-audio';
import { ARRAY_SOUNDS } from '../src/audio/array-catalog';
import { AudioMixer } from '../src/audio/mixer';
import { World } from '../src/game/world';
import type { ArrayEvent } from '../src/game/array-momentum';

class Parameter {value=1;setValueAtTime=vi.fn();linearRampToValueAtTime=vi.fn();setTargetAtTime=vi.fn();cancelScheduledValues=vi.fn();}
class Node {gain=new Parameter();pan=new Parameter();frequency=new Parameter();Q=new Parameter();playbackRate=new Parameter();threshold=new Parameter();knee=new Parameter();ratio=new Parameter();attack=new Parameter();release=new Parameter();connect=vi.fn();disconnect=vi.fn();start=vi.fn();stop=vi.fn();onended:(()=>void)|null=null;buffer:unknown;}
class Context {
  state='suspended';currentTime=1;destination=new Node();sources:Node[]=[];
  createGain=()=>new Node();createDynamicsCompressor=()=>new Node();createStereoPanner=()=>new Node();createWaveShaper=()=>new Node();createBiquadFilter=()=>new Node();
  createBufferSource=()=>{const n=new Node();this.sources.push(n);return n;};
  resume=vi.fn(async()=>{this.state='running';});suspend=vi.fn(async()=>{this.state='suspended';});close=vi.fn(async()=>{this.state='closed';});
  decodeAudioData=vi.fn(async()=>({duration:27.22,length:653280,numberOfChannels:2}));
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
async function setup(unlock=true){
  vi.stubGlobal('AudioContext',Context);vi.stubGlobal('OfflineAudioContext',Context);
  const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'array',tier:'ordinary',boon:'fivefold',roots:['fire']});world.startWave();
  const mixer=new AudioMixer(),load=vi.fn(async(_extension:string)=>new ArrayBuffer(2)),audio=new ArrayAudio(world,mixer,load);
  const emit=(patch:Partial<ArrayEvent>={})=>world.events.emit('arrayEffect',{kind:'release',at:{x:3,z:5},element:'fire',style:'fire',energy:100,label:'焚阵燎原',targets:[{x:4,z:5}],radius:3,...patch});
  if(unlock){await mixer.unlock();await audio.prepare();}
  return {world,mixer,audio,load,emit,context:()=>mixer.context as unknown as Context,dispose:()=>{audio.dispose();mixer.dispose();}};
}

describe('array material audio and lifecycle',()=>{
  it('preparing before user interaction cannot permanently prevent loading',async()=>{
    const a=await setup(false);await a.audio.prepare();a.emit();expect(a.load).not.toHaveBeenCalled();await a.mixer.unlock();await a.audio.prepare();expect(a.audio.diagnostics.loaded).toBe(true);expect(a.audio.diagnostics.played).toBe(0);a.emit();expect(a.audio.diagnostics.played).toBe(1);a.dispose();
  });
  it('tries mp3 after an unsupported ogg and shares a single pending decode',async()=>{
    const a=await setup(false);a.load.mockRejectedValueOnce(Error('codec'));await a.mixer.unlock();await Promise.all([a.audio.prepare(),a.audio.prepare()]);expect(a.load.mock.calls.map(c=>c[0])).toEqual(['ogg','mp3']);expect(a.audio.diagnostics.loaded).toBe(true);a.dispose();
  });
  it('routes ten native/counter styles into distinct sound windows',async()=>{
    const a=await setup(),offsets:number[]=[];
    for(const style of ['metal','wood','water','fire','earth','steam','splinter','rupture','melt','mud'] as const){a.context().currentTime+=1;a.emit({style});const call=a.context().sources.at(-1)!.start.mock.calls[0]!;expect(call[1]).toBe(ARRAY_SOUNDS[style][0].offset);offsets.push(call[1]);}
    expect(new Set(offsets).size).toBe(10);a.dispose();
  });
  it('alternates each material independently of intervening cues',async()=>{
    const a=await setup();a.emit();a.emit({kind:'feed'});a.context().currentTime+=.2;a.emit();const sources=a.context().sources;expect(sources[0]!.start.mock.calls[0]![1]).toBe(ARRAY_SOUNDS.fire[0].offset);expect(sources[2]!.start.mock.calls[0]![1]).toBe(ARRAY_SOUNDS.fire[1].offset);a.dispose();
  });
  it('lets a paid primary interrupt the cooldown of a weaker echo',async()=>{
    const a=await setup();a.emit({kind:'echo'});const before=a.audio.diagnostics.played;a.emit();expect(a.audio.diagnostics.played).toBe(before+1);a.emit();expect(a.audio.diagnostics.played).toBe(before+1);a.dispose();
  });
  it('ignores empty hits and visual-only harmony links, and bounds repeated hits',async()=>{
    const a=await setup();a.emit({targets:[]});a.emit({kind:'transfer',energy:0});expect(a.audio.diagnostics.played).toBe(0);
    for(let i=0;i<200;i++){a.context().currentTime+=.07;a.emit();}expect(a.audio.diagnostics.activeVoices).toBe(ARRAY_VOICES);expect(a.audio.diagnostics.peakVoices).toBe(ARRAY_VOICES);a.dispose();expect(a.audio.diagnostics.activeVoices).toBe(0);
  });
  it('clears active and scheduled voices for pause, mute, zero effects, reset and dispose',async()=>{
    const a=await setup();a.emit({kind:'transfer'});a.emit({kind:'transfer'});a.audio.pause(true);expect(a.audio.diagnostics.activeVoices).toBe(0);expect(a.context().sources.every(n=>n.stop.mock.calls.length===1&&n.disconnect.mock.calls.length===1)).toBe(true);a.emit();expect(a.audio.diagnostics.activeVoices).toBe(0);a.audio.pause(false);
    for(const settings of [{muted:true},{effects:0},{master:0}]){a.mixer.setPreferences({muted:false,effects:1,master:1});a.emit();expect(a.audio.diagnostics.activeVoices).toBe(1);a.mixer.setPreferences(settings);a.emit();expect(a.audio.diagnostics.activeVoices).toBe(0);}
    a.mixer.setPreferences({muted:false,effects:1,master:1});a.emit();a.world.events.emit('reset',undefined);expect(a.audio.diagnostics.activeVoices).toBe(0);a.emit();a.dispose();a.emit();expect(a.audio.diagnostics.activeVoices).toBe(0);
  });
  it('does not play array sounds after switching to another flow',async()=>{
    const a=await setup();a.world.reset();a.world.chooseDestiny({serial:2,fate:'slayer',tier:'ordinary',boon:'three',roots:['metal']});a.world.startWave();a.emit();expect(a.audio.diagnostics.played).toBe(0);a.dispose();
  });
});

describe('shipped array audio atlas',()=>{
  it('contains 32 original nonempty variants, unclipped samples and silent inter-cue gaps',()=>{
    for(const ext of ['ogg','mp3'])expect(statSync(`public/audio/array-spells.${ext}`).size).toBeGreaterThan(10000);
    const wav=readFileSync('artifacts/audio/array-spells.wav'),rate=wav.readUInt32LE(24),channels=wav.readUInt16LE(22),clips=Object.values(ARRAY_SOUNDS).flat();
    expect(clips).toHaveLength(32);expect(channels).toBe(2);let peak=0,gapPeak=0;
    for(let j=0;j<clips.length;j++){
      const clip=clips[j]!,begin=Math.round(clip.offset*rate),end=Math.round((clip.offset+clip.duration)*rate),next=j+1<clips.length?Math.round(clips[j+1]!.offset*rate):(wav.length-44)/(channels*2);let energy=0;
      expect(end).toBeLessThanOrEqual(next);
      for(let i=begin;i<end;i++){const v=Math.abs(wav.readInt16LE(44+i*channels*2));energy+=v*v;peak=Math.max(peak,v);}
      expect(energy/(end-begin)).toBeGreaterThan(1000);
      for(let i=end+1;i<next-1;i++)gapPeak=Math.max(gapPeak,Math.abs(wav.readInt16LE(44+i*channels*2)));
    }
    expect(peak).toBeLessThan(32767);expect(peak).toBeGreaterThan(5000);expect(gapPeak).toBe(0);
    for(const pair of Object.values(ARRAY_SOUNDS)){
      const slices=pair.map(c=>wav.subarray(44+Math.round(c.offset*rate)*channels*2,44+Math.round((c.offset+c.duration)*rate)*channels*2));expect(slices[0]!.equals(slices[1]!)).toBe(false);
    }
  });
});
