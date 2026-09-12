import type { Element, Modifier, Stat } from './contracts';

/** Re-evaluated from immutable definitions; removing an upgrade never compounds drift. */
export class StatModifiers {
  private readonly entries = new Map<string, Modifier>();
  add(modifier: Modifier): void { this.entries.set(modifier.id, modifier); }
  remove(id: string): void { this.entries.delete(id); }
  clear(): void { this.entries.clear(); }
  value(stat: Stat, base: number, element?: Element): number {
    let add = 0, multiply = 1;
    for (const entry of this.entries.values()) if (entry.stat === stat && (!entry.element || entry.element === element)) {
      add += entry.add ?? 0; multiply *= entry.multiply ?? 1;
    }
    return (base + add) * multiply;
  }
}
