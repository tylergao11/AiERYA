import { gsap } from 'gsap';
import { abilities, upgrades } from '../game/content';
import { ELEMENTS, type Element } from '../game/contracts';
import type { World } from '../game/world';
import { SPELLS } from '../game/combat';
import { openingPanel, rewardPanel, buildPanel, buildStatus } from './rogue-panel';
import { SLAYER_DAMAGE } from '../game/rogue-combat';
import { BirthPreview } from './birth-preview';
import { BattlePresentation } from './battle-presentation';
import { helpPanel, HELP_CHAPTERS, type HelpChapter } from './help-panel';
import { FirstRunGuide } from './first-run-guide';
import { ROGUE } from '../game/rogue-balance';
import { CHARGE } from '../game/charge';
import { SlayerHud } from './slayer-hud';
import { SlayerViewControls } from './slayer-view-controls';
import { SummonView } from './summon-view';
import type { SceneView } from '../render/view';
import { ArrayHud } from './array-hud';
import { SummonHud } from './summon-hud';
import { ORDERS } from '../game/summon-balance';
import { uiIcon as icon } from './icons';
import { WaveHud } from './wave-hud';
import { CAMPAIGN_WAVES } from '../game/encounters';
import { birthDetail } from './birth-panel';
import { elementArt, factionEmblem } from './manuscript-art';
import { PanelNavigation, type UtilityPanel } from './panel-navigation';
import { PanelSurface } from './panel-surface';
import { panelHeading, pausePanel, restartPanel, resultPanel } from './common-panels';
import './common-ui.css';
import './warm-scroll.css';
import './birth-layout.css';
import { MobileLayout } from './mobile-layout';
import './mobile-layout.css';
import { CombatDeck } from './combat-deck';

const COMBO_HINTS: Record<Element, string> = { wood: '助火蔓延 · 遇水缠枝 · 破土生根', fire: '遇木助燃 · 固土护墙 · 熔金破防', earth: '凝锋连击 · 截流成泥 · 遇火护阵', metal: '划水聚怪 · 斩木重击 · 遇土连击', water: '消火爆炸 · 润木缠枝 · 遇金聚怪' };

export class GameInterface {
  private readonly elements = new Map<Element, HTMLButtonElement>();
  private readonly combatDeck: CombatDeck;
  private readonly mobileLayout: MobileLayout;
  private readonly notice: HTMLElement;
  private readonly health: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly tip: HTMLElement;
  private previousNotice = '';
  private previousPhase = '';
  private helpChapter: HelpChapter = 'basics';
  private introductoryHandbook = false;
  private readonly firstGuide = new FirstRunGuide();
  private readonly navigation = new PanelNavigation();
  private readonly surface: PanelSurface;
  private birthFocus: string | null = null;
  private birthPreview?: BirthPreview;
  private noticeTimer = 0;
  private readonly battlePresentation: BattlePresentation;
  private readonly slayerHud: SlayerHud;
  private viewControls?: SlayerViewControls;
  private summonView?: SummonView;
  private readonly arrayHud: ArrayHud;
  private readonly summonHud: SummonHud;
  private readonly waveHud: WaveHud;
  private readonly disconnect: (() => void)[];
  get paused(): boolean { return this.navigation.has('pause'); }
  muted = false;
  removing = false;
  strokePreview: { cost: number; power: number; moving?: boolean; charge?: number; charging?: boolean; limited?: boolean; unaffordable?: boolean; returning?: import('../game/slayer-return-window').SlayerReturnGesture | null } | null = null;
  onRemovalChange: () => void = () => {};
  onPause: (paused: boolean) => void = () => {};
  onSound: (muted: boolean) => void = () => {};
  onSettings: () => void = () => {};

