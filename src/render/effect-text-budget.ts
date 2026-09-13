/** Cosmetic notices only. Repeated procs extend silence without extending old text. */
export class EffectTextBudget {
  private recent = new Map<string, number>();
  private active: number[] = [];
  claim(text: string, now: number): boolean {
    this.active = this.active.filter(until => until > now);
    for (const [key, until] of this.recent) if (until <= now) this.recent.delete(key);
    const repeated = this.recent.has(text);
    this.recent.set(text, now + .8);
    if (repeated || this.active.length >= 3) return false;
    this.active.push(now + 1.2);
    return true;
  }
  clear(): void { this.recent.clear(); this.active = []; }
}
