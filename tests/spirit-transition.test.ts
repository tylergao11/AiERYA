import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import type { GameEvents, Wolf } from '../src/game/contracts';
import { ROGUE } from '../src/game/rogue-balance';
import { SpiritArt } from '../src/render/spirit-art';
import { SPIRIT_TRANSITION_SECONDS } from '../src/render/spirit-transition';

function setup(beast = false) {
  const world = new World({ roguelike: true });
  world.chooseDestiny({ serial: 1, fate: 'spirit', tier: beast ? 'unusual' : 'ordinary', boon: beast ? 'beast' : 'twins', roots: ['earth'] });
  const events: GameEvents['spiritTransition'][] = [], generic: string[] = [];
  world.events.on('spiritTransition', e => events.push(e));
  world.events.on('rogueEffect', e => generic.push(e.label));
  return { world, events, generic, main: world.mechanics.spirits[0]! };
}

describe('summon milestone presentation without running a match', () => {
  it('announces each actual breakthrough once, on the main companion only', () => {
    const { world, events, generic, main } = setup();
    world.build.stage = 1; world.mechanics.upgraded(); world.mechanics.upgraded();
    expect(events.map(e => e.kind)).toEqual(['awaken']);
    expect(world.mechanics.spirits).toHaveLength(3);
    world.build.stage = 2; world.mechanics.upgraded();
    for (let n = 0; n < 5; n++) world.mechanics.upgraded();
    expect(events.map(e => e.kind)).toEqual(['awaken', 'ascend']);
    expect(events.every(e => e.spiritId === main.id)).toBe(true);
    expect(generic).not.toContain('主灵觉醒');
    expect(generic).not.toContain('领悟生效');
  });
  it('uses the real ancestor kill threshold and retains the existing size multiplier', () => {
    const { world, main, events, generic } = setup(true), before = main.size;
    const victim = (id: number, summoned = false) => ({ id, x: 0, z: 5, summoned, action: 'dead' } as Wolf);
    world.mechanics.afterDeath(victim(1, true), 'earth', { kind: 'spirit', spiritId: main.id });
    world.mechanics.afterDeath(victim(2), 'earth', { kind: 'manual' });
    expect(world.mechanics.beastMarks).toBe(0);
    for (let n = 0; n < ROGUE.spirit.beastKills; n++) world.mechanics.afterDeath(victim(n + 3), 'earth', { kind: 'spirit', spiritId: main.id });
    expect(events.map(e => e.kind)).toEqual(['evolve']);
    expect(events[0]).toMatchObject({ spiritId: main.id, ancestor: true, fromSize: before, toSize: before * 1.35 });
    world.mechanics.upgraded();
    world.mechanics.afterDeath(victim(99), 'earth', { kind: 'spirit', spiritId: main.id });
    expect(events).toHaveLength(1); expect(generic).not.toContain('祖兽蜕变');
  });
  it('does not replay a milestone at a wave boundary or mistake a new run for evolution', () => {
    const { world, events } = setup(true);
    world.build.stage = 1; world.mechanics.upgraded(); world.mechanics.endBattle(); world.mechanics.upgraded();
    expect(events).toHaveLength(1);
    world.reset(); world.chooseDestiny({ serial: 2, fate: 'spirit', tier: 'unusual', boon: 'beast', roots: ['earth'] });
    expect(events).toHaveLength(1);
    world.build.stage = 1; world.mechanics.upgraded(); expect(events).toHaveLength(2);
  });
  it('holds the painted body during gathering, grows on release, and never alters combat state', () => {
    const { world, main } = setup(true), art = new SpiritArt(world);
    main.age = 2; art.update(0); const fromSize = main.size; main.size *= 1.35;
    const event: GameEvents['spiritTransition'] = { kind: 'evolve', at: { x: main.x, z: main.z }, spiritId: main.id, element: main.element, ancestor: true, fromSize, toSize: main.size };
    art.transition(event); const before = structuredClone(main);
    art.update(.1); expect(art.poses.get(main).growth).toBe(fromSize);
    art.update(.25); expect(art.poses.get(main).growth).toBeGreaterThan(fromSize); expect(art.poses.get(main).growth).toBeLessThan(main.size);
    art.update(.3); expect(art.poses.get(main).growth).toBe(main.size);
    art.update(SPIRIT_TRANSITION_SECONDS); expect(main).toEqual(before);
    art.clear(); expect(art.poses.get(main).growth).toBe(main.size);
  });
});
