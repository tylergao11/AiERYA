import type { Pixel } from './projection';

const UNIT=113/338;
const TRAVEL=28*3.5/1.58;
export interface EarthLeg { hip:Pixel; knee:Pixel; ankle:Pixel; foot:Pixel; lift:number; planted:boolean }
export interface EarthGait { left:EarthLeg; right:EarthLeg }
const phase=(v:number)=>((v%1)+1)%1;

/** The right leg is near the camera. The left leg stays behind it in draw
 * order, but passes IN FRONT of it along the travel axis every other step. */
export function earthGait(stride:number):EarthGait {
  const leg=(cycle:number,near:boolean):EarthLeg=>{
    const t=phase(cycle),planted=t<.5,swing=(t-.5)*2;
    const x=planted?TRAVEL*(.25-t):TRAVEL*(-.25+.5*(swing*swing*(3-2*swing)));
    const lift=planted?0:Math.sin(swing*Math.PI)*12;
    const hip={x:near?0:-5,y:-48},foot={x:x+(near?2:-2),y:near?0:-2};
    foot.y-=lift;
    const ankle={x:foot.x-3,y:foot.y-6};
    const upper=25,lower=25,dx=ankle.x-hip.x,dy=ankle.y-hip.y,d=Math.min(upper+lower-.001,Math.hypot(dx,dy));
    const a=(upper*upper-lower*lower+d*d)/(2*d),h=Math.sqrt(Math.max(0,upper*upper-a*a)),length=Math.hypot(dx,dy);
    const knee={x:hip.x+dx/length*a+dy/length*h,y:hip.y+dy/length*a-dx/length*h};
    return {hip,knee,ankle,foot,lift,planted};
  };
  return {right:leg(stride/4,true),left:leg(stride/4+.5,false)};
}

interface Part {image:HTMLCanvasElement;dark:HTMLCanvasElement;pin:Pixel;to?:Pixel}
interface Parts {torso:Part;thigh:Part;shin:Part;foot:Part}
const cache=new WeakMap<HTMLImageElement,Parts>();
// Reuse the painted stone plates, masking at their natural joints. Each leg
// has its own hip, knee, ankle and foot; no frame swaps or whole-body mirroring.
function parts(atlas:HTMLImageElement):Parts {
  let result=cache.get(atlas);if(result)return result;
  const cut=(polygon:number[],pin:Pixel,to?:Pixel):Part=>{
    const xs=polygon.filter((_,i)=>i%2===0),ys=polygon.filter((_,i)=>i%2===1),left=Math.min(...xs),top=Math.min(...ys)-394;
    const image=document.createElement('canvas');image.width=Math.max(...xs)-left;image.height=Math.max(...ys)-394-top;
    const c=image.getContext('2d')!;c.translate(-left,-top);c.beginPath();
    for(let i=0;i<polygon.length;i+=2){const x=polygon[i]!,y=polygon[i+1]!-394;i?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.clip();
    c.drawImage(atlas,0,394,362,360,0,0,362,360);
    const dark=document.createElement('canvas');dark.width=image.width;dark.height=image.height;
    const tint=dark.getContext('2d')!;tint.filter='brightness(.73)';tint.drawImage(image,0,0);
    return {image,dark,pin:{x:pin.x-left,y:pin.y-394-top},to:to?{x:to.x-left,y:to.y-394-top}:undefined};
  };
  result={
    torso:cut([0,394,362,394,362,666,290,666,274,625,250,590,223,584,197,595,173,598,147,617,123,644,111,670,0,670],{x:200,y:738}),
    thigh:cut([171,578,209,568,240,581,263,611,260,632,244,654,214,656,188,640,169,617],{x:195,y:590},{x:235,y:647}),
    shin:cut([218,638,249,637,264,652,279,682,272,716,252,725,228,723,204,708,202,679],{x:235,y:647},{x:247,y:716}),
    foot:cut([218,705,255,702,273,710,288,711,310,728,303,742,218,741,197,732,199,717],{x:247,y:716}),
  };cache.set(atlas,result);return result;
}

function drawBone(c:CanvasRenderingContext2D,part:Part,from:Pixel,to:Pixel,depth:number):void {
  const axis=part.to!,angle=Math.atan2(to.y-from.y,to.x-from.x)-Math.atan2(axis.y-part.pin.y,axis.x-part.pin.x);
  const scale=Math.hypot(to.x-from.x,to.y-from.y)/Math.hypot(axis.x-part.pin.x,axis.y-part.pin.y);
  c.save();c.translate(from.x,from.y);c.rotate(angle);c.scale(scale*depth,scale);c.drawImage(depth<1?part.dark:part.image,-part.pin.x,-part.pin.y);c.restore();
}

export function paintEarthGait(c:CanvasRenderingContext2D,atlas:HTMLImageElement,stride:number):void {
  const sprite=parts(atlas),gait=earthGait(stride);
  const drawLeg=(leg:EarthLeg,near:boolean)=>{
    c.save();
    drawBone(c,sprite.thigh,leg.hip,leg.knee,near?1:.9);
    drawBone(c,sprite.shin,leg.knee,leg.ankle,near?1:.9);
    c.save();c.translate(leg.ankle.x,leg.ankle.y);c.scale(UNIT*(near?1:.9),UNIT);c.drawImage(near?sprite.foot.image:sprite.foot.dark,-sprite.foot.pin.x,-sprite.foot.pin.y);c.restore();
    c.restore();
  };
  drawLeg(gait.left,false);drawLeg(gait.right,true);
  c.save();c.scale(UNIT,UNIT);c.drawImage(sprite.torso.image,-sprite.torso.pin.x,-sprite.torso.pin.y);c.restore();
}

/** Forward contact belongs to the left/far leg at half a cycle, and to the
 * right/near leg at the cycle boundary. Foot effects share these exact points. */
export function earthFootContact(side:-1|1):Pixel {
  const gait=earthGait(side>0?2:0);return side>0?gait.left.foot:gait.right.foot;
}

export const earthHand={x:(326-200)*UNIT,y:(636-738)*UNIT};
