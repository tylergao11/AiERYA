import type { Fate } from './roguelike';

/** Prices are per deliberate action, not per animation frame or monster hit. */
export const BATTLE = {
  mana: {
    slayer: { regen: 3.2, kill: .12 },
    spirit: { regen: 1.2, kill: .08 },
    array: { regen: 1.6, kill: .1 },
    killCap: 12, techniqueCap: 36,
  },
  blade: { lightCost: 1.2, heavyCost: 7, lightDamage: 12, heavyDamage: 64,
    lightWidth: 1.1, heavyWidth: 2.2, comboRefund: 3, guardReduction: .92, breakSeconds: 3 },
  trace: { cost: 7, length: 8, lifetime: 5, cap: 6, width: 1.4, tick: .5,
    damage: 16, growth: .15, reactionDamage: 72, reactionRadius: 2.6, reactionTargets: 10 },
  spirit: { health: 160, downSeconds: 6, biteInterval: 1.4, nearbyAttackers: 2, attackOrders: 2 },
} as const;
export const TACTICAL_ORDERS = {
  leap: { name: '跃进', cost: 8, cooldown: 3, glyph: '跃' },
  defend: { name: '回防', cost: 4, cooldown: 2, glyph: '守' },
  repeat: { name: '复令', cost: 0, cooldown: .6, glyph: '复' },
  heal: { name: '回春', cost: 12, cooldown: 4, glyph: '愈' },
  attack: { name: '进攻', cost: 9, cooldown: 2, glyph: '攻' },
} as const;
export type TacticalOrder = keyof typeof TACTICAL_ORDERS;
export const STYLE_NAMES: Record<Fate, string> = { slayer: '剑术', spirit: '御灵', array: '画阵' };
