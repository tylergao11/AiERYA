import { distance, type Point } from '../core/math';
import { BATTLE } from './battle-rules';
import { GENERATES, OVERCOMES, strokeTouches, type CombatStroke } from './combat';
import type { Element } from './contracts';
import type { RogueHit } from './rogue-combat';
import { bindWolf, reactionStatus } from './reactions';
import type { World } from './world';

export interface ElementTrace { id: number; points: readonly Point[]; element: Element; remaining: number; power: number; origin: RogueHit }
/** Six finite paths. Same-element overlap never multiplies damage at one position. */
export class ElementTraces {
  readonly fields: ElementTrace[] = [];
  private next = 1;
  private pulse = 0;
  private proc = false;
  constructor(private readonly world: World) {}
  clear(): void { this.fields.length = 0; this.pulse = 0; }
  add(stroke: CombatStroke, element: Element, origin: RogueHit): void {
    const field: ElementTrace = { id: this.next++, points: stroke.points.map(p => ({ ...p })), element,
      remaining: BATTLE.trace.lifetime + (this.world.build.level('array-density') ? 1 : 0), power: (stroke.effect ?? 1) * (1 + BATTLE.trace.growth * this.world.build.learned.filter(r => r.lane === 'array').reduce((n,r) => n+r.level,0)) * (this.world.build.stage >= 1 ? 1.2 : 1),
      origin: { ...origin, kind: 'array', sustained: true, noProc: true } };
    const contact = [...this.fields].reverse().map(old => ({ old, at: field.points.find(p => old.points.some(q => distance(p, q) < BATTLE.trace.width)) }))
      .find(c => c.at && c.old.element !== element);
    if (contact?.at) {
      const { old, at } = contact;
      if (GENERATES[element] === old.element || GENERATES[old.element] === element) {
        field.power *= this.world.build.level('array-cycle') ? 1.9 : 1.5;
        old.remaining = Math.min(BATTLE.trace.lifetime, old.remaining + 1);
        this.world.mechanics.effect('root', at, element, '相生', 1.4);
      } else if (OVERCOMES[element] === old.element) {
        old.remaining *= .5;
        const targets = this.world.wolves.filter(w => w.action !== 'dead' && distance(w, at) <= BATTLE.trace.reactionRadius).slice(0, BATTLE.trace.reactionTargets);
        for (const wolf of targets) {
          this.world.enemyAbilities.interrupt(wolf.id);
          this.world.hitRogue(wolf, BATTLE.trace.reactionDamage * field.power * (this.world.build.level('array-echo') ? 1.42 : 1) * (this.world.build.stage >= 2 && new Set(this.fields.map(f => f.element)).size >= 3 ? 1.4 : 1), element, { kind: 'array', noProc: true });
        }
        if (targets.length >= 2 || targets.some(w => w.kind !== 'normal')) this.world.recoverTechnique(2);
        this.world.mechanics.effect('burst', at, element, '相克引爆', BATTLE.trace.reactionRadius);
      }
    }
    if (this.fields.length >= BATTLE.trace.cap) this.fields.shift();
    this.fields.push(field);
  }
  tick(dt: number): void {
    for (let i = this.fields.length - 1; i >= 0; i--) { this.fields[i]!.remaining -= dt; if (this.fields[i]!.remaining <= 0) this.fields.splice(i, 1); }
    this.pulse += dt; if (this.pulse < BATTLE.trace.tick) return;
    this.pulse %= BATTLE.trace.tick; this.proc = !this.proc;
    for (const wolf of this.world.wolves) {
      if (wolf.action === 'dead') continue;
      const contacts = new Map<Element, ElementTrace>();
      for (const field of this.fields) {
        const stroke: CombatStroke = { points: field.points as Point[], loop: null, direction: { x: 0, z: 0 }, multiplier: 1, width: BATTLE.trace.width };
        if (strokeTouches(wolf, stroke) && (!contacts.has(field.element) || contacts.get(field.element)!.power < field.power)) contacts.set(field.element, field);
      }
      for (const field of [...contacts.values()].sort((a, b) => b.power - a.power).slice(0, 2)) {
        this.world.hitRogue(wolf, BATTLE.trace.damage * BATTLE.trace.tick * field.power, field.element, { ...field.origin, noProc: !this.proc });
        if (field.element === 'wood') bindWolf(wolf, .18);
        if (field.element === 'water') { wolf.wet = Math.max(wolf.wet, .7); wolf.slowAmount = Math.max(wolf.slowAmount, .3); }
        if (field.element === 'earth') { const s = reactionStatus(wolf); s.weakened = Math.max(s.weakened, .7); s.weakness = Math.max(s.weakness, .2); }
        if (field.element === 'metal') { const s = reactionStatus(wolf); s.exposed = Math.max(s.exposed, .7); s.exposure = Math.max(s.exposure, .15); }
      }
    }
  }
}
