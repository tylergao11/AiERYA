import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'artifacts/audio/instruments');fs.mkdirSync(dir,{recursive:true});
const files=[['dog.7z','https://opengameart.org/sites/default/files/dog_0.7z'],['wolf-monster.mp3','https://opengameart.org/sites/default/files/wolf_monster_6.mp3']];
for(const [name,url] of files)if(!fs.existsSync(path.join(dir,name)))execFileSync('curl.exe',['--fail','--location','--retry','2','--connect-timeout','10','--max-time','30','--silent','--show-error',url,'--output',path.join(dir,name)],{windowsHide:true});
const entries=execFileSync('tar',['-tf',path.join(dir,'dog.7z')],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/);
if(entries.some(e=>!/^dog\/(dog-(growl|grumble|snarl)\.flac)?$/.test(e)))throw Error('Unexpected archive entry');
execFileSync('tar',['-xf',path.join(dir,'dog.7z'),'-C',dir],{windowsHide:true});
const samples=[];
for(const name of ['dog-growl','dog-grumble','dog-snarl','wolf-monster']){
  const input=path.join(dir,name==='wolf-monster'?'wolf-monster.mp3':`dog/${name}.flac`),output=path.join(dir,`${name}.f32`);
  execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',input,'-ac','1','-ar','24000','-f','f32le',output],{windowsHide:true});
  const bytes=fs.readFileSync(output),data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);let peak=0;for(const x of data)peak=Math.max(peak,Math.abs(x));
  samples.push({name,seconds:data.length/24000,peak,sha256:createHash('sha256').update(fs.readFileSync(input)).digest('hex')});
}
fs.writeFileSync(path.join(root,'public/audio/creature-sources.json'),JSON.stringify({license:'CC0-1.0',sources:[{author:'qubodup',title:'Dog Snarl Grunt Grumble',page:'https://opengameart.org/node/5407',download:files[0][1]},{author:'CaveboyTup',title:'Wolf Monster Sound',page:'https://opengameart.org/content/wolf-monster-sound',download:files[1][1]}],usage:'Recorded dog vocalizations and a designed horse-based monster call, edited and layered for fantasy wolves.',samples},null,2),'utf8');
console.log(samples.map(s=>`${s.name}: ${s.seconds.toFixed(2)}s`).join('\n'));
