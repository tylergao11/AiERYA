import { gsap } from 'gsap';
import { abilities, upgrades } from '../game/content';
import { ELEMENTS, type Element, type Mode } from '../game/contracts';
import type { World } from '../game/world';
import type { SceneView } from '../render/view';

const icon = (name: string): string => ({ pause: 'Ⅱ', play: '▷', sound: '♪', help: '?', undo: '↶' })[name] ?? name;
export class GameInterface {
  private readonly resources = new Map<string, HTMLButtonElement>();
  private readonly elements = new Map<Element, HTMLButtonElement>();
  private readonly notice: HTMLElement;
  private readonly health: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly tip: HTMLElement;
  private previousNotice = '';
  private previousPhase = '';
  private helpOpen = false;
  private readonly disconnect: (() => void)[];
  paused = false;
  muted = false;
  onPause: (paused: boolean) => void = () => {};
  onSound: (muted: boolean) => void = () => {};

  constructor(private readonly host: HTMLElement, private readonly world: World, private readonly view: SceneView) {
    host.innerHTML = `
      <div class="shade"></div>
      <header class="topbar"><div class="identity"><span class="seal">阵</span><div><p class="eyebrow">山涧营地 · 第一夜</p><h1>山野<span>·</span>阵火</h1></div></div>
      <div class="status"><div class="camp-status"><span>营地安危</span><strong id="health-text">100</strong><div class="health-track"><i id="health-bar"></i></div></div><div id="wave" class="wave">待暮色入林</div></div>
      <div class="tools"><button data-action="sound" aria-label="关闭声音" title="环境声音">${icon('sound')}</button><button data-action="help" aria-label="操作说明" title="操作说明">?</button><button data-action="pause" aria-label="暂停" title="暂停 / 空格">Ⅱ</button></div></header>
      <aside class="field-note"><span>取材</span><i>→</i><span>随形闭合成阵</span><i>→</i><span>引动迎敌</span></aside>
      <div class="resource-layer"></div>
      <div class="bottom"><div class="message" role="status" aria-live="polite"><span class="message-mark">◇</span><span id="notice"></span></div>
      <div class="command-deck"><div class="modes"><button data-mode="ward"><b>布阵</b><small>闭合成阵 <kbd>Q</kbd></small></button><button data-mode="invoke"><b>引动</b><small>划线借势 <kbd>E</kbd></small></button></div>
      <div class="elements">${ELEMENTS.map((element, i) => { const a = abilities[element]; return `<button class="element" data-element="${element}" style="--element:${a.css}" title="${a.detail}"><span class="element-glyph">${a.name}</span><span class="element-copy"><b>${a.label}</b><small><span class="energy">0</span><em> / 80</em></small></span><kbd>${i + 1}</kbd><i class="energy-line"></i></button>`; }).join('')}</div>
      <div id="actions" class="actions"><button data-action="undo" class="undo" aria-label="撤回最后一座阵，返还部分灵力" title="撤回末阵 · 返还 7 灵力">↶</button><button data-action="start" class="primary">迎战狼群 <span>→</span></button></div></div>
      <div class="footer"><span id="mode-tip">每阵消耗 14 灵力 · 最多六阵</span><span>滚轮缩放 <i>·</i> 空格暂停</span></div></div>
      <div id="panel" class="modal" hidden></div><div class="portrait-note">横屏展开，可看清整片山林</div>`;
    this.notice = host.querySelector('#notice')!; this.health = host.querySelector('#health-bar')!; this.wave = host.querySelector('#wave')!;
    this.actions = host.querySelector('#actions')!; this.panel = host.querySelector('#panel')!; this.tip = host.querySelector('#mode-tip')!;
    const layer = host.querySelector('.resource-layer')!;
    for (const resource of world.resources) {
      const button = document.createElement('button'); button.className = 'resource'; button.dataset.resource = resource.id;
      button.style.setProperty('--element', abilities[resource.element].css); button.innerHTML = `<span class="resource-glyph">${abilities[resource.element].name}</span><span class="resource-title">${resource.title}<small>借灵</small></span>`;
      button.setAttribute('aria-label', `从${resource.title}借取${abilities[resource.element].name}灵力`); layer.append(button); this.resources.set(resource.id, button);
    }
    for (const element of ELEMENTS) this.elements.set(element, host.querySelector(`[data-element="${element}"]`)!);
    host.addEventListener('click', this.click);
    this.disconnect = [world.events.on('gather', ({ resource }) => { const button = this.elements.get(resource.element)!; gsap.fromTo(button, { y: -3 }, { y: 0, duration: 0.4, ease: 'power2.out' }); }), world.events.on('campHit', () => { gsap.fromTo('.camp-status', { color: '#ffc5a4' }, { color: '#d5c9b2', duration: 0.65 }); }), world.events.on('reset', () => { this.paused = false; this.helpOpen = false; this.onPause(false); })];
  }

