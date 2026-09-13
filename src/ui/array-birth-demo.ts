import type { World } from '../game/world';
import type { Point } from '../core/math';
import type { Wolf } from '../game/contracts';

const loop=(x:number,z:number):Point[]=>[[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]].map(([a,b])=>({x:x+a!,z:z+b!}));
/** A practice pack inside an isolated preview World, using actual hits and casts. */
export class ArrayBirthDemo {
  caption='阵法命中养势 · 金木水火土各有一式';
  elapsed=0;
  stroke:Point[]=[];
  private first=false;
  private second=false;
  constructor(private readonly world:World){
    const w=world,moving=w.build.has('living');
    const slots=moving?[{e:'fire' as const,x:-9,z:0}]:[{e:'water' as const,x:-8,z:0},{e:'wood' as const,x:-2.5,z:0},{e:'fire' as const,x:3,z:0}];
    for(const n of slots){w.selected=n.e;w.place(loop(n.x,n.z));}
    w.startWave();
    w.wolves=w.wards.map((n,i):Wolf=>({id:10000+i,x:n.x+.75,z:n.z,hp:1800,maxHp:1800,speed:0,heading:0,action:'run',age:0,attack:20,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null}));
    // Begin after a short real-damage exchange, so a five-second preview can show a full route.
    for(let t=0;t<6;t++) { w.time+=.25;for(const [i,n]of w.wards.entries())w.hitRogue(w.wolves[i]!,70,n.element,{kind:'array',wardId:n.id}); }
    this.stroke=moving?[{x:-9,z:0},{x:-3,z:0}]:w.wards.map(n=>({x:n.x,z:n.z}));
    w.selected='water';
  }
  tick(dt:number):void{
    const w=this.world;this.elapsed+=dt;
    if(!this.first&&this.elapsed>=.85){this.first=true;
      if(w.build.has('living')){
        const n=w.wards[0];if(n){const target=w.wolves[0];if(target){target.x=-2.25;target.z=0;}w.moveMain(n.id,{x:-3,z:0});}
        this.caption='携势迁阵 · 落地放出焚阵燎原';
      }else{w.invoke(this.stroke);this.caption='水 → 木 → 火传势 · 水克火，蒸汽破阵';}
    }
    if(!this.second&&this.elapsed>=2.6){this.second=true;
      const n=w.wards.find(n=>n.element==='wood')??w.wards[0];
      if(n){w.selected=n.element==='wood'?'metal':'water';w.invoke([{x:n.x-2,z:n.z},{x:n.x+2,z:n.z}]);}
      this.caption=w.build.has('living')?'落地放势后，再用水克火接蒸汽':w.build.has('fivefold')?'水木双辅先聚后缚 · 再用相克放势收尾':'阵势随阵保留 · 留敌、传势，接下一轮';
    }
    w.tick(dt);w.wolves=w.wolves.filter(n=>n.id>=10000);
  }
}
