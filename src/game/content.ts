import type { AbilityDefinition, Element, UpgradeDefinition, WolfBehavior } from './contracts';

export const abilities: Record<Element, AbilityDefinition> = {
  wood: { id: 'wood', name: '木', label: '盘根', color: 0x84bd75, css: '#9ed297', damage: 3, interval: 1.1, detail: '周期缠绕 · 留敌于阵' },
  fire: { id: 'fire', name: '火', label: '焚野', color: 0xff9346, css: '#ffb278', damage: 10, interval: 0.75, detail: '群体焚烧 · 水引爆灼烧' },
  earth: { id: 'earth', name: '土', label: '垒土', color: 0xc0a97c, css: '#dac59d', damage: 4, interval: 1.2, detail: '实心土墙 · 圈定区域封路' },
  metal: { id: 'metal', name: '金', label: '鸣锋', color: 0xf4ddac, css: '#f7e8c6', damage: 21, interval: 0.9, detail: '高速单体 · 优先击杀残血' },
  water: { id: 'water', name: '水', label: '回澜', color: 0x7ec9d1, css: '#a6e5e6', damage: 2, interval: 1, detail: '持续减速 · 延长受击时间' },
};

export const upgrades: readonly UpgradeDefinition[] = [
  { id: 'clear-mind', title: '澄心', detail: '灵力自然恢复速度增加 35%', modifiers: [{ id: 'clear-mind', stat: 'regen', multiply: 1.35 }] },
  { id: 'resonance', title: '共鸣', detail: '所有阵法与主动施法伤害增加 20%', modifiers: [{ id: 'resonance', stat: 'damage', multiply: 1.2 }] },
  { id: 'flow', title: '行气', detail: '阵法与宝宝的攻击间隔缩短 20%', modifiers: [{ id: 'flow', stat: 'cooldown', multiply: 0.8 }] },
];

export const directApproach: WolfBehavior = { id: 'approach', target: (_wolf, context) => context.camp };

/** Initial pack spacing. Future formations and skills can replace this strategy per pack. */
export const packApproach: WolfBehavior = {
  id: 'pack',
  target(wolf, context) {
    const dx = wolf.x - context.camp.x, dz = wolf.z - context.camp.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 6) return context.camp;
    const side = wolf.pack % 2 ? 1 : -1;
    return { x: context.camp.x - dz / distance * side * 2.4, z: context.camp.z + dx / distance * side * 2.4 };
  },
};
