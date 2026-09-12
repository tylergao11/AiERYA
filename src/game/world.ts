import { EventBus } from '../core/events';
import { area, distance, inside, interiorPoint, random, resample, segmentDistance, selfIntersects, type Point } from '../core/math';
import { abilities, directApproach, upgrades } from './content';
import { ELEMENTS, type Element, type GameEvents, type Mode, type Phase, type Ward, type Wolf, type WolfBehavior } from './contracts';
import { NavigationField } from './navigation';
import { StatModifiers } from './stats';
import { buildable, CAMP, createResources, ENTRANCES, naturalElement, ROCKS, wallAt, walkable } from './terrain';

export class World {
  readonly events = new EventBus<GameEvents>();
  readonly stats = new StatModifiers();
  readonly navigation = new NavigationField();
  readonly behaviors = new Map<string, WolfBehavior>([[directApproach.id, directApproach]]);
  readonly camp = CAMP;
  resources = createResources();
  energy: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  wards: Ward[] = [];
  wolves: Wolf[] = [];
  selected: Element = 'fire';
  mode: Mode = 'ward';
  phase: Phase = 'prepare';
  time = 0;
  health = 100;
  wave = 0;
  kills = 0;
  notice = '轻触林木、溪流或篝火，借取五行灵力';
  invocationCooldown = 0;
  behaviorId = 'approach';
  private nextId = 1;
  private waveTime = 0;
  private spawned = 0;
  private nextSpawn = 0;
  private readonly rng = random(4217);

  constructor() { this.navigation.rebuild(CAMP, []); }
  get capacity(): number { return this.stats.value('capacity', 80); }
  get wardCost(): number { return Math.ceil(this.stats.value('wardCost', 14, this.selected)); }

  gather(id: string): void {
    const resource = this.resources.find(r => r.id === id);
    if (!resource || resource.cooldown > 0 || this.phase === 'lost' || this.phase === 'won') return;
    this.selected = resource.element;
    const amount = Math.min(this.capacity - this.energy[resource.element], Math.round(this.stats.value('gather', 28, resource.element)));
    if (amount <= 0) { this.warn('此行灵力已充盈，试着画一座阵'); return; }
    this.energy[resource.element] += amount;
    resource.cooldown = 3.5;
    this.notice = `借得${abilities[resource.element].name}灵力 · 在空地画一圈，闭合成阵`;
    this.events.emit('gather', { resource, amount });
  }

  place(points: readonly Point[]): boolean {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    if (points.length < 5 || distance(points[0]!, points.at(-1)!) > 1.4) { this.warn('让起点与终点相接，阵图才能成立'); return false; }
    const polygon = resample(points, 0.42);
    const size = area(polygon), cost = this.wardCost + Math.ceil(Math.max(0, size - 20) * 0.25);
    if (polygon.length < 6 || size < 4 || size > 160) { this.warn('阵域需要适中的大小'); return false; }
    if (selfIntersects(polygon)) { this.warn('阵线交错了，请画一个完整的圈'); return false; }
    const at = interiorPoint(polygon);
    if (polygon.some(p => !buildable(p)) || !buildable(at) || inside(CAMP, polygon) || ROCKS.some(rock => inside(rock, polygon))) { this.warn('这里有山石、深水或营地，请换一片空地'); return false; }
    if (this.wards.length >= 6) { this.warn('最多维持六座阵，先撤回一座再调整'); return false; }
    if (this.wards.some(w => polygon.some(p => inside(p, w.points)) || w.points.some(p => inside(p, polygon)))) { this.warn('阵域重叠了，留出不同的防区'); return false; }
    if (this.energy[this.selected] < cost) { this.warn(`此阵需要 ${cost} 灵力，先从${this.resources.find(r => r.element === this.selected)!.title}借取更多`); return false; }
    this.energy[this.selected] -= cost;
    const ward: Ward = { id: this.nextId++, ...at, points: polygon, element: this.selected, radius: Math.max(...polygon.map(p => distance(p, at))), age: 0, charge: 1, pulse: 0.6, health: 80 };
    this.wards.push(ward); this.navigation.rebuild(CAMP, this.wards);
    this.notice = `${abilities[ward.element].label}阵已成 · 阵法会自动防守`;
    this.events.emit('ward', { ward });
    return true;
  }

  undo(): void {
    const ward = this.wards.pop(); if (!ward) return;
    this.energy[ward.element] = Math.min(this.capacity, this.energy[ward.element] + 7);
    this.navigation.rebuild(CAMP, this.wards);
    this.events.emit('wardRemoved', { id: ward.id, at: ward, element: ward.element });
  }

