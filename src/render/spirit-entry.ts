import { clamp } from '../core/math';
import type { Element } from '../game/contracts';
import { COLORS, glow, line, oval, shape } from './ink';
import { paintSpiritMaterial } from './spirit-material';

const ease=(t:number)=>{const p=clamp(t,0,1);return 1-(1-p)**3;};
export const SPIRIT_ENTRY_SECONDS=.64;

/** The existing painted body enters through its own material; no simulation delay. */
export function spiritEntryFrame(element:Element,age:number,beast=false){
  const time=Number.isFinite(age)?Math.max(0,age):SPIRIT_ENTRY_SECONDS;
  const reveal=ease(time/.42),land=ease(time/.19),settle=Math.sin(clamp((time-.19)/.27,0,1)*Math.PI);
  const heavy=beast||element==='earth',ground=heavy||element==='wood';
  return {
    reveal,opacity:ease(time/.16),mask:ground||element==='water',
    y:heavy?-(beast?10:24)*(1-land):element==='fire'?-38*(1-ease(time/.32)):element==='metal'?-22*(1-ease(time/.27)):element==='water'?22*(1-reveal):0,
    sx:heavy?1+settle*(beast?.06:.085):element==='metal'?.83+.17*reveal:1,
    sy:heavy?1-settle*(beast?.09:.12):element==='wood'?.86+.14*reveal:1,
    release:clamp((time-.19)/.45,0,1),fade:time<SPIRIT_ENTRY_SECONDS?Math.sin(clamp(time/.1,0,1)*Math.PI/2)*(1-clamp((time-.28)/.36,0,1)):0,
  };
}

export function paintSpiritEntry(c:CanvasRenderingContext2D,element:Element,age:number,beast:boolean):void{
  const f=spiritEntryFrame(element,age,beast);if(f.fade<=0)return;
  const color=COLORS[element],wide=beast?95:element==='earth'?61:48;
  c.save();
  glow(c,0,-22,wide*.9,color,f.fade*.1);
  if(beast||element==='earth'){
    // Low cracks and falling stone give a planted body weight without a combat ring.
    if(f.release>0){
      for(let n=0;n<5;n++){
        const a=n*2.399,r=wide*(.25+f.release*.65),x=Math.cos(a)*r,y=Math.sin(a)*r*.25;
        c.globalAlpha=f.fade*.5;
        line(c,[{x:0,y:2},{x:x*.4,y:y*.6+2},{x:x*.7,y:y-2},{x,y}], '#433d32',2.2);
      }
      oval(c,0,2,wide*(.3+f.release*.8),8+f.release*9,`rgba(164,145,99,${f.fade*.14})`);
    }
    for(let n=0;n<7;n++){
      const a=n*2.399,x=Math.cos(a)*wide*(.35+f.release*.45),floor=Math.sin(a)*wide*.22;
      const lift=(1-f.release)*(12+n%3*10),y=floor-lift,size=beast?4.5:3.5;
      c.globalAlpha=f.fade*(n%2?.6:.8);oval(c,x,floor+2,size+1,1.5,'#16201e66');
      shape(c,[x-size,y+size*.3,x-size*.7,y-size*.9,x+size*.45,y-size*1.15,x+size,y-size*.25,x+size*.55,y+size*.6],'#897d65','#454638',1);
      line(c,[{x:x-size*.6,y:y-size*.75},{x:x+size*.4,y:y-size*.95},{x:x+size*.75,y:y-size*.25}],'#b4a78b',.7);
    }
  }else if(element==='metal'){
    for(let n=0;n<3;n++){
      const x=(n-1)*22,rise=ease(age/.27),y=-105+(n%2)*16+rise*34;
      c.globalAlpha=f.fade*(.8-n*.12);
      line(c,[{x:x*1.25,y:y-35*(1-rise)},{x,y:y+32}], '#c9c8b2',1.6);
      shape(c,[x-2,y+18,x,y-3,x+2,y+18,x,y+26], '#dfd1a9','#65644c',.7);
    }
  }else if(element==='wood'){
    for(let n=0;n<4;n++){
      const side=n%2?1:-1,x=side*(25+n*9),rise=ease(age/.3);
      c.globalAlpha=f.fade*.55;
      c.beginPath();c.moveTo(x,5);c.quadraticCurveTo(x*.8,-18*rise,x*.2,-34*rise);c.strokeStyle='#53614a';c.lineWidth=1.5;c.stroke();
      const y=-15*rise,lx=x*.72;
      c.beginPath();c.moveTo(lx,y);c.quadraticCurveTo(lx+side*3,y-7,lx+side*7,y-6);c.quadraticCurveTo(lx+side*6,y-1,lx,y+1);
      c.fillStyle='#798769';c.fill();c.strokeStyle='#43513b';c.lineWidth=.6;c.stroke();
      line(c,[{x:lx,y},{x:lx+side*5,y:y-4}],'#abb18c',.45);
    }
  }else if(element==='water'){
    paintSpiritMaterial(c,element,1,0,-8,88+f.release*30,40,0,f.fade*.38);
    for(let n=0;n<2;n++){
      const side=n?1:-1,t=ease(age/.36);c.globalAlpha=f.fade*.62;
      c.beginPath();c.moveTo(side*34,4);c.bezierCurveTo(side*60,-30,side*-18,-57*t,side*17,-92*t);c.strokeStyle='#a1c9c3';c.lineWidth=3-n;c.stroke();
      for(let k=0;k<3;k++)oval(c,side*(28+k*6),-15-k*18*t,1.4,3.1,'#b5d3c9');
    }
  }else{
    // The phoenix descends through a short fan of embers, rather than growing out of soil.
    const spread=ease(age/.3);
    for(let n=0;n<7;n++){
      const side=n-3,x=side*9*spread,y=-58+Math.abs(side)*9+f.release*20;
      c.globalAlpha=f.fade*(1-Math.abs(side)*.13);
      shape(c,[x-2,y,x-side*2,y-25*(1-f.release)-8,x+3,y-5,x+1,y+7],n%2?'#c7753d':'#e3ac61','#985237',.6);
    }
    paintSpiritMaterial(c,'fire',1,0,-5,72+spread*36,38,0,f.fade*.3);
  }
  c.restore();
}
