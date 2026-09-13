import { returnCrossing } from './slayer-return-crossing';
import type { CombatStroke } from './combat';
import type { Element } from './contracts';
import type { RogueHit } from './rogue-combat';
import type { World } from './world';

export const SLAYER_TECHNIQUES = { returnSeconds: 2.8, openingSeconds: 3, initiativeArm: .18, rushSeconds: 2.2, rushShare: .6, rushReserve: .3 } as const;
export interface ReturnCut { stroke: CombatStroke; element: Element; remaining: number }

/** The three reward routes connect quick -> heavy -> quick without an input cooldown. */
export class SlayerTechniques {
  initiative = 0;
  returnCut: ReturnCut | null = null;
  rush: { remaining: number; investment: number } | null = null;
  readonly openings = new Map<number, number>();
  constructor(private readonly world: World) {}
  chargeTime(seconds: number): number { return seconds >= SLAYER_TECHNIQUES.initiativeArm ? seconds + this.initiative : seconds; }
  spendInitiative(charge: number): void { if (charge >= 2) this.initiative = 0; }
  rushEnergy(stroke: CombatStroke, paid: boolean): number {
    if (!this.rush || !paid || (stroke.charge ?? 0) >= 2 || !this.world.build.has('debt')) return 0;
    return Math.min(this.rush.investment, (stroke.investment ?? 1) * SLAYER_TECHNIQUES.rushShare);
  }
  spendRush(stroke: CombatStroke, paid: boolean): void { if (paid && (stroke.charge ?? 0) < 2) this.rush = null; }
  openingPower(id: number, origin?: RogueHit): number {
    if (origin?.kind !== 'manual' || (origin.ticket?.charge ?? 0) >= 2 || !origin.ticket?.paidCost || !this.openings.has(id)) return 1;
    this.openings.delete(id);
    return 1 + .15 + this.world.build.level('slayer-focus') * .15;
  }
  after(stroke: CombatStroke, element: Element, origin: RogueHit | undefined, hits: ReadonlySet<number>): ReturnCut | null {
    if (!this.world.build.is('slayer') || origin?.kind !== 'manual' || !origin.ticket?.paidCost) return null;
    const charge = stroke.charge ?? 0, investment = stroke.investment ?? 1, build = this.world.build;
    let echo: ReturnCut | null = null;
    if (charge < 2 && this.returnCut) {
      const old = this.returnCut.stroke.points;
      const crosses = returnCrossing(stroke.points, old);
      if (crosses) {
        const saved = this.returnCut; this.returnCut = null;
        echo = { ...saved, stroke: { ...saved.stroke, points: [...saved.stroke.points].reverse(), direction: { x: -saved.stroke.direction.x, z: -saved.stroke.direction.z },
          charge: saved.stroke.charge, burst: 0, multiplier: saved.stroke.multiplier * Math.min(1, investment / (saved.stroke.investment ?? 1)) * (.35 + .15 * build.level('slayer-return')) } };
      }
    }
    if (hits.size) {
      if (charge === 3 && build.has('debt')) this.rush = { remaining: SLAYER_TECHNIQUES.rushSeconds, investment: investment * SLAYER_TECHNIQUES.rushReserve };
      if (charge < 2 && build.level('slayer-edge')) {
        const gain = .05 + .05 * build.level('slayer-edge');
        this.initiative = Math.min(gain * 3, this.initiative + investment * gain);
      }
      if (charge >= 2 && build.level('slayer-return')) this.returnCut = { stroke: structuredClone(stroke), element, remaining: SLAYER_TECHNIQUES.returnSeconds };
      if (charge === 3 && build.level('slayer-focus')) for (const id of hits) {
        if (this.world.wolves.some(w => w.id === id && w.action !== 'dead')) this.openings.set(id, SLAYER_TECHNIQUES.openingSeconds);
      }
    }
    return echo;
  }
  tick(dt: number): void {
    if (this.rush) { this.rush.remaining -= dt; if (this.rush.remaining <= 0) this.rush = null; }
    if (this.world.slayerCombo.remaining <= 0) this.initiative = 0;
    if (this.returnCut) { this.returnCut.remaining -= dt; if (this.returnCut.remaining <= 0) this.returnCut = null; }
    for (const [id, remaining] of this.openings) {
      if (remaining <= dt || !this.world.wolves.some(w => w.id === id && w.action !== 'dead')) this.openings.delete(id);
      else this.openings.set(id, remaining - dt);
    }
  }
  clear(): void { this.initiative = 0; this.returnCut = null; this.rush = null; this.openings.clear(); }
}
