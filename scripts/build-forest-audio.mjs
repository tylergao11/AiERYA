/** Original score and sound design with CC0 VSCO instrument notes and synthesis.
 * 48 bars, 96 BPM, open D major pentatonic. Three phase-aligned stems and a cue atlas.
 * Run: node scripts/build-forest-audio.mjs (FFmpeg on PATH or FFMPEG).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public/audio'), work = path.join(root, 'artifacts/audio');
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(work, { recursive: true });
const SR = 24000, TAU = Math.PI * 2, beat = .625, bar = beat * 4, length = bar * 48;
let seed = 0x124ec09;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noise = () => random() * 2 - 1;
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const sources=JSON.parse(fs.readFileSync(path.join(output,'instrument-sources.json'),'utf8'));
const instruments=sources.entries.map(entry=>{
  const bytes=fs.readFileSync(path.join(work,'instruments',`${entry.name}.f32`));
  return {...entry,data:new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4)};
});
const creatureSources=JSON.parse(fs.readFileSync(path.join(output,'creature-sources.json'),'utf8'));
const creatures=creatureSources.samples.map(entry=>{const bytes=fs.readFileSync(path.join(work,'instruments',`${entry.name}.f32`));return {...entry,data:new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4)};});
function acoustic(c,at,family,midi,duration,pan,gain,rateOverride){
  const candidates=instruments.filter(s=>s.name.startsWith(family));
  const instrument=candidates.sort((a,b)=>Math.abs(a.midi-midi)-Math.abs(b.midi-midi))[0];
  if(!instrument)throw Error(`Missing instrument ${family}; run scripts/fetch-forest-instruments.mjs`);
  const speed=rateOverride??2**((midi-instrument.midi)/12),samples=instrument.data;
  c.put(at,duration,pan,(t,i)=>{
    const atSample=i*speed, index=Math.floor(atSample),blend=atSample-index;
    const value=(samples[index]??0)*(1-blend)+(samples[index+1]??0)*blend;
    return value/Math.max(.015,instrument.peak)*gain*smooth((duration-t)/Math.min(.22,duration*.28));
  });
}
function canvas(seconds, circular = false) {
  const n = Math.round(seconds * SR), channels = [new Float32Array(n), new Float32Array(n)];
  const put = (start, duration, pan, sound) => {
    const offset = Math.round(start * SR), count = Math.round(duration * SR);
    const gl = Math.sqrt((1 - pan) * .5), gr = Math.sqrt((1 + pan) * .5);
    for (let i = 0; i < count; i++) {
      let at = offset + i; if (circular) at = ((at % n) + n) % n;
      if (at < 0 || at >= n) continue;
      const sample = sound(i / SR, i) * smooth(i / 80) * smooth((count - i) / 160);
      channels[0][at] += sample * gl; channels[1][at] += sample * gr;
    }
  };
  return { channels, n, seconds, circular, put };
}
function flute(c, at, midi, duration, pan = -.2, gain = .15) {
  acoustic(c,at,'flute',midi,duration,pan,gain*1.2);
  gain*=.13; // A quiet breath layer softens the orchestral flute toward the night palette.
  const f = hz(midi); let air = 0, phase = 0;
  c.put(at, duration, pan, t => {
    air = air * .72 + noise() * .28;
    const vibrato = Math.sin(TAU * 4.7 * t) * .003 * smooth((t - .18) * 3);
    phase += TAU * f / SR * (1 + vibrato - .012 * Math.exp(-t * 18));
    const envelope = smooth(t / .12) * smooth((duration - t) / .25);
    return (Math.sin(phase) + .19 * Math.sin(phase * 2) + .05 * Math.sin(phase * 3) + air * .16) * gain * envelope;
  });
}
function strings(c, at, midi, duration, pan, gain, pulse = false) {
  acoustic(c,at,pulse?(midi>=65?'violin':'spic'):'cello',midi,duration,pan,gain*(pulse?1.9:2.2));
  gain*=.08;
  const f = hz(midi), phases = [random()*6,random()*6,random()*6];
  c.put(at, duration, pan, t => {
    let v = 0;
    for (let voice = 0; voice < 3; voice++) {
      phases[voice] += TAU * f / SR * (1 + (voice - 1) * .003 + .0012 * Math.sin(t * 24 + voice));
      const p = phases[voice];
      v += Math.sin(p) + .3 * Math.sin(2*p) + .16 * Math.sin(3*p) + .075 * Math.sin(4*p);
    }
    const e = smooth(t / (pulse ? .035 : .7)) * smooth((duration - t) / (pulse ? .12 : .8));
    return v / 3 * gain * e * (pulse ? Math.exp(-t * 3.5) : .88 + .12*Math.sin(t*2));
  });
}
function pluck(c, at, midi, pan, gain = .22) {
  const size = Math.round(SR / hz(midi)), ring = Float32Array.from({length:size}, noise); let index = 0, previous = 0;
  c.put(at, 2.8, pan, t => { const v = ring[index]; ring[index] = (v + previous) * .497; previous = v; index = (index + 1) % size; return v * gain * Math.exp(-t * .5); });
}
function drum(c, at, gain = .3, pitch = 57, pan = 0) {
  acoustic(c,at,'timpani',45,1.4,pan,gain*.55,pitch/74);
  let membrane = 0;
  c.put(at, 1.4, pan, t => {
    membrane = membrane * .65 + noise() * .35;
    const p = TAU * (pitch * t + 2.1 * (1 - Math.exp(-t*28)));
    return gain * (Math.sin(p)*Math.exp(-t*5) + .32*Math.sin(p*1.51)*Math.exp(-t*9) + membrane*.28*Math.exp(-t*34));
  });
}
function gong(c, at, midi, gain = .15, duration = 4, pan = .1) {
  acoustic(c,at,'gong',48,duration,pan,gain*.85,.8+Math.min(1,midi/96)*.2);
  const f = hz(midi);
  c.put(at, duration, pan, t => [1,1.49,2.08,2.73,3.81].reduce((sum,r,i) => sum + Math.sin(TAU*f*r*t + .2*Math.sin(t*9)) * Math.exp(-t*(.65+i*.31)) / (1+i*1.7),0) * gain);
}
function rush(c, at, duration, gain = .35, pan = 0) {
  let low = 0;
  c.put(at, duration, pan, t => { low = .83*low + .17*noise(); return low * Math.sin(Math.PI*t/duration)**1.5 * gain; });
}
// Sustained bowing with a soft onset; no pitch dive or clock-like plucked ostinato.
function heldString(c, at, midi, duration, pan, gain) {
  const instrument=[...instruments.filter(s=>s.name.startsWith('cello'))].sort((a,b)=>Math.abs(a.midi-midi)-Math.abs(b.midi-midi))[0];
  const speed=2**((midi-instrument.midi)/12), samples=instrument.data;
  c.put(at,duration,pan,(t,i)=>{
    const p=i*speed,j=Math.floor(p),u=p-j;
    const value=(samples[j]??0)*(1-u)+(samples[j+1]??0)*u;
    return value/instrument.peak*gain*smooth(t/.7)*smooth((duration-t)/.9);
  });
}
function dryDrum(c, at, gain, pitch=64, pan=0) {
  acoustic(c,at,'timpani',45,.48,pan,gain*.34,pitch/74);
  let air=0;
  c.put(at,.5,pan,t=>{
    air=air*.55+noise()*.45;
    return gain*(Math.sin(TAU*(pitch*t+.24*(1-Math.exp(-t*60))))*Math.exp(-t*14)+air*.25*Math.exp(-t*70));
  });
}
function texture(c,at,duration,gain,kind='wood',pan=0) {
  let low=0,previous=0;
  c.put(at,duration,pan,t=>{
    const n=noise();low=low*.82+n*.18;
    const v=kind==='metal'?n-previous:kind==='earth'?low:kind==='water'?low*.7+n*.12:n*.3+low*.4;
    previous=n;
    return v*gain*Math.exp(-t*(kind==='earth'?22:kind==='metal'?42:32));
  });
}
function beast(c, at, duration, pitch = 96, gain = .23, howl = false) {
  const name=howl?'wolf-monster':pitch<110?'dog-growl':pitch<200?'dog-snarl':'dog-grumble';
  const animal=creatures.find(s=>s.name===name),speed=Math.max(.68,Math.min(1.4,pitch/150));
  c.put(at,duration,-.1,(t,i)=>{const atSample=i*speed,index=Math.floor(atSample),blend=atSample-index;return ((animal.data[index]??0)*(1-blend)+(animal.data[index+1]??0)*blend)/Math.max(.02,animal.peak)*gain*1.1*smooth((duration-t)/.08);});
  gain*=.075;
  let phase = 0, breath = 0;
  c.put(at, duration, -.1, t => {
    const u = t/duration, f = pitch * (howl ? 1 + .28*Math.sin(Math.PI*u) : 1.24 - .5*u);
    phase += TAU*f/SR; breath = breath*.7 + noise()*.3;
    const voice = Math.sin(phase) + .45*Math.sin(phase*2) + .27*Math.sin(phase*3) + .13*Math.sin(phase*5);
    const growl = howl ? .9 + .1*Math.sin(t*31) : .72+.28*Math.sin(t*105);
    return (voice*.42*growl + breath*(howl?.1:.4)) * gain * Math.sin(Math.PI*u)**.65;
  });
}
function reflections(c, amount) {
  const dry = c.channels.map(v=>v.slice());
  for (const [seconds, gain] of [[.079,.25],[.173,.2],[.311,.13],[.487,.09],[.691,.045]]) {
    const d = Math.round(seconds*SR);
    for (let i=0;i<c.n;i++) { const j=c.circular?(i-d+c.n)%c.n:i-d; if(j>=0){c.channels[0][i]+=dry[1][j]*gain*amount;c.channels[1][i]+=dry[0][j]*gain*amount;} }
  }
}
const reports = [], tracks = {};
function wav(c, file, ceiling = .7, mono = false) {
  let peak = 0, square = 0;
  for(const ch of c.channels) for(const v of ch) peak=Math.max(peak,Math.abs(v));
  const gain = Math.min(1, ceiling/Math.max(.001,peak)), count=mono?1:2, data=Buffer.alloc(44+c.n*count*2);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(count,22);data.writeUInt32LE(SR,24);data.writeUInt32LE(SR*count*2,28);data.writeUInt16LE(count*2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(c.n*count*2,40);
  let outPeak=0;
  for(let i=0;i<c.n;i++)for(let channel=0;channel<count;channel++){
    const v=(mono?(c.channels[0][i]+c.channels[1][i])*.707:c.channels[channel][i])*gain;
    const s=Math.max(-.98,Math.min(.98,v)); outPeak=Math.max(outPeak,Math.abs(s));square+=s*s;data.writeInt16LE(Math.round(s*32767),44+(i*count+channel)*2);
  }
  fs.writeFileSync(file,data);
  return {seconds:c.seconds,channels:count,peakDb:20*Math.log10(outPeak),rmsDb:20*Math.log10(Math.sqrt(square/(c.n*count)))};
}
function save(name,c,{reverb=0,mono=false}={}) {
  if(reverb)reflections(c,reverb);
  const source=path.join(work,`${name}.wav`), report=wav(c,source,.68,mono);
  for(const [ext,codec] of [['ogg',['-c:a','libvorbis','-q:a','4']],['mp3',['-c:a','libmp3lame','-b:a',mono?'64k':'96k']]])
    execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,...codec,path.join(output,`${name}.${ext}`)],{windowsHide:true});
  reports.push({name,...report});tracks[name]={seconds:c.seconds,channels:report.channels};
  process.stdout.write(`${name}: ${c.seconds}s, peak ${report.peakDb.toFixed(1)} dBFS\n`);
}
// Open, resolute harmony. Quiet phases hear only this breathable, non-percussive layer.
const voicings=[[50,57,64],[50,59,66],[55,62,69],[57,64,71],[50,57,66],[50,57,64]];
const phrases=[[62,66,69,71,69],[64,69,74,71,69],[66,69,71,74,76],[69,71,74,71,66],[64,66,69,74,71],[69,66,64,69,62]];
const bed=canvas(length,true), tension=canvas(length,true), drums=canvas(length,true);
const rhythms=[[0,1.5,3],[0,2.5],[.5,2,3.5],[0,1.75,3.25],[0,2],[.75,2.5,3.5]];
for(let b=0;b<48;b++){
  const at=b*bar,section=Math.floor(b/8),chord=voicings[section],local=b%8;
  if(b%2===0){
    heldString(bed,at-.15,chord[0],5.7,-.3,.057);
    heldString(bed,at+.2,chord[1],5.3,.35,.038);
    if(local===2||local===6)heldString(bed,at+.45,chord[2],4.6,.1,.024);
  }
  if(local===2){
    const phrase=phrases[section];
    for(let j=0;j<phrase.length;j++)acoustic(bed,at+[.3,1.55,2.6,4.1,5.5][j],'flute',phrase[j],j===4?2.1:1.25,j%2?.18:-.15,.053);
  }
  // Eight-bar breathing points and varied accents prevent an endless two-hit thump.
  if(local!==7){
    const pattern=rhythms[(section+local)%rhythms.length];
    for(const [i,p]of pattern.entries())dryDrum(drums,at+p*beat+(i?random()*.018:0),i===0?.19:.10+random()*.025,i===0?64:91,i%2?.18:-.12);
    if(local===3||local===6)texture(drums,at+beat*3.75,.18,.12,'wood',.25);
  }else {texture(drums,at+beat*.5,.18,.09,'wood',-.2);if(section%2)dryDrum(drums,at+beat*3.5,.09,94,.2);}
  const figures=[[0,2,4,7],[0,3,5],[1,4,6],[0,2,5,7]];
  if(local!==7)for(const [i,n]of figures[(b+section)%4].entries()){
    const midi=[chord[0]+12,chord[1]+12,chord[0]+24,chord[2]][(i+section)%4];
    strings(tension,at+n*beat*.5+(i?random()*.012:0),midi,.32,i%2?.3:-.3,i===0?.067:.046,true);
  }
  if(local===6){heldString(tension,at+.2,chord[1]+12,3.4,.1,.04);rush(tension,at+bar*.9,bar*.65,.05);}
}
save('night-theme',bed,{reverb:.45});save('war-drums',drums,{reverb:.13,mono:true});save('tightening-strings',tension,{reverb:.25,mono:true});
// Independently looped ambience; periodic modulation and a seam crossfade.
for(const kind of ['wind','river','embers']){
  const c=canvas(12,true); let slow=0,fast=0;
  c.put(0,12,kind==='river'?.6:kind==='embers'?-.18:0,t=>{
    slow=slow*.994+noise()*.006;fast=fast*.73+noise()*.27;
    if(kind==='wind')return slow*(.36+.15*Math.sin(TAU*t/12)) + fast*.008;
    if(kind==='river')return fast*.055*(.9+.1*Math.sin(TAU*t/4))+slow*.1;
    return slow*.12+fast*.013;
  });
  if(kind==='embers')for(let i=0;i<30;i++){const at=random()*12;c.put(at,.06+random()*.12,-.3+random()*.3,t=>noise()*.035*Math.exp(-t*65));}
  // Quiet, smooth loop boundary; no discontinuity from joining unrelated noise samples.
  const seam=Math.round(SR*.06);
  for(const ch of c.channels)for(let i=0;i<seam;i++){ch[i]*=smooth(i/seam);ch[c.n-1-i]*=smooth(i/seam);}
  save(kind,c);
}
const atlas=canvas(48), cues={};let cursor=.1;
function cue(name,duration,build){
  cues[name]={offset:Number(cursor.toFixed(4)),duration};
  const clip=canvas(duration);build(clip,0);
  const offset=Math.round(cursor*SR);
  for(let ch=0;ch<2;ch++)for(let i=0;i<clip.n;i++)atlas.channels[ch][offset+i]=clip.channels[ch][i]*smooth((clip.n-i)/(SR*.035));
  cursor+=duration+.12;
}
cue('ui',.18,(c,t)=>texture(c,t,.14,.13,'wood'));
cue('choose',.6,(c,t)=>{texture(c,t,.12,.14,'wood');pluck(c,t+.06,81,.1,.08);});
cue('repair',.8,(c,t)=>{texture(c,t,.2,.22,'wood');texture(c,t+.16,.2,.13,'wood',.15);rush(c,t+.15,.55,.1);});
cue('reward',2.3,(c,t)=>{[62,69,74,78].forEach((n,i)=>pluck(c,t+i*.16,n,(i-1.5)*.15,.13));rush(c,t+.3,.6,.06);});
cue('victory',5.2,(c,t)=>{dryDrum(c,t,.2,65);[62,66,69,74,78,81].forEach((n,i)=>pluck(c,t+i*.22,n,(i%2?1:-1)*.25,.17));heldString(c,t+.3,50,4.6,-.25,.10);heldString(c,t+.3,57,4.6,.25,.07);acoustic(c,t+1.2,'flute',81,2.7,.1,.06);});
cue('defeat',2.4,(c,t)=>{texture(c,t,.25,.22,'earth');heldString(c,t,50,2.3,.1,.10);rush(c,t,.65,.1);});
cue('camp-hit',.3,(c,t)=>{texture(c,t,.25,.45,'wood');texture(c,t+.02,.24,.22,'earth');});
cue('danger',.85,(c,t)=>{rush(c,t,.65,.2);texture(c,t+.12,.22,.23,'wood');});
cue('footstep',.16,(c,t)=>texture(c,t,.13,.15,'earth'));
cue('bite',.48,(c,t)=>{beast(c,t,.32,122,.12);rush(c,t+.12,.12,.32);});
cue('wolf-death',.65,(c,t)=>{beast(c,t,.49,175,.13);rush(c,t+.2,.18,.15);});
cue('elite-death',1.1,(c,t)=>{beast(c,t,.8,94,.24);drum(c,t+.35,.16,77);});
cue('king',2.6,(c,t)=>{beast(c,t,2.3,61,.35,true);gong(c,t+.1,38,.16,2.4);});
cue('swift',.55,(c,t)=>rush(c,t,.5,.4));
cue('giant',.65,(c,t)=>{drum(c,t,.27,49);rush(c,t+.03,.3,.2);});
cue('regen',.6,(c,t)=>{rush(c,t,.55,.1);texture(c,t+.04,.3,.025,'metal',.15);});
cue('rage',1.3,(c,t)=>beast(c,t,1.15,84,.31));
cue('split',.85,(c,t)=>{rush(c,t,.2,.6);beast(c,t+.14,.38,235,.13);beast(c,t+.3,.36,280,.1);});
cue('howl',2,(c,t)=>beast(c,t,1.85,159,.19,true));
cue('seal',1.5,(c,t)=>{gong(c,t,50,.12,1.4);rush(c,t+.1,1.1,.12);});
cue('break',1.25,(c,t)=>{drum(c,t,.4,42);rush(c,t,.48,.55);gong(c,t,45,.08,1.2);});
cue('interrupt',.55,(c,t)=>{rush(c,t,.12,.25);pluck(c,t,86,0,.17);});
cue('formation-set',.45,(c,t)=>{texture(c,t,.24,.22,'wood');rush(c,t+.03,.35,.14);});
for(const kind of ['metal','wood','water','fire','earth'])cue(`invoke-${kind}`,.48,(c,t)=>{
  rush(c,t,.32,kind==='fire'?.25:.16);texture(c,t+.08,.25,kind==='metal'?.1:.22,kind);
});
cue('impact',.2,(c,t)=>texture(c,t,.16,.18,'wood'));
cue('time-stop',1.1,(c,t)=>{rush(c,t,.8,.35);texture(c,t+.5,.32,.04,'metal');});
cue('time-release',1,(c,t)=>{dryDrum(c,t,.3,59);rush(c,t,.48,.4);texture(c,t+.03,.22,.18,'wood');});
// Truncate the atlas to its actual content; cues never include their neighbour.
atlas.seconds=cursor;atlas.n=Math.round(cursor*SR);atlas.channels=atlas.channels.map(v=>v.slice(0,atlas.n));save('forest-cues',atlas,{mono:true});
fs.mkdirSync(path.join(root,'src/audio'),{recursive:true});
const revision=createHash('sha256');for(const name of Object.keys(tracks))revision.update(fs.readFileSync(path.join(output,`${name}.ogg`)));
fs.writeFileSync(path.join(root,'src/audio/catalog.ts'),`// Generated by scripts/build-forest-audio.mjs. Original score; CC0 instrument credits in public/audio.\nexport const AUDIO_REVISION = '${revision.digest('hex').slice(0,12)}';\nexport const AUDIO_TRACKS = ${JSON.stringify(tracks,null,2)} as const;\nexport const SOUND_CUES = ${JSON.stringify(cues,null,2)} as const;\nexport type SoundCue = keyof typeof SOUND_CUES;\nexport type AudioTrack = keyof typeof AUDIO_TRACKS;\nexport const SCORE_BAR = ${bar};\n`,'utf8');
fs.writeFileSync(path.join(work,'asset-report.json'),JSON.stringify({sampleRate:SR,bpm:96,barSeconds:bar,seed:'0x124ec09',reports,cues},null,2),'utf8');
// A 33-second listening comparison of the actual stems: quiet -> battle -> pressure.
const demo=canvas(33);for(let i=0;i<demo.n;i++){
  const t=i/SR,d=smooth((t-7)/3)*.7,s=smooth((t-18)/4)*.65;
  for(let ch=0;ch<2;ch++)demo.channels[ch][i]=bed.channels[ch][i]*.7+drums.channels[ch][i]*d+tension.channels[ch][i]*s;
}
wav(demo,path.join(work,'eastern-night-preview.wav'),.78);
process.stdout.write(`Audio catalog: ${Object.keys(cues).length} cues, ${cursor.toFixed(2)}s atlas\n`);
