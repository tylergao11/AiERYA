import type { Element } from './contracts';

/** Array-only budgets. Damage, tooltips and tests use this same source. */
export const ARRAY = {
  capacity: 100, ready: 14, eyeRadius: 2, linkRange: 16,
  feedPerDamage: .32, feedWindow: .25, feedWindowCap: 12,
  invocationGain: 24, transferShare: .7, minimumTransfer: 4,
  baseDamage: 0, damagePerEnergy: 1.2, targetCap: 18,
  retainShare: .24, echoShare: .42, echoDelay: .36,
  fieldSeconds: 2.4, fieldRadius: 2.3, fieldTick: .55, fieldCap: 16,
  markCost: 6, markSeconds: 6, markScale: .5, markCap: 24,
  remnantEnergy: 10, remnantSeconds: 7, remnantCap: 12,
  heavenShare: .2, heavenInterval: .16,
} as const;
export const ARRAY_NAMES: Record<Element, string> = {
  metal: '万刃穿阵', wood: '千根缚杀', water: '归墟引潮', fire: '焚阵燎原', earth: '镇岳震关',
};
export const ARRAY_SUPPORT = {
  seconds: 3, cooldown: 2.5, minimumInvestment: .2, tick: .35, fieldCap: 20,
  statusSeconds: .8, exposure: .22, rootSeconds: 1.1, pull: .8, slow: .35,
  repair: .035, guard: .25, weakness: .25, burnExtension: 1.5, burnCap: 6,
  spreadTargets: 2, spreadShare: .4,
} as const;
export const ARRAY_SUPPORT_NAMES: Record<Element,string> = {
  metal:'金 · 裂甲开锋', wood:'木 · 缠枝留敌', water:'水 · 聚流牵引', fire:'火 · 续燃传火', earth:'土 · 固阵护持',
};
export const ARRAY_REWARDS = [
  { id: 'array-density', title: '留势刻印', lane: 'array' as const, max: 1, detail: () => '笔痕延长一秒；亲手放势后留住 24% 已用阵势，可接下一次转化；合鸣与回响不返还。' },
  { id: 'array-cycle', title: '回环引阵', lane: 'array' as const, max: 1, detail: () => '笔痕相生增伤由 50% 提至 90%；划过阵眼后，传势沿相生阵再走一站；同一阵每笔只经过一次。' },
  { id: 'array-invoke', title: '五行余韵', lane: 'array' as const, max: 1, detail: () => '手动放势后，在原阵激活本系辅助：金破甲、木缚足、水聚敌、火续燃、土修护；与相生辅阵共享每阵 2.5 秒间隔。' },
  { id: 'array-echo', title: '三才回响', lane: 'array' as const, max: 1, detail: () => '笔痕相克引爆威力 +42%；阵势记住至少三种五行后，手动放势在原位追加一次 42% 威力回响；不再积势或派生。' },
  { id: 'array-remnant', title: '借尸续阵', lane: 'array' as const, max: 1, detail: () => '主放势击杀后，在至多三具尸体处留下可划线引爆的阵痕；存留 7 秒，阵痕不再生产阵痕。' },
  { id: 'array-messenger', title: '借敌行阵', lane: 'array' as const, max: 1, detail: () => '阵法有效攻击花 6 阵势给敌人附阵印；它进入另一座相生或相克阵时，转化阵势或触发小型放势。每枚印只用一次。' },
] as const;
