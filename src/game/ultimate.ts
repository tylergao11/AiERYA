import type { Element } from './contracts';
import type { CombatStroke } from './combat';
import { ROGUE } from './rogue-balance';

export const ULTIMATE = Object.freeze({ captureSeconds: 3, windupSeconds: 0.28, releaseSeconds: 0.85, effect: 2, width: 2 });
export interface StoredStroke { readonly element: Element; readonly stroke: CombatStroke }
/** Uses the active frame clock, independently of frozen battle time. */
export class TimeStopUltimate {
  stage: 'idle' | 'drawing' | 'release' = 'idle';
  available = true;
  elapsed = 0;
  private committed = false;
  private stored: StoredStroke[] = [];
  get active(): boolean { return this.stage !== 'idle'; }
  get strokes(): readonly StoredStroke[] { return this.stored; }
  get remaining(): number { return Math.max(0, ULTIMATE.captureSeconds - this.elapsed); }
  start(): boolean {
    if (!this.available || this.active) return false;
    this.available = false; this.elapsed = 0; this.committed = false; this.stored = []; this.stage = 'drawing'; return true;
  }
  add(stroke: CombatStroke, element: Element): boolean {
    if (this.stage !== 'drawing' || this.stored.length >= ROGUE.limits.storedStrokes) return false;
    this.stored.push({ element, stroke: structuredClone(stroke) }); return true;
  }
  tick(dt: number, close: () => void, release: (strokes: readonly StoredStroke[]) => void): void {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += dt;
    if (this.stage === 'drawing' && this.elapsed >= ULTIMATE.captureSeconds - 1e-9) {
      close(); // Give pointer input one final chance to finish its current stroke.
      this.elapsed = Math.max(0, this.elapsed - ULTIMATE.captureSeconds); this.stage = 'release';
    }
    if (this.stage === 'release') {
      if (!this.committed && this.elapsed >= ULTIMATE.windupSeconds - 1e-9) { this.committed = true; release(this.stored); }
      if (this.elapsed >= ULTIMATE.releaseSeconds) { this.stage = 'idle'; this.stored = []; this.elapsed = 0; }
    }
  }
  clear(refill = false): void { this.stage = 'idle'; this.elapsed = 0; this.stored = []; this.committed = false; if (refill) this.available = true; }
}
