const focusable = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Owns modal lifetime, focus and motion; gameplay only decides which page to show. */
export class PanelSurface {
  private kind: string | null = null;
  private generation = 0;
  private animation?: Animation;
  private returnFocus?: HTMLElement;
  private background: { node: HTMLElement; inert: boolean }[] = [];
  private readonly abort = new AbortController();
  active = false;
  exiting = false;

  constructor(private readonly host: HTMLElement, private readonly panel: HTMLElement, private readonly back: () => void, private readonly changed: () => void) {
    panel.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); if (!event.repeat && !this.exiting) this.back(); }
      if (event.key !== 'Tab') return;
      const items = [...panel.querySelectorAll<HTMLElement>(focusable)].filter(e => e.getClientRects().length && !e.closest('[inert]'));
      if (!items.length) { event.preventDefault(); return; }
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (index < 0 || event.shiftKey && index === 0 || !event.shiftKey && index === items.length - 1) {
        event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0]!.focus();
      }
    }, { signal: this.abort.signal });
  }

  show(kind: string, render: () => void): void {
    const entering = this.kind !== kind || this.exiting || !this.active;
    this.generation++; this.animation?.cancel(); this.animation = undefined;
    if (!this.active) {
      this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      this.background = [...this.host.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e !== this.panel).map(node => ({ node, inert: node.inert }));
      this.background.forEach(({ node }) => { node.inert = true; });
    }
    const previousChapter = this.panel.querySelector<HTMLElement>('.handbook-page')?.dataset.chapter;
    const scrollPositions = ['.folio-scroll', '.build-content', '.birth-options', '.birth-copy', '.reward-choices'].map(selector => ({ selector, top: this.panel.querySelector(selector)?.scrollTop ?? 0 }));
    const focused = document.activeElement instanceof HTMLElement && this.panel.contains(document.activeElement) ? document.activeElement : null;
    const action = focused?.dataset.action, chapter = focused?.dataset.chapter, talent = focused?.dataset.talent, spirit = focused?.dataset.spirit;
    const opened = [...this.panel.querySelectorAll<HTMLDetailsElement>('details[open]')].map(e => e.querySelector('summary')?.textContent);
    this.kind = kind; this.active = true; this.exiting = false; this.panel.hidden = false; this.panel.inert = false;
    this.panel.dataset.surface = kind; delete this.panel.dataset.leaving;
    this.host.classList.add('has-panel');
    render();
    const heading = this.panel.querySelector<HTMLElement>('h2'); if (heading) heading.tabIndex = -1;
    if (!entering) {
      for (const detail of this.panel.querySelectorAll<HTMLDetailsElement>('details')) if (opened.includes(detail.querySelector('summary')?.textContent)) detail.open = true;
      const chapterChanged = previousChapter !== this.panel.querySelector<HTMLElement>('.handbook-page')?.dataset.chapter;
      scrollPositions.forEach(({ selector, top }) => this.panel.querySelector(selector)?.scrollTo({ top: chapterChanged ? 0 : top }));
      const target = [...this.panel.querySelectorAll<HTMLElement>('[data-action], [data-talent], [data-spirit]')].find(e => action !== undefined ? e.dataset.action === action && e.dataset.chapter === chapter : talent !== undefined ? e.dataset.talent === talent : spirit !== undefined && e.dataset.spirit === spirit);
      (target && !target.hasAttribute('disabled') ? target : heading)?.focus({ preventScroll: true });
      return;
    }
    this.panel.scrollTop = 0;
    (this.panel.querySelector<HTMLElement>('[data-focus]') ?? heading)?.focus({ preventScroll: true });
    const content = this.panel.firstElementChild;
    if (content && !reduced()) content.animate([{ opacity: 0, transform: 'translateY(10px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: kind === 'birth' || kind === 'reward' ? 300 : 220, easing: 'cubic-bezier(.2,.75,.25,1)' });
    this.changed();
  }

  hide(): void {
    if (!this.active || this.exiting) return;
    const token = ++this.generation;
    this.exiting = true; this.panel.inert = true; this.panel.dataset.leaving = 'true';
    this.changed();
    const finish = () => {
      if (token !== this.generation) return;
      this.animation = undefined; this.panel.hidden = true; this.panel.inert = false; this.panel.replaceChildren();
      this.active = false; this.exiting = false; this.kind = null;
      this.background.forEach(({ node, inert }) => { node.inert = inert; }); this.background = [];
      this.host.classList.remove('has-panel');
      const target = this.returnFocus;
      if (target?.isConnected && !target.closest('[inert]') && !target.hasAttribute('disabled')) target.focus({ preventScroll: true });
      else this.host.querySelector<HTMLElement>('[data-action="pause"]')?.focus({ preventScroll: true });
      this.returnFocus = undefined; this.changed();
    };
    if (reduced()) { finish(); return; }
    this.animation = this.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' });
    void this.animation.finished.then(finish, () => {});
  }

  dispose(): void {
    this.generation++; this.animation?.cancel(); this.abort.abort();
    this.background.forEach(({ node, inert }) => { node.inert = inert; });
    this.active = false; this.panel.hidden = true; this.panel.inert = false; this.host.classList.remove('has-panel');
  }
}
