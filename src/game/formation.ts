import { type Point } from '../core/math';
import type { CompanionAttack, WardFormationContext, WardFormationEffect } from './contracts';
import { buildable } from './terrain';
import { wardContains } from './ward-geometry';

export interface PlannedCompanion {
  readonly effectId: string;
  readonly kind: string;
  readonly at: Point;
  readonly attack: CompanionAttack;
}

/** Run-local gameplay effects. Replacing an ID does not stack duplicate hooks. */
export class WardFormationEffects {
  private readonly effects = new Map<string, WardFormationEffect>();

  add(effect: WardFormationEffect): void {
    if (!effect.id.trim()) throw new Error('A formation effect requires an ID');
    this.effects.set(effect.id, Object.freeze({ ...effect }));
  }
  remove(id: string): void { this.effects.delete(id); }
  clear(): void { this.effects.clear(); }

  plan(context: WardFormationContext): PlannedCompanion[] {
    const result: PlannedCompanion[] = [];
    // Effects receive a detached, immutable snapshot, never the live ward or World.
    const snapshot: WardFormationContext = Object.freeze({ ...context, ward: Object.freeze({
      ...context.ward, points: Object.freeze(context.ward.points.map(p => Object.freeze({ ...p }))),
      ...(context.ward.regions ? { regions: Object.freeze(context.ward.regions.map(region => Object.freeze(region.map(ring => Object.freeze(ring.map(p => Object.freeze({ ...p }))))))) } : {}),
    }) });
    for (const effect of this.effects.values()) {
      if (effect.element && effect.element !== snapshot.ward.element) continue;
      for (const spawn of effect.plan(snapshot)) {
        const { damage, interval, range } = spawn.attack;
        if (!spawn.kind.trim() || ![damage, interval, range].every(Number.isFinite) || damage < 0 || interval <= 0 || range <= 0) {
          throw new Error(`Invalid companion definition from formation effect: ${effect.id}`);
        }
        const at = spawn.at ?? snapshot.ward;
        if (!Number.isFinite(at.x) || !Number.isFinite(at.z) || !wardContains(at, snapshot.ward) || !buildable(at)) {
          throw new Error(`Companion spawn must be inside its ward: ${effect.id}`);
        }
        result.push({ effectId: effect.id, kind: spawn.kind, at: { x: at.x, z: at.z }, attack: Object.freeze({ damage, interval, range }) });
      }
    }
    return result;
  }
}