  invoke(points: readonly Point[]): void {
    if (points.length < 2 || this.phase === 'lost' || this.phase === 'won') return;
    if (this.invocationCooldown > 0) { this.warn('稍候片刻，让灵力重新凝聚'); return; }
    const samples = resample(points, 0.35);
    const seen = new Set<string>();
    let current: Element = this.selected, wasWood = false, reacted = false;
    const direction = { x: points.at(-1)!.x - points[0]!.x, z: points.at(-1)!.z - points[0]!.z };
    const length = Math.hypot(direction.x, direction.z) || 1; direction.x /= length; direction.z /= length;
    for (let i = 0; i < samples.length; i++) {
      const point = samples[i]!;
      const ward = this.wards.find(w => inside(point, w.points));
      const element = ward?.element ?? naturalElement(point);
      const key = ward ? `ward:${ward.id}` : `natural:${element}`;
      if (!element || seen.has(key)) continue;
      seen.add(key);
      if ((ward && ward.charge < 1) || this.energy[element] < 4) continue;
      this.energy[element] -= 4; if (ward) ward.charge = 0;
      current = element; reacted = true;
      const combo = current === 'fire' && wasWood;
      if (current === 'wood') wasWood = true;
      const tail = samples.slice(i);
      this.events.emit('invoke', { points: tail, element: current, source: point, combo });
      const targets = this.wolves.filter(w => w.action !== 'dead' && (ward ? this.touches(w, ward, 1) : tail.some((p, n) => n > 0 && segmentDistance(w, tail[n - 1]!, p) < 2.2)));
      for (const wolf of targets) this.damage(wolf, abilities[current].damage * (combo ? 3.1 : 2.3), current, direction, combo ? 1.6 : 1.1);
      if (ward?.element === 'earth') { ward.health = Math.max(20, ward.health - 10); }
    }
    if (!reacted) {
      this.events.emit('invoke', { points: [...points], element: current, source: points[0]!, combo: false });
      for (const wolf of this.wolves) if (wolf.action !== 'dead' && samples.some((p, i) => i > 0 && segmentDistance(wolf, samples[i - 1]!, p) < 0.65)) this.damage(wolf, 8, current, direction, 0.45);
      this.notice = '划过水流、林木或阵域，可以借势引动';
    } else this.notice = wasWood && current === 'fire' ? '木生火 · 借势爆燃' : `借${abilities[current].name}之势 · ${abilities[current].label}`;
    this.invocationCooldown = 0.65;
  }

  startWave(): void {
    if (this.phase !== 'prepare' && this.phase !== 'rest') return;
    this.wave++; this.waveTime = 0; this.spawned = 0; this.nextSpawn = 1;
    this.mode = 'invoke'; this.setPhase('battle');
    this.notice = '狼群靠近了 · 划过地形或阵域，借势迎敌';
  }

  chooseUpgrade(id: string): void {
    if (this.phase !== 'rest') return;
    const upgrade = upgrades.find(u => u.id === id); if (!upgrade) return;
    for (const modifier of upgrade.modifiers) this.stats.add({ ...modifier, id: `${modifier.id}:${this.wave}` });
    this.health = Math.min(100, this.health + 15);
    this.events.emit('upgrade', { id }); this.startWave();
  }

  tick(dt: number): void {
    this.time += dt;
    this.invocationCooldown = Math.max(0, this.invocationCooldown - dt);
    for (const resource of this.resources) resource.cooldown = Math.max(0, resource.cooldown - dt);
    for (const ward of this.wards) { ward.age += dt; ward.charge = Math.min(1, ward.charge + dt / this.stats.value('cooldown', 4, ward.element)); }
    if (this.phase !== 'battle') return;
    this.waveTime += dt;
    const count = 8 + this.wave * 4;
    if (this.spawned < count && this.waveTime >= this.nextSpawn) {
      this.spawnWolf(); this.spawned++; this.nextSpawn += this.spawned % 3 ? 0.65 : 3.5 - this.wave * 0.4;
    }
    for (const ward of this.wards) {
      ward.pulse -= dt;
      if (ward.pulse > 0 || ward.health <= 0) continue;
      ward.pulse = this.stats.value('cooldown', abilities[ward.element].interval, ward.element);
      let targets = this.wolves.filter(w => w.action !== 'dead' && this.touches(w, ward, ward.element === 'metal' ? 2 : 0.75));
      if (ward.element === 'metal') targets = targets.slice(0, 2);
      if (targets.length) this.events.emit('pulse', { ward, targets: targets.map(t => t.id) });
      for (const wolf of targets) {
        const d = distance(wolf, ward) || 1;
        this.damage(wolf, abilities[ward.element].damage, ward.element, { x: (wolf.x - ward.x) / d, z: (wolf.z - ward.z) / d }, 0.45);
      }
    }
    for (const wolf of this.wolves) this.tickWolf(wolf, dt);
    this.wolves = this.wolves.filter(w => w.action !== 'dead' || w.age < 2.1);
    if (this.health <= 0) { this.setPhase('lost'); return; }
    if (this.spawned >= count && !this.wolves.some(w => w.action !== 'dead')) this.setPhase(this.wave >= 3 ? 'won' : 'rest');
  }

  reset(): void {
    this.wards = []; this.wolves = []; this.resources = createResources();
    for (const element of ELEMENTS) this.energy[element] = 0;
    this.health = 100; this.wave = 0; this.kills = 0; this.time = 0; this.nextId = 1; this.invocationCooldown = 0;
    this.selected = 'fire'; this.mode = 'ward'; this.stats.clear(); this.navigation.rebuild(CAMP, []);
    this.notice = '轻触林木、溪流或篝火，借取五行灵力';
    this.events.emit('reset', undefined); this.setPhase('prepare');
  }

