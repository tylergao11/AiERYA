import { encounter, type WaveSpawn } from './encounters';

/** Continuous, irregular arrivals. Congestion defers the queue without dropping or dumping it. */
export class WaveDirector {
  readonly plan: ReturnType<typeof encounter>;
  elapsed=0;
  private cursor=0;
  private delay=0;
  constructor(wave:number){this.plan=encounter(wave);}
  get spawned():number{return this.cursor;}
  get finished():boolean{return this.cursor>=this.plan.count;}
  tick(dt:number,spawn:(ticket:WaveSpawn)=>boolean):void{
    if(!Number.isFinite(dt)||dt<=0)return;
    this.elapsed+=dt;
    const ticket=this.plan.spawns[this.cursor];
    if(!ticket||this.elapsed+1e-9<ticket.at+this.delay||!spawn(ticket))return;
    this.delay=Math.max(this.delay,this.elapsed-ticket.at);
    this.cursor++;
  }
}