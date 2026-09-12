import type { AbilityDefinition, Element, UpgradeDefinition, WolfBehavior } from './contracts';

export const abilities: Record<Element, AbilityDefinition> = {
  wood: { id: 'wood', name: '木', label: '盘根', color: 0x84bd75, css: '#9ed297', damage: 9, interval: 1.4, detail: '根系生长 · 缠绕狼群' },
  fire: { id: 'fire', name: '火', label: '焚野', color: 0xff9346, css: '#ffb278', damage: 18, interval: 1.05, detail: '聚火成阵 · 持续灼烧' },
  earth: { id: 'earth', name: '土', label: '垒石', color: 0xc0a97c, css: '#dac59d', damage: 7, interval: 1.9, detail: '隆起石脊 · 迫敌绕行' },
  metal: { id: 'metal', name: '金', label: '鸣锋', color: 0xf4ddac, css: '#f7e8c6', damage: 28, interval: 1.35, detail: '凝聚锋刃 · 自动迎敌' },
  water: { id: 'water', name: '水', label: '回澜', color: 0x7ec9d1, css: '#a6e5e6', damage: 7, interval: 1.3, detail: '引流成泽 · 减速推流' },
};

export const upgrades: readonly UpgradeDefinition[] = [
  { id: 'clear-mind', title: '澄心', detail: '取材获得的灵力增加 35%', modifiers: [{ id: 'clear-mind', stat: 'gather', multiply: 1.35 }] },
  { id: 'resonance', title: '共鸣', detail: '所有阵法与引动伤害增加 20%', modifiers: [{ id: 'resonance', stat: 'damage', multiply: 1.2 }] },
  { id: 'flow', title: '行气', detail: '阵法蓄能和自动攻击加快 20%', modifiers: [{ id: 'flow', stat: 'cooldown', multiply: 0.8 }] },
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
