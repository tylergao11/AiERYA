import type { World } from '../game/world';
import { CHARGE } from '../game/charge';

/** Bounded screen-space impulses; sustained damage cannot turn into continuous shaking. */
export class ImpactMotion {
  private strength = 0;
  private elapsed = 1;
  private sinceKick = 1;
  kick(pixels: number, maximum = 4.5): void {
    if (this.sinceKick < .13 && pixels <= this.strength) return;
    this.strength = Math.min(maximum, Math.max(this.strength * .5, Math.max(0, pixels)));
    this.elapsed = 0; this.sinceKick = 0;
  }
  update(dt: number, suppressed = false): { x: number; y: number } {
    this.elapsed += Math.max(0, dt); this.sinceKick += Math.max(0, dt);
    if (suppressed) { this.strength = 0; return { x: 0, y: 0 }; }
    const decay = Math.pow(Math.max(0, 1 - this.elapsed / .3), 2), t = this.elapsed;
    if (!this.strength || !decay) return { x: 0, y: 0 };
    return { x: Math.sin(t * 95) * this.strength * decay, y: Math.cos(t * 79) * this.strength * .48 * decay };
  }
  clear(): void { this.strength = 0; this.elapsed = 1; this.sinceKick = 1; }
}

export class SceneImpact {
  readonly motion = new ImpactMotion();
  private readonly off: (() => void)[];
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private lastVibration = -Infinity;
  constructor(world: World) {
    this.off = [world.events.on('arrayEffect', e => { if (e.targets.length && ['release', 'harmony'].includes(e.kind)) this.motion.kick(Math.min(6.5, 2 + e.energy * .045 + (e.kind==='harmony'?.8:0)),6.5); }),
      world.events.on('campHit', () => this.motion.kick(4)),
      world.events.on('summonImpact', e => { if(!e.echo && e.union)this.motion.kick(Math.min(4.5,2.8+e.strength*.3)); }),
      world.events.on('summonTechnique', e => { if(e.kind==='fury')this.motion.kick(2.5);else if(e.kind==='pincer')this.motion.kick(1.3); }),
      world.events.on('damage', e => { if (!e.ongoing && e.amount >= 40) this.motion.kick(e.amount >= 90 ? 2.7 : 1.3); }),
      world.events.on('spiritAttack', e => { if (e.stage === 'impact' && e.heavy) this.motion.kick(1.7); }),
      world.events.on('steam', e => { if (e.targets.length > 1) this.motion.kick(2.5); }),
      world.events.on('ultimate', e => { if (e.stage === 'release' && !world.mechanics.commands.stormOnly) this.motion.kick(3.8); }),
      world.events.on('slayerStrike', e => {
        if (!e.hits || this.reduced.matches) return;
        if (e.guarded === e.hits && !e.kills) { this.motion.kick(.9); return; }
        const weight = Math.min(1, e.investment), density = Math.min(1.2, e.hits * .12 + e.kills * .1);
        this.motion.kick(Math.min(7.5, ((CHARGE.shake[e.level] ?? 0) + 1 + density + e.tier * .25 + (e.burst > 0 ? .8 : 0) + ((e.rush ?? 0) > 0 ? 1.8 : 0) + (e.openings?.length ? 1.2 : 0)) * weight), 7.5);
        const now = performance.now();
        if (weight >= .5 && now - this.lastVibration >= 120 && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          this.lastVibration = now;
          try { navigator.vibrate(e.level >= 2 ? [12 + e.level * 4, 18, 16 + e.level * 7] : 8 + e.tier * 3); } catch { /* Optional device feedback. */ }
        }
      }),
      world.events.on('slayerFinisher', e => { if ((e.hits ?? 0) > (e.guarded ?? 0) && !this.reduced.matches) this.motion.kick(7.5, 7.5); }),
      world.events.on('slayerReturn',e=>{if(e.hits>e.guarded&&!this.reduced.matches)this.motion.kick((1.6+Math.min(1.5,(e.hits-e.guarded)*.15))*Math.min(1,e.investment));}),
      world.events.on('phase', () => this.motion.clear()),
      world.events.on('reset', () => this.motion.clear())];
  }
  update(dt: number, drawing: boolean) { return this.motion.update(dt, drawing || this.reduced.matches); }
  dispose(): void { this.off.forEach(off => off()); this.motion.clear(); }
}