  private spawnWolf(): void {
    const entrance = ENTRANCES[Math.floor(this.spawned / 3) % ENTRANCES.length]!;
    this.wolves.push({ id: this.nextId++, x: entrance.x + (this.rng() - 0.5), z: entrance.z + (this.rng() - 0.5), hp: 68 + this.wave * 7, maxHp: 68 + this.wave * 7, speed: 2 + this.wave * 0.17 + this.rng() * 0.3, heading: 0, action: 'run', age: this.rng(), attack: 0.8, hit: 0, burning: 0, rooted: 0, wet: 0, vx: 0, vz: 0, pack: Math.floor(this.spawned / 3), routeAge: 0, waypoint: null });
  }

  private tickWolf(wolf: Wolf, dt: number): void {
    wolf.age += dt;
    if (wolf.action === 'dead') return;
    wolf.hit = Math.max(0, wolf.hit - dt);
    if (wolf.burning > 0) { wolf.burning = Math.max(0, wolf.burning - dt); this.damage(wolf, dt * 8, 'fire', { x: 0, z: 0 }, 0, false); }
    if (wolf.hp <= 0) return;
    wolf.rooted = Math.max(0, wolf.rooted - dt); wolf.wet = Math.max(0, wolf.wet - dt);
    if (wolf.rooted > 0) return;
    const wall = wallAt(wolf, this.wards);
    if (distance(wolf, CAMP) < 1.8 || wall) {
      wolf.action = 'attack'; wolf.attack -= dt;
      if (wolf.attack <= 0) {
        wolf.attack = 1.2;
        if (wall) { wall.health -= 12; if (wall.health <= 0) { this.wards = this.wards.filter(w => w.id !== wall.id); this.navigation.rebuild(CAMP, this.wards); this.events.emit('wardRemoved', { id: wall.id, at: wall, element: wall.element }); } }
        else { this.health = Math.max(0, this.health - 5); this.events.emit('campHit', { amount: 5 }); }
      }
      return;
    }
    wolf.action = 'run';
    const intent = (this.behaviors.get(this.behaviorId) ?? directApproach).target(wolf, { camp: CAMP, wards: this.wards, wolves: this.wolves, time: this.time });
    const next = this.navigation.direction(wolf);
    // Strategy can bias the final approach, while the shared field handles terrain.
    const target = distance(wolf, CAMP) < 5 && walkable(intent) ? intent : next;
    let dx = target.x - wolf.x, dz = target.z - wolf.z;
    for (const other of this.wolves) {
      if (other === wolf || other.action === 'dead') continue;
      const d = distance(wolf, other); if (d > 0.01 && d < 1.1) { dx += (wolf.x - other.x) / d * (1.1 - d) * 0.7; dz += (wolf.z - other.z) / d * (1.1 - d) * 0.7; }
    }
    const d = Math.hypot(dx, dz) || 1, speed = wolf.speed * (wolf.wet > 0 ? 0.48 : 1);
    const x = wolf.x + (dx / d * speed + wolf.vx) * dt, z = wolf.z + (dz / d * speed + wolf.vz) * dt;
    if (walkable({ x, z })) { wolf.x = x; wolf.z = z; }
    else if (walkable({ x, z: wolf.z })) wolf.x = x;
    else if (walkable({ x: wolf.x, z })) wolf.z = z;
    wolf.vx *= Math.exp(-dt * 5); wolf.vz *= Math.exp(-dt * 5);
    wolf.heading = Math.atan2(dx, dz);
  }

  private damage(wolf: Wolf, value: number, element: Element, direction: Point, strength: number, applyStatus = true): void {
    if (wolf.action === 'dead') return;
    wolf.hp -= this.stats.value('damage', value, element);
    if (applyStatus) {
      wolf.hit = 0.14;
      if (element === 'fire') wolf.burning = 2;
      if (element === 'wood') wolf.rooted = Math.max(wolf.rooted, 0.85);
      if (element === 'water') wolf.wet = 2;
      if (element === 'water' || element === 'earth') { wolf.vx += direction.x * strength * 4; wolf.vz += direction.z * strength * 4; }
      this.events.emit('hit', { ...wolf, element, direction, strength, target: wolf.id });
    }
    if (wolf.hp <= 0) { wolf.action = 'dead'; wolf.age = 0; this.kills++; this.events.emit('death', { wolf, element }); }
  }
  private touches(wolf: Wolf, ward: Ward, margin: number): boolean {
    return inside(wolf, ward.points) || ward.points.some((p, i) => segmentDistance(wolf, p, ward.points[(i + 1) % ward.points.length]!) < margin);
  }
  private setPhase(phase: Phase): void { this.phase = phase; this.events.emit('phase', { phase }); }
  private warn(message: string): void { this.notice = message; this.events.emit('warning', { message }); }
}
