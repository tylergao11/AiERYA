/** Original offline-rendered elemental materials. The game imports only this sprite index. */
export const SUMMON_AUDIO_RATE=24000;
export const SUMMON_MATERIALS=['metal','wood','water','fire','earth','beast'] as const;
export type SummonMaterial=typeof SUMMON_MATERIALS[number];
export type SummonCue=`launch-${SummonMaterial}`|`hit-${SummonMaterial}`|`spawn-${SummonMaterial}`|`union-${SummonMaterial}`|`step-${'wood'|'earth'|'beast'}`|'focus'|'move'|'infuse'|'ready'|'union-call'|'union-hit'|'fury'|'pincer'|'hunt'|'seal'|'echo'|'pierce'|'fireburst'|'stomp'|'blocked'|'freed'|'feed-beast';
export const SUMMON_CUES:readonly SummonCue[]=[...SUMMON_MATERIALS.flatMap(e=>[`launch-${e}`,`hit-${e}`,`spawn-${e}`] as SummonCue[]),'focus','move','infuse','ready','union-call','union-hit','fury','pincer','hunt','seal','echo','pierce','fireburst','stomp',...SUMMON_MATERIALS.map(e=>`union-${e}` as SummonCue),'blocked','freed','step-wood','step-earth','step-beast','feed-beast'];
export function summonCueSeconds(cue:SummonCue):number {
  if(cue.startsWith('spawn-'))return .86;
  if(cue.startsWith('launch-'))return .28;
  if(cue.startsWith('hit-'))return cue==='hit-beast'?.58:.48;
  const material=cue.slice(6) as SummonMaterial;
  if(cue.startsWith('union-')&&SUMMON_MATERIALS.includes(material))return {metal:.7,wood:.86,water:1.02,fire:1.04,earth:.9,beast:.95}[material];
  return {focus:.17,move:.19,infuse:.34,ready:.84,'union-call':.78,'union-hit':1.05,fury:.7,pincer:.31,hunt:.26,seal:.48,echo:.26,pierce:.31,fireburst:.76,stomp:.64,blocked:.23,freed:.34,'step-wood':.17,'step-earth':.23,'step-beast':.25,'feed-beast':.3}[cue as Exclude<SummonCue,`${'launch'|'hit'|'spawn'|'union'}-${SummonMaterial}`>];
}
export const SUMMON_SPRITE=new Map<string,{offset:number;duration:number}>();
let cursor=0;
for(const cue of SUMMON_CUES)for(let variant=0;variant<2;variant++){
  const duration=Math.ceil(summonCueSeconds(cue)*SUMMON_AUDIO_RATE)/SUMMON_AUDIO_RATE;
  SUMMON_SPRITE.set(`${cue}:${variant}`,{offset:cursor,duration});cursor+=duration+.025;
}
export const SUMMON_SPRITE_SECONDS=cursor;
const tau=Math.PI*2;

