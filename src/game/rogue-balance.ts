import type { Element } from './contracts';
import { REACTION_MULTIPLIER, reactionBonus } from './combat';

/** Run combat, reward policy and player-facing numbers share this tuning source. */
export const ROGUE = {
  opening: { count: 5, chosen: 2, singleAffinity: .75, tiers: [.35, .35, .25, .05], singlePower: 1.2, dualPower: 1.12 },
  rewards: { count: 3, rerolls: 3, maxLevel: 3, awaken: 2, ascend: 5, ownWeight: 1.25, affinityWeight: 1.15, ordinaryWeight: 1, opportunityWeight: .35, coreWeight: 2.4 },
  growth: { power: .25, focus: .4, invoke: .35, command: .3, regen: .3, repair: 30, overdrive: .35, regenPenalty: .2 },
  slayer: { damageMultiplier: .3, cost: .6, regen: 2, killIncome: .2, guardMetalReduction: .98, refundBase: 2, refundPerLevel: 2, refundCap: 4, refundCapPerLevel: 4, refundShare: .3,
    sidePower: .45, scarSeconds: 5, scarDamage: 13, scarRadius: 3, debtFloor: -36, debtPower: 1.6, returnPower: .55, riftEvery: 3, riftPower: 1.35 },
  array: { sustainDamageMultiplier: 1.5, twinPower: .65, energy: 8, petCharge: .5, invokeBase: 16, invokePerEnergy: 6, moveCost: 4, moveDamage: 16 },
  spirit: { attackMultiplier: 2.25, attackSplashRadius: 1.6, attackSplashPower: .4, attackSplashTargets: 3,
    twinPower: .65, supportPower: .4, arrayPower: .55, range: 14, arrayRange: 4, mimicPower: .5, markSeconds: 3.5,
    meleeRange: 1.75, beastRange: 2.2, moveSpeed: 3.8, bodyRadius: .38, burnDps: 3,
    beastPower: 1.35, beastInterval: 1.5, beastKills: 12, evolvedPower: 1.35, awakenedPower: 1.25, splashPower: .35, splashRadius: 2.2,
    energy: 8, ultimatePower: 2.3, ultimateRadius: 4 },
  roots: { pursuitBase: 12, pursuitPerLevel: 12, pursuitRange: 7, seedBase: 10, seedPerLevel: 8, seedDelay: .6, seedRadius: 2.6, seedCap: 16,
    rippleBase: 6, ripplePerLevel: 6, rippleCooldown: .8, rippleRadius: 3, fractureEvery: 3, fractureBase: 18, fracturePerLevel: 14,
    emberBase: .35, emberPerLevel: .1, emberSeconds: 1.5, emberRange: 4 },
  limits: { burstTargets: 12, storedStrokes: 4 },
  economy: { killSpirit: 1 },
  tactics: { generationDamage: reactionBonus(2), empowerMultiplier: reactionBonus(1.5), generationEffect: 1.2, wallRepair: .18 * REACTION_MULTIPLIER, wallRepairCap: 32 * REACTION_MULTIPLIER,
    cycleSeconds: 6, cycleKinds: 3, vortexSeconds: 2, mistSeconds: 2.4, radius: 3.2, fieldCap: 12,
    prisonSeconds: .85, cutTargets: 2, cutRange: 5, cutBase: 12, cutPerRoot: 12, forgeCharges: 3, forgeSeconds: 6, forgeDamage: 28, forgeRange: 7 },
} as const;

export const SLAYER_DAMAGE: Readonly<Record<Element, number>> = { metal: 11.5, wood: 6, water: 4.5, fire: 9, earth: 8 };
export const MAIN_ARRAY_DAMAGE: Readonly<Record<Element, number>> = { metal: 26, wood: 11, water: 9, fire: 14, earth: 11 };
export const SPIRIT_DAMAGE: Readonly<Record<Element, number>> = { metal: 14, wood: 9, water: 8, fire: 11, earth: 12 };
export const SPIRIT_SKILLS = {
  metal: { name: '御剑穿锋', detail: '保持距离御剑穿刺，沿弹道追加两敌；副剑为 50%，土墙阻挡剑锋。', interval: 1.2, extraTargets: 2, width: 1.1, piercePower: .5 },
  wood: { name: '盘根擒抱', detail: '近身擒抱后在脚边扎根；根牢只在木灵身边缠住踏入者，离开即失效。', interval: 1.5, radius: 1.8, seconds: 2, power: .3 },
  water: { name: '游龙引涡', detail: '远射水弹，在命中处留下短暂漩涡聚敌、挂水；土墙阻断水弹。', interval: 1.45, radius: 1.8, seconds: 1.1 },
  fire: { name: '翎火连爆', detail: '远射火羽叠印；三印或击杀时在目标处爆燃，波及附近敌人。', interval: 1.4, radius: 2, seconds: 4, stacks: 3, powerPerStack: .4 },
  earth: { name: '镇岳践踏', detail: '近身践踏击退狼群、削弱扑咬；接敌时修补紧邻的一座土墙，不能远程震击。', interval: 1.6, radius: 2, splashPower: .35, weakness: .2, seconds: 1.5, repair: 3 },
} as const;
export const percent = (value: number): number => Math.round(value * 100);
