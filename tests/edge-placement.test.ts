import { describe, expect, it } from 'vitest';
import { distance, segmentDistance, type Point } from '../src/core/math';
import { CLEARING, mapPoint } from '../src/game/map';
import { buildable, CAMP, MAGE, ENTRANCES, wallAt } from '../src/game/terrain';
import { World } from '../src/game/world';
import { wardArea, wardContains, wardContours } from '../src/game/ward-geometry';
import { wolfClear, wolfGround, wolfSegmentClear, wolfWall } from '../src/game/wolf-collision';
import { tickWolfMotion } from '../src/game/wolf-motion';
import { WOLF_KINDS } from '../src/game/wolves';
import type { Wolf } from '../src/game/contracts';
import { layoutWard } from '../src/render/ward-layout';
import { SceneView } from '../src/render/view';
import { Camera2D } from '../src/render/projection';

const path = (points: number[][]) => points.map(([x, y]) => mapPoint(x!, y!));
const rectangle = (x: number, y: number, width: number, height: number) => path([[x,y],[x+width,y],[x+width,y+height],[x,y+height],[x,y]]);
const divided = path([[680,150],[920,150],[920,330],[870,330],[870,180],[730,180],[730,330],[680,330],[680,150]]);
const enemy = (at: Point, id = 900): Wolf => ({ ...at, id, hp: 1000, maxHp: 1000, speed: 2.3, heading: 0, action: 'run', age: 0, attack: 0,
  hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null });

describe('effective formation regions at the clearing edge', () => {
  it.each([[1460,535],[1080,940],[200,465]])('opens the painted ground around %s,%s', (x, y) => {
    const w = new World();
    expect(w.place(rectangle(x - 16, y - 12, 32, 24)), w.notice).toBe(true);
    expect(wardContains(mapPoint(x, y), w.wards[0]!)).toBe(true);
  });
  it('clips a large outside section onto the east bank instead of rejecting or nudging the whole stroke', () => {
    const w = new World(), stroke = rectangle(1280,455,300,165), plan = w.previewPlacement(stroke);
    expect(plan.ok).toBe(true); if (!plan.ok) return;
    expect(plan.clipped).toBe(true); expect(wardContours(plan).flat().every(buildable)).toBe(true);
    expect(w.place(stroke)).toBe(true); expect(w.spirit).toBe(86);
    expect(w.wards[0]!.regions).toEqual(plan.regions); expect(w.wards[0]!.power.area).toBeCloseTo(wardArea(plan), 8);
    expect(wardContains(mapPoint(1570,520), w.wards[0]!)).toBe(false);
  });
  it('keeps disconnected pieces as one formation and one investment, with no invisible connecting wall', () => {
    const w = new World(); w.selected = 'earth'; expect(w.place(divided)).toBe(true);
    const ward = w.wards[0]!;
    expect(ward.regions).toHaveLength(2); expect(w.wards).toHaveLength(1); expect(w.spirit).toBe(86);
    expect(w.place(divided)).toBe(false); expect(w.spirit).toBe(86);
    expect(wardContains(mapPoint(700,280), ward)).toBe(true); expect(wardContains(mapPoint(900,280), ward)).toBe(true);
    expect(wardContains(mapPoint(800,280), ward)).toBe(false);
    expect(wallAt(mapPoint(800,230), [ward])).toBeUndefined(); expect(wolfWall(mapPoint(800,230), 0.62, [ward])).toBeUndefined();
    const layout = layoutWard(ward); expect(layout.contours).toHaveLength(2);
    expect(layout.nodes.every(node => wardContains(node.at, ward))).toBe(true);
    w.undo(); expect(w.wards).toHaveLength(0); expect(w.spirit).toBeCloseTo(97.2);
  });
  it('both clipped pieces defend while their excluded gap does not deal damage', () => {
    const w = new World(); expect(w.place(divided)).toBe(true);
    const a = enemy(mapPoint(700,280)), b = enemy(mapPoint(900,280),901), gap = enemy(mapPoint(800,280),902);
    for (const wolf of [a,b,gap]) wolf.speed = 0;
    w.startWave(); w.wolves = [a,b,gap]; w.tick(0.01);
    expect(a.hp).toBeLessThan(1000); expect(b.hp).toBeLessThan(1000); expect(gap.hp).toBe(1000);
  });
  it('cuts a hole around the mage and prevents artwork or companions from occupying it', () => {
    const w = new World(), stroke = rectangle(310,265,155,110), plan = w.previewPlacement(stroke);
    expect(plan.ok).toBe(true); if (!plan.ok) return;
    expect(plan.regions.some(region => region.length > 1)).toBe(true);
    expect(wardContains(MAGE, plan)).toBe(false); expect(wardContains(plan.at, plan)).toBe(true);
    w.formationEffects.add({ id: 'invalid-hole-spawn', plan: () => [{ kind: 'test', at: MAGE, attack: { damage:1, interval:1, range:1 } }] });
    expect(w.place(stroke)).toBe(false); expect(w.spirit).toBe(100);
    w.formationEffects.clear(); expect(w.place(stroke)).toBe(true);
    expect(layoutWard(w.wards[0]!).nodes.every(node => wardContains(node.at, w.wards[0]!))).toBe(true);
  });
  it('keeps clipped regions detached and immutable in the future companion hook', () => {
    const w = new World(); let received: unknown;
    w.formationEffects.add({ id: 'capture', plan: context => { received = context.ward.regions; return []; } });
    expect(w.place(divided)).toBe(true);
    expect(received).toEqual(w.wards[0]!.regions); expect(received).not.toBe(w.wards[0]!.regions);
    const regions = received as Point[][][];
    expect(Object.isFrozen(regions[1]![0]![0])).toBe(true);
  });
  it('rejects a drawing with no effective ground without charging spirit', () => {
    const w = new World(); expect(w.place(rectangle(30,80,55,60))).toBe(false); expect(w.spirit).toBe(100);
  });
  it('picks the extended southern ground below the former invisible input cutoff', () => {
    const camera = new Camera2D(); camera.resize(1600,1000);
    const view = { camera, canvas: { getBoundingClientRect: () => ({left:0,top:0,width:1600,height:1000}) } } as unknown as SceneView;
    const picked = SceneView.prototype.pick.call(view,1080,940);
    expect(picked).toEqual(mapPoint(1080,940)); expect(buildable(picked!)).toBe(true);
    expect(SceneView.prototype.pick.call(view,1080,1005)).toBeNull();
  });
});