  constructor(private readonly host: HTMLElement, private readonly world: World) {
    host.innerHTML = `
      <div class="shade"></div>
      <header class="topbar"><div class="identity"><span class="seal">阵</span><div><p class="eyebrow">山涧营地 · 第一夜</p><h1>山野<span>·</span>阵火</h1></div></div>
      <div class="status"><div class="spirit-status"><span id="spirit-label">灵力</span><strong id="spirit-text">100 / 100</strong><div class="health-track"><i id="spirit-bar"></i></div></div><div class="camp-status"><span>营地</span><strong id="health-text">100</strong><div class="health-track"><i id="health-bar"></i></div></div><div id="wave" class="wave">待暮色入林</div></div>
      <div class="tools"><button data-action="sound" aria-label="关闭声音" title="环境声音">${icon('sound')}</button><button data-action="help" aria-label="操作说明" title="操作说明">${icon('help')}</button><button data-action="pause" aria-label="暂停" title="暂停 / 空格">${icon('pause')}</button></div></header>
      <aside class="field-note" hidden></aside><div class="build-strip"><button data-action="build" class="build-toggle" hidden></button><span class="array-status" hidden></span></div>
      <div class="bottom"><div class="message" role="status" aria-live="polite"><span class="message-mark">◇</span><span id="notice"></span></div>
      <div class="command-deck"><div class="modes"><div class="phase-mode"><b id="phase-title">布局</b><small id="phase-tip">围拢自动成阵</small></div></div>
      <div class="elements">${ELEMENTS.map((element, i) => { const a = abilities[element]; return `<button class="element" data-element="${element}" style="--element:${a.css}" title="${a.detail}" aria-label="选择${a.name}行">${elementArt(element)}<span class="element-glyph">${a.name}</span><span class="element-copy"><b>${a.label}</b><small></small></span><kbd>${i + 1}</kbd></button>`; }).join('')}</div>
      <div id="actions" class="actions"><button data-action="ultimate" class="ultimate-button" aria-label="发动停时大招" title="Q · 每波一次，停时三秒自由划线，双倍释放" hidden><b>停时</b><small>Q · 万象齐发</small></button><button data-action="dismiss" class="dismiss-button" aria-label="撤阵，回收剩余耐久的灵力残值" aria-pressed="false" title="点击后选择阵法 · 实付 × 剩余耐久 × 80%"><b>撤阵</b><small>回收残值</small></button><button data-action="start" class="primary">迎战 <span>→</span></button></div></div>
      <div class="footer"><span id="mode-tip"></span><span id="combat-totals">滚轮缩放 · 空格暂停</span></div></div>
      <div id="panel" class="modal" hidden></div><div class="portrait-note">横屏展开，可看清整片山林</div>`;
    this.notice = host.querySelector('#notice')!; this.health = host.querySelector('#health-bar')!; this.wave = host.querySelector('#wave')!;
    host.querySelector('.tools')!.insertAdjacentHTML('beforeend', '<button class="help-nudge" data-action="help" aria-label="打开五行手记" hidden><svg viewBox="0 0 44 48" aria-hidden="true"><path d="M15 29V9q0-6 5-6t5 6v14q2-6 6-3 4-3 7 2 4 0 4 6l-2 10-6 7H21l-9-10q-8-9-4-11 4-2 7 5Z"/></svg><span>手记</span></button>');
    this.actions = host.querySelector('#actions')!; this.panel = host.querySelector('#panel')!; this.tip = host.querySelector('#mode-tip')!;
    this.surface = new PanelSurface(host, this.panel, () => this.back(), () => {
      if (!this.surface.active && this.world.phase !== 'destiny') { this.birthPreview?.dispose(); this.birthPreview = undefined; }
      this.onPause(this.blocked);
    });
    for (const element of ELEMENTS) this.elements.set(element, host.querySelector(`[data-element="${element}"]`)!);
    this.combatDeck = new CombatDeck(host, world, () => { this.setRemoval(false); this.onRemovalChange(); });
    host.addEventListener('click', this.click);
    this.battlePresentation = new BattlePresentation(host, world);
    this.slayerHud = new SlayerHud(host, world);
    this.arrayHud = new ArrayHud(host, world);
    this.summonHud = new SummonHud(host, world);
    this.mobileLayout = new MobileLayout(host);
    this.waveHud = new WaveHud(host, world);
    const repair=document.createElement('button');repair.dataset.action='repair-camp';repair.className='dismiss-button';repair.hidden=true;
    repair.innerHTML='<b>修营 +20</b><small></small>';this.actions.prepend(repair);
    this.disconnect = [world.events.on('campHit', () => { gsap.fromTo(host.querySelector('.camp-status'), { color: '#ffc5a4' }, { color: '#d5c9b2', duration: 0.65 }); }), world.events.on('reset', () => { this.setRemoval(false); this.navigation.clear(); this.previousPhase = ''; this.onPause(this.blocked); }), world.events.on('ultimate', event => { if (event.stage === 'start') this.setRemoval(false); })];
  }

