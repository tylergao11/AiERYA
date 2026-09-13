import { distance, type Point } from '../core/math';
import type { Wolf } from './contracts';
import { reactionStatus } from './reactions';
import { ROGUE, SPIRIT_SKILLS as S, SPIRIT_DAMAGE } from './rogue-balance';
import { wolfSegmentClear } from './wolf-collision';
import { SpiritMovement } from './spirit-movement';
import { earthWallAt } from './earth-wall';
import type { RogueCombat, RogueHit, RunSpirit } from './rogue-combat';
import type { World } from './world';

export interface SpiritField extends Point { owner: number; kind: 'wood' | 'water'; remaining: number; radius: number; touched: Set<number> }
interface FireBrand { owner: number; stacks: number; remaining: number }
/** Element identity is simulation behavior, independent of sprite color or damage labels. */
export class SpiritAbilities {
  readonly fields: SpiritField[] = [];
  readonly brands = new Map<number, FireBrand>();
  constructor(private readonly world: World, private readonly combat: RogueCombat) {}
  clear(): void { this.fields.length = 0; this.brands.clear(); }
  removed(owner: number): void {
    for (let i = this.fields.length - 1; i >= 0; i--) if (this.fields[i]!.owner === owner) this.fields.splice(i, 1);
    for (const [id, brand] of this.brands) if (brand.owner === owner) this.brands.delete(id);
  }
  private available(spirit: RunSpirit): boolean {
    if (!this.combat.spirits.includes(spirit) || this.world.enemyAbilities.silenced(spirit)) return false;
    const ward = spirit.wardId === undefined ? undefined : this.world.wards.find(w => w.id === spirit.wardId);
    return spirit.wardId === undefined || !!ward && ward.health > 0 && ward.suppressed <= 0;
  }
  attack(spirit: RunSpirit, target: Wolf, damage: number, origin: RogueHit): boolean {
    const w = this.world, element = spirit.element;
    if (target.action === 'dead' || !this.available(spirit) || !SpiritMovement.canHit(spirit, target, w.wards)) return false;
    this.combat.attackEvent('impact', spirit, target, .32);
    if (element === 'fire') {
      const brand = this.brands.get(target.id);
      this.brands.set(target.id, { owner: spirit.id, stacks: Math.min(S.fire.stacks, (brand?.stacks ?? 0) + 1), remaining: S.fire.seconds });
    }
    w.hitRogue(target, damage, element, origin);
    const struck = new Set([target.id]);
    if (element === 'metal') {
      const direction = { x: target.x - spirit.x, z: target.z - spirit.z };
      const length = Math.hypot(direction.x, direction.z) || 1;
      const behind = w.wolves.filter(v => v.id !== target.id && v.action !== 'dead' && SpiritMovement.canHit(spirit, v, w.wards)
        && (v.x - spirit.x) * direction.x + (v.z - spirit.z) * direction.z >= length * length
        && Math.abs((v.x - spirit.x) * direction.z - (v.z - spirit.z) * direction.x) / length <= S.metal.width)
        .sort((a, b) => distance(a, spirit) - distance(b, spirit)).slice(0, S.metal.extraTargets);
      const contacts:Point[]=[];
      for (const v of behind) { struck.add(v.id);const hp=v.hp;w.hitRogue(v, damage * S.metal.piercePower, 'metal', { ...origin, noProc: true });if(v.hp<hp)contacts.push({x:v.x,z:v.z}); }
      if(contacts.length)w.events.emit('spiritAbility',{kind:'pierce',spiritId:spirit.id,at:{x:target.x,z:target.z},targets:contacts,radius:0});
    } else if (element === 'wood' || element === 'water') {
      const existing = this.fields.findIndex(f => f.owner === spirit.id);
      if (existing >= 0) this.fields.splice(existing, 1);
      const at = element === 'water' ? target : spirit;
      this.fields.push({ owner: spirit.id, kind: element, x: at.x, z: at.z, radius: S[element].radius, remaining: S[element].seconds, touched: new Set([target.id]) });
    } else if (element === 'fire') {
      const brand = this.brands.get(target.id);
      if (brand && brand.stacks >= S.fire.stacks) this.explode(target, brand);
    } else {
      const near = w.wolves.filter(v => v.action !== 'dead' && distance(v, spirit) <= S.earth.radius && SpiritMovement.canHit(spirit, v, w.wards, .25));
      for (const v of near) {
        if (v.id !== target.id) { struck.add(v.id);w.hitRogue(v, damage * S.earth.splashPower, 'earth', { ...origin, noProc: true }); }
        const state = reactionStatus(v);
        if (state.weakened <= 0 || state.weakness <= S.earth.weakness) { state.weakened = S.earth.seconds; state.weakness = S.earth.weakness; }
        const d = distance(v, w.camp) || 1; v.vx = (v.x - w.camp.x) / d * 3.5; v.vz = (v.z - w.camp.z) / d * 3.5;
      }
      w.events.emit('spiritAbility',{kind:'stomp',spiritId:spirit.id,at:{x:spirit.x,z:spirit.z},targets:[target,...near.filter(v=>v.id!==target.id)].map(v=>({x:v.x,z:v.z})),radius:S.earth.radius});
      const wall = w.wards.filter(a => a.element === 'earth' && a.health > 0 && a.health < a.maxHealth && earthWallAt(spirit, a, 2.2)).sort((a, b) => a.health / a.maxHealth - b.health / b.maxHealth)[0];
      if (wall) { wall.health = Math.min(wall.maxHealth, wall.health + S.earth.repair * spirit.power); w.events.emit('reactionEffect', { effect: 'guard', at: wall, radius: 2, targets: [] }); }
    }
    // One local splash per basic attack; existing pierce/stomp contacts are not hit twice.
    const splash = ROGUE.spirit;
    const nearby = w.wolves.filter(v => v.action !== 'dead' && !struck.has(v.id)
      && distance(v, target) <= splash.attackSplashRadius
      && SpiritMovement.canHit(spirit, v, w.wards, splash.attackSplashRadius)
      && wolfSegmentClear(target, v, .08, w.wards))
      .sort((a, b) => distance(a, target) - distance(b, target) || a.id - b.id).slice(0, splash.attackSplashTargets);
    for (const v of nearby) w.hitRogue(v, damage * splash.attackSplashPower, element, { ...origin, noProc: true });
    if (nearby.length) this.combat.effect('burst', target, element, '', splash.attackSplashRadius);
    return true;
  }
  died(wolf: Wolf, origin?: RogueHit): void {
    const brand = this.brands.get(wolf.id); if (!brand) return;
    if (!origin?.noProc) this.explode(wolf, brand); else this.brands.delete(wolf.id);
  }
  private explode(wolf: Wolf, brand: FireBrand): void {
    this.brands.delete(wolf.id);
    const owner = this.combat.spirits.find(s => s.id === brand.owner);
    if (!owner || !this.available(owner) || !SpiritMovement.canHit(owner, wolf, this.world.wards, .25)) return;
    this.combat.burst(wolf, 'fire', SPIRIT_DAMAGE.fire * S.fire.powerPerStack * brand.stacks, S.fire.radius, { kind: 'spirit', spiritId: brand.owner, noProc: true }, wolf.id,false);
    this.world.events.emit('spiritAbility',{kind:'fireburst',spiritId:brand.owner,at:{x:wolf.x,z:wolf.z},targets:[],radius:S.fire.radius,stacks:brand.stacks});
  }
  tick(dt: number): void {
    for (const [id, brand] of this.brands) { brand.remaining -= dt; if (brand.remaining <= 0) this.brands.delete(id); }
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const field = this.fields[i]!; field.remaining -= dt;
      const owner = this.combat.spirits.find(s => s.id === field.owner), ward = owner?.wardId === undefined ? undefined : this.world.wards.find(w => w.id === owner.wardId);
      if (field.remaining <= 0 || !owner || field.kind === 'wood' && distance(owner, field) > field.radius) { this.fields.splice(i, 1); continue; }
      if (this.world.enemyAbilities.silenced(owner) || ward && (ward.suppressed > 0 || ward.health <= 0)) continue;
      const targets = this.world.wolves.filter(w => w.action !== 'dead' && distance(w, field) <= field.radius && SpiritMovement.canHit(owner, w, this.world.wards));
      if (field.kind === 'water') this.world.reactionEffects.pull(field, targets, owner.power * .7);
      for (const wolf of targets) {
        if (field.touched.has(wolf.id)) continue; field.touched.add(wolf.id);
        this.world.hitRogue(wolf, field.kind === 'wood' ? SPIRIT_DAMAGE.wood * S.wood.power : 0, field.kind, { kind: 'spirit', spiritId: owner.id, noProc: true });
      }
    }
  }
}
