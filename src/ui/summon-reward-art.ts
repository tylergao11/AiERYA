import type { Element } from '../game/contracts';
import { hasSummonGrowthArt, summonGrowthArt, summonGrowthCast, type SummonGrowthCast } from './summon-growth-art';
import './summon-reward.css';

type Pet = 'fire' | 'water' | 'beast';
const supported = new Set(['spirit-pincer','spirit-hunt','spirit-sweep','spirit-fury','spirit-seal','spirit-echo']);
let sequence = 0;
export const hasSummonRewardArt = (id:string):boolean => supported.has(id) || hasSummonGrowthArt(id);

/** Staged visual examples; no combat clock, targets or rewards are changed. */
export function summonRewardArt(id:string,cast?:SummonGrowthCast):string {
  if(!hasSummonRewardArt(id))return '';
  const filter=`summon-material-${++sequence}`;
  if(hasSummonGrowthArt(id))return summonGrowthArt(id,cast??summonGrowthCast(undefined,1),filter);
  const timed=(art:string,cls:string,delay=0)=>`<g class="sum-case-${cls}" style="animation-delay:${delay}s">${art}</g>`;
  const pet=(x:number,y:number,kind:Pet,cls='cast',delay=0)=>{
    const beast=kind==='beast',w=beast?112:61,h=beast?78:86;
    const crop=beast?'0 0 768 512':kind==='fire'?'923 70 285 458':'611 73 312 451';
    return `<g transform="translate(${x} ${y})"><ellipse cy="3" rx="${beast?42:17}" ry="5" fill="#4a4337" opacity=".16"/>${timed(`<svg x="${-w/2}" y="${-h}" width="${w}" height="${h}" viewBox="${crop}"><image href="./art/${beast?'ancestor-beast':'element-spirit'}-atlas.webp" width="1536" height="1024"/></svg>`,cls,delay)}</g>`;
  };
  const wolf=(x:number,y:number,cls='recoil',delay=0)=>`<g transform="translate(${x} ${y})"><ellipse cy="2" rx="19" ry="4" fill="#4a4337" opacity=".16"/>${timed('<svg x="-34" y="-53" width="68" height="60" viewBox="0 0 256 256"><g transform="translate(256 0) scale(-1 1)"><image href="./art/wolf-atlas.webp" width="1024" height="768"/></g></svg>',cls,delay)}</g>`;
  const material=(element:Element,layer:0|1|2,x:number,y:number,w:number,h:number)=>{
    const edges=[0,309,623,932,1237,1536],ys=[0,300,640,1024],col={metal:0,wood:1,water:2,fire:3,earth:4}[element];
    return `<g filter="url(#${filter})"><svg x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" viewBox="${edges[col]} ${ys[layer]} ${edges[col+1]!-edges[col]!} ${ys[layer+1]!-ys[layer]!}"><image href="./art/spirit-effects-atlas.webp" width="1536" height="1024"/></svg></g>`;
  };
  const missile=(element:Element,x:number,y:number,dx:number,dy:number,delay=0,echo=false)=>`<g transform="translate(${x} ${y})"><g class="sum-case-missile${echo?' is-echo':''}" style="--flight-x:${dx}px;--flight-y:${dy}px;animation-delay:${delay}s"><g transform="rotate(${Math.atan2(dy,dx)*180/Math.PI})">${material(element,0,0,0,54,33)}</g></g></g>`;
  const hit=(element:Element,x:number,y:number,delay=0,large=false)=>timed(material(element,large?2:1,x,y,large?91:62,large?86:58),'hit',delay);
  const lock=(x:number,y:number,delay=0)=>`<g transform="translate(${x} ${y})">${timed('<path d="M-15-5L-21 0L-15 5M15-5L21 0L15 5M-4-35L0-30L4-35" fill="none" stroke="#8c5a2c" stroke-width="1.8"/>','lock',delay)}</g>`;
  const claw=(x:number,y:number,delay=0)=>`<g transform="translate(${x} ${y})">${timed('<path d="M-24-31Q-19 1 21 18M-12-34Q-7-2 33 16M0-32Q5-4 42 10" fill="none" stroke="#715335" stroke-width="4"/><path d="M-24-31Q-19 1 21 18M-12-34Q-7-2 33 16M0-32Q5-4 42 10" fill="none" stroke="#ead2a1" stroke-width="1.5"/>','claw',delay)}</g>`;
  const seal=(x:number,y:number,element:'fire'|'water',delay:number)=>`<g transform="translate(${x} ${y})">${timed(`<path d="M-11-15L12-13L10 14L-12 12Z" fill="${element==='fire'?'#ad643b':'#426e77'}"/><text y="6" fill="#f2dfba" text-anchor="middle" font-size="19">${element==='fire'?'火':'水'}</text>`,'seal',delay)}</g>`;
  let picture='';
  if(id==='spirit-pincer')picture=pet(39,96,'fire')+pet(107,103,'water','cast',.38)+wolf(206,89,'pincer-recoil')+lock(206,89)+missile('fire',51,37,141,27)+missile('water',119,52,75,12,.38)+hit('fire',206,68)+hit('water',206,69,.38)+timed('<path d="M179 38L167 60L179 84M230 38L243 60L231 84" stroke="#59796c" stroke-width="2.5" fill="none"/>','claw',.4);
  else if(id==='spirit-hunt')picture=pet(48,100,'fire','pursue')+wolf(151,91,'fall')+wolf(225,84,'recoil',1.18)+lock(151,88)+timed('<path d="M151 52Q186 15 222 43" fill="none" stroke="#7b875b" stroke-width="1.5" stroke-dasharray="3 4"/>','transfer')+lock(225,81,1.18)+missile('fire',62,38,76,24)+missile('fire',91,38,120,18,1.18)+hit('fire',151,67)+hit('fire',224,63,1.18);
  else if(id==='spirit-sweep')picture=wolf(182,59,'recoil',.05)+wolf(218,78,'recoil',.1)+wolf(190,107,'recoil',.16)+pet(69,99,'beast','lunge')+claw(180,67)+hit('earth',191,92,0,true);
  else if(id==='spirit-fury')picture=pet(75,98,'beast','heavy')+wolf(211,96,'stagger')+[0,1,2].map(n=>`<g transform="translate(${61+n*13} 15)">${timed('<path d="M0-6L4 0L0 6L-4 0Z" fill="#977039" stroke="#e0c38b" stroke-width="1"/>','charge',n*.19)}</g>`).join('')+claw(190,69,.6)+hit('earth',206,80,.6,true);
  else if(id==='spirit-seal')picture=pet(49,101,'water','cast',.75)+wolf(210,94,'double-recoil')+seal(104,31,'fire',0)+seal(139,31,'water',.75)+missile('fire',91,57,105,10)+missile('water',91,58,105,9,.75)+hit('fire',210,69)+hit('water',210,70,.75);
  else picture=pet(43,102,'water')+wolf(152,88,'fall')+wolf(224,96,'recoil',1.04)+missile('water',61,45,80,19)+hit('water',153,64)+timed('<path d="M69 70Q145 105 213 75" fill="none" stroke="#567f83" stroke-width="1.4" stroke-dasharray="3 4"/>','transfer')+missile('water',65,60,148,13,1.04,true)+hit('water',224,73,1.04);
  return `<g class="summon-example-art" data-mechanic="${id}"><defs><filter id="${filter}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .34 .34 .32 0 0"/></filter></defs><path d="M12 103Q131 91 251 100" stroke="#7e705b" stroke-width="1" opacity=".2" fill="none"/>${picture}</g>`;
}