  reveal(): void {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.fromTo(['.topbar', '.bottom'], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1, ease: 'power2.out' });
  }
  setMode(mode: Mode): void { this.world.mode = mode; this.world.notice = mode === 'ward' ? '在空地画一圈，连接首尾，以灵力改造地形' : '划过溪水、林木或阵域，再指向逼近的狼群'; }
  togglePause(): void { if (this.world.phase === 'won' || this.world.phase === 'lost') return; this.helpOpen = false; this.paused = !this.paused; this.onPause(this.paused); this.previousPhase = ''; }
  get blocked(): boolean { return this.paused || this.helpOpen; }

  update(): void {
    this.health.style.transform = `scaleX(${this.world.health / 100})`;
    this.host.querySelector('#health-text')!.textContent = `${this.world.health}`;
    this.wave.textContent = this.world.phase === 'prepare' ? '布阵待敌' : `第 ${this.world.wave} / 3 波 · ${this.world.wolves.filter(w => w.action !== 'dead').length} 只狼`;
    this.host.querySelector('.field-note')!.classList.toggle('retired', this.world.wards.length > 0 || this.world.wave > 0);
    for (const resource of this.world.resources) {
      const button = this.resources.get(resource.id)!, p = this.view.project(resource, resource.element === 'wood' ? 1 : resource.element === 'fire' ? 2.9 : 0.7);
      button.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      button.hidden = !p.visible; button.disabled = resource.cooldown > 0 || this.blocked || this.world.phase === 'won' || this.world.phase === 'lost';
      button.querySelector('small')!.textContent = resource.cooldown > 0 ? `${resource.cooldown.toFixed(1)}s` : '借灵';
      button.classList.toggle('ready', resource.cooldown <= 0); button.style.setProperty('--cooldown', `${100 - resource.cooldown / 3.5 * 100}%`);
    }
    for (const [element, button] of this.elements) {
      const selected = element === this.world.selected; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
      button.querySelector('.energy')!.textContent = `${this.world.energy[element]}`;
      button.querySelector('em')!.textContent = ` / ${this.world.capacity}`;
      (button.querySelector('.energy-line') as HTMLElement).style.transform = `scaleX(${this.world.energy[element] / this.world.capacity})`;
    }
    this.host.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => { const active = button.dataset.mode === this.world.mode; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); });
    this.tip.textContent = this.world.mode === 'ward' ? `每阵 ${this.world.wardCost} 灵力起 · 面积越大消耗越多 · 已布 ${this.world.wards.length} / 6 阵` : '引动每处地形消耗 4 灵力 · 阵域蓄能 4 秒';
    if (this.world.notice !== this.previousNotice) { this.previousNotice = this.world.notice; this.notice.textContent = this.world.notice; }
    const start = this.actions.querySelector<HTMLButtonElement>('[data-action="start"]')!;
    start.hidden = this.world.phase !== 'prepare'; this.actions.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = !this.world.wards.length || this.blocked;
    const state = `${this.world.phase}:${this.paused}:${this.helpOpen}`;
    if (state !== this.previousPhase) { this.previousPhase = state; this.showPanel(); }
  }

  dispose(): void { this.disconnect.forEach(off => off()); this.host.removeEventListener('click', this.click); gsap.killTweensOf(this.host.querySelectorAll('*')); }

  private readonly click = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
    const data = button.dataset;
    if (data.resource && !this.blocked) this.world.gather(data.resource);
    if (data.element) this.world.selected = data.element as Element;
    if (data.mode) this.setMode(data.mode as Mode);
    if (data.upgrade) this.world.chooseUpgrade(data.upgrade);
    switch (data.action) {
      case 'start': this.world.startWave(); break;
      case 'undo': this.world.undo(); break;
      case 'reset': this.world.reset(); break;
      case 'pause': case 'resume': this.togglePause(); break;
      case 'help': this.helpOpen = !this.helpOpen; this.paused = this.helpOpen; this.onPause(this.paused); this.previousPhase = ''; break;
      case 'sound': this.muted = !this.muted; this.onSound(this.muted); button.classList.toggle('muted', this.muted); button.setAttribute('aria-label', this.muted ? '开启声音' : '关闭声音'); break;
    }
  };

  private showPanel(): void {
    const phase = this.world.phase;
    this.panel.hidden = !this.paused && !this.helpOpen && !['rest', 'won', 'lost'].includes(phase);
    this.host.querySelector('[data-action="pause"]')!.textContent = this.paused ? icon('play') : icon('pause');
    if (this.panel.hidden) return;
    let content = '';
    if (this.helpOpen) content = `<p class="eyebrow">阵法师手记</p><h2>就地取材，借势成阵</h2><div class="help-copy"><p><b>取材</b> 轻触林木、篝火、沙地、铁器或溪流，补充对应灵力。</p><p><b>布阵 · Q</b> 选择五行，在空地绘制任意简单闭合形状，阵内会生成对应的水体、火势或结构并自动防守，土阵还能改变狼群路线。</p><p><b>引动 · E</b> 划过自然地形或已经布好的阵域。溪水推流、根系缠绕，先借木再引火可爆燃。</p><p><b>守夜</b> 迎战后仍可取材与布阵。守过三波，便能安然度过此夜。</p></div><button class="primary" data-action="help">回到山林</button>`;
    else if (this.paused) content = `<p class="eyebrow">山林暂歇</p><h2>风声仍在，稍作休息</h2><button class="primary" data-action="resume">继续守夜 →</button>`;
    else if (phase === 'rest') content = `<p class="eyebrow">第 ${this.world.wave} 波 · 守住了</p><h2>静息片刻，领悟一式</h2><p class="panel-sub">选择一项领悟 · 营地恢复 15 安危 · 随后迎来下一波</p><div class="upgrades">${upgrades.map((upgrade, i) => `<button data-upgrade="${upgrade.id}"><span class="upgrade-glyph">${['心', '鸣', '气'][i]}</span><h3>${upgrade.title}</h3><p>${upgrade.detail}</p><small>领悟此式 →</small></button>`).join('')}</div>`;
    else content = `<p class="eyebrow">${phase === 'won' ? '三波尽退 · 此夜无虞' : '篝火渐熄 · 防线失守'}</p><h2>${phase === 'won' ? '山林复静，余火尚温' : '再借天地之势'}</h2><p class="panel-sub">已击退 ${this.world.kills} 只狼${phase === 'lost' ? ' · 调整阵域位置，让狼群经过你的防线' : ' · 营地安危 ' + this.world.health}</p><button class="primary" data-action="reset">重新布阵 →</button>`;
    this.panel.innerHTML = `<section class="panel-card">${content}</section>`;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.fromTo(this.panel.firstElementChild, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35 });
  }
}
