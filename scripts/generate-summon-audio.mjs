import fs from 'node:fs/promises';
import ts from 'typescript';
const src=await fs.readFile(new URL('../src/audio/summon-bank.ts',import.meta.url),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {SUMMON_AUDIO_RATE:rate,SUMMON_CUES,SUMMON_SPRITE,SUMMON_SPRITE_SECONDS,renderSummonCue}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
function wav(samples){const out=Buffer.alloc(44+samples.length*2);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples.length*2,40);samples.forEach((v,i)=>out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));return out;}
const sprite=new Float32Array(Math.ceil(SUMMON_SPRITE_SECONDS*rate)),clips=[];
for(const cue of SUMMON_CUES)for(let variant=0;variant<2;variant++){const samples=renderSummonCue(cue,variant),segment=SUMMON_SPRITE.get(`${cue}:${variant}`);sprite.set(samples,Math.round(segment.offset*rate));clips.push({cue,variant,...segment,peak:samples.reduce((v,n)=>Math.max(v,Math.abs(n)),0),rms:Math.sqrt(samples.reduce((v,n)=>v+n*n,0)/samples.length),head:samples[0],tail:samples.at(-1)});}
await fs.mkdir(new URL('../public/audio/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../public/audio/summon-materials.wav',import.meta.url),wav(sprite));
await fs.mkdir(new URL('../artifacts/summon/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../artifacts/summon/audio-bank-audit.json',import.meta.url),JSON.stringify({rate,seconds:SUMMON_SPRITE_SECONDS,bytes:44+sprite.length*2,clips},null,2),'utf8');
const cues=['focus','move','infuse','hit-metal','hit-wood','hit-water','hit-fire','hit-earth','hit-beast','pierce','fireburst','stomp','ready','union-call','union-metal','union-wood','union-water','union-fire','union-earth','union-beast'];
const reel=new Float32Array(Math.ceil((cues.length*1.35+.4)*rate));cues.forEach((cue,i)=>reel.set(renderSummonCue(cue,0),Math.round((.2+i*1.35)*rate)));
await fs.writeFile(new URL('../artifacts/summon/summon-sound-reel.wav',import.meta.url),wav(reel));
const unionCues=['metal','wood','water','fire','earth','beast'],unionReel=new Float32Array(Math.ceil((unionCues.length*1.35+.4)*rate));
unionCues.forEach((material,i)=>unionReel.set(renderSummonCue(`union-${material}`,0),Math.round((.2+i*1.35)*rate)));
await fs.writeFile(new URL('../artifacts/summon/summon-union-reel.wav',import.meta.url),wav(unionReel));
console.log(JSON.stringify({clips:clips.length,bytes:44+sprite.length*2,seconds:SUMMON_SPRITE_SECONDS,peak:Math.max(...clips.map(c=>c.peak))}));
const restrictionReel=new Float32Array(Math.ceil(1.6*rate));restrictionReel.set(renderSummonCue('blocked',0),Math.round(.15*rate));restrictionReel.set(renderSummonCue('freed',0),Math.round(.85*rate));
await fs.writeFile(new URL('../artifacts/summon/summon-restriction-reel.wav',import.meta.url),wav(restrictionReel));
const footsteps=['wood','earth','beast'],footstepReel=new Float32Array(Math.ceil(5.5*rate));
footsteps.forEach((material,n)=>{for(let step=0;step<3;step++)footstepReel.set(renderSummonCue(`step-${material}`,step%2),Math.round((.2+n*1.8+step*.4)*rate));});
await fs.writeFile(new URL('../artifacts/summon/summon-footstep-reel.wav',import.meta.url),wav(footstepReel));
const feastReel=new Float32Array(Math.ceil(2.4*rate));
feastReel.set(renderSummonCue('feed-beast',0),Math.round(.2*rate));feastReel.set(renderSummonCue('feed-beast',1),Math.round(.8*rate));feastReel.set(renderSummonCue('spawn-beast',0),Math.round(1.4*rate));
await fs.writeFile(new URL('../artifacts/summon/summon-feast-reel.wav',import.meta.url),wav(feastReel));
