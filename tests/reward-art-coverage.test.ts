import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { World } from '../src/game/world';
import { BOONS, FATES, OPPORTUNITIES, REWARDS, boonFate, type Boon, type Destiny, type Fate, type Reward } from '../src/game/roguelike';
import { boonArt, destinyArt, rewardArt, rewardIllustrations } from '../src/ui/manuscript-art';
import { rewardPanel, buildPanel } from '../src/ui/rogue-panel';
import { UI_ART } from '../src/ui/ui-assets';

const regular: Reward[] = REWARDS.map(r => ({ ...r, detail: r.detail(1), tag: '', level: 1 }));
const destiny = (fate: Fate, boon: Boon, serial = 1): Destiny => ({ serial, fate, boon, tier: ['debt', 'living', 'beast'].includes(boon) ? 'unusual' : 'ordinary', roots: ['earth'] });
function worldFor(boon: Boon) {
  const world = new World({ roguelike: true });
  world.chooseDestiny(destiny(boonFate(boon), boon));
  return world;
}
function assertPaintedPick(world: World, reward: Reward) {
  world.build.offers = [reward];
  const html = rewardPanel(world), pick = html.match(/<button data-upgrade=[\s\S]*?<\/button>/)![0];
  expect(pick, reward.id).toContain('class="reward-painting"');
  expect(pick, reward.id).toContain('data-illustration=');
  expect(pick, reward.id).not.toContain('summon-card-scene');
  expect(pick, reward.id).not.toContain('<svg');
  expect(html.slice(html.indexOf('<details')), reward.id).toContain('aria-label="举例：');
  expect(html, reward.id).not.toMatch(/undefined|NaN/);
}

describe('complete build selection illustration coverage', () => {
  it('assigns a distinct painting to every regular mechanic and a matching painting to every opportunity', () => {
    const cells = regular.map(r => rewardIllustrations(r)[0]!.join(':'));
    expect(new Set(cells).size).toBe(REWARDS.length);
    for (const reward of OPPORTUNITIES) expect(rewardArt(reward)).toBe(boonArt(reward.boon!));
    for (const reward of [...regular, ...OPPORTUNITIES, { id: 'replenish', title: '', detail: '', tag: '', level: 1 }]) {
      const art = rewardArt(reward);
      const path = art.match(/url\('([^']+)'\)/)![1]!;
      expect(existsSync(`public${path}`), reward.id).toBe(true);
      expect(UI_ART.some(name => path === `/art/ui/${name}.webp`), reward.id).toBe(true);
    }
    expect(() => rewardArt({ id: 'new-unassigned-mechanic', title: '', detail: '', tag: '', level: 1 })).toThrow('Missing reward illustration');
  });

  it.each(Object.keys(BOONS) as Boon[])('never replaces the painting with a small diagram for a %s build', boon => {
    const world = worldFor(boon);
    for (const reward of world.build.rewardPool(70).map(entry => entry.reward)) assertPaintedPick(world, reward);
    for (const id of ['awaken', 'ascend']) assertPaintedPick(world, { id, title: id, detail: '', tag: '', level: 1, lane: boonFate(boon) });
  });

  it('uses three complete heaven paintings, separately from the six awakening and ascension paintings', () => {
    const art = new Set<string>();
    for (const fate of Object.keys(FATES) as Fate[]) {
      const heaven = destinyArt({ serial: 1, fate, boon: null, tier: 'heaven', roots: ['earth'] });
      expect(heaven.match(/data-illustration=/g)).toHaveLength(1);
      expect(heaven).not.toContain('talent-paintings.webp');
      art.add(heaven.match(/data-illustration="([^"]+)"/)![1]!);
      for (const id of ['awaken', 'ascend']) {
        const cell = rewardIllustrations({ id, title: '', detail: '', tag: '', level: 1, lane: fate });
        art.add(cell[0]!.join(':'));
      }
    }
    expect(art.size).toBe(9);
  });

  it('keeps all mixed paths represented and depicts ancestor reinforcement without adding an imaginary companion', () => {
    const world = worldFor('beast');
    const awakening: Reward = { id: 'awaken', title: '', detail: '', tag: '', level: 1 };
    expect(rewardArt(awakening, world.build)).toBe(boonArt('beast'));
    world.build.beginPair([destiny('slayer', 'three', 1), destiny('array', 'fivefold', 2)]);
    for (const id of ['awaken', 'ascend']) expect(rewardIllustrations({ ...awakening, id }, world.build)).toHaveLength(2);
    const opportunity = OPPORTUNITIES.find(r => r.boon === 'twins')!;
    world.build.offers = [opportunity]; world.build.choose(opportunity.id, 70);
    expect(rewardIllustrations(awakening, world.build)).toHaveLength(3);
    assertPaintedPick(world, awakening);
  });

  it('retains the same skill painting after the player learns it', () => {
    const world = worldFor('mimic');
    const reward = world.build.rewardPool(70).find(entry => entry.reward.id === 'spirit-harmony')!.reward;
    world.build.offers = [reward]; world.build.choose(reward.id, 70);
    const html = buildPanel(world), art = rewardArt(reward, world.build);
    expect(html).toContain(`<span class="learned-painting">${art}</span>`);
    expect(html).toContain('出手节拍 ×1.25');
  });

  it('references published artwork in all UI diagrams, never stripped authoring PNG files', () => {
    const sources = readdirSync('src/ui').filter(name => name.endsWith('.ts'));
    const paths = sources.flatMap(name => [...readFileSync(`src/ui/${name}`, 'utf8').matchAll(/\/art\/[a-zA-Z0-9/_-]+\.(?:png|webp)/g)].map(match => match[0]));
    expect(paths.length).toBeGreaterThan(5);
    for (const path of paths) {
      expect(path).not.toMatch(/\.png$/);
      expect(existsSync(`public${path}`), path).toBe(true);
    }
  });
});
