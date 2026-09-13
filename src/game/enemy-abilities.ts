import { distance, type Point } from '../core/math';
import type { Element, Wolf } from './contracts';
import type { World } from './world';
import { earthWallAt } from './earth-wall';
import { wolfSpawn } from './wolf-collision';
import { wardContains, wardContours } from './ward-geometry';
import { ENCOUNTERS, encounter } from './encounters';
import { BATTLE } from './battle-rules';

export const ENEMY_SKILLS = { callDelay: 1.25, callCooldown: 9, callLimit: 2, callCount: 2, aliveLimit: ENCOUNTERS.aliveLimit,
  silenceDelay: 1.35, silenceCooldown: 10, silenceRadius: 3.6, silenceSeconds: 3.5,
  huntDelay: 1.2, huntCooldown: 8, huntRadius: 2.8, huntSeconds: 3,
  mendRadius: 4, rushRadius: 3, armorReduction: .7, interruptPower: .5,
  breakDelay: 1.5, breakCooldown: 7, breakRadius: 3.2, breakFlat: 24, breakFraction: .42, interruptCooldown: 4 } as const;
type Skill = 'call' | 'silence' | 'break' | 'hunt' | 'mend' | 'rush';
interface State { cooldown: number; used: number; cast?: { skill: Skill; at: Point; remaining: number; duration: number } }
export interface SilenceZone extends Point { remaining: number; radius: number; ownerId?: number; spiritsOnly?: boolean }
/** Telegraphs can be interrupted by a direct overcoming reaction. Reinforcements never summon. */
export class EnemyAbilities {
  private states = new Map<number, State>();
  private broken = new Map<number, number>();
  readonly zones: SilenceZone[] = [];
  constructor(private readonly world: World) {}
  clear(): void { this.states.clear(); this.broken.clear(); this.zones.length = 0; }
  get cues() { return [...this.states].flatMap(([id, s]) => s.cast ? [{ id, ...s.cast }] : []); }
  silenced(at: Point): boolean { return this.zones.some(z => distance(z, at) <= z.radius); }
  armored(wolf: Wolf): boolean { return wolf.eliteSkill === 'guard' && (this.broken.get(wolf.id) ?? 0) <= this.world.time; }
  breakGuard(wolf: Wolf): void {
    if (this.armored(wolf)) {
      this.broken.set(wolf.id, this.world.time + BATTLE.blade.breakSeconds);
      this.world.mechanics.effect('burst', wolf, 'metal', '重斩破甲', 1.5);
    }
    this.interrupt(wolf.id);
  }
  counterAura(_wolf: Wolf): Element | null {
    return null;
  }
  interrupt(id: number, power = 1): boolean {
    const state = this.states.get(id), wolf = this.world.wolves.find(w => w.id === id);
    if (!state?.cast || !wolf || power < ENEMY_SKILLS.interruptPower) return false;
    this.world.events.emit('enemySkill', { stage: 'interrupt', skill: state.cast.skill, id, at: { x: wolf.x, z: wolf.z } });
    state.cast = undefined; state.cooldown = ENEMY_SKILLS.interruptCooldown;
    this.world.mechanics.effect('burst', wolf, 'metal', '破招', 1.4); return true;
  }
  casting(id: number): boolean { return !!this.states.get(id)?.cast; }
  tick(dt: number): void {
    if (!this.world.build.active) return;
    const w = this.world, B = ENEMY_SKILLS;
    const alive = new Set(w.wolves.filter(wolf => wolf.action !== 'dead').map(wolf => wolf.id));
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]!; z.remaining -= dt; if (z.remaining <= 0) { this.zones.splice(i, 1); continue; }
      if (z.ownerId !== undefined && !alive.has(z.ownerId)) { this.zones.splice(i, 1); continue; }
      if (z.spiritsOnly) continue;
      for (const ward of w.wards) if (wardContains(z, ward) || wardContours(ward).some(r => r.some(p => distance(p, z) <= z.radius))) ward.suppressed = Math.max(ward.suppressed, .15);
    }
    for (const id of this.states.keys()) if (!alive.has(id)) this.states.delete(id);
    let casting = [...this.states.values()].filter(s => s.cast).length;
    for (const wolf of [...w.wolves]) {
      if (wolf.action === 'dead' || wolf.summoned || !wolf.kind || wolf.kind === 'normal') continue;
      if (wolf.eliteSkill === 'guard' || wolf.kind==='elite'&&!wolf.eliteSkill) continue;
      let state = this.states.get(wolf.id);
      if (!state) { state = { cooldown: wolf.kind === 'king' ? 1.5 : 2.5, used: 0 }; this.states.set(wolf.id, state); }
      if (state.cast) {
        state.cast.remaining -= dt;
        if (state.cast.remaining <= 0) { const cast = state.cast; state.cast = undefined; casting--; this.release(wolf, cast.skill, cast.at, state); }
        continue;
      }
      state.cooldown -= dt; if (state.cooldown > 0 || wolf.motion?.pose === 'vault') continue;
      // Multiple escorted elites can survive a pulse; keep at most two simultaneous decisions readable.
      if (casting >= 2) continue;
      const skill: Skill = wolf.kind === 'king' ? (state.used % 2 ? 'break' : 'rush') : wolf.eliteSkill ?? (wolf.id % 2 ? 'call' : 'silence');
      if (skill === 'rush' && distance(wolf,w.camp) > 12) continue;
      if (skill === 'call' && (state.used >= B.callLimit || alive.size >= B.aliveLimit)) continue;
      const targetWard = [...w.wards].filter(a => a.health > 0 && (skill === 'break' ? earthWallAt(wolf, a, B.breakRadius) || distance(wolf, a) <= B.breakRadius : distance(wolf, a) < 11))
        .sort((a, b) => distance(a, wolf) - distance(b, wolf))[0];
      
      const prey = skill === 'hunt' ? [...w.mechanics.spirits].filter(s => distance(s, wolf) < 12).sort((a,b) => distance(a,wolf)-distance(b,wolf))[0] : undefined;
      if (skill === 'hunt' && !prey) { state.cooldown = .4; continue; }
      const at = skill === 'rush' ? w.camp : prey ?? (skill === 'silence' ? targetWard ?? w.mechanics.spirits.find(s => distance(s, wolf) < 9) ?? wolf : wolf);
      const duration = skill === 'call' ? B.callDelay : skill === 'silence' ? B.silenceDelay : skill === 'hunt' ? B.huntDelay : B.breakDelay;
      state.cast = { skill, at: { x: at.x, z: at.z }, remaining: duration, duration };
      this.world.events.emit('enemySkill', { stage: 'start', skill, id: wolf.id, at: { x: wolf.x, z: wolf.z } });
      casting++;
      this.world.mechanics.effect('burst', wolf, 'metal', skill === 'call' ? '呼群' : skill === 'silence' ? '封灵' : skill === 'hunt' ? '猎灵' : skill === 'mend' ? '血祭' : skill === 'rush' ? '突袭蓄力' : '破阵', .9);
    }
  }
  private release(wolf: Wolf, skill: Skill, at: Point, state: State): void {
    const w = this.world, B = ENEMY_SKILLS;
    w.events.emit('enemySkill', { stage: 'release', skill, id: wolf.id, at: { x: at.x, z: at.z } });
    if (skill === 'call') {
      state.used++; state.cooldown = B.callCooldown;
      for (let i = 0; i < B.callCount && w.wolves.filter(v => v.action !== 'dead').length < B.aliveLimit; i++) {
        const p = wolfSpawn({ x: wolf.x + (i ? -1.7 : 1.7), z: wolf.z + 1 }, .62, w.wolves, w.wards); if (!p) continue;
        const hp = encounter(w.wave).health * .65;
        w.wolves.push({ ...p, id: w.allocateEntityId(), kind: 'normal', summoned: true, hp, maxHp: hp, speed: wolf.speed, heading: wolf.heading, action: 'run', age: 0, attack: .8,
          hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: wolf.pack, routeAge: 0, waypoint: null });
      }
    } else if (skill === 'mend') {
      state.cooldown = 10;
      for (const ally of w.wolves.filter(a => a.action !== 'dead' && a.id !== wolf.id && distance(a,wolf) <= B.mendRadius).slice(0,8)) ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp*.18);
      w.mechanics.effect('root', wolf, 'wood', '群狼回生', B.mendRadius);
    } else if (skill === 'rush') {
      state.cooldown = 10; state.used++;
      // Damage is announced in advance and prevented by interrupting this cast.
      const damage = 5 * encounter(w.wave).attackMultiplier;
      w.health = Math.max(0, w.health - damage); w.events.emit('campHit', { amount: damage });
      w.mechanics.effect('burst', at, 'fire', '突袭营火', B.rushRadius);
    } else if (skill === 'silence' || skill === 'hunt') {
      const hunt = skill === 'hunt', radius = hunt ? B.huntRadius : B.silenceRadius;
      state.cooldown = hunt ? B.huntCooldown : B.silenceCooldown; if (this.zones.length >= 8) this.zones.shift();
      this.zones.push({ ...at, remaining: hunt ? B.huntSeconds : B.silenceSeconds, radius, ownerId: wolf.id, spiritsOnly: hunt });
      w.mechanics.effect('burst', at, hunt ? 'water' : 'earth', hunt ? '猎灵禁区' : '封灵禁地', radius);
    } else {
      state.cooldown = B.breakCooldown; state.used++;
      for (const ward of [...w.wards]) if (earthWallAt(wolf, ward, B.breakRadius) || distance(wolf, ward) <= B.breakRadius) {
        w.damageWard(ward.id, (B.breakFlat + ward.maxHealth * B.breakFraction) * encounter(w.wave).attackMultiplier);
        ward.charge = 0; ward.empowered = 0; ward.suppressed = Math.max(ward.suppressed, 2);
      }
      w.mechanics.effect('burst', wolf, 'earth', '狼王破阵', B.breakRadius);
    }
  }
}
