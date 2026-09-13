import { REWARDS, type RunBuild } from './roguelike';

/** Only a paid manual hit feeds momentum. Echoes, empty strokes and summons cannot farm it. */
export const SLAYER_COMBO = {
  window: 3.2, thresholds: [8, 20, 40], names: ['起势', '连斩', '疾风', '无双'],
  bankCap: 1.2, bankShare: .25, finishShare: .5,
  pureThreshold: .5, purePower: .45, pureLength: 9,
} as const;

/** Even a dormant foreign talent breaks purity; common, roots and reactions do not. */
export function pureSlayer(build: RunBuild): boolean {
  return build.spellOnly && !REWARDS.some(r => (r.lane === 'array' || r.lane === 'spirit') && build.level(r.id) > 0);
}

export class SlayerCombo {
  score = 0;
  remaining = 0;
  momentum = 0;
  get count(): number { return Math.floor(this.score + 1e-8); }
  get tier(): number { return SLAYER_COMBO.thresholds.filter(t => this.score + 1e-8 >= t).length; }
  finisher(_investment: number, charge: number, paid: boolean): number {
    return paid && charge >= 2 && this.momentum >= .5 ? .5 : 0;
  }
  spend(amount: number): void { this.momentum = Math.max(0, this.momentum - Math.max(0, amount)); }
  hit(investment: number, hits: number, charge: number): void {
    if (!Number.isFinite(investment) || investment <= 0 || hits <= 0) return;
    const weight = Math.min(1, investment);
    this.score = Math.min(999, this.score + hits * weight);
    // A streamed slash pays fractional energy but earns the full continuation window.
    this.remaining = SLAYER_COMBO.window;
    if (charge < 2) this.momentum = Math.min(SLAYER_COMBO.bankCap, this.momentum + .25);
  }
  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining <= 0) this.clear();
  }
  clear(): void { this.score = 0; this.remaining = 0; this.momentum = 0; }
}
