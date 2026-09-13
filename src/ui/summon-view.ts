import type { World } from '../game/world';
import { CLEARING, mapPoint } from '../game/map';
import { CAMP } from '../game/terrain';
import type { SceneView } from '../render/view';
import { ART, toArt, type ViewportRect } from '../render/projection';
import { SlayerNavigation } from './slayer-navigation';
import './summon-view.css';

export interface FieldBlock { edge:'top'|'bottom'; top:number; bottom:number }
export function summonFieldRect(width:number,height:number,blocks:readonly FieldBlock[]):ViewportRect|null {
  if(![width,height].every(Number.isFinite)||width<=0||height<=0)return null;
  let top=0,bottom=height;
  for(const b of blocks){
    if(!Number.isFinite(b.top)||!Number.isFinite(b.bottom)||b.bottom<=b.top)continue;
    if(b.edge==='top')top=Math.max(top,b.bottom+8);else bottom=Math.min(bottom,b.top-8);
  }
  top=Math.max(0,top);bottom=Math.min(height,bottom);
  return bottom-top>=140?{x:0,y:top,width,height:bottom-top}:null;
}

/** The portrait summoner keeps readable bodies, with an explicit whole-map escape. */
export class SummonView {
  private readonly button=document.createElement('button');
  private readonly map=document.createElement('div');
  private readonly navigation:SlayerNavigation;
  private readonly markers=new Map<string,SVGCircleElement>();
  private readonly abort=new AbortController();
  private readonly off:(()=>void)[];
  private readonly observer:ResizeObserver;
  private preferred:boolean|undefined;
  private near=false;
  private blocked=false;
  private dirty=true;
  private pointer:number|null=null;
  private nextMap=0;
  private disposed=false;
  constructor(private readonly host:HTMLElement,private readonly world:World,private readonly view:SceneView,private readonly cancelStroke:()=>void){
    this.button.type='button';this.button.className='summon-view-toggle';this.button.hidden=true;
    this.button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6"/><circle cx="12" cy="12" r="4"/></svg><span>全景</span>';
    this.map.className='summon-minimap';this.map.hidden=true;this.map.tabIndex=0;this.map.setAttribute('role','group');
    this.map.setAttribute('aria-label','战场地图，点按移镜，方向键移动');
    const camp=toArt(CAMP),outline=CLEARING.map(p=>{const a=toArt(p);return `${a.x},${a.y}`;}).join(' ');
    this.map.innerHTML=`<svg viewBox="0 0 ${ART.width} ${ART.height}" aria-hidden="true"><polygon points="${outline}"/><path class="summon-map-camp" d="M${camp.x-40} ${camp.y+24}l40-70 40 70Z"/><g></g><rect/></svg><span>点地图移镜</span>`;
    host.querySelector('.tools')!.prepend(this.button);host.append(this.map);
    this.navigation=new SlayerNavigation(view.canvas,{enabled:()=>this.near&&!this.blocked&&!world.ultimate.active,cancelStroke,pan:(x,y)=>{view.panBy(x,y);this.mapFrame();}});
    const options={signal:this.abort.signal};
    this.button.addEventListener('click',e=>{e.stopPropagation();if(this.blocked||world.ultimate.active)return;this.navigation.cancel();this.cancelStroke();view.beginStroke();this.preferred=!this.near;this.dirty=true;this.update(this.blocked);},options);
    this.map.addEventListener('pointerdown',e=>{if(e.button!==0||this.blocked||world.ultimate.active)return;this.navigation.cancel();cancelStroke();this.pointer=e.pointerId;this.map.setPointerCapture(e.pointerId);this.moveMap(e);},options);
    this.map.addEventListener('pointermove',e=>{if(e.pointerId===this.pointer)this.moveMap(e);},options);
    for(const name of ['pointerup','pointercancel','lostpointercapture'])this.map.addEventListener(name,()=>{this.pointer=null;},options);
    this.map.addEventListener('keydown',e=>{const d={ArrowLeft:[36,0],ArrowRight:[-36,0],ArrowUp:[0,36],ArrowDown:[0,-36]}[e.key];if(!d||!this.near||this.blocked||world.ultimate.active)return;e.preventDefault();e.stopPropagation();cancelStroke();view.panBy(d[0]!,d[1]!);this.mapFrame();},options);
    window.addEventListener('resize',()=>{this.dirty=true;this.navigation.cancel();this.pointer=null;},options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.navigation.cancel();this.pointer=null;}},options);
    this.observer=new ResizeObserver(()=>{this.dirty=true;});
    for(const el of host.querySelectorAll('.status,.tools,.build-strip,.summon-hud,.elements,.actions'))this.observer.observe(el);
    this.off=[world.events.on('phase',()=>{this.dirty=true;this.navigation.cancel();this.pointer=null;}),world.events.on('reset',()=>{this.preferred=undefined;this.dirty=true;this.navigation.cancel();this.pointer=null;})];
    this.update(false);
  }
  private available():boolean{return this.world.mechanics.commands.stormOnly&&['prepare','battle'].includes(this.world.phase)&&this.view.camera.width<=600&&this.view.camera.height>this.view.camera.width;}
  private rectangle():ViewportRect|null {
    const canvas=this.view.canvas.getBoundingClientRect(),blocks:FieldBlock[]=[];
    for(const [selector,edge] of [['.status,.tools,.build-strip,.summon-hud','top'],['.elements,.actions','bottom']] as const)
      for(const el of this.host.querySelectorAll<HTMLElement>(selector)){if(!el.getClientRects().length)continue;const r=el.getBoundingClientRect();blocks.push({edge,top:r.top-canvas.top,bottom:r.bottom-canvas.top});}
    return summonFieldRect(canvas.width,canvas.height,blocks);
  }
  private apply(rect:ViewportRect|null):void {
    const was=this.near;this.near=!!rect;this.navigation.cancel();this.pointer=null;this.cancelStroke();this.view.navigate(rect);
    if(rect&&!was){
      const troops=this.world.mechanics.commands.troops;
      const center=troops.length?{x:troops.reduce((n,s)=>n+s.x,0)/troops.length+2,z:troops.reduce((n,s)=>n+s.z,0)/troops.length-2}:CAMP;
      const p=this.view.project(center);this.view.panBy(rect.x+rect.width/2-p.x,rect.y+rect.height/2-p.y);
    }
    this.nextMap=0;
  }
  private moveMap(e:PointerEvent):void {
    if(!this.near||this.blocked||this.world.ultimate.active){this.pointer=null;return;}e.preventDefault();
    const matrix=this.map.querySelector('svg')!.getScreenCTM();if(!matrix)return;
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());this.view.beginStroke();
    const at=this.view.project(mapPoint(Math.max(0,Math.min(ART.width,p.x)),Math.max(0,Math.min(ART.height,p.y)))),r=this.view.camera.viewport!;
    this.view.panBy(r.x+r.width/2-at.x,r.y+r.height/2-at.y);this.mapFrame();
  }
  private mapFrame():void {
    const c=this.view.camera,r=c.viewport;if(!r)return;
    const p=toArt(c.unproject(r.x,r.y)),box=this.map.querySelector('rect')!;
    for(const [name,value] of Object.entries({x:p.x,y:p.y,width:r.width/c.scale,height:r.height/c.scale}))box.setAttribute(name,String(value));
  }
  private updateMap():void {
    this.mapFrame();if(performance.now()<this.nextMap)return;this.nextMap=performance.now()+120;
    const live=new Set<string>(),host=this.map.querySelector('g')!;
    const actors=[...this.world.wolves.filter(w=>w.action!=='dead').map(w=>({key:`w${w.id}`,point:w,kind:'enemy',radius:w.kind==='king'?22:w.kind==='elite'?17:11})),
      ...this.world.mechanics.commands.troops.map(s=>({key:`s${s.id}`,point:s,kind:'spirit',radius:15}))];
    for(const a of actors){live.add(a.key);let node=this.markers.get(a.key);if(!node){node=document.createElementNS('http://www.w3.org/2000/svg','circle');node.setAttribute('class',a.kind);this.markers.set(a.key,node);host.append(node);}const p=toArt(a.point);node.setAttribute('cx',String(p.x));node.setAttribute('cy',String(p.y));node.setAttribute('r',String(a.radius));}
    for(const [id,node] of this.markers)if(!live.has(id)){node.remove();this.markers.delete(id);}
  }
  update(blocked:boolean):void {
    if(this.disposed)return;this.blocked=blocked;const available=this.available();this.host.classList.toggle('summon-mobile-view',available);
    if(!available&&this.near)this.apply(null);
    if(blocked){this.navigation.cancel();this.pointer=null;}
    if(available&&!blocked&&this.dirty&&!this.world.ultimate.active&&!this.view.drawingActive){
      const rect=this.preferred===false?null:this.rectangle(),old=this.view.camera.viewport;
      if(!!rect!==this.near||rect&&(!old||Math.abs(rect.y-old.y)>1||Math.abs(rect.height-old.height)>1||rect.width!==old.width))this.apply(rect);
      this.dirty=false;
    }
    this.button.hidden=!available;this.button.disabled=blocked||this.world.ultimate.active;
    const label=this.near?'全景':'近景',text=this.button.querySelector('span')!;
    if(text.textContent!==label)text.textContent=label;
    this.button.setAttribute('aria-label',this.near?'恢复全景':'放大战场');this.button.setAttribute('aria-pressed',String(this.near));
    this.button.title=this.near?'恢复完整战场 · 近景可双指或小地图移镜':'放大战场，保留点按指挥与划线授令';
    this.map.hidden=!this.near||blocked||this.world.ultimate.active;
    if(!this.map.hidden){const r=this.view.camera.viewport!;this.map.style.top=`${r.y+8}px`;this.updateMap();}
  }
  dispose():void {if(this.disposed)return;if(this.near)this.apply(null);this.disposed=true;this.abort.abort();this.observer.disconnect();this.off.forEach(off=>off());this.navigation.dispose();this.button.remove();this.map.remove();this.host.classList.remove('summon-mobile-view');}
}
