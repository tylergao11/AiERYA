import { distance, type Point } from '../core/math';
import type { Ward, Wolf } from './contracts';
import { wolfClear, wolfGround, wolfWall } from './wolf-collision';
import { wolfProfile } from './wolves';

export const ELITE_VAULT = { distance: 4.5, windup: 0.26, flight: 0.56, recovery: 0.2, cooldown: 4.5, height: 66 } as const;
export interface VaultPlan { start: Point; end: Point; wallId: number }
function freeLanding(p: Point, wolf: Wolf, wards: readonly Ward[], wolves: readonly Wolf[]): boolean {
  const radius = wolfProfile(wolf).radius;
  return wolfClear(p, radius + 0.08, wards) && wolves.every(other => {
    if (other.id === wolf.id || other.action === 'dead') return true;
    const occupied = other.motion?.vault?.end ?? other;
    return distance(p, occupied) >= radius + wolfProfile(other).radius + 0.18;
  });
}
/** Only soil walls can be crossed. The entire ground projection still avoids river, rocks and bounds. */
export function planVault(wolf: Wolf, toward: Point, wards: readonly Ward[], wolves: readonly Wolf[]): VaultPlan | null {
  if (wolf.kind !== 'elite' || wolf.rooted > 0 || (wolf.motion?.vaultCooldown ?? 0) > 0) return null;
  if (!wards.some(w => w.element === 'earth' && w.health > 0 && distance(w, wolf) < w.radius + ELITE_VAULT.distance)) return null;
  const radius = wolfProfile(wolf).radius, base = Math.atan2(toward.z - wolf.z, toward.x - wolf.x);
  for (const turn of [0, 0.3, -0.3, 0.6, -0.6]) {
    const dx = Math.cos(base + turn), dz = Math.sin(base + turn); let crossed: Ward | undefined;
    for (let step = 1; step <= 32; step++) {
      const length = step * ELITE_VAULT.distance / 32, p = { x: wolf.x + dx * length, z: wolf.z + dz * length };
      if (!wolfGround(p, radius + 0.03)) break;
      const wall = wolfWall(p, radius, wards);
      if (wall) { if (!crossed && length > 1.7) break; crossed ??= wall; }
      else if (crossed && freeLanding(p, wolf, wards, wolves) && distance(p, toward) < distance(wolf, toward) - 0.8) {
        return { start: { x: wolf.x, z: wolf.z }, end: p, wallId: crossed.id };
      }
    }
  }
  return null;
}

export function landVault(wolf: Wolf, wards: readonly Ward[], wolves: readonly Wolf[]): void {
  const plan = wolf.motion?.vault; if (!plan) return;
  const preferred = distance(wolf, plan.end) < distance(wolf, plan.start) ? plan.end : plan.start;
  let at = preferred;
  if (!freeLanding(at, wolf, wards, wolves)) {
    let found = false;
    for (let i = 0; i < 24; i++) {
      const radius = 0.2 + Math.floor(i / 8) * 0.2, a = i * Math.PI / 4;
      const p = { x: preferred.x + Math.cos(a) * radius, z: preferred.z + Math.sin(a) * radius };
      if (freeLanding(p, wolf, wards, wolves)) { at = p; found = true; break; }
    }
    if (!found) at = plan.start;
  }
  wolf.x = at.x; wolf.z = at.z; wolf.vx = wolf.vz = 0;
  wolf.motion!.vault = undefined; wolf.motion!.lift = 0; wolf.motion!.landing = 0.24;
}
