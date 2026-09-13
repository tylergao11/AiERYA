interface Position { x:number; y:number }
interface NavigationActions { enabled:()=>boolean; cancelStroke:()=>void; pan:(x:number,y:number)=>void }

/** A second finger takes ownership of the whole gesture, including both releases. */
export class SlayerNavigation {
  private readonly points=new Map<number,Position>();
  private navigating=false;
  private mouse=false;
  private anchor:Position|null=null;
  private readonly abort=new AbortController();
  get active():boolean{return this.navigating;}
  constructor(private readonly canvas:HTMLCanvasElement,private readonly actions:NavigationActions){
    const options={capture:true,passive:false,signal:this.abort.signal};
    canvas.addEventListener('pointerdown',this.down,options);
    canvas.addEventListener('pointermove',this.move,options);
    canvas.addEventListener('pointerup',this.up,options);
    canvas.addEventListener('pointercancel',this.up,options);
    canvas.addEventListener('lostpointercapture',this.up,options);
    canvas.addEventListener('contextmenu',e=>{if(actions.enabled())e.preventDefault();},{signal:this.abort.signal});
  }
  private center():Position {
    const points=[...this.points.values()];
    return {x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};
  }
  private consume(e:PointerEvent):void{e.preventDefault();e.stopImmediatePropagation();}
  private readonly down=(e:PointerEvent):void=>{
    if(!this.actions.enabled())return;
    const touch=e.pointerType==='touch',mouse=!touch&&(e.shiftKey||e.button===2);
    if(!touch&&!mouse)return;
    this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!mouse&&this.points.size<2)return;
    this.navigating=true;this.mouse=mouse;this.anchor=this.center();
    this.actions.cancelStroke();this.canvas.setPointerCapture(e.pointerId);this.consume(e);
  };
  private readonly move=(e:PointerEvent):void=>{
    if(!this.points.has(e.pointerId))return;
    this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!this.navigating)return;
    this.consume(e);
    if(!this.actions.enabled()){this.cancel();return;}
    if(!this.mouse&&this.points.size<2)return;
    const next=this.center();
    if(this.anchor)this.actions.pan(next.x-this.anchor.x,next.y-this.anchor.y);
    this.anchor=next;
  };
  private readonly up=(e:PointerEvent):void=>{
    if(!this.points.has(e.pointerId))return;
    this.points.delete(e.pointerId);
    if(this.navigating)this.consume(e);
    this.anchor=this.points.size?this.center():null;
    if(!this.points.size){this.navigating=false;this.mouse=false;}
  };
  cancel():void {
    if(this.points.size)this.actions.cancelStroke();
    this.points.clear();this.navigating=false;this.mouse=false;this.anchor=null;
  }
  dispose():void{this.abort.abort();this.cancel();}
}
