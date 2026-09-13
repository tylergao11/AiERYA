import type { World } from '../game/world';
import type { SceneView } from '../render/view';
import type { ViewportRect } from '../render/projection';
import { SlayerNavigation } from './slayer-navigation';
import { CLEARING, mapPoint } from '../game/map';
import { ART, toArt } from '../render/projection';
import { CAMP } from '../game/terrain';

/** Optional portrait navigation leaves the default whole-field view intact. */
export class SlayerViewControls {
  private readonly button=document.createElement('button');
  private readonly hint=document.createElement('span');
  private readonly minimap=document.createElement('div');
  private readonly markers=new Map<number,SVGCircleElement>();
  private mapPointer:number|null=null;
  private readonly navigation:SlayerNavigation;
  private readonly abort=new AbortController();
  private readonly off:(()=>void)[];
  private near=false;
  private blocked=false;
  private disposed=false;
  constructor(private readonly host:HTMLElement,private readonly world:World,private readonly view:SceneView,private readonly cancelStroke:()=>void){
    this.button.type='button';this.button.className='slayer-view-toggle';this.button.hidden=true;
    this.button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M7 10h6m-3-3v6"/></svg><span>近景</span>';
    this.hint.className='slayer-view-hint';this.hint.textContent='双指或小地图移镜 · 单指划线';this.hint.hidden=true;
    this.minimap.className='slayer-minimap';this.minimap.hidden=true;this.minimap.tabIndex=0;
    this.minimap.setAttribute('role','group');this.minimap.setAttribute('aria-label','战场全图，拖动移动视野，方向键微调');
    const camp=toArt(CAMP),outline=CLEARING.map(p=>{const a=toArt(p);return `${a.x},${a.y}`;}).join(' ');
    this.minimap.innerHTML=`<svg viewBox="0 0 ${ART.width} ${ART.height}" aria-hidden="true"><polygon points="${outline}"/><path class="slayer-map-camp" d="M${camp.x-45} ${camp.y+30}l45-80 45 80Z"/><g class="slayer-map-enemies"></g><rect class="slayer-map-window"/></svg>`;
    host.querySelector('.tools')!.prepend(this.button);host.append(this.hint,this.minimap);
    this.navigation=new SlayerNavigation(view.canvas,{enabled:()=>this.near&&!this.blocked&&this.available(),cancelStroke,pan:(x,y)=>view.panBy(x,y)});
    this.button.addEventListener('click',e=>{e.stopPropagation();if(!this.blocked&&this.available())this.setNear(!this.near);},{signal:this.abort.signal});
    this.minimap.addEventListener('pointerdown',e=>{if(e.button!==0||this.blocked||!this.near)return;e.preventDefault();this.navigation.cancel();this.cancelStroke();view.beginStroke();this.mapPointer=e.pointerId;this.minimap.setPointerCapture(e.pointerId);this.moveMap(e);},{signal:this.abort.signal});
    this.minimap.addEventListener('pointermove',e=>{if(e.pointerId===this.mapPointer)this.moveMap(e);},{signal:this.abort.signal});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])this.minimap.addEventListener(name,()=>{this.mapPointer=null;},{signal:this.abort.signal});
    this.minimap.addEventListener('keydown',e=>{const delta={ArrowLeft:[32,0],ArrowRight:[-32,0],ArrowUp:[0,32],ArrowDown:[0,-32]}[e.key];if(!delta||this.blocked||!this.near)return;e.preventDefault();e.stopPropagation();this.cancelStroke();view.panBy(delta[0]!,delta[1]!);this.mapFrame();},{signal:this.abort.signal});
    window.addEventListener('resize',()=>this.setNear(false),{signal:this.abort.signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.navigation.cancel();},{signal:this.abort.signal});
    this.off=[world.events.on('phase',()=>this.setNear(false)),world.events.on('reset',()=>this.setNear(false))];
    this.update(false);
  }
  private available():boolean{return this.world.build.is('slayer')&&['prepare','battle'].includes(this.world.phase)&&this.view.camera.width<=600&&this.view.camera.height>this.view.camera.width;}
  private rectangle():ViewportRect {
    const canvas=this.view.canvas.getBoundingClientRect(),height=canvas.height;
    let top=0,bottom=height;
    for(const el of this.host.querySelectorAll<HTMLElement>('.status,.tools,.build-strip,.slayer-hud,.summon-hud,.array-hud,.elements,.actions')){
      if(!el.getClientRects().length)continue;
      const r=el.getBoundingClientRect(),y=r.top-canvas.top;
      if(y<height/2&&r.bottom-canvas.top<height*.7)top=Math.max(top,r.bottom-canvas.top+6);
      else bottom=Math.min(bottom,y-6);
    }
    return {x:0,y:top,width:canvas.width,height:Math.max(1,bottom-top)};
  }
  private setNear(near:boolean):void {
    if(this.disposed||near===this.near)return;
    this.navigation.cancel();this.mapPointer=null;this.cancelStroke();this.near=near;this.host.classList.toggle('slayer-near',near);
    this.view.navigate(near?this.rectangle():null);
    this.button.querySelector('span')!.textContent=near?'全景':'近景';
    this.update(this.blocked);
  }
  private moveMap(e:PointerEvent):void {
    if(this.blocked||!this.near){this.mapPointer=null;return;}
    e.preventDefault();
    const transform=this.minimap.querySelector('svg')!.getScreenCTM();if(!transform)return;
    const at=new DOMPoint(e.clientX,e.clientY).matrixTransform(transform.inverse());
    // A delayed finisher can start between moves; measure from the chosen view again.
    this.view.beginStroke();const c=this.view.camera,v=c.viewport!;
    const point=mapPoint(Math.max(0,Math.min(ART.width,at.x)),Math.max(0,Math.min(ART.height,at.y))),p=c.project(point);
    this.view.panBy(v.x+v.width/2-p.x,v.y+v.height/2-p.y);this.mapFrame();
  }
  private mapFrame():void {
    const c=this.view.camera,v=c.viewport;if(!v)return;
    const at=toArt(c.unproject(v.x,v.y)),frame=this.minimap.querySelector('rect')!;
    for(const [key,value] of Object.entries({x:at.x,y:at.y,width:v.width/c.scale,height:v.height/c.scale}))frame.setAttribute(key,String(value));
  }
  private updateMap():void {
    const live=new Set<number>(),host=this.minimap.querySelector('.slayer-map-enemies')!;
    for(const wolf of this.world.wolves){if(wolf.action==='dead')continue;live.add(wolf.id);let node=this.markers.get(wolf.id);
      if(!node){node=document.createElementNS('http://www.w3.org/2000/svg','circle');node.setAttribute('r',wolf.kind==='king'?'24':wolf.kind==='elite'?'17':'10');this.markers.set(wolf.id,node);host.append(node);}
      const p=toArt(wolf);node.setAttribute('cx',String(p.x));node.setAttribute('cy',String(p.y));
    }
    for(const [id,node] of this.markers)if(!live.has(id)){node.remove();this.markers.delete(id);}
    this.mapFrame();
  }
  update(blocked:boolean):void {
    this.blocked=blocked;
    if(!this.available()&&this.near)this.setNear(false);
    if(blocked){this.navigation.cancel();this.mapPointer=null;}
    this.button.hidden=!this.available();this.button.disabled=blocked;
    this.button.setAttribute('aria-label',this.near?'恢复全景':'放大战场');this.button.setAttribute('aria-pressed',String(this.near));
    this.button.title=this.near?'恢复完整战场 · 近景可双指或 Shift 拖动视野':'放大战场 · 双指移动，单指划线';
    this.hint.hidden=!this.near||blocked;this.minimap.hidden=this.hint.hidden;
    if(this.near){const r=this.view.camera.viewport!;this.hint.style.top=`${r.y+r.height-20}px`;this.minimap.style.top=`${r.y+6}px`;this.updateMap();}
    else if(this.markers.size){this.markers.forEach(node=>node.remove());this.markers.clear();}
  }
  dispose():void {if(this.disposed)return;this.setNear(false);this.disposed=true;this.abort.abort();this.off.forEach(off=>off());this.navigation.dispose();this.button.remove();this.hint.remove();this.minimap.remove();}
}