/** Modal resonance, short noise grains and air layers; never synthesize on a hit frame. */
export function renderSummonCue(cue:SummonCue,variant=0,rate=SUMMON_AUDIO_RATE):Float32Array {
  const duration=summonCueSeconds(cue),samples=new Float32Array(Math.ceil(rate*duration));
  let seed=48271+SUMMON_CUES.indexOf(cue)*31337+variant*701,low=0,mid=0,phase=0;
  const tune=variant?.976:1.021,material=cue.split('-').at(-1) as SummonMaterial;
  const launch=cue.startsWith('launch-'),hit=cue.startsWith('hit-'),spawn=cue.startsWith('spawn-');
  const union=cue.startsWith('union-')&&SUMMON_MATERIALS.includes(material);
  const decay=(t:number,k:number)=>t<0?0:Math.exp(-t*k)*(1-Math.exp(-t*800));
  const mode=(t:number,f:number,k:number,ratios:readonly number[]=[1,1.57,2.83])=>t<0?0:ratios.reduce((sum,r,n)=>sum+Math.sin(t*f*r*tune*tau)*decay(t,k*(1+n*.42))/(1+n*1.6),0);
  for(let i=0;i<samples.length;i++){
    const t=i/rate,q=t/duration;
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    low+=.035*(noise-low);mid+=.22*(noise-mid);
    const grain=mid-low,air=noise-mid;
    phase+=tau*(63+82*Math.exp(-t*30))*tune/rate;
    const body=(Math.sin(phase)+.4*Math.sin(phase*2)+.2*Math.sin(phase*3));
    let v=0;
    if(cue.startsWith('step-')){
      if(material==='wood')v=mode(t,310,56,[1,2.63])*.12+low*decay(t,38)*1.15+grain*decay(t-.008,42)*.34+air*decay(t-.035,80)*.06;
      else if(material==='earth')v=body*decay(t,26)*.2+low*decay(t,23)*1.45+grain*decay(t-.012,35)*.32+mode(t-.032,220,43,[1,2.34])*.1;
      else v=body*decay(t,22)*.25+low*decay(t,20)*1.7+grain*decay(t-.014,29)*.34+mode(t-.02,150,38,[1,2.6])*.075;
    }else if(launch){
      const swell=Math.sin(Math.PI*Math.min(1,t/.14))**2;
      v=(grain*.8+air*.08)*swell*Math.exp(-t*6);
      if(material==='metal')v+=mode(t-.035,1040,17,[1,1.414,2.76])*.2;
      if(material==='wood')v+=mode(t,275,32)*.25+grain*decay(t-.04,30)*.45;
      if(material==='water')v+=Math.sin(tau*(510*t-520*t*t))*decay(t-.015,14)*.13;
      if(material==='fire')v+=grain*decay(t-.04,10)*.7+body*decay(t-.045,19)*.12;
      if(material==='earth'||material==='beast')v+=body*decay(t,20)*.2+low*decay(t,17)*1.2;
    }else if(union){
      // Impact identity comes from timing and material, not six pitch-shifted explosions.
      if(material==='metal'){
        for(let n=0;n<3;n++){const r=t-n*.045;v+=mode(r,660+n*155,11+n*3,[1,1.414,2.17])*.16+(grain*.65+air*.18)*decay(r,47);}
        v+=body*decay(t,16)*.18;
      }else if(material==='wood'){
        v+=body*decay(t,12)*.2+low*decay(t,10)*1.5;
        for(let n=0;n<6;n++){const r=t-n*.038;v+=grain*decay(r,38)*.43+mode(r,175+n*53,24,[1,2.71])*.13;}
        v+=grain*decay(t-.22,12)*.22;
      }else if(material==='water'){
        v+=body*decay(t,12)*.17+(low*2.6+grain*1.2)*decay(t,6);
        const returnFlow=decay(t-.21,6);v+=grain*returnFlow*.72;
        for(let n=0;n<5;n++){const r=t-.09-n*.045;if(r>=0)v+=Math.sin(tau*((740+n*81)*r-360*r*r))*decay(r,18)*.09;}
      }else if(material==='fire'){
        v+=body*decay(t,7)*.34+(low*2.5+grain*1.7)*decay(t,7)+grain*decay(t-.085,12)*.6;
        for(let n=0;n<11;n++)v+=air*decay(t-.13-n*.043,130)*(.24-n*.011);
      }else if(material==='earth'){
        v+=body*decay(t,8)*.4+low*decay(t,6)*2.8;
        for(let n=0;n<7;n++){const r=t-.08-n*.05;v+=grain*decay(r,30)*.42+mode(r,160+n*41,24,[1,2.34])*.12;}
      }else{
        v+=body*decay(t,7)*.31+Math.sin(tau*91*t+1.45*Math.sin(tau*39*t))*decay(t,5)*.19;
        for(let n=0;n<3;n++){const r=t-n*.042;v+=(grain*.72+air*.1)*decay(r,26)+mode(r,350+n*90,16,[1,2.57])*.1;}
        v+=low*decay(t-.1,7)*1.5;
      }
    }else if(hit||spawn){
      const u=spawn?t-.19:t,swirl=spawn?Math.sin(Math.PI*Math.min(1,t/.32))**2:0;
      if(spawn)v+=(grain*.8+air*.045)*swirl;
      if(material==='metal'){
        v+=mode(u,740,spawn?5:12,[1,1.483,2.17,3.84])*.27+(grain*.6+air*.24)*decay(u,48);
        v+=mode(u-.04,1180,17,[1,1.71])*.12;
      }else if(material==='wood'){
        for(let n=0;n<4;n++){const r=u-n*(.029+variant*.003);v+=grain*decay(r,50+n*5)*(.6-n*.08)+mode(r,230+n*170,32)*.11;}
        v+=low*decay(u,12)*1.05;
      }else if(material==='water'){
        v+=(grain*1.65+air*.13)*decay(u,9)*(1+.4*Math.sin(t*49));
        for(let n=0;n<5;n++){const r=u-.018-n*.046;if(r>=0)v+=Math.sin(tau*((470+n*123)*r+950*r*r))*decay(r,34)*.12;}
        v+=body*decay(u,22)*.12;
      }else if(material==='fire'){
        v+=(low*2.5+grain*1.7+air*.09)*decay(u,10)+body*decay(u,14)*.29;
        for(let n=0;n<7;n++)v+=air*decay(u-.035-n*.042,170)*(.26-n*.018);
      }else if(material==='earth'){
        v+=body*decay(u,11)*.36+low*decay(u,8)*2.3;
        for(let n=0;n<5;n++)v+=(grain*.7+mode(u-n*.041,190+n*81,35)*.17)*decay(u-n*.041,35);
      }else{
        const r=Math.max(0,u),throat=Math.sin(tau*83*r+1.3*Math.sin(tau*37*r));
        v+=body*decay(u,9)*.32+throat*decay(u,7)*.18+grain*decay(u,14)*1.2;
        v+=mode(u,420,13,[1,2.57])*.13+air*decay(u-.035,50)*.2;
      }
      if(spawn)v+=mode(t-.22,196,5,[1,2,3])*.11+mode(t-.31,294,6,[1,2.01])*.07;
    }else if(cue==='feed-beast'){
      const inhale=Math.sin(Math.PI*Math.min(1,t/.18))**2;
      v=grain*inhale*.35+low*inhale*.65+mode(t-.09,148,24,[1,2.13,3.4])*.13+body*decay(t-.11,30)*.09;
    }else if(cue==='focus'||cue==='move'){
      const rising=cue==='focus';v=mode(t,rising?680:510,33,[1,1.71])*.09+mode(t-.052,rising?880:380,30)*.065+grain*decay(t,70)*.15;
    }else if(cue==='infuse'){
      const swell=Math.sin(Math.PI*Math.min(1,t/.23))**2;
      v=grain*swell*.38+mode(t-.04,392,13,[1,2.01])*.14+mode(t-.09,588,13,[1,2.02])*.09;
    }else if(cue==='ready'||cue==='union-call'){
      const call=cue==='union-call';
      for(let n=0;n<3;n++)v+=mode(t-n*.09,[196,294,392][n]!*(call?.75:1),5,[1,2.006,3.91])*(call?.18:.12);
      v+=grain*Math.sin(Math.PI*Math.min(1,t/.42))**2*(call?.55:.16);
    }else if(cue==='union-hit'||cue==='fury'){
      v=body*decay(t,6)*.46+low*decay(t,5)*1.4+grain*decay(t,12)*1.4+air*decay(t,45)*.18;
      if(cue==='union-hit'){
        v+=mode(t-.035,147,4,[1,2.13,3.76,5.23])*.23+mode(t-.11,588,6,[1,1.71])*.1;
        v+=grain*decay(t-.09,14)*.85;
      }else v+=Math.sin(tau*92*t+Math.sin(tau*42*t))*decay(t,8)*.22+mode(t-.035,430,17)*.14;
    }else if(cue==='pierce'){
      v=air*(decay(t,42)+decay(t-.05,48))*.22+mode(t,1320,26,[1,1.414,2.31])*.12+mode(t-.052,960,23,[1,1.73])*.1;
    }else if(cue==='fireburst'){
      // Delayed secondary ignition makes a three-feather detonation distinct from a single hit.
      v=body*decay(t,9)*.31+(low*2.6+grain*1.4)*decay(t,7)+grain*decay(t-.085,10)*1.05;
      for(let n=0;n<9;n++)v+=air*decay(t-.05-n*.046,145)*(.27-n*.02);
    }else if(cue==='stomp'){
      v=body*decay(t,10)*.3+low*decay(t,7)*2.7;
      for(let n=0;n<6;n++){const r=t-.035-n*.053;v+=(grain*.5+mode(r,180+n*74,34)*.2)*decay(r,27);}
    }else if(cue==='pincer'){
      v=mode(t,380,25)*.2+mode(t-.055,510,25)*.21+grain*(decay(t,40)+decay(t-.055,40))*.7;
    }else if(cue==='blocked'){
      v=mode(t,186,27,[1,1.63])*.2+(low*1.5+grain*.45)*decay(t,28)+grain*decay(t-.026,55)*.25;
    }else if(cue==='freed'){
      v=mode(t,520,13,[1,2.005])*.11+mode(t-.045,780,17,[1,2.005])*.08+grain*decay(t,34)*.19;
    }else if(cue==='seal'){
      v=mode(t,330,12,[1,2.005])*.15+mode(t-.14,494,12,[1,2.005])*.18+grain*(decay(t,40)+decay(t-.14,40))*.17;
    }else{
      const chase=cue==='hunt';v=grain*Math.sin(Math.PI*q)**2*(chase?.46:.24)+mode(t-.06,chase?660:880,20,[1,1.72])*.08;
    }
    const edge=Math.min(1,t/.003)*Math.min(1,(duration-t)/.04);
    samples[i]=Math.tanh(v*1.5)*.72*edge;
  }
  samples[0]=0;samples[samples.length-1]=0;return samples;
}