  reveal(): void {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.fromTo(this.host.querySelectorAll('.topbar, .bottom'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .4, stagger: .05, ease: 'power2.out', clearProps: 'opacity,transform' });
  }
  /** Called once by the entry flow after the film, before the first UI update. */
  showIntroduction(): void {
    this.helpChapter = 'basics'; this.introductoryHandbook = true;
    this.firstGuide.dismiss();
    if (this.navigation.current !== 'help') this.navigate('help');
    this.previousPhase = '';
  }
  togglePause(): void { if (['won', 'lost', 'destiny', 'rest'].includes(this.world.phase) || this.surface.exiting) return; this.navigate('pause'); }
  private navigate(panel: UtilityPanel): void { this.navigation.open(panel); this.previousPhase = ''; this.onPause(this.blocked); }
  private back(): void { if (this.navigation.active) { this.introductoryHandbook = false; this.navigation.back(); this.previousPhase = ''; this.onPause(this.blocked); this.update(); } }
  get blocked(): boolean { return this.navigation.active || this.surface.active || ['destiny', 'rest', 'won', 'lost'].includes(this.world.phase); }
  setRemoval(active: boolean): void {
    active = active && !this.blocked && this.world.canDismissWard && this.world.wards.length > 0;
    if (this.removing === active) return;
    this.removing = active; this.host.classList.toggle('removing-ward', active); this.onRemovalChange();
  }
  attachView(view:SceneView,cancel:()=>void):void{this.detachView();this.viewControls=new SlayerViewControls(this.host,this.world,view,cancel);this.summonView=new SummonView(this.host,this.world,view,cancel);}
  detachView():void{this.summonView?.dispose();this.summonView=undefined;this.viewControls?.dispose();this.viewControls=undefined;}

