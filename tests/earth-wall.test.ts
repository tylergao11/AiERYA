import { describe, expect, it } from 'vitest';
import { area, distance, interiorPoint, type Point } from '../src/core/math';
import { calculateWardPower } from '../src/game/concentration';
import type { Ward, Wolf } from '../src/game/contracts';
import { earthWallAt } from '../src/game/earth-wall';
import { planVault } from '../src/game/wolf-vault';
import { moveWolf, wolfClear, wolfSegmentClear, wolfWall } from '../src/game/wolf-collision';
import { wallAt } from '../src/game/terrain';
import { wardArea, wardContains } from '../src/game/ward-geometry';
import { World } from '../src/game/world';
import { EarthWallMesh } from '../src/render/earth-wall';
import { ART, type Pixel } from '../src/render/projection';

const rectangle = (x: number, z: number, width: number, depth: number): Point[] =>
  [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }];
function earth(regions: Point[][][] = [[rectangle(-6,-4,12,12)]]): Ward {
  const points = regions[0]![0]!, at = interiorPoint(points), contours = regions.flat();
  const perimeter = contours.reduce((sum, ring) => sum + ring.reduce((n, p, i) => n + distance(p, ring[(i+1)%ring.length]!), 0), 0);
  return { ...at, id: 19, element: 'earth', points, regions, radius: Math.max(...contours.flat().map(p => distance(p,at))),
    age: 1, charge: 0, pulse: 0, health: 120, maxHealth: 120, empowered: 0, suppressed: 0,
    power: calculateWardPower('earth', 14, wardArea({ points, regions }), perimeter) };
}
const wolf = (x = 8, z = 3): Wolf => ({ x, z, id: 901, kind: 'elite', hp: 100, maxHp: 100, speed: 2.3,
  heading: -Math.PI/2, action: 'run', age: 0, attack: 0, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0,
  rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });
const groundPoint = (p: Pixel): Point => ({ x: (p.x-ART.x)/ART.unitX, z: (p.y-ART.y)/ART.unitY });

describe('solid earth formation', () => {
  it('blocks the whole interior and a segment contained entirely within it', () => {
    const wall = earth(), point = { x: 0, z: 3 };
    expect(wallAt(point,[wall])).toBe(wall);
    expect(wolfWall(point,0.62,[wall])).toBe(wall);
    expect(wolfClear(point,0.62,[wall])).toBe(false);
    expect(wolfSegmentClear({x:-2,z:3},{x:2,z:3},0.62,[wall])).toBe(false);
  });
  it('fills every effective piece while leaving the excluded gap and inner hole open', () => {
    const wall = earth([[rectangle(-8,-5,14,15),rectangle(-5,-2,8,8)],[rectangle(10,-5,3,15)]]);
    expect(earthWallAt({x:-7,z:3},wall)).toBe(true);
    expect(earthWallAt({x:11,z:3},wall)).toBe(true);
    expect(wolfClear({x:0,z:3},0.62,[wall])).toBe(true);
    expect(wolfClear({x:8,z:3},0.62,[wall])).toBe(true);
    expect(wolfSegmentClear({x:-2,z:2},{x:1,z:3},0.62,[wall])).toBe(true);
  });
  it('stops a large ground displacement at the outside face', () => {
    const wall = earth(), enemy = wolf(); enemy.kind = 'normal';
    moveWolf(enemy,-20,0,[wall]);
    expect(enemy.x).toBeGreaterThan(7);
    expect(wolfClear(enemy,0.62,[wall])).toBe(true);
  });
  it('requires elites to land beyond the whole wall, rather than in a hollow center', () => {
    const wall = earth(), enemy = wolf();
    expect(planVault(enemy,{x:-12,z:3},[wall],[enemy])).toBeNull();
    const narrow = earth([[rectangle(0,-4,0.8,12)]]), jumper = wolf(2.3,3);
    const plan = planVault(jumper,{x:-12,z:3},[narrow],[jumper]);
    expect(plan).not.toBeNull();
    expect(plan!.end.x).toBeLessThan(-1.3);
    expect(wolfClear(plan!.end,0.84,[narrow])).toBe(true);
  });
  it('remains solid under suppression and releases its entire footprint when destroyed', () => {
    const wall = earth(); wall.suppressed = 5;
    expect(earthWallAt({x:0,z:3},wall)).toBe(true);
    wall.health = 0;
    expect(wolfClear({x:0,z:3},0.62,[wall])).toBe(true);
    expect(wolfSegmentClear({x:-2,z:3},{x:2,z:3},0.62,[wall])).toBe(true);
  });
  it('does not migrate a solid wall onto a wolf or charge spirit for the occupied destination', () => {
    const w = new World({roguelike:true});
    expect(w.chooseDestiny({serial:1,fate:'array',boon:'living',tier:'unusual',roots:['earth']})).toBe(true);
    const outline = rectangle(-9,0,6,6);
    expect(w.place([...outline,outline[0]!])).toBe(true);
    const wall = w.wards[0]!, before = structuredClone(wall);
    w.startWave(); w.wolves = [wolf(4,3)]; const spirit = w.spirit;
    expect(w.moveMain(wall.id,{x:4,z:3})).toBe(false);
    expect(wall).toEqual(before); expect(w.spirit).toBe(spirit); expect(wolfClear(w.wolves[0]!,0.76,w.wards)).toBe(true);
    expect(w.moveMain(wall.id,{x:-6,z:12})).toBe(true);
    expect(w.spirit).toBe(spirit-10);
  });
});

describe('solid earth wall artwork', () => {
  it.each([
    [[rectangle(-6,-4,12,12)]],
    [[rectangle(-8,-5,14,15),rectangle(-5,-2,8,8)],[rectangle(10,-5,3,15)]],
    [[[{x:-8,z:0},{x:10,z:-5},{x:12,z:-4},{x:-6,z:2}]]],
  ])('covers precisely the effective area with a raised cap and continuous faces', (...regions) => {
    const wall = earth(regions as Point[][][]), before = structuredClone(wall), mesh = new EarthWallMesh(wall);
    const roof = mesh.parts.filter(p => p.kind === 'roof');
    // Boolean output winding distinguishes holes even after all pieces are depth sliced.
    const capArea = roof.reduce((total, part) => total + part.contours.reduce((sum, ring) => {
      const points = ring.map(groundPoint);
      const signed = points.reduce((n,p,i) => { const q = points[(i+1)%points.length]!; return n+p.x*q.z-q.x*p.z; },0)/2;
      return sum + signed;
    },0),0);
    expect(capArea).toBeCloseTo(wardArea(wall),7);
    expect(mesh.parts.some(p => p.kind === 'face')).toBe(true);
    for (const part of mesh.parts) expect(Number.isFinite(part.z)).toBe(true);
    for (const part of roof) for (const grain of part.grains) expect(wardContains(groundPoint(grain),wall)).toBe(true);
    expect(wall).toEqual(before);
    wall.health = 1; wall.suppressed = 3;
    expect(new EarthWallMesh(wall).parts).toEqual(mesh.parts);
  });
  it('keeps an elongated soil wall filled rather than turning its cap into a perimeter ring', () => {
    const wall = earth([[rectangle(-12,0,24,0.8)]]), mesh = new EarthWallMesh(wall);
    const roof = mesh.parts.filter(p => p.kind === 'roof');
    expect(roof).toHaveLength(1);
    expect(roof[0]!.contours).toHaveLength(1);
    expect(area(roof[0]!.contours[0]!.map(groundPoint))).toBeCloseTo(19.2);
  });
});
