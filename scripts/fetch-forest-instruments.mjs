/** Retrieve the small CC0 instrument selection used by the original night score.
 * Pinned upstream revision, exact source paths, and license are recorded with the game.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'artifacts/audio/instruments');fs.mkdirSync(dir,{recursive:true});
const revision='440300901dfe9275fd84e0b7763af1f8443ae62e';
const treePath=path.join(root,'artifacts/audio/vsco-tree.json');
if(!fs.existsSync(treePath))execFileSync('curl.exe',['--fail','--location','--retry','2','--retry-all-errors','--max-time','45','--silent','--show-error',`https://api.github.com/repos/sgossner/VSCO-2-CE/git/trees/${revision}?recursive=1`,'--output',treePath],{windowsHide:true});
const sourceTree=JSON.parse(fs.readFileSync(treePath,'utf8'));
if(sourceTree.sha!==revision)throw Error('Instrument source revision mismatch');
function getBlob(source,destination){
  const blob=sourceTree.tree.find(entry=>entry.path===source);if(!blob)throw Error(`Missing source: ${source}`);
  const responseFile=path.join(dir,`response-${blob.sha}.json`);
  execFileSync('curl.exe',['--fail','--location','--retry','2','--retry-all-errors','--connect-timeout','15','--max-time','45','--silent','--show-error',`https://api.github.com/repos/sgossner/VSCO-2-CE/git/blobs/${blob.sha}`,'--output',responseFile],{windowsHide:true});
  const response=JSON.parse(fs.readFileSync(responseFile,'utf8'));if(response.sha!==blob.sha||response.encoding!=='base64')throw Error('Unexpected sample object');
  const bytes=Buffer.from(response.content,'base64');
  if(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==blob.sha)throw Error('Instrument object checksum mismatch');
  fs.writeFileSync(destination,bytes);
  fs.unlinkSync(responseFile);
}
const picks=[
 ['flute-c',72,'Woodwinds/Flute/susNV/LDFlute_susNV_C4_v1_1.wav'],
 ['flute-e',76,'Woodwinds/Flute/susNV/LDFlute_susNV_E4_v1_1.wav'],
 ['flute-a',69,'Woodwinds/Flute/susNV/LDFlute_susNV_A3_v1_1.wav'],
 ['cello-c',36,'Strings/Cello Section/susvib/susvib_C1_v1_1.wav'],
 ['cello-g',43,'Strings/Cello Section/susvib/susvib_G1_v1_1.wav'],
 ['cello-d',50,'Strings/Cello Section/susvib/susvib_D2_v1_1.wav'],
 ['spic-c',60,'Strings/Cello Section/spic/spic_C3_v1_RR1.wav'],
 ['spic-d',50,'Strings/Cello Section/spic/spic_D2_v1_RR1.wav'],
 ['spic-a',57,'Strings/Cello Section/spic/spic_A2_v1_RR1.wav'],
 ['violin-a',69,'Strings/Violin Section/Spic/VlnEns_Spic_A3_v1_rr1.wav'],
 ['gong',48,'Percussion/gongHit_p.wav'],
 ['timpani',45,'Percussion/Timpani/Timpani3_Hit_v3_rr1_Sum.wav'],
];
const entries=[];
for(let batch=0;batch<picks.length;batch+=3){
 const results=await Promise.allSettled(picks.slice(batch,batch+3).map(async([name,midi,source])=>{
  const url=`https://raw.githubusercontent.com/sgossner/VSCO-2-CE/${revision}/${source.split('/').map(encodeURIComponent).join('/')}`;
  const file=path.join(dir,`${name}.wav`);
  if(!fs.existsSync(file)){
    console.log(`Downloading ${name}`);
    // The raw host can reset large transfers on this connection. Git's blob API
    // serves the exact same pinned object, with a verifiable object id.
    getBlob(source,file);
  }
  const raw=path.join(dir,`${name}.f32`);
  execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',file,'-ac','1','-ar','24000','-f','f32le',raw],{windowsHide:true});
  // Estimate pitch from the stable portion, checking the expected register +/- one octave.
  const bytes=fs.readFileSync(raw),data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);
  let best={error:Infinity,lag:0};const expected=440*2**((midi-69)/12),from=Math.floor(24000/(expected*1.03)),to=Math.ceil(24000/(expected*.97));
  const start=Math.min(Math.floor(data.length*.25),12000),count=Math.min(6000,data.length-start-to-1);
  for(let lag=from;lag<=to;lag++){let difference=0,power=0;for(let i=0;i<count;i++){const a=data[start+i],b=data[start+i+lag];difference+=(a-b)**2;power+=a*a+b*b;}const error=difference/Math.max(1e-9,power);if(error<best.error)best={error,lag};}
  const estimated=69+12*Math.log2(24000/Math.max(1,best.lag)/440);
  let peak=0;for(const v of data)peak=Math.max(peak,Math.abs(v));
  return {name,midi,estimatedMidi:Number(estimated.toFixed(2)),pitchError:Number(best.error.toFixed(3)),source,url,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),seconds:data.length/24000,peak};
 }));
 for(const result of results){if(result.status==='rejected')throw result.reason;entries.push(result.value);console.log(result.value.name,result.value.estimatedMidi,result.value.seconds.toFixed(2));}
}
const licensePath=path.join(root,'public/audio/VSCO-CC0.txt');getBlob('LICENSE',licensePath);
const license=fs.readFileSync(licensePath,'utf8');
if(!license.startsWith('CC0 1.0'))throw Error('Unexpected upstream license');
fs.writeFileSync(path.join(root,'public/audio/VSCO-CC0.txt'),license,'utf8');
const credit={project:'VS Chamber Orchestra: Community Edition',authors:'Sam Gossner & Simon Dalzell; sample cutting by Elan Hickler / Soundemote',license:'CC0-1.0',repository:'https://github.com/sgossner/VSCO-2-CE',revision,usage:'Instrument notes resampled and arranged into the original Forest Ward score. No third-party composition is used.',entries};
fs.writeFileSync(path.join(root,'public/audio/instrument-sources.json'),JSON.stringify(credit,null,2),'utf8');
