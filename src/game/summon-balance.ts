/** Summoner-owned tuning. Direct slayer attacks and ancient-array budgets are independent. */
export const SUMMON = {
  charges: 2, capacity: 4, lifetime: 10, ultimateCapacity: 16,
  movement: 1.8, pursuitSpeed: 1.35, rallyRadius: 6, tapRadius: 2.1, commandResponse: .18,
  resonanceMax: 100, focusGain: 12, empoweredGain: 22, minimumOrder: .25,
  unionPower: 2.3, unionAscendPower: 3, unionRadius: 4, unionSeconds: 12,
  empoweredSpeed: 1.8, echoPower: .35, echoDelay: .25,
  pincerPower: .35, pincerWindow: 1.2, pincerCooldown: 2,
  huntRange: 6, huntSeconds: 1, sweepPower: .4, furyPower: .6, furySeconds: 5,
  sealPower: .25, sealSeconds: 4,
} as const;
export const ORDERS = {
  metal: { name: '破锋', verb: '凝刃破防', power: 1.8, radius: 0, splash: 0 },
  wood: { name: '缠生', verb: '命中缠足', power: .65, radius: 2.5, splash: .35 },
  water: { name: '回澜', verb: '水击聚敌', power: .6, radius: 3, splash: .3 },
  fire: { name: '焚羽', verb: '附焰爆燃', power: .9, radius: 3.3, splash: 1 },
  earth: { name: '震岳', verb: '重击退敌', power: .85, radius: 2.8, splash: .45 },
} as const;

export const SUMMON_REWARDS = [
  { id: 'spirit-pincer', title: '合围', lane: 'spirit', max: 1, detail: () => '两只灵体在 1.2 秒内强化命中同一敌人，追加一次 35% 夹击；需至少两灵，每令一次，间隔 2 秒。' },
  { id: 'spirit-hunt', title: '追猎', lane: 'spirit', max: 1, detail: () => '御令击杀集火目标后，6 步内接续转火，全队移速 +35% 持续 1 秒；保留剩余御令。' },
  { id: 'spirit-sweep', title: '重扑', lane: 'spirit', max: 1, detail: () => '祖兽强化爪击横扫前方最多三敌，各受 40% 伤害；需吞灵祖兽，土墙仍阻挡。' },
  { id: 'spirit-fury', title: '吞势', lane: 'spirit', max: 1, detail: () => '祖兽御令击杀原生狼积战意，三层后下一次强化重击 +60%；5 秒未续则散，短划按投入积累。' },
  { id: 'spirit-seal', title: '双印', lane: 'spirit', max: 1, detail: () => '有效御令命中留印 4 秒，换系命中时先复奏 25% 旧印，再释放新令；只存一印，不能递归。' },
  { id: 'spirit-echo', title: '余音', lane: 'spirit', max: 1, detail: () => '拟法回响的目标已死时，转向附近 4 步内另一敌人；需拟法，仍检查射程与土墙。' },
] as const;
