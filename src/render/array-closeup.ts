import type { Point } from '../core/math';
import type { ArrayEvent } from '../game/array-momentum';
import type { World } from '../game/world';
import { ART, type Camera2D, toArt } from './projection';

export const ARRAY_CLOSEUP = { enter: .12, hold: .16, release: .82, harmony: 1.04, interval: 2, desktopZoom: 1.42, mobileZoom: 1.24 } as const;
interface Source { at: Point; energy: number; age: number }
interface Bounds { left: number; right: number; top: number; bottom: number }
interface Shot { age: number; duration: number; priority: number; sources: Source[] }
const smooth=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
const valid=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.z);
const counter=(e:ArrayEvent)=>['steam','splinter','rupture','melt','mud'].includes(e.style);

/** Array-only presentation: one shared camera transform, no simulation time or
 * damage authority. Same-cast releases are framed together instead of zooming
 * separately into every proc. */
export class ArrayCloseup {
  private shot:Shot|null=null;
  private recent:Source[]=[];
  private cooldown=0;
  private weight=0;
  private at:Point={x:0,z:0};
  private bounds:Bounds|null=null;
  private readonly reduced=matchMedia('(prefers-reduced-motion: reduce)');
  private readonly off:(()=>void)[];
  constructor(private readonly world:World){
    this.off=[world.events.on('arrayEffect',e=>this.receive(e)),world.events.on('phase',()=>this.cancel()),world.events.on('ultimate',()=>this.cancel()),world.events.on('reset',()=>{this.cancel();this.cooldown=0;})];
  }
  get active():boolean{return this.shot!==null;}
  private receive(e:ArrayEvent):void{
    if(!this.world.build.is('array')||this.world.phase!=='battle'||this.world.ultimate.active||!valid(e.at)||!Number.isFinite(e.energy)||!e.targets.some(valid))return;
    const heaven=e.label.includes('周天'),primary=e.kind==='release'||e.kind==='harmony';
    if(!primary&&!heaven)return;
    const source={at:{...e.at},energy:Math.max(0,Math.min(100,e.energy)),age:0};
    this.recent.push(source);if(this.recent.length>8)this.recent.shift();
    const priority=e.kind==='harmony'||heaven?2:e.energy>=70||(counter(e)&&e.energy>=20)?1:0;
    if(this.shot){
      // Immediate companion releases may enlarge the framing, but never restart its clock.
      if(this.shot.age<=.08||(priority>this.shot.priority&&this.shot.age<.28)){
        this.shot.sources=this.merge([...this.shot.sources,...this.recent]);
        this.shot.priority=Math.max(this.shot.priority,priority);
        this.shot.duration=this.shot.priority===2?ARRAY_CLOSEUP.harmony:ARRAY_CLOSEUP.release;
      }
      return;
    }
    if(priority===0||this.cooldown>0)return;
    this.shot={age:0,duration:priority===2?ARRAY_CLOSEUP.harmony:ARRAY_CLOSEUP.release,priority,sources:this.merge(this.recent)};
    this.cooldown=ARRAY_CLOSEUP.interval;
  }
  private merge(sources:Source[]):Source[]{
    const result:Source[]=[];
    for(const s of sources){const same=result.find(v=>Math.hypot(v.at.x-s.at.x,v.at.z-s.at.z)<.25);if(same)same.energy=Math.max(same.energy,s.energy);else if(result.length<8)result.push({...s,at:{...s.at}});}
    return result;
  }
  update(dt:number,camera:Camera2D,interrupted=false,otherCameraActive=false):void{
    const step=Number.isFinite(dt)?Math.max(0,dt):0;
    this.cooldown=Math.max(0,this.cooldown-step);
    for(const source of this.recent)source.age+=step;this.recent=this.recent.filter(s=>s.age<=.08);
    if(interrupted||otherCameraActive||this.world.phase!=='battle'||this.world.ultimate.active)this.cancel();
    // Another style owns this frame. In particular, do not reset its camera to normal.
    if(otherCameraActive)return;
    const shot=this.shot;
    if(!shot){camera.focus(null);return;}
    shot.age+=step;
    if(shot.age>=shot.duration){this.cancel();camera.focus(null);return;}
    const enter=smooth(shot.age/ARRAY_CLOSEUP.enter),tail=1-smooth((shot.age-ARRAY_CLOSEUP.enter-ARRAY_CLOSEUP.hold)/(shot.duration-ARRAY_CLOSEUP.enter-ARRAY_CLOSEUP.hold));
    this.weight=enter*tail;
    // The painted atlas is 2.3r tall with its ground anchor at 83%.
    const boxes=shot.sources.map(s=>{const p=toArt(s.at),r=72+s.energy*1.08;return {left:p.x-r*1.18,right:p.x+r*1.18,top:p.y-r*1.95,bottom:p.y+r*.85};});
    const bounds=this.bounds={left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))};
    this.at={x:((bounds.left+bounds.right)/2-ART.x)/ART.unitX,z:((bounds.top+bounds.bottom)/2+20-ART.y)/ART.unitY};
    camera.focus(null);
    if(this.reduced.matches)return;
    const mobile=Math.min(camera.width,camera.height)<=600,peak=mobile?ARRAY_CLOSEUP.mobileZoom:ARRAY_CLOSEUP.desktopZoom;
    const fit=Math.max(1,Math.min(peak,camera.width*.86/((bounds.right-bounds.left)*camera.scale),camera.height*.7/((bounds.bottom-bounds.top)*camera.scale)));
    camera.focus(this.at,1+(fit-1)*this.weight,this.weight*.78);
  }
  paint(c:CanvasRenderingContext2D,camera:Camera2D,ratio:number):void{
    if(!this.shot||!this.bounds||this.weight<=0)return;
    const focus=camera.project(this.at,.8),rx=Math.max(110,(this.bounds.right-this.bounds.left)*camera.scale*.64),ry=Math.max(95,(this.bounds.bottom-this.bounds.top)*camera.scale*.61);
    c.save();c.setTransform(ratio,0,0,ratio,0,0);c.translate(focus.x,focus.y);c.scale(1,ry/rx);
    const shade=c.createRadialGradient(0,0,rx*.56,0,0,rx*1.85),alpha=this.weight*(this.reduced.matches?.12:.52);
    shade.addColorStop(0,'rgba(4,14,19,0)');shade.addColorStop(.38,`rgba(4,14,19,${alpha*.28})`);shade.addColorStop(1,`rgba(4,14,19,${alpha})`);
    c.fillStyle=shade;c.fillRect(-focus.x,-focus.y*rx/ry,camera.width,camera.height*rx/ry);c.restore();
  }
  cancel():void{this.shot=null;this.recent=[];this.weight=0;this.bounds=null;}
  dispose():void{this.off.forEach(off=>off());this.cancel();}
}
