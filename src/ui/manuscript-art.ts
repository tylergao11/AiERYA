import { LANES, type Boon, type Destiny, type Fate, type Reward, type RewardLane, type RunBuild } from '../game/roguelike';
import type { Element } from '../game/contracts';
import { rewardExample } from './reward-examples';
import { assetUrl } from '../core/resource-loader';

const BOON_ART: Record<Boon, number> = { three: 0, scar: 1, debt: 2, twinArray: 3, fivefold: 4, living: 5, twins: 6, mimic: 7, beast: 8 };
const ELEMENT_ART: Record<Element, number> = { wood: 0, fire: 1, earth: 2, metal: 3, water: 4 };
type Atlas = 'elements' | 'talents' | 'rewards' | 'reward-martial-paintings' | 'reward-spirit-paintings' | 'reward-mystic-paintings' | 'reward-elements-paintings' | 'destiny-progress-paintings' | 'array-support-paintings';
export type Illustration = readonly [Atlas, number];
const FATE_ART: Record<Fate, number> = { slayer: 0, array: 1, spirit: 2 };

export function laneMark(lane: RewardLane): string {
  const data = LANES[lane];
  return `<span class="lane-mark" data-lane="${lane}"><b aria-hidden="true">${data.glyph}</b><span>${data.name}</span></span>`;
}

export function factionArt(fate: Fate): string {
  return `<span class="faction-painting" aria-hidden="true" style="--faction-x:${({ slayer: 0, spirit: 50, array: 100 })[fate]}%"></span>`;
}

export function factionEmblem(fate: Fate): string {
  return `<span class="faction-emblem" data-lane="${fate}">${factionArt(fate)}<b aria-hidden="true">${LANES[fate].glyph}</b><strong>${LANES[fate].name}</strong></span>`;
}

/** Equal-cell atlases keep all illustrations on the same paper and load once. */
export function paintedArt(atlas: Atlas, index: number, extra = ''): string {
  const columns = atlas === 'array-support-paintings' ? 2 : 3;
  const rows = atlas === 'elements' || atlas === 'array-support-paintings' ? 2 : 3;
  const file = atlas === 'talents' ? 'talent-paintings' : atlas;
  // Explicit image resources and SVG crops avoid CSS URL substitution and
  // background/mask compositing failures in the rotated mobile game frame.
  return `<svg class="painted-art ${extra}" data-illustration="${atlas}:${index}" viewBox="${index % columns} ${Math.floor(index / columns)} 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><image href="${assetUrl(`./art/ui/${file}.webp`)}" width="${columns}" height="${rows}" preserveAspectRatio="none"/></svg>`;
}
export const elementArt = (element: Element): string => paintedArt('elements', ELEMENT_ART[element], 'element-art');
const boonIllustration = (boon: Boon): Illustration => boon === 'fivefold' ? ['array-support-paintings', 0] : ['talents', BOON_ART[boon]];
export const boonArt = (boon: Boon): string => paintedArt(...boonIllustration(boon));
export const destinyArt = (destiny: Destiny): string => `<span class="destiny-art${destiny.tier === 'heaven' ? ' heaven-art' : ''}">${destiny.tier === 'heaven' ? destiny.fate === 'array' ? paintedArt('array-support-paintings', 2) : paintedArt('destiny-progress-paintings', FATE_ART[destiny.fate]) : boonArt(destiny.boon!)}</span>`;

const REWARD_ART: Readonly<Record<string, Illustration>> = {
  'slayer-edge': ['reward-martial-paintings', 0], 'slayer-return': ['reward-martial-paintings', 1], 'slayer-focus': ['reward-martial-paintings', 2],
  'array-density': ['reward-martial-paintings', 3], 'array-cycle': ['reward-martial-paintings', 4], 'array-invoke': ['reward-martial-paintings', 5],
  'array-echo': ['reward-martial-paintings', 6], 'array-remnant': ['reward-martial-paintings', 7], 'array-messenger': ['reward-martial-paintings', 8],
  'spirit-might': ['reward-spirit-paintings', 0], 'spirit-harmony': ['reward-spirit-paintings', 1], 'spirit-command': ['reward-spirit-paintings', 2],
  'spirit-pincer': ['reward-spirit-paintings', 3], 'spirit-hunt': ['reward-spirit-paintings', 4], 'spirit-sweep': ['reward-spirit-paintings', 5],
  'spirit-fury': ['reward-spirit-paintings', 6], 'spirit-seal': ['reward-spirit-paintings', 7], 'spirit-echo': ['reward-spirit-paintings', 8],
  'common-regen': ['reward-mystic-paintings', 0], 'common-capacity': ['reward-mystic-paintings', 1], 'common-spell': ['reward-mystic-paintings', 2],
  'common-overdrive': ['reward-mystic-paintings', 3], 'common-repair': ['reward-elements-paintings', 5], replenish: ['reward-mystic-paintings', 1],
  'reaction-cycle': ['reward-mystic-paintings', 4], 'reaction-vortex': ['reward-mystic-paintings', 5], 'reaction-steam': ['reward-mystic-paintings', 6],
  'reaction-cut': ['reward-mystic-paintings', 7], 'reaction-forge': ['reward-mystic-paintings', 8],
  'root-metal-pursuit': ['reward-elements-paintings', 0], 'root-wood-seed': ['reward-elements-paintings', 1], 'root-water-ripple': ['reward-elements-paintings', 2],
  'root-fire-ember': ['reward-elements-paintings', 3], 'root-earth-fracture': ['reward-elements-paintings', 4],
};

/** Explicit catalog coverage: new mechanics must be assigned art instead of silently borrowing a generic icon. */
export function rewardIllustrations(reward: Reward, build?: RunBuild): readonly Illustration[] {
  const boon = reward.boon ?? (reward.id.startsWith('opportunity-') ? reward.id.slice(12) as Boon : undefined);
  if (boon && Object.hasOwn(BOON_ART, boon)) return [boonIllustration(boon)];
  if (reward.id === 'awaken' || reward.id === 'ascend') {
    const fates = build?.fates.length ? build.fates : reward.lane && Object.hasOwn(FATE_ART, reward.lane) ? [reward.lane as Fate] : [];
    if (!fates.length) throw new Error(`Missing fate for ${reward.id} illustration`);
    return fates.map(fate => reward.id === 'awaken' && fate === 'spirit' && build?.has('beast')
      ? ['talents', BOON_ART.beast] as const
      : fate === 'array' ? ['array-support-paintings', reward.id==='awaken'?1:3] as const
      : ['destiny-progress-paintings', FATE_ART[fate] + (reward.id === 'awaken' ? 3 : 6)] as const);
  }
  const illustration = REWARD_ART[reward.id];
  if (!illustration) throw new Error(`Missing reward illustration: ${reward.id}`);
  return [illustration];
}
export function rewardArt(reward: Reward, build?: RunBuild): string {
  const cells = rewardIllustrations(reward, build);
  const paintings = cells.map(([atlas, index]) => paintedArt(atlas, index)).join('');
  return cells.length === 1 ? paintings : `<span class="progress-art" data-count="${cells.length}">${paintings}</span>`;
}
export function rewardSummary(reward: Reward, build?: RunBuild): string {
  if (reward.id === 'reaction-cycle') return '6 秒内三种相生 · 下一笔免费';
  return rewardExample(reward, build).result;
}
export function rewardCondition(reward: Reward): string {
  return (reward.dormant ?? '').replace('尚未生效：', '').replace(/；可留待.*$/, '');
}
