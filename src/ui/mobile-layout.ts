/** The HUD occupies the space above the real command deck, including safe-area changes. */
export class MobileLayout {
  private readonly resize: ResizeObserver;
  private readonly off: (() => void)[] = [];
  constructor(host: HTMLElement) {
    const deck = host.querySelector<HTMLElement>('.bottom')!;
    this.resize = new ResizeObserver(() => host.style.setProperty('--deck-height', `${deck.getBoundingClientRect().height}px`));
    this.resize.observe(deck);
    for (const [selector, title] of [['.slayer-hud', '剑势'], ['.array-hud', '阵势']]) {
      const panel = host.querySelector<HTMLElement>(selector!); if (!panel) continue;
      const content = document.createElement('div'); content.className = 'hud-fold-content';
      content.append(...Array.from(panel.childNodes));
      const toggle = document.createElement('button'); toggle.className = 'hud-fold-toggle';
      toggle.textContent = `${title} ＋`; toggle.setAttribute('aria-expanded', 'false');
      panel.append(toggle, content); panel.classList.add('hud-collapsed');
      const fold = (event: MouseEvent) => { event.stopPropagation(); const collapsed = panel.classList.toggle('hud-collapsed'); toggle.textContent = `${title} ${collapsed ? '＋' : '−'}`; toggle.setAttribute('aria-expanded', String(!collapsed)); };
      toggle.addEventListener('click', fold); this.off.push(() => toggle.removeEventListener('click', fold));
    }
  }
  dispose(): void { this.resize.disconnect(); this.off.forEach(off => off()); }
}