describe('soil formations can seal the route against the natural boundary', () => {
  it('walks directly toward camp across unobstructed ground instead of following grid-shaped bends', () => {
    const w = new World();
    for (const from of ENTRANCES) {
      expect(wolfSegmentClear(from,CAMP,0.62)).toBe(true);
      expect(w.navigation.direction(from)).toEqual(CAMP);
      const wolf = enemy(from);
      for (let i=0;i<360;i++) tickWolfMotion(wolf,1/60,w.navigation,[],[wolf],CAMP,()=>{});
      expect(segmentDistance(wolf,from,CAMP)).toBeLessThan(0.001);
      expect(distance(wolf,CAMP)).toBeLessThan(distance(from,CAMP)-10);
    }
  });
  it.each(['normal','king'] as const)('%s stays in front of a sealed wall, bites it, then advances after the breach', kind => {
    const w = new World(); w.selected = 'earth';
    expect(w.place(rectangle(640,150,40,750)), w.notice).toBe(true);
    const ward = w.wards[0]!, contours = wardContours(ward), radius = WOLF_KINDS[kind].radius;
    expect(contours.flat().some(p => CLEARING.some((a,i)=>segmentDistance(p,a,CLEARING[(i+1)%CLEARING.length]!) < 1e-6))).toBe(true);
    const wolf = enemy(mapPoint(800,360)); wolf.kind = kind;
    let wallHits = 0, breached = false;
    for (let i = 0; i < 3600 && distance(wolf,CAMP) > 2.5; i++) {
      tickWolfMotion(wolf,1/60,w.navigation,w.wards,[wolf],CAMP,wall => {
        if (!wall) return; wallHits++; wall.health = Math.max(0,wall.health-12);
        if (!wall.health) { breached = true; w.wards.splice(0); w.navigation.rebuild(CAMP,[]); }
      });
      expect(wolfGround(wolf,radius)).toBe(true);
      if (!breached) { expect(wolf.x).toBeGreaterThan(mapPoint(680,0).x); expect(wolfClear(wolf,radius,w.wards)).toBe(true); }
    }
    expect(wallHits).toBeGreaterThan(0); expect(breached).toBe(true); expect(distance(wolf,CAMP)).toBeLessThan(2.5);
  });
});
