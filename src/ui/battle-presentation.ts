import type { World } from '../game/world';

/** Short, nonblocking beat between player decisions. Timers never advance the world. */
export class BattlePresentation {
  private readonly banner = document.createElement('div');
  private timer = 0;
  private evolvingUntil = 0;
  private readonly off: (() => void)[];
  constructor(host: HTMLElement, world: World) {
    this.banner.className = 'battle-banner'; this.banner.hidden = true;
    this.banner.setAttribute('role', 'status'); this.banner.setAttribute('aria-live', 'polite'); host.append(this.banner);
    this.off = [world.events.on('phase', ({ phase }) => {
      host.dataset.phase = phase;
      if (phase === 'battle') this.hide();
      else if (phase === 'prepare' && performance.now() < this.evolvingUntil) return;
      else if (phase === 'prepare' && world.wave > 0) this.show('', '整阵再战', '', 'learned');
      else this.hide();
    }), world.events.on('wardEvolved', () => { this.evolvingUntil = performance.now() + 1600; this.show('阵师觉醒', '阵尽 · 灵生', '古阵之力，随灵而行', 'evolved'); }),
    world.events.on('reset', () => this.hide())];
    host.dataset.phase = world.phase;
  }
  private show(kicker: string, title: string, caption: string, mood: string): void {
    clearTimeout(this.timer); this.banner.hidden = false; this.banner.dataset.mood = mood;
    this.banner.innerHTML = `<span class="banner-rule"></span><small>${kicker}</small><strong>${title}</strong><span>${caption}</span><span class="banner-rule"></span>`;
    this.banner.getAnimations().forEach(a => a.cancel());
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.banner.animate([{ opacity: 0, transform: 'translate(-50%, -8px)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: .16 }, { opacity: 1, offset: .72 }, { opacity: 0, transform: 'translate(-50%, -3px)' }], { duration: 1550, easing: 'ease-out', fill: 'both' });
    this.timer = window.setTimeout(() => this.hide(), 1550);
  }
  private hide(): void { clearTimeout(this.timer); this.banner.hidden = true; this.banner.getAnimations().forEach(a => a.cancel()); }
  dispose(): void { this.hide(); this.off.forEach(off => off()); this.banner.remove(); }
}