  update(): void {
    this.combatDeck.update(this.blocked);
    this.waveHud.update(this.blocked);
    this.slayerHud.update(this.blocked,this.strokePreview?.returning); this.arrayHud.update(this.blocked);
    this.summonHud.update(this.blocked);
    this.viewControls?.update(this.blocked);
    this.summonView?.update(this.blocked);
    this.host.classList.toggle('low-health', this.world.health <= 30);
    if (this.removing && (this.blocked || !this.world.canDismissWard || !this.world.wards.length)) this.setRemoval(false);
    this.health.style.transform = `scaleX(${this.world.health / 100})`;
    this.host.querySelector('#health-text')!.textContent = `${Math.ceil(this.world.health)}`;
    const waveNumber=this.world.wave+(this.world.phase==='prepare'?1:0),waveLabel=waveNumber>CAMPAIGN_WAVES?`历练 ${waveNumber} 波`:`${waveNumber} / ${CAMPAIGN_WAVES} 波`;
    this.wave.textContent = `${waveLabel} · ${this.world.phase==='prepare'?'准备':`${this.world.wolves.filter(w=>w.action!=='dead').length} 狼`}`;
    const buildButton = this.host.querySelector<HTMLButtonElement>('.build-toggle')!;
    this.host.querySelector<HTMLButtonElement>('.help-nudge')!.hidden = !this.firstGuide.visible || this.blocked || this.world.phase !== 'prepare' || this.world.wave > 0;
    buildButton.hidden = !this.world.build.active;
    const buildLabel = `${this.world.build.fates.join(',')}:${this.world.build.progress}:${this.world.build.stage}`;
    if (buildButton.dataset.label !== buildLabel) {
      buildButton.dataset.label = buildLabel;
      buildButton.innerHTML = this.world.build.fates.map(factionEmblem).join('') + `<span class="build-progress">修为 ${this.world.build.progress}${this.world.build.stage ? this.world.build.stage === 1 ? ' · 觉醒' : ' · 升华' : ''}</span>`;
    }
    buildButton.title = buildStatus(this.world);
    buildButton.setAttribute('aria-label', '查看构筑');
    const arrayStatus = this.host.querySelector<HTMLElement>('.array-status')!;
    arrayStatus.hidden = !this.world.build.is('array') || this.world.phase !== 'prepare';
    arrayStatus.textContent = this.world.availableMainSlot === undefined ? '古阵已齐 · 可继续自由画阵' : `自由画阵 · 下一阵附古阵之力 · ${this.world.mainPlacementCost} 灵力`;
    this.host.querySelector('.field-note')!.classList.toggle('retired', this.world.wards.length > 0 || this.world.wave > 0);
    this.host.querySelector('#spirit-text')!.textContent = this.world.build.active ? `${Math.round(this.world.spirit * 100) / 100}` : `${Math.floor(this.world.spirit * 10 + 1e-6) / 10} / ${this.world.capacity}`;
    (this.host.querySelector('#spirit-bar') as HTMLElement).style.transform = `scaleX(${Math.min(1,Math.max(0, this.world.spirit) / this.world.capacity)})`;
    this.host.querySelector('#spirit-label')!.textContent = '灵力';
    this.host.querySelector<HTMLElement>('.spirit-status')!.title = `灵力上限 ${this.world.capacity} · 战斗回灵 +${Number(this.world.regeneration.toFixed(2))}/秒 · 击杀收入 +${Number(this.world.killSpirit.toFixed(2))} · 余额跨波保留`;
    const preparationLocked = this.world.preparationLocked;
    this.host.querySelector('.command-deck')!.classList.toggle('preparation-locked', preparationLocked);
    for (const [element, button] of this.elements) {
      const selected = !preparationLocked && element === this.world.selected; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
      button.disabled = this.world.phase === 'destiny' || preparationLocked;
      const affinity = Math.round((this.world.build.affinityPower(element) - 1) * 100);
      button.querySelector('small')!.textContent = preparationLocked ? '迎战后可用' : this.world.ultimate.stage === 'drawing' ? '停时 · 自由划线' : button.disabled ? '天生灵根' : this.world.phase === 'battle' ? '按笔长耗灵' : affinity ? `亲和强化 +${affinity}%` : abilities[element].detail.split(' · ')[0]!;
      button.title = `天生${abilities[element].name}灵根 · ${affinity ? `额外亲和 +${affinity}%` : '基础能力始终可用'} · ${this.world.phase === 'battle' ? `划线基准 ${this.world.build.is('slayer') ? SLAYER_DAMAGE[element] : SPELLS[element].damage} 伤害，沿途全部目标生效，受构筑与图形浓度影响` : abilities[element].detail}`;
      if (preparationLocked) button.title = '杀伐命格无法布阵 · 迎战后可用五行划线';
      if (this.world.mechanics.commands.active && this.world.phase === 'battle') {
        button.querySelector('b')!.textContent = ORDERS[element].name;
        button.querySelector('small')!.textContent = ORDERS[element].verb;
        button.title = `${ORDERS[element].name}御令 · ${ORDERS[element].verb} · 点按免费指挥，划线强化宝宝`;
      } else button.querySelector('b')!.textContent = abilities[element].label;
    }
    this.host.querySelector('#phase-title')!.textContent = preparationLocked ? '待战' : this.world.phase === 'battle' ? '战斗' : '布局';
    this.host.querySelector('#phase-tip')!.textContent = preparationLocked ? '杀伐命格 · 无法布阵' : this.world.phase === 'battle' ? '划动 / 画圈施法' : '围拢自动成阵';
    this.tip.textContent = this.world.mode === 'ward' ? `每阵 ${this.world.wardCost} 灵力 · 大阵广而淡，小阵浓而强 · 已布 ${this.world.wards.length} / 6 阵` : `短划省灵、长划增威 · ${COMBO_HINTS[this.world.selected]}`;
    if (this.world.build.spellOnly) this.tip.textContent = preparationLocked ? '杀伐命格无法布阵 · 点击「迎战狼群」，五行划线将在战斗中启用' : '杀伐划线 · 威力随灵力投入增长 · 击杀回灵 · 五行可破精英招式';
    if (this.world.build.is('array') && this.world.phase === 'prepare' && this.world.availableMainSlot !== undefined) this.tip.textContent = `自由围拢成阵 · 古阵强化附于手绘阵形 · 相生点阵激活五行辅助 · 本次 ${this.world.mainPlacementCost} 灵力`;
    if (this.world.build.has('living') && this.world.phase === 'battle') this.tip.textContent = `拖动阵心迁阵 · ${ROGUE.array.moveCost} 灵力 · 划线仍可施法`;
    if (this.world.build.is('slayer') && this.world.phase === 'battle') this.tip.textContent = '划过即时出刀 · 原地按住蓄力，蓄好划出重斩';
    if (this.world.mechanics.commands.active && this.world.phase === 'battle') {
      this.host.querySelector('#phase-title')!.textContent = '御灵';
      this.host.querySelector('#phase-tip')!.textContent = '点按指挥 · 划线御令';
      this.tip.textContent = `点敌集火 · 点地集合 · ${ORDERS[this.world.selected].verb}${this.world.build.is('slayer')?' · 即划即斩，原地按住蓄力':''}`;
    }
    if (this.strokePreview && this.world.phase === 'battle') {
      const p=this.strokePreview;
      this.tip.textContent = p.moving ? `迁阵 ${p.cost} 灵力 · 松手确认落点` : p.charging ? `${CHARGE.names[p.charge??0]} ${p.charge??0}/3 · ${p.unaffordable ? '灵力不足，击杀可回灵' : p.limited ? '灵力受限，短划出刀' : '原地蓄力，划动释放'}` : `${p.charge ? CHARGE.names[p.charge]+' · ' : ''}本笔 ${p.cost.toFixed(1)} 灵力 · 威力 ${Math.round(p.power * 100)}%${p.unaffordable || this.world.spirit - this.world.mechanics.debtFloor < p.cost ? ' · 灵力不足，可缩短笔画' : p.limited ? ' · 灵力限制，已降档' : ''}`;
      if (this.world.mechanics.commands.replacesStroke && !p.moving) this.tip.textContent = `${ORDERS[this.world.selected].name}御令 · ${p.cost.toFixed(1)} 灵力${p.cost === 0 && !this.world.ultimate.active ? ' · 御令已足' : ' · 划过即时强化宝宝'}`;
    }
    const totals = this.world.combatTotals;
    this.host.querySelector('#combat-totals')!.textContent = this.world.build.active ? `灵力 · 入账 ${Math.floor(this.world.ledger.earned)} · 支出 ${Math.floor(this.world.ledger.spent)} · 残值回收 ${Math.floor(this.world.ledger.salvaged)}` : this.world.wave > 0 ? `有效伤害 · 阵法 ${Math.round(totals.ward)} / 宝宝 ${Math.round(totals.companion)} / 划线 ${Math.round(totals.spell)} / 反应 ${Math.round(totals.steam + totals.reaction)}` : '贴边自动裁切 · 滚轮缩放 · 空格暂停';
    // Only transient actionable feedback occupies the battlefield; tutorials live in the handbooks.
    if (this.world.notice !== this.previousNotice) {
      this.previousNotice = this.world.notice;
      clearTimeout(this.noticeTimer);
      this.notice.textContent = /不足|无法|不能|已满|失败|失守|回收|修复|击退|获得/.test(this.world.notice) ? this.world.notice : '';
      this.noticeTimer = window.setTimeout(() => { this.notice.textContent = ''; }, 2800);
    }
    const start = this.actions.querySelector<HTMLButtonElement>('[data-action="start"]')!;
    const ultimate = this.world.ultimate, ultimateButton = this.actions.querySelector<HTMLButtonElement>('[data-action="ultimate"]')!;
    ultimateButton.hidden = this.world.phase !== 'battle'; ultimateButton.disabled = this.blocked || !ultimate.available;
    ultimateButton.classList.toggle('charging', ultimate.active);
    ultimateButton.querySelector('b')!.textContent = ultimate.stage === 'drawing' ? `${ultimate.remaining.toFixed(1)} 秒` : ultimate.stage === 'release' ? this.world.mechanics.commands.stormOnly&&!ultimate.strokes.length?'收势':'齐发 ×2' : '停时';
    const summonStorm=this.world.mechanics.commands.stormOnly;
    ultimateButton.title=summonStorm?'Q · 停时三秒蓄令，宝宝接敌后依次释放':'Q · 每波一次，停时三秒自由划线，双倍释放';
    ultimateButton.querySelector('small')!.textContent = ultimate.active ? `已蓄 ${ultimate.strokes.length}/${ROGUE.limits.storedStrokes} 笔` : ultimate.available ? summonStorm?'Q · 群灵齐发':'Q · 万象齐发' : '下波恢复';
    if (ultimate.active) {
      this.host.querySelector('#phase-title')!.textContent = ultimate.stage === 'drawing' ? '停时' : '齐发';
      this.host.querySelector('#phase-tip')!.textContent = summonStorm?'群灵齐发 · 御令入灵':'万象齐发 · 双倍效果';
      this.host.querySelector('#spirit-label')!.textContent = '时间静止';
      this.tip.textContent = summonStorm
        ? ultimate.stage==='drawing'?`剩余 ${ultimate.remaining.toFixed(1)} 秒 · 划线蓄令，可切换五行`:ultimate.strokes.length?'御令按容量入灵 · 宝宝接敌后依次释放':'未蓄御令 · 恢复战斗'
        : ultimate.stage === 'drawing' ? `剩余 ${ultimate.remaining.toFixed(1)} 秒 · 免灵力 · 最多 ${ROGUE.limits.storedStrokes} 笔，可切换五行连续划线` : `${ultimate.strokes.length} 笔集中释放 · 伤害、控制与增益翻倍`;
    }
    start.hidden = this.world.phase !== 'prepare';
    const repair=this.actions.querySelector<HTMLButtonElement>('[data-action="repair-camp"]')!;
    repair.hidden=this.world.phase!=='prepare'||!this.world.build.active||this.world.health>=100;
    repair.disabled=this.blocked||this.world.spirit<this.world.repairCost;
    repair.querySelector('small')!.textContent=`花费 ${this.world.repairCost} 灵力`;
    repair.querySelector('b')!.textContent=`修营 +${Math.ceil(Math.min(20,100-this.world.health))}`;
    const dismiss = this.actions.querySelector<HTMLButtonElement>('[data-action="dismiss"]')!;
    dismiss.disabled = !this.world.canDismissWard || !this.world.wards.length || this.blocked;
    dismiss.setAttribute('aria-pressed', String(this.removing));
    dismiss.querySelector('b')!.textContent = this.removing ? '取消撤阵' : '撤阵';
    dismiss.querySelector('small')!.textContent = this.removing ? '点击阵法 · Esc' : '回收残值';
    if (this.removing) this.tip.textContent = '点击阵法查看回收金额 · 实付灵力 × 剩余耐久 × 80% · Esc 退出';
    if (!this.strokePreview && !this.removing && !ultimate.active) this.tip.textContent = '';
    const state = `${this.world.phase}:${this.navigation.current}:${this.world.build.revision}`;
    if (state !== this.previousPhase) { this.previousPhase = state; this.showPanel(); }
  }

