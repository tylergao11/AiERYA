import type { Point } from '../core/math';
import type { GameEvents } from '../game/contracts';
import { summonImpactSeconds, type SummonImpactArt } from './summon-impact-art';

const LIMIT = 48;
interface Coordination { age: number; at: Point; targetId?: number; owners: number[] }
const accompanies = (e: GameEvents['summonImpact'], f: Coordination) => !e.union &&
  (f.targetId === undefined || e.targetId === f.targetId) && (!f.owners.length || e.spiritId !== undefined && f.owners.includes(e.spiritId)) && Math.hypot(e.at.x-f.at.x,e.at.z-f.at.z)<.4;
/** Preserve contact identity while sharing one readable crest within a tight volley. */
export class SummonImpactBuffer {
  private impacts: SummonImpactArt[] = [];
  private coordination: Coordination[] = [];
  get entries(): readonly SummonImpactArt[] { return this.impacts; }
  add(event: GameEvents['summonImpact'], melee: boolean, ancestor: boolean): void {
    const shared = event.union && !event.echo && this.impacts.some(e =>
      e.union && !e.echo && !e.accent && e.age < .3 && e.element === event.element &&
      (e.targetId === undefined || event.targetId === undefined || e.targetId === event.targetId) &&
      Math.hypot(e.at.x - event.at.x, e.at.z - event.at.z) < 1.25);
    if (this.impacts.length >= LIMIT) {
      const light = this.impacts.findIndex(e => e.echo || e.accent || !e.union);
      // A burst of echoes must not evict the main contact it is accompanying.
      if (light < 0 && event.echo) return;
      this.impacts.splice(light < 0 ? 0 : light, 1);
    }
    this.impacts.push({ ...event, at: { ...event.at }, from: { ...event.from }, age: 0, melee, ancestor, accent: shared || this.coordination.some(f=>accompanies(event,f)) });
  }
  feature(event: GameEvents['summonTechnique']): void {
    if(event.kind!=='pincer'&&event.kind!=='seal')return;
    const f:Coordination={age:0,at:{...event.at},targetId:event.targetId,owners:[event.spiritId,event.partner?.spiritId].filter((id):id is number=>id!==undefined)};
    if(this.coordination.length>=8)this.coordination.shift();this.coordination.push(f);
    for(const e of this.impacts)if(e.age<.08&&accompanies(e,f))e.accent=true;
  }
  hasNativeDuplicate(at: Point, spiritId?: number, targetId?: number): boolean {
    return this.impacts.some(e => !e.echo && e.age < .08 &&
      (spiritId === undefined || e.spiritId === spiritId) && (targetId === undefined || e.targetId === targetId) &&
      Math.hypot(e.at.x - at.x, e.at.z - at.z) < .2);
  }
  update(dt: number): void {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.impacts = this.impacts.filter(e => { e.age += step; return e.age < summonImpactSeconds(e); });
    this.coordination=this.coordination.filter(f=>{f.age+=step;return f.age<.08;});
  }
  clear(): void { this.impacts = []; this.coordination=[]; }
}
