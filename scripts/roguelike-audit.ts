import { random, distance, type Point } from '../src/core/math';
import { World } from '../src/game/world';
import { BirthDraft } from '../src/game/birth-draft';
import { destinyBoons, destinyName, REWARDS, type Boon, type Destiny, type Fate } from '../src/game/roguelike';
import { ELEMENTS, type Element } from '../src/game/contracts';
import { mapPoint } from '../src/game/map';

const circle = (x: number, z: number, r: number): Point[] => Array.from({ length: 25 }, (_, i) => ({ x: x + Math.cos(i / 24 * Math.PI * 2) * r, z: z + Math.sin(i / 24 * Math.PI * 2) * r }));
const atArt = (x: number, y: number, r: number) => { const p = mapPoint(x, y); return circle(p.x, p.z, r); };
const layout: [Element, Point[]][] = [
  ['water', atArt(650, 304, 2.6)], ['fire', atArt(480, 283, 2.4)], ['metal', atArt(386, 272, 1.75)],
  ['wood', atArt(500, 468, 2.7)], ['water', atArt(423, 395, 2.5)], ['fire', atArt(360, 335, 2.3)],
];
function fate(f: Fate, boon: Boon | null, serial = 1): Destiny {
  return { serial, fate: f, boon, roots: ['metal'], tier: boon === null ? 'heaven' : ['debt', 'living', 'beast'].includes(boon) ? 'unusual' : 'ordinary' };
}
export const profiles: Record<string, Destiny[]> = {
  three: [fate('slayer', 'three')], scar: [fate('slayer', 'scar')], debt: [fate('slayer', 'debt')],
  twinArray: [fate('array', 'twinArray')], fivefold: [fate('array', 'fivefold')], living: [fate('array', 'living')],
  twins: [fate('spirit', 'twins')], mimic: [fate('spirit', 'mimic')], beast: [fate('spirit', 'beast')],
  heavenSlayer: [fate('slayer', null)], heavenArray: [fate('array', null)], heavenSpirit: [fate('spirit', null)],
  bladeBeast: [fate('slayer', 'three'), fate('spirit', 'beast', 2)],
  doubleMimic: [fate('spirit', 'twins'), fate('spirit', 'mimic', 2)],
  mobileSpirit: [fate('array', 'living'), fate('array', 'fivefold', 2)],
};
function score(w: World, id: string): number {
  if (id === 'awaken' || id === 'ascend') return 100;
  if (id === 'common-repair') return w.health < 50 ? 90 : 15;
  const r = REWARDS.find(r => r.id === id);
  if (r && w.build.is(r.lane as Fate)) return 60;
  if (id.startsWith('opportunity-')) return 45;
  if (id === 'common-regen') return 35;
  if (id === 'common-spell' && w.build.is('slayer')) return 30;
  if (r?.root === 'metal') return 25;
  return w.build.offers.find(r => r.id === id)?.dormant ? 0 : 10;
}
function run(choices: Destiny[], seed: number) {
  const w = new World({ roguelike: true, random: random(seed) });
  if (choices.length === 1) w.chooseDestiny(choices[0]);
  else { w.build.beginPair(choices); w.phase = 'prepare'; w.mechanics.initialize(); }
  const rewards: string[] = []; let casts = 0, awakeAt: number | null = null, ascendAt: number | null = null;
  for (let frame = 0; frame < 300 * 30 && w.phase !== 'lost'; frame++) {
    if (w.phase === 'prepare') {
      if (!w.build.spellOnly) for (const [element, points] of layout) {
        if (w.wards.length >= 6) break;
        w.selectElement(element); w.place(points);
      }
      w.startWave();
    }
    if (w.phase === 'won') w.continueRun();
    if (w.phase === 'rest') {
      let offers = [...w.build.offers].sort((a, b) => score(w, b.id) - score(w, a.id));
      if (score(w, offers[0]!.id) < 60 && w.rerollRewards()) offers = [...w.build.offers].sort((a, b) => score(w, b.id) - score(w, a.id));
      const id = offers[0]!.id; w.chooseUpgrade(id); rewards.push(id);
      if (id === 'awaken') awakeAt = w.time; if (id === 'ascend') ascendAt = w.time;
    }
    if (w.phase !== 'battle') continue;
    if (w.invocationCooldown <= 0) {
      const alive = w.wolves.filter(v => v.action !== 'dead'), target = alive.sort((a, b) => distance(a, w.camp) - distance(b, w.camp))[0];
      if (target) {
        const element: Element = w.build.is('slayer') ? 'metal' : target.burning > .5 ? 'water' : target.rooted > .3 ? 'metal' : target.wet > .1 ? 'wood' : 'metal';
        w.selectElement(element);
        if (w.spellCooldowns[element] <= 0 && w.draw([{ x: target.x - 1, z: target.z }, { x: target.x + 1, z: target.z }])) casts++;
      }
    }
    w.tick(1 / 30);
  }
  return { seed, phase: w.phase, wave: w.wave, seconds: Math.round(w.time), health: Math.round(w.health), kills: w.kills, casts,
    progress: w.build.progress, stage: w.build.stage, awakeAt, ascendAt, rewards, damage: w.combatTotals };
}
export function audit(seeds = 3) {
  const draft = new BirthDraft(random(87912)), opening = { batches: 10000, heavenBatches: 0, multiHeaven: 0, singles: 0, named: {} as Record<string, number>, boons: {} as Record<string, number> };
  for (let n = 0; n < opening.batches; n++) {
    const heavenly = draft.candidates.filter(d => d.tier === 'heaven').length;
    if (heavenly) opening.heavenBatches++; if (heavenly > 1) opening.multiHeaven++;
    for (const d of draft.candidates) { const name = destinyName(d); opening.named[name] = (opening.named[name] ?? 0) + 1; opening.singles += Number(d.roots.length === 1); for (const b of destinyBoons(d)) opening.boons[b] = (opening.boons[b] ?? 0) + 1; }
    draft.roll();
  }
  const runs = Object.fromEntries(Object.entries(profiles).map(([name, choices]) => [name, Array.from({ length: seeds }, (_, i) => run(choices, 1729 + i * 5437))]));
  return { opening, runs, methodology: '300 seconds maximum, fixed map/enemy rules, repeatable six-ward layout, nearest-threat auto strokes, only actually offered rewards and three paid-in-run rerolls; no ultimate. Single-talent profiles are diagnostic lower bounds, actual opening chooses two.' };
}
