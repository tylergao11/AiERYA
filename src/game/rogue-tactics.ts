import { distance, type Point } from '../core/math';
import { strokeTouches, type CombatStroke } from './combat';
import type { Element, Wolf } from './contracts';
import { bindWolf, type ReactionRequest } from './reactions';
import { CONCENTRATION } from './concentration';
import { ROGUE } from './rogue-balance';
import type { RogueCombat, RogueHit } from './rogue-combat';
import type { World } from './world';

const B = ROGUE.tactics;
export interface TacticField extends Point { kind: 'vortex' | 'mist'; radius: number; remaining: number; power: number; touched: Set<number> }
/** Extra rules earned in a run, driven by actual reactions rather than selected colors. */
export class RogueTactics {
  readonly fields: TacticField[] = [];
  readonly generation = new Set<Element>();
  cycleRemaining = 0;
  freeCast = false;
  swords = 0;
  swordRemaining = 0;
  private forgedOn = -1;
  private swordPower = 1;
  constructor(private readonly world: World, private readonly combat: RogueCombat) {}
  clear(): void { this.fields.length = 0; this.generation.clear(); this.cycleRemaining = 0; this.freeCast = false; this.swords = 0; this.swordRemaining = 0; this.forgedOn = -1; }
  reactions(requests: readonly ReactionRequest[], origin?: RogueHit): void {
    if (!this.world.build.active || !origin || origin.kind !== 'manual' && !origin.command) return;
    const own = (id: string) => this.world.build.level(`reaction-${id}`) > 0;
    const unique = new Map<string, ReactionRequest>();
    // Baseline reactions still affect all contacts. Each earned follow-up has one budget per relation and original stroke.
    for (const r of requests) {
      if (r.reaction.kind === 'resist' || r.power <= 0) continue;
      const key = `${r.reaction.from}:${r.reaction.to}`, old = unique.get(key);
      if (!old || r.power > old.power) unique.set(key, r);
    }
    for (const r of unique.values()) {
      const { reaction, at } = r;
      if (reaction.kind === 'generate') {
        if (own('cycle') && !this.freeCast && (origin.ticket?.investment ?? 1) >= .5) {
          if (!this.generation.size) this.cycleRemaining = B.cycleSeconds;
          this.generation.add(reaction.from);
          if (this.generation.size >= B.cycleKinds) {
            this.generation.clear(); this.cycleRemaining = 0; this.freeCast = true;
            this.combat.effect('evolve', at, reaction.result, '五行轮转 · 下一笔免费');
          }
        }
        if (reaction.from === 'metal' && own('vortex')) this.field('vortex', at, r.power);
      } else {
        if (reaction.from === 'water' && own('steam')) this.field('mist', at, r.power);
        if (reaction.from === 'metal' && own('cut')) {
          const roots = Math.min(CONCENTRATION.maxRootSeconds * (r.effect ?? 1), r.rooted ?? 0);
          const targets = this.near(at, B.cutRange).filter(w => w.id !== r.focusId).slice(0, B.cutTargets);
          for (const target of targets) {
            this.world.hitRogue(target, B.cutBase + roots * B.cutPerRoot, 'metal', { kind: 'trigger', scale: r.power, noProc: true, ticket: origin.ticket });
            this.combat.effect('beam', at, 'metal', '斩木飞刃', 0, target);
          }
        }
        if (reaction.from === 'fire' && own('forge')) {
          this.swords = B.forgeCharges; this.swordRemaining = B.forgeSeconds; this.forgedOn = origin.ticket?.id ?? -1;
          this.swordPower = Math.min(2, r.power); this.combat.effect('evolve', at, 'metal', '熔金藏剑 · 三柄');
        }
      }
    }
  }
  afterCast(stroke: CombatStroke, element: Element, origin: RogueHit): void {
    if (!this.swords || element === 'metal' || origin.ticket?.id === this.forgedOn) return;
    const at = stroke.points.at(-1)!;
    const target = this.near(at, B.forgeRange).sort((a, b) => Number(strokeTouches(b, stroke)) - Number(strokeTouches(a, stroke)))[0];
    if (!target) return;
    this.swords--;
    this.world.hitRogue(target, B.forgeDamage, 'metal', { kind: 'trigger', scale: this.swordPower * Math.min(1, stroke.investment ?? 1), noProc: true, ticket: origin.ticket });
    this.combat.effect('beam', at, 'metal', `剑藏 · 余 ${this.swords}`, 0, target);
  }
  /** Pure summoners spend a stored sword at a legal pet contact, once per original order. */
  commandContact(target: Wolf, from: Point, element: Element, origin: RogueHit): boolean {
    if (!this.swords || target.action === 'dead' || element === 'metal' || origin.ticket?.id === this.forgedOn) return false;
    this.swords--;
    this.world.hitRogue(target, B.forgeDamage, 'metal', { kind: 'trigger', scale: this.swordPower * Math.min(1, origin.ticket?.investment ?? 1), noProc: true, ticket: origin.ticket });
    this.combat.effect('beam', from, 'metal', `剑藏 · 余 ${this.swords}`, 0, target);
    return true;
  }
  private near(at: Point, radius: number): Wolf[] { return this.world.wolves.filter(w => w.action !== 'dead' && distance(w, at) <= radius).sort((a, b) => distance(a, at) - distance(b, at) || a.id - b.id); }
  private field(kind: TacticField['kind'], at: Point, power: number): void {
    const old = this.fields.findIndex(f => f.kind === kind && distance(f, at) < B.radius * .5);
    if (old >= 0) this.fields.splice(old, 1);
    if (this.fields.length >= B.fieldCap) this.fields.shift();
    this.fields.push({ ...at, kind, radius: B.radius, remaining: kind === 'vortex' ? B.vortexSeconds : B.mistSeconds, power: Math.min(1.5, power), touched: new Set() });
    this.combat.effect('burst', at, 'water', kind === 'vortex' ? '回澜地牢' : '沸雾还潮', B.radius);
  }
  tick(dt: number): void {
    this.cycleRemaining = Math.max(0, this.cycleRemaining - dt); if (!this.cycleRemaining) this.generation.clear();
    this.swordRemaining = Math.max(0, this.swordRemaining - dt); if (!this.swordRemaining) this.swords = 0;
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i]!; f.remaining -= dt; if (f.remaining <= 0) { this.fields.splice(i, 1); continue; }
      const targets = this.near(f, f.radius);
      if (f.kind === 'vortex') this.world.reactionEffects.pull(f, targets, f.power);
      for (const wolf of targets) {
        if (f.touched.has(wolf.id)) continue;
        if (f.kind === 'mist') {
          f.touched.add(wolf.id);
          this.world.hitRogue(wolf, 0, 'water', { kind: 'trigger', scale: f.power, noProc: true });
        } else if ((wolf.reactions?.mired ?? 0) > 0 && bindWolf(wolf, B.prisonSeconds * f.power)) {
          f.touched.add(wolf.id); this.combat.effect('root', wolf, 'wood', '泥牢缠足', 1);
        }
      }
    }
  }
}
