import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { distance, random } from '../src/core/math';
import { World } from '../src/game/world';
import { ROGUE } from '../src/game/rogue-balance';
import { aim, pairs, inputProfiles, selectReward, type Gesture, type Style, type InputProfile } from './slayer-probe-controller';
const engineFiles = ['src/core/math.ts', ...readdirSync('src/game').filter(name => name.endsWith('.ts')).map(name => `src/game/${name}`)].sort();
const sourceHashes = Object.fromEntries(engineFiles.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
const engineSignature = createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex');

function simulate(route: string, style: Style, seed: number, input: InputProfile) {
  const world = new World({ roguelike: true, random: random(seed) }), pair = pairs[route]!;
  const controllerRandom = random(seed ^ 0x5f3759df), profile = inputProfiles[input];
  const draft = world.birthDraft;
  for (let n = 0; !pair.every(b => draft.candidates.some(d => d.boon === b)); n++) { if (n > 1000) throw Error('Opening not drawn'); draft.roll(); }
  for (const boon of pair) draft.toggle(draft.candidates.find(d => d.boon === boon)!.serial);
  expect(world.chooseBirth()).toBe(true);
  const opening = structuredClone(world.build.starting), waves: unknown[] = [], picked: string[] = [];
  let clock = 0, next = 0, gesture: Gesture | null = null, casts = 0, failed = 0, debtCasts = 0, heavies = 0, specials = 0, returnCuts = 0, scars = 0, rushes = 0, spent = 0, emptyStrokes = 0;
  let waveClock = 0, waveCasts = 0, waveDamage = 0, waveKills = 0, peak = 0, minSpirit = world.spirit, minHealth = 100, repairs = 0, lowManaSeconds = 0;
  world.events.on('slayerStrike', e => { if (e.level >= 2) heavies++; if (e.rush) rushes++; if (!e.hits) emptyStrokes++; }); world.events.on('slayerFinisher', () => specials++);
  world.events.on('slayerReturn', () => returnCuts++); world.events.on('rogueEffect', e => { if (e.label === '交叉引爆') scars++; });
  world.events.on('campHit', e => { waveDamage += e.amount; });
  const record = () => waves.push({ wave: world.wave, seconds: +(clock - waveClock).toFixed(1), casts: casts - waveCasts, kills: world.kills - waveKills, campDamage: +waveDamage.toFixed(1), health: +world.health.toFixed(1), mana: +world.spirit.toFixed(1), lowestMana: +minSpirit.toFixed(1), lowestHealth: +minHealth.toFixed(1), peak });
  world.startWave();
  for (let frame = 0; frame < 60 * 1050 && world.phase !== 'won' && world.phase !== 'lost'; frame++) {
    clock = frame / 60;
    if (world.phase === 'rest') {
      record(); const id = selectReward(world, route); picked.push(id); world.chooseUpgrade(id);
      while (world.health <= 80 && world.repairCamp()) repairs++;
      waveClock = clock; waveCasts = casts; waveKills = world.kills; waveDamage = 0; peak = 0; minSpirit = world.spirit; minHealth = world.health;
      gesture = null; next = clock + .15; world.startWave();
    }
    const alive = world.wolves.filter(e => e.action !== 'dead'); peak = Math.max(peak, alive.length);
    minSpirit = Math.min(minSpirit, world.spirit); minHealth = Math.min(minHealth, world.health);
    if (world.spirit < 3) lowManaSeconds += 1 / 60;
    if (style === 'combo' && world.ultimate.available && !gesture && (world.spirit < 4 || alive.length >= 35 || world.health < 35 && alive.length > 3 || alive.some(e => e.kind === 'king' && distance(e, world.camp) < 15))) world.startUltimate();
    if (gesture && clock + 1e-9 >= gesture.ends) {
      const before = world.ledger.spent, inDebt = world.spirit < 0;
      world.selected = gesture.element;
      const ok = gesture.ultimate ? world.queueUltimateStroke(gesture.points, gesture.element, gesture.seconds) : world.draw(gesture.points, gesture.seconds);
      if (ok) { casts++; spent += world.ledger.spent - before; if (inDebt || world.spirit < 0) debtCasts++; } else failed++;
      gesture = null; next = clock + profile.gap;
    }
    if (!gesture && clock >= next) { gesture = aim(world, style, clock, casts, input, controllerRandom); if (!gesture) next = clock + .12; }
    world.tick(1 / 60);
    expect(Number.isFinite(world.spirit)).toBe(true);
  }
  record();
  return { probeVersion: 4, engineSignature, balance: structuredClone(ROGUE.slayer), route, style, seed, input, inputParameters: profile, opening, phase: world.phase, wave: world.wave, kills: world.kills, health: world.health, seconds: +clock.toFixed(1), casts, failed, emptyStrokes, spent, income: world.ledger.earned, mana: world.spirit, debtCasts, heavies, specials, returnCuts, scars, rushes, repairs, lowManaSeconds: +lowManaSeconds.toFixed(1), picked, damage: world.combatTotals, waves };
}
it('records bounded-gesture campaign probes without spawning fixtures or granting currency', () => {
  const selected = process.env.SLAYER_PROBE_CASE;
  const cases = selected ? selected.split(',').map(value => value.split(':')) : [['blades', 'combo'], ['pressure', 'combo'], ['scars', 'combo'], ['blades', 'spam'], ['blades', 'tiny']];
  const seed = Number(process.env.SLAYER_PROBE_SEED ?? 73451);
  const incomes = process.env.SLAYER_PROBE_KILL_INCOME?.split(',').map(Number) ?? [ROGUE.slayer.killIncome];
  const inputs = process.env.SLAYER_PROBE_INPUT?.split(',') ?? ['precise'];
  if (!inputs.every(value => Object.hasOwn(inputProfiles, value))) throw Error('Invalid input profile');
  if (!incomes.every(value => Number.isFinite(value) && value >= 0 && value <= 3)) throw Error('Invalid Slayer income comparison');
  const originalIncome = ROGUE.slayer.killIncome;
  const results: ReturnType<typeof simulate>[] = [];
  try {
    // This override belongs only to the comparison process; production values stay unchanged.
    for (const killIncome of incomes) {
      Object.assign(ROGUE.slayer, { killIncome });
      for (const input of inputs) for (const [route, style] of cases) {
        const r = simulate(route!, style as Style, seed, input as InputProfile); results.push(r);
        console.info(JSON.stringify({ route, style, input, killIncome, phase: r.phase, wave: r.wave, mana: r.mana, debtCasts: r.debtCasts, heavy: r.heavies, casts: r.casts }));
      }
    }
  } finally { Object.assign(ROGUE.slayer, { killIncome: originalIncome }); }
  mkdirSync('artifacts/slayer', { recursive: true });
  writeFileSync(`artifacts/slayer/campaign-${process.env.SLAYER_PROBE_REPORT ?? 'baseline'}.json`, JSON.stringify(results, null, 2));
  writeFileSync(`artifacts/slayer/campaign-${process.env.SLAYER_PROBE_REPORT ?? 'baseline'}.meta.json`, JSON.stringify({ engineSignature, sourceHashes }, null, 2));
  expect(results.every(r => Number.isFinite(r.mana) && r.casts > 0)).toBe(true);
}, 180000);
