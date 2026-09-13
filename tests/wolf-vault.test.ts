import { describe, expect, it, vi } from 'vitest';
import { distance } from '../src/core/math';
import type { Wolf } from '../src/game/contracts';
import { World } from '../src/game/world';
import { ELITE_VAULT, planVault } from '../src/game/wolf-vault';
import { tickWolfMotion, staggerWolf } from '../src/game/wolf-motion';
import { wolfClear, wolfGround } from '../src/game/wolf-collision';
import { wolfFrame } from '../src/render/wolf-frame';

const fixture = () => {
  const w = new World(); w.selected = 'earth';
  expect(w.place([{ x: 0, z: -4 }, { x: 0.8, z: -4 }, { x: 0.8, z: 8 }, { x: 0, z: 8 }, { x: 0, z: -4 }])).toBe(true);
  const wolf: Wolf = { id: 900, kind: 'elite', x: 2.3, z: 3, hp: 100, maxHp: 100, speed: 2.3, heading: -Math.PI / 2, action: 'run', age: 0, attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null };
  w.wolves = [wolf]; return { w, wolf, target: { x: -12, z: 3 } };
};
describe('elite vault is traversal, not an attack', () => {
  it('jumps across a soil wall, leaves it intact and resumes walking without biting', () => {
    const { w, wolf, target } = fixture(), bite = vi.fn(), health = w.wards[0]!.health; const poses = new Set<string>(); let height = 0;
    for (let i = 0; i < 80; i++) { tickWolfMotion(wolf, 1 / 60, w.navigation, w.wards, w.wolves, target, bite); poses.add(wolf.motion!.pose); height = Math.max(height, wolf.motion!.lift); expect(wolfGround(wolf, 0.76)).toBe(true); }
    expect([...poses]).toEqual(expect.arrayContaining(['vaultWindup', 'vault', 'vaultRecover', 'run']));
    expect(wolf.x).toBeLessThan(-1.3); expect(height).toBeGreaterThan(55); expect(wolfClear(wolf, 0.76, w.wards)).toBe(true);
    expect(w.wards[0]!.health).toBe(health); expect(bite).not.toHaveBeenCalled(); expect(wolf.motion!.vaultCooldown).toBeGreaterThan(2);
    expect(planVault(wolf, { x: 12, z: 3 }, w.wards, w.wolves)).toBeNull();
  });
  it('ordinary wolves and the king do not gain the elite traversal ability', () => {
    const { w, wolf, target } = fixture();
    for (const kind of ['normal', 'king'] as const) { wolf.kind = kind; expect(planVault(wolf, target, w.wards, w.wolves)).toBeNull(); }
  });
  it('takes an unoccupied landing or declines, and never crosses the clearing boundary', () => {
    const { w, wolf, target } = fixture(), first = planVault(wolf, target, w.wards, w.wolves)!; expect(first).not.toBeNull();
    const blocker = { ...wolf, id: 901, kind: 'king' as const, ...first.end }; w.wolves.push(blocker);
    const other = planVault(wolf, target, w.wards, w.wolves);
    if (other) expect(distance(other.end, blocker)).toBeGreaterThan(1.72);
    wolf.x = 10; wolf.z = 26.9; const wall = w.wards[0]!;
    wall.x = 10; wall.z = 28.9; wall.radius = 8; wall.points = [{ x: 4, z: 28.8 }, { x: 16, z: 28.8 }, { x: 16, z: 29 }, { x: 4, z: 29 }];
    wall.regions = undefined;
    expect(planVault(wolf, { x: 10, z: 35 }, [wall], [wolf])).toBeNull();
  });
  it('a hit during flight lands safely before applying stun', () => {
    const { w, wolf, target } = fixture(), bite = vi.fn();
    for (let i = 0; i < 24; i++) tickWolfMotion(wolf, 1 / 60, w.navigation, w.wards, w.wolves, target, bite);
    expect(wolf.motion!.pose).toBe('vault'); expect(wolfFrame(wolf)).toEqual({ row: 1, column: 1 });
    staggerWolf(wolf); expect(wolf.motion!.pose).toBe('vault');
    const poses = new Set<string>(); for (let i = 0; i < 40; i++) { tickWolfMotion(wolf, 1 / 60, w.navigation, w.wards, w.wolves, target, bite); poses.add(wolf.motion!.pose); }
    expect(poses.has('stagger')).toBe(true); expect(wolfClear(wolf, 0.76, w.wards)).toBe(true); expect(bite).not.toHaveBeenCalled();
  });
  it('a lethal burn during flight places the corpse on valid ground', () => {
    const { w, wolf, target } = fixture();
    for (let i = 0; i < 32; i++) tickWolfMotion(wolf, 1 / 60, w.navigation, w.wards, w.wolves, target, () => {});
    expect(wolf.motion!.pose).toBe('vault'); w.phase = 'battle'; wolf.hp = 1; wolf.burning = 1; wolf.burnDps = 1000;
    w.tick(1 / 60); expect(wolf.action).toBe('dead'); expect(wolfClear(wolf, 0.76, w.wards)).toBe(true); expect(wolf.motion!.vault).toBeUndefined();
  });
  it('rooted elites cannot start a vault', () => {
    const { w, wolf, target } = fixture(); wolf.rooted = 1;
    expect(planVault(wolf, target, w.wards, w.wolves)).toBeNull(); expect(ELITE_VAULT.cooldown).toBeGreaterThan(ELITE_VAULT.flight);
  });
});