  dispose(): void { this.mobileLayout.dispose(); this.combatDeck.dispose(); this.detachView(); clearTimeout(this.noticeTimer); this.surface.dispose(); this.birthPreview?.dispose(); this.battlePresentation.dispose(); this.slayerHud.dispose(); this.arrayHud.dispose(); this.summonHud.dispose(); this.waveHud.dispose(); this.disconnect.forEach(off => off()); this.host.removeEventListener('click', this.click); gsap.killTweensOf(this.host.querySelectorAll('*')); }

  private inspectBirth(id: number): void {
    if (this.world.phase !== 'destiny') return;
    const draft = this.world.birthDraft;
    if (!draft.inspect(id)) return;
    for (const option of this.panel.querySelectorAll<HTMLElement>('.birth-talent')) { option.dataset.inspected = String(Number(option.dataset.inspect) === id); option.setAttribute('aria-current', option.dataset.inspected); }
    const detail = this.panel.querySelector<HTMLElement>('.birth-detail');
    if (detail) detail.outerHTML = birthDetail(draft.detail, draft.selected.has(id), draft.choices.length >= 2);
    this.birthPreview?.mount(this.panel.querySelector<HTMLElement>('.birth-demo')!, draft.detail);
  }

  private readonly click = (event: MouseEvent): void => {
    if (this.surface.exiting) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
    const data = button.dataset;
    if (data.inspect !== undefined) { this.inspectBirth(Number(data.inspect)); return; }
    if (data.element) { this.setRemoval(false); this.world.selectElement(data.element as Element); }
    if (data.upgrade) { button.closest('.reward-choice')?.setAttribute('data-chosen', 'true'); this.world.chooseUpgrade(data.upgrade); }
    if (data.talent !== undefined && this.world.phase === 'destiny') {
      this.world.birthDraft.toggle(Number(data.talent)); this.previousPhase = '';
      this.birthFocus = '[data-action="toggle-talent"]';
    }
    if (data.spirit !== undefined) this.world.cycleSpirit(Number(data.spirit));
    switch (data.action) {
      case 'replay-talent': if (this.world.phase === 'destiny') { this.birthPreview?.replay(); this.previousPhase = ''; } break;
      case 'roll': if (this.world.phase === 'destiny') { this.world.birthDraft.roll(); this.previousPhase = ''; this.birthFocus = '[data-action="roll"]'; } break;
      case 'accept-fate': this.world.chooseBirth(); break;
      case 'reroll-rewards': this.world.rerollRewards(); break;
      case 'build': if (this.world.build.active) this.navigate('build'); break;
      case 'continue-run': this.world.continueRun(); break;
      case 'finish-run': this.navigation.clear(); this.world.finishRun(); this.onPause(this.blocked); break;
      case 'start': this.setRemoval(false); this.world.startWave(); break;
      case 'repair-camp': if(!this.blocked)this.world.repairCamp(); break;
      case 'ultimate': if (!this.blocked) this.world.startUltimate(); break;
      case 'dismiss': this.setRemoval(!this.removing); break;
      case 'reset': this.navigate('restart'); break;
      case 'confirm-reset': if (this.navigation.current === 'restart' || ['won', 'lost'].includes(this.world.phase)) this.world.reset(); break;
      case 'pause': this.togglePause(); break;
      case 'resume': case 'back': this.back(); break;
      case 'help': this.firstGuide.dismiss(); this.navigate('help'); break;
      case 'help-chapter': if (data.chapter && data.chapter in HELP_CHAPTERS) { this.helpChapter = data.chapter as HelpChapter; this.previousPhase = ''; } break;
      case 'settings': this.onSettings(); break;
      case 'sound': this.muted = !this.muted; this.onSound(this.muted); button.classList.toggle('muted', this.muted); button.innerHTML = icon(this.muted ? 'soundOff' : 'sound'); button.setAttribute('aria-label', this.muted ? '开启声音' : '关闭声音'); break;
    }
  };

