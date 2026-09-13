import type { World } from '../game/world';
import { pureSlayer, SLAYER_COMBO } from '../game/slayer-combo';
import { slayerReturnWindow, returnWindowHint, returnGestureHint, type SlayerReturnGesture } from '../game/slayer-return-window';

export class SlayerHud {
  private readonly root = document.createElement('aside');
  private readonly count: HTMLElement;
  private readonly rank: HTMLElement;
  private readonly bank: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly impact: HTMLElement;
  private readonly set: HTMLElement;
  private readonly trigger: HTMLElement;
  private readonly recovery: HTMLElement;
  private readonly callout = document.createElement('div');
  private readonly off: (() => void)[];
  private impactUntil = 0;
  private recoveryUntil = 0;
  private recovered = 0;
  private animation?: Animation;
  private calloutAnimation?: Animation;
  private calloutUntil = 0;
  private calloutPriority = 0;
  private tier = 0;
  constructor(host: HTMLElement, private readonly world: World) {
    this.root.className = 'slayer-hud'; this.root.hidden = true; this.root.setAttribute('aria-label', '杀伐连斩');
    this.root.innerHTML = '<div class="slayer-set"></div><div class="slayer-pure-trigger"></div><div class="slayer-rank"></div><div class="slayer-count"></div><div class="slayer-timer"><i></i></div><div class="slayer-bank"></div><div class="slayer-recovery"></div><div class="slayer-impact" role="status"></div>';
    host.append(this.root);
    this.callout.className = 'slayer-callout'; this.callout.hidden = true;
    this.callout.setAttribute('aria-hidden', 'true'); host.append(this.callout);
    this.count = this.root.querySelector('.slayer-count')!; this.rank = this.root.querySelector('.slayer-rank')!;
    this.bank = this.root.querySelector('.slayer-bank')!; this.timer = this.root.querySelector('.slayer-timer i')!; this.impact = this.root.querySelector('.slayer-impact')!;
    this.set = this.root.querySelector('.slayer-set')!;
    this.trigger = this.root.querySelector('.slayer-pure-trigger')!;
    this.recovery = this.root.querySelector('.slayer-recovery')!;
    this.off = [world.events.on('slayerStrike', e => {
      if (!e.hits) return;
      this.impact.textContent = `${(e.rush ?? 0) > 0 ? '狂书追斩 · ' : e.burst > 0 ? '刀势爆发 · ' : ''}${e.kills > 1 ? `一刀 ${e.kills} 杀` : e.level >= 2 ? '重斩命中' : e.hits > 1 ? `贯穿 ${e.hits} 敌` : '命中'}`;
      if (e.openings?.length) this.impact.textContent = `追破 ${e.openings.length} 敌 · ${this.impact.textContent}`;
      this.impactUntil = performance.now() + 850;
      const allGuarded = e.guarded === e.hits && !e.kills;
      if (allGuarded) this.impact.textContent = '锋甲弹刀 · 蓄力重斩破甲';
      else if (e.guarded) this.impact.textContent += ` · ${e.guarded} 敌弹刀`;
      if (e.level === 3 && e.kills >= 3) this.announce('破军', `一刀 ${e.kills} 杀`, 3);
      else if ((e.rush ?? 0) >= .3 && !allGuarded) this.announce('狂书', '借势追斩 · 一气呵成', 3);
      else if (!allGuarded && (e.tierRaised ?? (e.tier > this.tier)) && e.tier >= 2) this.announce(SLAYER_COMBO.names[e.tier]!, `${e.combo} 连斩`, e.tier === 3 ? 2 : 1);
      this.tier = e.tier;
      if (!allGuarded && this.count.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.animation?.cancel();
        this.animation = this.count.animate([{ transform: `scale(${1.08 + e.level * .05})`, filter: 'brightness(1.7)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 180 });
      }
    }), world.events.on('slayerFinisher', e => {
      this.impactUntil = performance.now() + 1100;
      if (!(e.hits ?? 0)) { this.impact.textContent = '交叉斩掠空'; return; }
      if (e.hits! <= (e.guarded ?? 0)) { this.impact.textContent = '交叉斩受阻 · 蓄力重斩破甲'; return; }
      this.impact.textContent = `千锋归一 · 贯穿 ${e.hits} 敌${e.guarded ? ` · ${e.guarded} 敌弹刀` : ''}`;
      this.announce('千锋归一', '刀势尽出 · 交叉追斩', 4);
    }),
    world.events.on('slayerReturn', e => {
      const now = performance.now(), current = this.impact.textContent ?? '';
      const result=!e.hits?'回锋掠空':e.guarded>=e.hits?'回锋弹刀 · 蓄力重斩破甲':`回锋 ${e.hits-e.guarded} 敌${e.guarded?` · ${e.guarded} 敌弹刀`:''}`;
      this.impact.textContent = now < this.impactUntil && current.startsWith('追破 ') ? `${current.split(' · ')[0]!.replace(' 敌','')} · ${result.replace(' 敌','')}` : result;
      this.impactUntil = now + 900;
    }),
    world.events.on('spiritRecovered', ({ amount }) => {
      if (!world.build.is('slayer') || world.phase !== 'battle' || amount <= 0) return;
      const now = performance.now();
      this.recovered = (now < this.recoveryUntil ? this.recovered : 0) + amount;
      this.recoveryUntil = now + 1200;
    }), world.events.on('phase', () => this.clearFeedback()), world.events.on('reset', () => this.clearFeedback())];
  }
  private announce(title: string, subtitle: string, priority: number): void {
    const now = performance.now();
    if (now < this.calloutUntil && priority <= this.calloutPriority) return;
    this.calloutPriority = priority; this.calloutUntil = now + 950;
    this.callout.dataset.kind = priority === 4 ? 'pure' : 'heavy';
    this.callout.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
    this.callout.hidden = false; this.calloutAnimation?.cancel();
    if (this.callout.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.calloutAnimation = this.callout.animate([
        { opacity: 0, translate: '26px 0', filter: 'brightness(1.5)', offset: 0 },
        { opacity: 1, translate: '-3px 0', filter: 'brightness(1.2)', offset: .1 },
        { opacity: 1, translate: '0 0', filter: 'brightness(1)', offset: .25 },
        { opacity: 1, translate: '0 0', offset: .68 },
        { opacity: 0, translate: '-12px 0', offset: 1 },
      ], { duration: 950, fill: 'forwards' });
    }
  }
  private clearFeedback(): void { this.recovered = 0; this.recoveryUntil = 0; this.impactUntil = 0; this.tier = 0; this.calloutUntil = 0; this.calloutAnimation?.cancel(); this.callout.hidden = true; }
  update(blocked: boolean, gesture: SlayerReturnGesture | null = null): void {
    this.root.classList.toggle('mixed-summon', this.world.build.is('slayer') && this.world.build.is('spirit'));
    this.root.hidden = blocked || this.world.phase !== 'battle' || !this.world.swordActive;
    this.callout.hidden = this.root.hidden || performance.now() >= this.calloutUntil;
    if (this.root.hidden) return;
    const combo = this.world.slayerCombo;
    if (!combo.count) this.tier = 0;
    this.root.dataset.tier = String(combo.tier);
    this.count.textContent = `${combo.count} 连斩`;
    this.rank.textContent = `剑势 · ${SLAYER_COMBO.names[combo.tier]}`;
    this.set.hidden = !pureSlayer(this.world.build); this.set.textContent = '纯杀伐 · 千锋归一';
    this.trigger.hidden=this.set.hidden;
    const ready=combo.momentum>=SLAYER_COMBO.pureThreshold;
    this.root.classList.toggle('pure-ready',!this.set.hidden&&ready);
    this.trigger.textContent=ready?'三格满蓄 · 命中触发':`合技 ${Math.min(100,Math.floor(combo.momentum/SLAYER_COMBO.pureThreshold*100))}% · 快斩积势`;
    const bank = Math.round(combo.momentum / SLAYER_COMBO.bankCap * 100);
    const initiative = this.world.slayerTechniques.initiative;
    const rush = this.world.slayerTechniques.rush;
    const scarce = !this.world.ultimate.active && this.world.spellCost > 0 && this.world.spirit - this.world.mechanics.debtFloor < 8;
    const openings = this.world.slayerTechniques.openings.size, returnCut = this.world.slayerTechniques.returnCut;
    const returnWindow = slayerReturnWindow(this.world);
    this.bank.dataset.return = !rush && returnWindow ? returnWindow.state : '';
    this.bank.textContent = rush ? `狂书待发 · ${rush.remaining.toFixed(1)}s 内接快刀` : returnWindow && returnCut ? returnWindowHint(returnWindow, returnCut.remaining) : openings ? `${openings} 敌有破绽 · ${scarce ? '短划' : '快刀'}追破` : scarce ? '灵力吃紧 · 短划补刀' : `${bank > 0 ? `刀势 ${bank}%` : '命中积势'}${initiative > .01 ? ` · 先手 ${initiative.toFixed(1)}s` : ' · 原地按住蓄力'}`;
    this.root.classList.toggle('rush-ready', !!rush);
    if(gesture && returnCut){
      this.bank.textContent=returnGestureHint(gesture);
      this.bank.dataset.return=gesture.mode==='remote'||gesture.mode==='overlap'?'ready':gesture.mode==='guarded'?'guarded':'empty';
    }
    const recovering = performance.now() < this.recoveryUntil;
    this.recovery.textContent = recovering ? `斩获 +${Number(this.recovered.toFixed(2))} 灵力` : '两次轻刀积势 · 重刀命中返 3 灵力';
    this.recovery.classList.toggle('active', recovering);
    this.timer.style.transform = `scaleX(${combo.remaining / SLAYER_COMBO.window})`;
    this.impact.hidden = performance.now() > this.impactUntil;
  }
  dispose(): void { this.off.forEach(off => off()); this.animation?.cancel(); this.calloutAnimation?.cancel(); this.callout.remove(); this.root.remove(); }
}
