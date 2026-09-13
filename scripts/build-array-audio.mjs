/** Original deterministic material sounds for the array flow. No sampled audio.
 * Run with Node and FFmpeg. Also emits the exact runtime sprite offsets. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'public/audio'),work=path.join(root,'artifacts/audio');
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(work,{recursive:true});
const SR=24000,TAU=Math.PI*2;
const lengths={metal:.72,wood:.7,water:.92,fire:.82,earth:1.1,steam:1,splinter:.78,rupture:.95,melt:1,mud:.94,ready:.4,transfer:.38,harmony:1.5,echo:.6,remnant:.5,mark:.34};
let seed=1;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);const noise=()=>random()*2-1;
function clip(seconds){return [new Float32Array(Math.ceil(seconds*SR)),new Float32Array(Math.ceil(seconds*SR))];}
function add(c,at,duration,pan,fn){
  const start=Math.round(at*SR),n=Math.round(duration*SR),left=Math.sqrt((1-pan)/2),right=Math.sqrt((1+pan)/2);
  for(let i=0;i<n;i++){const k=start+i;if(k<0||k>=c[0].length)continue;const t=i/SR,edge=Math.min(1,i/24,(n-i)/180),v=fn(t,i)*edge;c[0][k]+=v*left;c[1][k]+=v*right;}
}
function tone(c,at,duration,pan,hz,gain,decay=6,bend=0){add(c,at,duration,pan,t=>(Math.sin(TAU*(hz*t+bend*(1-Math.exp(-t*32)))/1)+Math.sin(TAU*hz*2.01*t)*.13)*gain*Math.exp(-t*decay));}
function dust(c,at,duration,pan,gain,cutoff,decay=6,high=false){
  let low=0;add(c,at,duration,pan,t=>{const sample=noise(),f=Array.isArray(cutoff)?cutoff[0]+(cutoff[1]-cutoff[0])*Math.min(1,t/duration):cutoff;
    low+=(sample-low)*(1-Math.exp(-TAU*f/SR));const v=high?sample-low:low;return v*gain*Math.exp(-t*decay)*Math.min(1,t/.003);});
}
function thud(c,at,pitch,gain,pan=0){tone(c,at,.55,pan,pitch,gain,9,2.4);tone(c,at,.27,pan,pitch*2.08,gain*.4,15,.9);dust(c,at,.08,pan,gain*.45,1900,35);}
function blade(c,at,gain,pan=0){
  dust(c,at,.19,pan,gain*.44,[4200,1200],16,true);
  for(const [i,ratio]of [1,1.49,2.71,3.89].entries())tone(c,at,.65,pan,587*ratio,gain*.22/(1+i),5+i*4,.16);
  add(c,at,.2,pan,t=>Math.sin(TAU*(2300*t-1700*t*t))*Math.sin(Math.PI*t/.2)*Math.exp(-t*11)*gain*.13);
}
function branches(c,at,gain){
  thud(c,at,92,gain*.42);
  for(let i=0;i<6;i++){const p=(i%2?-.55:.55),delay=at+i*.031;dust(c,delay,.085,p,gain*(.72-i*.07),[3100,650],30);tone(c,delay,.14,p,180+i*47,gain*.14,22,.8);}
  dust(c,at+.05,.42,-.1,gain*.33,[800,150],9);
}
function water(c,at,gain){
  let low=0;add(c,at,.78,-.25,t=>{low+=(noise()-low)*.13;return low*gain*(.12+Math.sin(Math.PI*t/.78)**2)*Math.exp(-t*1.8);});
  for(let i=0;i<9;i++){const delay=at+.035+i*.037,f=240+random()*650;tone(c,delay,.16,(random()-.5)*1.1,f,gain*.075,21,1.5);}
  thud(c,at+.09,78,gain*.38);dust(c,at+.16,.64,.3,gain*.34,[3200,650],4,true);
}
function flame(c,at,gain){
  thud(c,at,58,gain*.75);dust(c,at,.52,0,gain*.9,[1600,340],7);
  for(let i=0;i<13;i++)dust(c,at+.025+i*.026,.037,(random()-.5)*1.3,gain*(.16+random()*.1),5200,60,true);
  dust(c,at+.12,.48,-.35,gain*.24,[3300,1100],5,true);
}
function stone(c,at,gain){
  thud(c,at,43,gain);tone(c,at,.8,0,116,gain*.26,5,.8);
  for(let i=0;i<8;i++){const d=at+.02+i*.054;dust(c,d,.12,(i%2?-.6:.6),gain*(.54-i*.047),[2000-i*140,260],22);tone(c,d,.18,0,120+i*27,gain*.09,18,.4);}
  dust(c,at+.08,.87,0,gain*.32,[620,100],5);
}
function chime(c,at,f,gain,duration=.55,pan=0){for(const [i,r]of [1,2,2.98,4.1].entries())tone(c,at,duration,pan,f*r,gain/(1+i*3),5+i*4,0);}
function make(cue,variant){
  seed=0x15a43+Object.keys(lengths).indexOf(cue)*171+variant*79;const c=clip(lengths[cue]),g=.62,shift=variant*.009;
  switch(cue){
    case 'metal':blade(c,0,g,-.36);blade(c,.06+shift,g*.7,.42);thud(c,.025,94,g*.27);break;
    case 'wood':branches(c,0,g);break;
    case 'water':water(c,0,g);break;
    case 'fire':flame(c,0,g);break;
    case 'earth':stone(c,0,g);break;
    case 'steam':water(c,0,g*.55);flame(c,.075,g*.35);dust(c,.075,.85,.1,g*.75,[4200,1800],2.8,true);break;
    case 'splinter':branches(c,0,g*.68);blade(c,.035,g*.8,-.4);blade(c,.095,g*.5,.4);break;
    case 'rupture':stone(c,0,g*.65);branches(c,.085,g*.9);break;
    case 'melt':flame(c,0,g*.65);blade(c,.045,g*.6);for(let i=0;i<4;i++)tone(c,.13+i*.036,.55,i%2?.3:-.3,440*(1-i*.14),g*.12,5,.7);break;
    case 'mud':water(c,0,g*.52);stone(c,.055,g*.4);tone(c,.04,.5,0,110,g*.25,7,2.8);dust(c,.12,.62,0,g*.25,280,4);break;
    case 'ready':chime(c,0,587,.13,.4);chime(c,.03+shift,880,.05,.33,variant?-.25:.25);break;
    case 'transfer':chime(c,0,293.665,.2,.38);dust(c,0,.23,variant?-.25:.25,.075,[2100,600],8,true);break;
    case 'harmony':for(const [i,f]of [146.832,220,293.665,349.228,523.251].entries())chime(c,i*.058,f,.12-i*.012,1.25,i%2?-.35:.35);thud(c,.01,55,.22);dust(c,.1,1.15,0,.1,[1800,100],3);break;
    case 'echo':chime(c,0,440,.15,.55,-.3);chime(c,.12,587,.1,.45,.3);dust(c,0,.26,0,.08,[1500,550],10);break;
    case 'remnant':branches(c,0,g*.3);tone(c,.02,.4,0,174.6,.18,9);break;
    case 'mark':chime(c,0,698.45,.065,.3);dust(c,0,.09,0,.08,1600,28);break;
  }
  // Two short cross-channel early reflections, not a long washing reverb.
  const dry=c.map(a=>a.slice());for(let side=0;side<2;side++)for(const [delay,gain]of [[.037,.09],[.071,.045]]){const offset=Math.round(delay*SR);for(let i=offset;i<c[side].length;i++)c[side][i]+=dry[1-side][i-offset]*gain;}
  let peak=0,sum=0;for(const channel of c){let previous=0,high=0;for(let i=0;i<channel.length;i++){const sample=channel[i];high=.994*(high+sample-previous);previous=sample;channel[i]=Math.tanh(high*1.15)*.88;channel[i]*=Math.min(1,(channel.length-i)/(SR*.055));peak=Math.max(peak,Math.abs(channel[i]));sum+=channel[i]*channel[i];}}
  return {samples:c,peak,rms:Math.sqrt(sum/(c[0].length*2))};
}
function wav(file,channels){const n=channels[0].length,b=Buffer.alloc(44+n*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);for(let i=0;i<n;i++)for(let side=0;side<2;side++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,channels[side][i]))*32767),44+i*4+side*2);fs.writeFileSync(file,b);}
const catalog={},renders=[],report=[];let cursor=0;
for(const cue of Object.keys(lengths)){catalog[cue]=[];for(let variant=0;variant<2;variant++){const rendered=make(cue,variant);catalog[cue].push({offset:cursor,duration:lengths[cue]});renders.push({offset:cursor,rendered});report.push({cue,variant,peak:rendered.peak,rms:rendered.rms});cursor+=lengths[cue]+.06;}}
const bank=clip(cursor);for(const {offset,rendered}of renders){const start=Math.round(offset*SR);for(let side=0;side<2;side++)bank[side].set(rendered.samples[side],start);}
const wavPath=path.join(work,'array-spells.wav');wav(wavPath,bank);
const ffmpeg=process.env.FFMPEG||'ffmpeg';for(const [ext,args]of [['ogg',['-c:a','libvorbis','-q:a','5']],['mp3',['-c:a','libmp3lame','-b:a','128k']]])execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',wavPath,...args,path.join(output,`array-spells.${ext}`)]);
fs.writeFileSync(path.join(root,'src/audio/array-catalog.ts'),`// Generated by scripts/build-array-audio.mjs. Offsets match both encoded banks.\nexport const ARRAY_SOUNDS = ${JSON.stringify(catalog,null,2)} as const;\nexport type ArraySound = keyof typeof ARRAY_SOUNDS;\n`,'utf8');
const preview=clip(8);for(const [i,cue]of ['metal','wood','water','fire','earth'].entries()){const rendered=make(cue,0);for(let side=0;side<2;side++)preview[side].set(rendered.samples[side],Math.round((.1+i*1.5)*SR));}wav(path.join(work,'array-five-elements.wav'),preview);
fs.writeFileSync(path.join(work,'array-report.json'),JSON.stringify({sampleRate:SR,seconds:cursor,channels:2,variants:32,report},null,2),'utf8');
console.log(JSON.stringify({seconds:cursor,variants:report.length,peak:Math.max(...report.map(r=>r.peak)),oggBytes:fs.statSync(path.join(output,'array-spells.ogg')).size,mp3Bytes:fs.statSync(path.join(output,'array-spells.mp3')).size}));
