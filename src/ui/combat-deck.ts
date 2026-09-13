import { BATTLE, STYLE_NAMES, TACTICAL_ORDERS, type TacticalOrder } from '../game/battle-rules';
import type { Fate } from '../game/roguelike';
import type { World } from '../game/world';
import { elementArt } from './manuscript-art';
import './combat-deck.css';

export class CombatDeck {
  private readonly root = document.createElement('div');
  private readonly modes = document.createElement('nav');
  private readonly blade: HTMLButtonElement;
  private readonly orders = new Map<TacticalOrder, HTMLButtonElement>();
  private signature = '';
  constructor(private readonly host: HTMLElement, private readonly world: World, private readonly cancel: () => void) {
    this.root.className = 'battle-commands'; this.root.hidden = true;
    this.root.innerHTML = `<button class="blade-command" aria-label="斩天拔剑术，无属性，划动轻刀，按住后划动重刀">${elementArt('metal')}<b>斩天拔剑术</b><small>轻刀 · 蓄力重刀</small></button><div class="tactical-orders">${Object.entries(TACTICAL_ORDERS).map(([key, order]) => `<button data-order="${key}" aria-pressed="false"><span>${order.glyph}</span><b>${order.name}</b><small></small></button>`).join('')}</div>`;
    this.blade = this.root.querySelector('.blade-command')!;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-order]')) this.orders.set(button.dataset.order as TacticalOrder, button);
    this.modes.className = 'combat-styles'; this.modes.setAttribute('aria-label', '切换战斗流派');
    host.querySelector('.command-deck')!.insertBefore(this.root, host.querySelector('#actions'));
    host.querySelector('.bottom')!.prepend(this.modes);
    this.root.addEventListener('click', this.click); this.modes.addEventListener('click', this.click);
  }
  private readonly click = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    this.cancel();
    if (button.dataset.style) this.world.selectStyle(button.dataset.style as Fate);
    if (button.dataset.order) this.world.mechanics.commands.chooseOrder(button.dataset.order as TacticalOrder);
    this.update(false);
  };
  update(blocked: boolean): void {
    const w = this.world, battle = w.phase === 'battle', style = w.combatStyle;
    this.host.dataset.hasArray = String(w.build.is('array')); this.host.dataset.combatStyle = style; this.host.dataset.phase = w.phase;
    this.root.hidden = !battle || !w.build.active || style === 'array';
    this.blade.hidden = style !== 'slayer';
    (this.root.querySelector('.tactical-orders') as HTMLElement).hidden = style !== 'spirit';
    this.modes.hidden = w.build.fates.length < 2 || !['battle','prepare'].includes(w.phase) || blocked;
    const signature = w.build.fates.join(',');
    if (signature !== this.signature) { this.signature = signature; this.modes.innerHTML = w.build.fates.map(f => `<button data-style="${f}">${STYLE_NAMES[f]}</button>`).join(''); }
    for (const button of this.modes.querySelectorAll<HTMLButtonElement>('button')) { button.setAttribute('aria-pressed', String(button.dataset.style === style)); button.disabled = blocked || w.ultimate.active; }
    this.blade.disabled = blocked;
    this.blade.querySelector('small')!.textContent = `轻 ${BATTLE.blade.lightCost} · 重 ${BATTLE.blade.heavyCost + 1}`;
    const cmd = w.mechanics.commands;
    for (const [kind, button] of this.orders) {
      button.disabled = blocked || !cmd.canOrder(kind);
      button.setAttribute('aria-pressed', String(cmd.selectedOrder === kind));
      const cooldown = cmd.orderCooldown(kind);
      button.querySelector('small')!.textContent = cooldown > 0 ? `${cooldown.toFixed(1)} 秒` : `${cmd.orderCost(kind)} 灵力`;
    }
  }
  dispose(): void { this.root.removeEventListener('click', this.click); this.modes.removeEventListener('click', this.click); this.root.remove(); this.modes.remove(); }
}