  private showPanel(): void {
    const phase = this.world.phase, utility = this.navigation.current;
    const kind = utility ?? (phase === 'destiny' ? 'birth' : phase === 'rest' ? 'reward' : phase === 'won' || phase === 'lost' ? 'result' : null);
    this.host.classList.toggle('choosing-birth', phase === 'destiny');
    if (kind && kind !== 'birth' && this.birthPreview) { this.birthPreview.dispose(); this.birthPreview = undefined; }
    const pauseButton = this.host.querySelector('[data-action="pause"]')!;
    pauseButton.innerHTML = this.paused ? icon('play') : icon('pause');
    pauseButton.setAttribute('aria-label', this.paused ? '继续' : '暂停');
    if (!kind) { this.surface.hide(); return; }
    this.panel.classList.toggle('birth-modal', kind === 'birth');
    this.host.classList.toggle('choosing-birth', phase === 'destiny');
    this.surface.show(kind, () => {
      if (kind === 'birth') {
        this.panel.innerHTML = openingPanel(this.world);
        this.birthPreview ??= new BirthPreview();
        this.birthPreview.mount(this.panel.querySelector<HTMLElement>('.birth-demo')!, this.world.birthDraft.detail);
        if (this.birthFocus) { this.panel.querySelector<HTMLButtonElement>(this.birthFocus)?.focus({ preventScroll: true }); this.birthFocus = null; }
      } else if (kind === 'build') this.panel.innerHTML = '<section class="panel-card folio-panel build-panel" role="dialog" aria-modal="true" aria-label="当前构筑">' + buildPanel(this.world) + '</section>';
      else if (kind === 'help') this.panel.innerHTML = '<section class="panel-card folio-panel help-panel" role="dialog" aria-modal="true" aria-label="操作手记">' + helpPanel(this.helpChapter, this.world, this.introductoryHandbook) + '</section>';
      else if (kind === 'pause') this.panel.innerHTML = pausePanel(this.world);
      else if (kind === 'restart') this.panel.innerHTML = restartPanel();
      else if (kind === 'result') this.panel.innerHTML = resultPanel(this.world);
      else if (this.world.build.active) this.panel.innerHTML = '<section class="panel-card reward-panel" role="dialog" aria-modal="true" aria-label="选择本波领悟">' + rewardPanel(this.world) + '</section>';
      else this.panel.innerHTML = '<section class="panel-card folio-panel" role="dialog" aria-modal="true" aria-label="选择本波领悟">' + panelHeading('此战有悟', '', false) + '<div class="folio-scroll"><div class="upgrades">' + upgrades.map(upgrade => '<button data-upgrade="' + upgrade.id + '"><h3>' + upgrade.title + '</h3><p>' + upgrade.detail + '</p></button>').join('') + '</div></div></section>';
    });
  }
}
