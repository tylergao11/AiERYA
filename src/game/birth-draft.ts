import { ELEMENTS } from './contracts';
import { ROGUE as B } from './rogue-balance';
import { FATES, destinyBoons, destinyKey, type Boon, type Destiny, type Fate } from './roguelike';

const BOON_POOLS: Record<Fate, readonly Boon[]> = { slayer: ['three', 'scar', 'debt'], array: ['twinArray', 'fivefold', 'living'], spirit: ['twins', 'mimic', 'beast'] };
/** Weighted sampling without replacement: five real configurations, no pity or retained rolls. */
export function birthPool(): { destiny: Omit<Destiny, 'serial'>; weight: number }[] {
  const roots = ELEMENTS.flatMap((a, i) => [[a], ...ELEMENTS.slice(i + 1).map(b => [a, b])]);
  return (Object.keys(FATES) as Fate[]).flatMap(fate => roots.flatMap(root =>
    [0, 1, 2, 3].map(i => ({ destiny: { fate, roots: root, tier: i === 3 ? 'heaven' as const : i === 2 ? 'unusual' as const : 'ordinary' as const, boon: BOON_POOLS[fate][i] ?? null },
      weight: (root.length === 1 ? B.opening.singleAffinity / 5 : (1 - B.opening.singleAffinity) / 10) * B.opening.tiers[i]! / 3 }))));
}

export class BirthDraft {
  candidates: readonly Destiny[] = [];
  readonly selected = new Set<number>();
  inspected = 0;
  round = 0;
  message = '';
  constructor(private readonly rng: () => number = Math.random) { this.roll(); }
  roll(): void {
    const pool = birthPool(), choices: Destiny[] = []; this.round++;
    for (let n = 0; n < B.opening.count; n++) {
      let draw = Math.min(1 - Number.EPSILON, Math.max(0, this.rng())) * pool.reduce((sum, entry) => sum + entry.weight, 0), index = 0;
      while (index < pool.length - 1 && draw >= pool[index]!.weight) { draw -= pool[index]!.weight; index++; }
      const entry = pool.splice(index, 1)[0]!;
      choices.push({ ...entry.destiny, roots: [...entry.destiny.roots], serial: this.round * 5 + n });
      // Each option has distinct effects, so both selected talents fully contribute.
      for (let i = pool.length - 1; i >= 0; i--) if (destinyBoons({ ...pool[i]!.destiny, serial: 0 }).some(boon => destinyBoons(choices.at(-1)!).includes(boon))) pool.splice(i, 1);
    }
    this.candidates = choices; this.selected.clear(); this.inspected = choices[0]!.serial; this.message = '';
  }
  inspect(id: number): boolean { if (!this.candidates.some(d => d.serial === id)) return false; this.inspected = id; return true; }
  toggle(id: number): boolean {
    if (!this.inspect(id)) return false;
    if (this.selected.delete(id)) { this.message = ''; return true; }
    if (this.selected.size >= B.opening.chosen) { this.message = '已选满两个，可先取消一项再替换'; return false; }
    this.selected.add(id); this.message = ''; return true;
  }
  get detail(): Destiny { return this.candidates.find(d => d.serial === this.inspected) ?? this.candidates[0]!; }
  get choices(): readonly Destiny[] { return [...this.selected].flatMap(id => this.candidates.filter(d => d.serial === id)); }
  get ready(): boolean { return this.choices.length === 2 && new Set(this.choices.map(destinyKey)).size === 2; }
}
