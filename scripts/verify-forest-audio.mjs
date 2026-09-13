import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const report=JSON.parse(fs.readFileSync('artifacts/audio/asset-report.json','utf8'));
const measurements=[];
for(const track of report.reports)for(const extension of ['ogg','mp3']){
  const path=`public/audio/${track.name}.${extension}`;
  const raw=execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-i',path,'-ar','24000','-ac',String(track.channels),'-f','f32le','pipe:1'],{maxBuffer:64*1024*1024,windowsHide:true});
  const data=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);let peak=0,square=0;
  for(const sample of data){if(!Number.isFinite(sample))throw Error(`Nonfinite ${path}`);peak=Math.max(peak,Math.abs(sample));square+=sample*sample;}
  const duration=data.length/track.channels/24000;if(duration<track.seconds-.02)throw Error(`Truncated ${path}`);if(peak>=.99)throw Error(`Clipping ${path}`);
  let seam=0;if(track.name!=='forest-cues')for(let ch=0;ch<track.channels;ch++)seam=Math.max(seam,Math.abs(data[ch]-data[(Math.round(track.seconds*24000)-1)*track.channels+ch]));
  if(seam>.035)throw Error(`Loop discontinuity ${path}: ${seam}`);
  measurements.push({path,bytes:fs.statSync(path).size,sha256:createHash('sha256').update(fs.readFileSync(path)).digest('hex'),seconds:duration,peakDb:20*Math.log10(peak),rmsDb:20*Math.log10(Math.sqrt(square/data.length)),seam});
}
fs.writeFileSync('artifacts/audio/codec-verification.json',JSON.stringify({sampleRate:24000,measurements},null,2),'utf8');
console.log(JSON.stringify({files:measurements.length,primaryBytes:measurements.filter(m=>m.path.endsWith('.ogg')).reduce((n,m)=>n+m.bytes,0),worstPeakDb:Math.max(...measurements.map(m=>m.peakDb)),worstLoopDelta:Math.max(...measurements.map(m=>m.seam))},null,2));
