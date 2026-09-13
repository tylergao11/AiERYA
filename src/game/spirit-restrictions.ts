import type { RunSpirit } from './rogue-combat';
import type { World } from './world';

export type SpiritRestriction = 'silenced' | 'suppressed';
/** One read-only rule for simulation, body effects and the companion roster. */
export function spiritRestriction(world: World, spirit: RunSpirit): SpiritRestriction | null {
  if ((spirit.hp ?? 100) <= 0) return 'suppressed';
  if (spirit.wardId !== undefined) {
    const ward = world.wards.find(w => w.id === spirit.wardId);
    if (!ward || ward.health <= 0 || ward.suppressed > 0) return 'suppressed';
  }
  return world.enemyAbilities.silenced(spirit) ? 'silenced' : null;
}

/** Cancel a windup once; clearing a short restriction cannot resurrect its delayed launch. */
export class SpiritRestrictions {
  private readonly states = new Map<number, SpiritRestriction>();
  private tickets = new WeakMap<RunSpirit, number>();
  begin(spirit: RunSpirit): number { const token = (this.tickets.get(spirit) ?? 0) + 1; this.tickets.set(spirit, token); return token; }
  valid(spirit: RunSpirit, token: number): boolean { return this.tickets.get(spirit) === token; }
  refresh(world: World, spirits: readonly RunSpirit[]): void {
    const live = new Set(spirits.map(s => s.id));
    for (const id of this.states.keys()) if (!live.has(id)) this.states.delete(id);
    for (const s of spirits) {
      const state = spiritRestriction(world, s), old = this.states.get(s.id) ?? null;
      if (state && s.cast > 0) { s.cast = 0; this.begin(s); }
      if (state === old) continue;
      if (state) this.states.set(s.id, state); else this.states.delete(s.id);
      world.events.emit('spiritRestriction', { spiritId: s.id, at: { x: s.x, z: s.z }, element: s.element, state: state ?? 'free' });
    }
  }
  clear(): void { this.states.clear(); this.tickets = new WeakMap(); }
}
