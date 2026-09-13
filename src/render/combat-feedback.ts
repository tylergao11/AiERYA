import type { World } from '../game/world';
import { COLORS } from './ink';
import { toArt, type Pixel } from './projection';
import { layoutCombatLabels, type CombatLabel, type LabelRect } from './combat-labels';
import { wolfAnchors } from './actor-anchors';
import { slayerDetailScale } from './slayer-readability';
import { SummonLabels, summonDetailScale } from './summon-labels';
import { EffectTextBudget } from './effect-text-budget';

interface NumberMark { p: Pixel; age: number; amount: number; color: string; key: string; label: string; fractional: boolean }
const slayerNumberPriority = (label: string) => label === '蒸汽 ' || label === '追破 ' || label === '回锋 ' ? 3 : label === '灼 ' ? 1 : 2;
const summonColors = {metal:'#d3bd91',wood:'#b5c39e',water:'#aac6c7',fire:'#d5aa86',earth:'#c3b18b'};
/** Reads resolved combat events. Feedback has no authority over damage or timing. */
export class CombatFeedback {
  private numbers: NumberMark[] = [];
  private tags: { p: Pixel; age: number; text: string; color: string }[] = [];
  private readonly off: (() => void)[];
  private readonly summonLabels: SummonLabels;
  constructor(private readonly world: World, private readonly textBudget = new EffectTextBudget()) {
    this.summonLabels=new SummonLabels(world);
    this.off = [world.events.on('damage', event => this.damage(event)),
      world.events.on('reaction', e => {
        if(!this.textBudget.claim(e.name,world.time))return;
        const p = toArt(e.at);
        if (this.tags.some(t => t.text === e.name && t.age < 0.35 && Math.hypot(t.p.x - p.x, t.p.y - p.y) < 90)) return;
        if (this.tags.length >= 3) this.tags.shift();
        this.tags.push({ p, age: 0, text: e.name, color: world.mechanics.commands.active&&!world.build.is('slayer')?summonColors[e.result]:COLORS[e.result] });
      }),
      world.events.on('phase', ({ phase }) => { if (phase !== 'battle') this.clear(); }),
      world.events.on('reset', () => this.clear())];
  }
  private damage(event: import('../game/contracts').GameEvents['damage']): void {
    const burst=this.world.mechanics.commands.active&&!this.world.build.is('slayer')&&!event.ongoing&&['companion','steam','reaction'].includes(event.source);
    const key = burst?`${event.targetId}:summon-burst`:`${event.targetId}:${event.source}:${event.ongoing}${event.opening ? ':opening' : event.returning ? ':return' : ''}`, wolf = this.world.wolves.find(w => w.id === event.targetId);
    const anchors = wolf && wolfAnchors(wolf), p = anchors ? { x: anchors.body.x, y: anchors.body.y - 48 * anchors.scale } : toArt(event.at, 2.8);
    const recent = this.numbers.find(mark => (mark.key === key || !burst && event.source === 'steam' && mark.label === '蒸汽 ' && Math.abs(mark.p.x - p.x) < 110 && Math.abs(mark.p.y - p.y) < 50) && mark.age < (event.ongoing ? 0.45 : burst?.14:.1));
    if (recent) { recent.amount += event.amount; return; }
    const label = burst?'':event.opening ? '追破 ' : event.returning ? '回锋 ' : event.source === 'steam' ? '蒸汽 ' : event.ongoing ? '灼 ' : event.source === 'reaction' ? '连携 ' : '';
    if (this.numbers.length >= 30) {
      if (!this.world.build.is('slayer')&&!this.world.mechanics.commands.active) return;
      // A fresh blade may replace an older contact; burn ticks must not evict it.
      const priority = slayerNumberPriority(label);
      let victim = -1;
      for (let i = 0; i < this.numbers.length; i++) {
        const mark = this.numbers[i]!, candidate = this.numbers[victim];
        const rank = slayerNumberPriority(mark.label);
        if (rank > priority) continue;
        if (!candidate || rank < slayerNumberPriority(candidate.label) || rank === slayerNumberPriority(candidate.label) && mark.age > candidate.age) victim = i;
      }
      if (victim < 0) return;
      this.numbers.splice(victim, 1);
    }
    this.numbers.push({ p, age: 0, amount: event.amount, key, fractional: event.source === 'campfire',
      color: event.opening?'#ffe0a1':event.returning?'#d7ecd3':burst?'#e3d6b7':event.source === 'companion'&&this.world.mechanics.commands.active ? event.ongoing?'#cda37e':'#e3d6b7' : event.source === 'steam' ? '#efffff' : COLORS[event.element], label });
  }
  update(dt: number): void {
    this.summonLabels.update(dt);
    for (const mark of this.numbers) mark.age += dt;
    this.numbers = this.numbers.filter(mark => mark.age < 0.95);
    for (const tag of this.tags) tag.age += dt;
    this.tags = this.tags.filter(tag => tag.age < 1.15);
  }
  paint(c: CanvasRenderingContext2D, cameraScale = 1, bodies: readonly LabelRect[] = []): void {
    c.save();
    const summoner=this.world.mechanics.commands.active;
    const detail = this.world.build.is('slayer') ? slayerDetailScale(cameraScale) : summoner?summonDetailScale(cameraScale):1;
    const labels: CombatLabel[] = this.summonLabels.labels(summonDetailScale(cameraScale),(text,size)=>{c.font=`600 ${size}px "Microsoft YaHei UI",sans-serif`;return c.measureText(text).width;}), reserved: LabelRect[] = [...bodies];
    const add = (text: string, p: Pixel, color: string, alpha: number, size: number, priority: number) => {
      size *= detail;
      c.font = `600 ${size}px "Microsoft YaHei UI",sans-serif`; labels.push({ text, p, color, alpha, size, priority, width: c.measureText(text).width });
    };
    for (const wolf of this.world.wolves) if (wolf.action !== 'dead') {
      const a = wolfAnchors(wolf);
      reserved.push({ x: a.body.x - 31 * a.scale, y: a.body.y - 33 * a.scale, width: 62 * a.scale, height: 54 * a.scale });
      if (wolf.kind && wolf.kind !== 'normal') reserved.push({ x: a.body.x - 36 * a.scale, y: a.ground.y - a.lift - 100 * a.scale, width: 72 * a.scale, height: 18 });
    }
    for (const tag of this.tags) add(tag.text, { x: tag.p.x, y: tag.p.y - 58 - tag.age * 16 }, tag.color, Math.min(1, (1.15 - tag.age) * 3), 14, 3);
    // New contacts claim the limited readable positions before fading old numbers.
    const slayer = this.world.build.is('slayer');
    for (const mark of slayer||summoner ? [...this.numbers].reverse() : this.numbers) {
      if (mark.fractional && mark.amount < .05) continue;
      const amount = mark.fractional && mark.amount < 1 ? mark.amount.toFixed(1) : Math.round(mark.amount);
      const text = `${mark.label}${amount}`, y = mark.p.y - mark.age * 28;
      add(text, { x: mark.p.x, y }, mark.color, Math.min(1, (0.95 - mark.age) * 4), 15, slayer||summoner ? slayerNumberPriority(mark.label) : mark.label === '蒸汽 ' ? 3 : 2);
    }
    c.font = '13px "Microsoft YaHei UI", sans-serif'; c.globalAlpha = 0.95;
    const groups: { p: Pixel; text: string; rooted: boolean; count: number }[] = [];
    for (const wolf of this.world.wolves) {
      if (wolf.action === 'dead') continue;
      if(summoner&&!slayer&&wolf.id!==this.world.mechanics.commands.targetId)continue;
      const marks = wolf.reactions;
      const slow = Math.max(wolf.slowAmount, (marks?.mired ?? 0) > 0 ? marks!.mireSlow : 0);
      const compact=summoner&&!slayer;
      const status = [(marks?.exposed ?? 0) > 0 ? compact?'破防':`破防 +${Math.round(marks!.exposure * 100)}%` : '', wolf.rooted > 0 ? '缠绕' : slow > 0 ? compact?'减速':`减速 ${Math.round(slow * 100)}%` : '', (marks?.weakened ?? 0) > 0 ? '镇压' : ''].filter(Boolean).join(' · ');
      if (!status) continue;
      const p = toArt(wolf), group = groups.find(group => group.text === status && Math.abs(group.p.x - p.x) < 100 && Math.abs(group.p.y - p.y) < 40);
      if (group) {
        group.p.x = (group.p.x * group.count + p.x) / (group.count + 1); group.p.y = (group.p.y * group.count + p.y) / (group.count + 1); group.count++;
      } else groups.push({ p, text: status, rooted: wolf.rooted > 0, count: 1 });
    }
    for (const group of groups) {
      const label = group.text + (group.count > 1 ? ` ×${group.count}` : '');
      add(label, { x: group.p.x, y: group.p.y + 25 }, summoner&&!slayer?group.rooted?summonColors.wood:summonColors.water:group.rooted ? COLORS.wood : COLORS.water, 0.86, 12, 1);
    }
    for (const ward of this.world.wards) if (ward.empowered > 0 && (ward.element === 'earth' || ward.element === 'metal')) {
      const p = toArt(ward, 1.6), label = ward.element === 'earth' ? '固土护阵' : `凝锋 ${(ward.edgeCharges ?? 0)}击`;
      add(label, p, COLORS[ward.element], 0.85, 12, 1);
    }
    c.textAlign = 'center'; c.lineWidth = 3 * detail; c.strokeStyle = '#122129';
    for (const label of layoutCombatLabels(labels, reserved, { spacing: detail, limit: detail > 1.4 ? 12 : 24, sideLanes:summoner })) {
      c.globalAlpha = label.alpha; c.font = `600 ${label.size}px "Microsoft YaHei UI",sans-serif`; c.fillStyle = label.color;
      c.strokeText(label.text, label.p.x, label.p.y); c.fillText(label.text, label.p.x, label.p.y);
    }
    c.restore();
  }
  private clear(): void { this.numbers = []; this.tags = []; this.summonLabels.clear(); this.textBudget.clear(); }
  dispose(): void { this.off.forEach(off => off()); this.summonLabels.dispose(); this.clear(); }
}
