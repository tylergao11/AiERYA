import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { ELEMENTS, type Element } from '../src/game/contracts';
import { rewardPanel, buildPanel } from '../src/ui/rogue-panel';
import { exampleMarkup, rewardExample } from '../src/ui/reward-examples';

function setup(beast = false) {
  const world = new World({ roguelike: true });
  expect(world.chooseDestiny({ serial: 1, fate: 'spirit', tier: beast ? 'unusual' : 'ordinary', boon: beast ? 'beast' : 'mimic', roots: ['fire', 'water'] })).toBe(true);
  return world;
}
function offer(world: World, id: string) {
  const reward = world.build.rewardPool(world.health).find(item => item.reward.id === id)?.reward;
  expect(reward, id).toBeDefined(); return reward!;
}
function learn(world: World, id: string) {
  world.build.offers = [offer(world, id)];
  expect(world.build.choose(id, world.health), id).not.toBeNull();
}
function native(world: World, element: Element) {
  const main = world.mechanics.spirits.find(s => s.role === 'main')!;
  for (let i = 0; i < ELEMENTS.length && main.element !== element; i++) expect(world.cycleSpirit(main.id)).toBe(true);
  expect(main.element).toBe(element); return main;
}

describe('summoner growth cards explain the party actually owned, without a battle clock', () => {
  it.each(ELEMENTS)('shows the switched %s body and its native attack style in all three growth cards', element => {
    const world = setup(), main = native(world, element);
    world.build.offers = ['spirit-might', 'spirit-harmony', 'spirit-command'].map(id => offer(world, id));
    const before = [world.time, world.spirit, world.build.revision, world.mechanics.spirits.length], body = structuredClone(main);
    const html = rewardPanel(world);
    expect(html.match(new RegExp(`data-native="${element}"`, 'g'))).toHaveLength(3);
    expect(html.match(/class="summon-card-scene"/g)).toHaveLength(3);
    expect(html.match(new RegExp(`data-action="${element === 'wood' || element === 'earth' ? 'melee' : 'ranged'}"`, 'g'))).toHaveLength(3);
    expect(html).toContain('点按集火'); expect(html).toContain('出手节拍 ×1.25');
    expect(html).not.toContain('element-spirit-atlas.png');
    expect([world.time, world.spirit, world.build.revision, world.mechanics.spirits.length]).toEqual(before); expect(main).toEqual(body);
  });
  it('keeps accumulated growth honest after learning a second rank and in the build folio', () => {
    const world = setup(); learn(world, 'spirit-harmony');
    const second = offer(world, 'spirit-harmony'); expect(second.level).toBe(2);
    const example = rewardExample(second, world.build, world.mechanics.spirits);
    expect(example.result).toContain('+50%'); expect(exampleMarkup(example)).toContain('出手节拍 ×1.5');
    world.build.offers = [second]; expect(world.build.choose(second.id, 100)).not.toBeNull();
    const html = buildPanel(world); expect(html).toContain('出手节拍 ×1.5'); expect(html).toContain('全部灵体攻速 +50%');
  });
  it.each([false, true])('awakening predicts the actual new body or ancestor reinforcement (ancestor %s)', beast => {
    const world = setup(beast), main = native(world, 'wood');
    for (const id of ['spirit-might', 'spirit-harmony', 'spirit-command']) learn(world, id);
    const awakening = offer(world, 'awaken');
    const example = rewardExample(awakening, world.build, world.mechanics.spirits), html = exampleMarkup(example);
    expect(html).toContain('data-native="wood"');
    expect(html).toContain(`data-action="${beast ? 'melee' : 'arrival'}"`);
    expect(html.match(/data-body=/g)).toHaveLength(beast ? 1 : 2);
    if (beast) expect(example.result).toBe('祖兽威力 +25%');
    else expect(html).toContain('data-native="water"');
    const count = world.mechanics.spirits.length;
    world.build.offers = [awakening]; expect(world.build.choose('awaken', 100)).not.toBeNull(); world.mechanics.upgraded();
    expect(world.mechanics.spirits.length).toBe(count + (beast ? 0 : 1));
    expect(main.element).toBe('wood');
    if (!beast) expect(world.mechanics.spirits.find(s => s.role === 'support')?.element).toBe(example.summonCast?.arrival);
  });
  it('keeps mimic echoes and added companions distinct from changing the main native body', () => {
    const world = setup(), main = native(world, 'earth');
    for (const id of ['opportunity-mimic', 'opportunity-twins', 'opportunity-beast']) {
      const example = rewardExample({ id, title: '', detail: '', tag: '', level: 1 }, world.build, world.mechanics.spirits);
      const html = exampleMarkup(example); expect(html).toContain('data-native="earth"');
      if (id === 'opportunity-mimic') { expect(html).toContain('is-echo'); expect(html).toContain('data-action="melee-echo"'); }
      if (id === 'opportunity-twins') { expect(html).toContain('data-native="water"'); expect(html.match(/data-body=/g)).toHaveLength(2); }
      if (id === 'opportunity-beast') { expect(html).toContain('ancestor-beast-atlas.webp'); expect(html).toContain('12 次主灵击杀'); }
    }
    expect(main.element).toBe('earth'); expect(world.mechanics.spirits).toHaveLength(1);
  });
});
