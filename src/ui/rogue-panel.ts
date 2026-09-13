import { panelHeading } from './common-panels';
import { slayerGuide } from './slayer-guide';
import { summonGuide } from './summon-guide';
import { summonBuild } from './summon-build';
import { arrayGuide } from './array-guide';
import { BOONS, ROOT_NAMES, boonFate, destinyBoons, type Boon, type Destiny, type Reward } from '../game/roguelike';
import type { World } from '../game/world';
import { ROGUE as B } from '../game/rogue-balance';
import { exampleMarkup, rewardExample } from './reward-examples';
import { boonArt, rewardArt, rewardCondition, rewardSummary, laneMark, factionEmblem } from './manuscript-art';

const boonCard = (boon: Boon, world?: World): string => {
  const fate = boonFate(boon), data = BOONS[boon];
  const example = rewardExample({ id: `opportunity-${boon}`, title: data.name, detail: data.detail, tag: '', level: 1 }, world?.build, world?.mechanics.spirits);
  return `<details class="boon boon-disclosure lane-${fate}"><summary><span class="boon-illustration">${boonArt(boon)}</span>${laneMark(fate)}<b>${data.name}</b><span>${example.result}</span><i aria-hidden="true">⌄</i></summary><div class="boon-more">${exampleMarkup(example)}<p>${data.detail}</p><small>${data.chase}</small></div></details>`;
};
const boons = (d: Destiny, world: World): string => destinyBoons(d).map(boon => boonCard(boon, world)).join('');

export { openingPanel } from './birth-panel';

function rewardCard(r: Reward, index: number, world: World): string {
  const b = world.build, example = rewardExample(r, b, world.mechanics.spirits);
  const core = r.id === 'awaken' || r.id === 'ascend';
  const kind = core ? 'core-reward' : r.boon ? 'opportunity-reward' : r.dormant ? 'dormant-reward' : '';
  return `<article class="reward-choice lane-${r.lane ?? 'common'} ${kind}" style="--order:${index}">
    <button data-upgrade="${r.id}" class="reward-pick" aria-label="领悟${r.title}">
      <span class="reward-card-heading">${laneMark(r.lane ?? 'common')}<span>${r.boon ? '机缘' : core ? '突破' : `${r.level} 重`}</span></span>
      <h3>${r.title}</h3><span class="reward-painting">${rewardArt(r, b)}</span>
      <strong class="reward-result">${rewardSummary(r, b)}</strong>
      ${r.dormant ? `<span class="reward-condition">${rewardCondition(r)}</span>` : ''}
      <span class="reward-choose-label">${r.dormant ? '先领悟' : '领悟'} <b aria-hidden="true">→</b></span>
    </button>
    <details class="reward-details"><summary aria-label="${r.title}详情"><b class="reward-detail-title">${r.title}</b><span class="detail-open-label">详情</span><span class="detail-close-label">返回</span></summary>
      ${example.summonMechanic ? `<span class="summon-card-scene">${exampleMarkup(example)}</span>` : exampleMarkup(example)}
      <p>${r.detail}${r.dormant ? ` · ${r.dormant}` : ''}</p>
    </details>
  </article>`;
}

export function rewardPanel(world: World): string {
  const b = world.build;
  return `<header class="reward-heading"><h2>此战有悟</h2></header>
    <div class="reward-choices">${b.offers.map((r, i) => rewardCard(r, i, world)).join('')}</div>
    <footer class="reward-footer"><button data-action="reroll-rewards" ${b.rerolls <= 0 ? 'disabled' : ''}>↻ 换一批 <span>· ${b.rerolls}</span></button><button data-action="build">构筑</button></footer>`;
}

export function buildPanel(world: World): string {
  const b = world.build;
  return panelHeading(b.name) + `<div class="folio-scroll build-book"><aside class="build-identity"><div class="build-emblems" data-count="${b.fates.length}">${b.fates.map(factionEmblem).join('')}</div>
    <p class="fate-rule">修为 ${b.progress} · ${['尚未觉醒', '已觉醒', '已升华'][b.stage]}</p><div class="root-row">${(b.spellOnly ? [] : b.affinities).map(r => `<span class="root-medallion root-${r}" aria-label="${ROOT_NAMES[r]}行亲和 +${Math.round((b.affinityPower(r) - 1) * 100)}%"><b>${ROOT_NAMES[r]}</b><span>+${Math.round((b.affinityPower(r) - 1) * 100)}%</span></span>`).join('')}</div></aside>
    <div class="build-content" tabindex="0" aria-label="构筑详情"><div class="boon-grid">${b.starting.map(d => boons(d, world)).join('')}</div>
    ${b.gained.length ? `<p class="eyebrow">途中所得机缘</p><div class="boon-grid">${b.gained.map(boon => boonCard(boon, world)).join('')}</div>` : ''}
    <div class="build-learned">${b.learned.length ? b.learned.map(r => `<details class="learned-item lane-${r.lane ?? 'common'}"><summary><span class="learned-painting">${rewardArt(r, b)}</span><b>${r.title} <small>${r.level} 重</small></b><span>${rewardExample(r, b, world.mechanics.spirits).result}</span></summary>${exampleMarkup(rewardExample(r, b, world.mechanics.spirits))}<p>${r.detail}${r.dormant ? `<small class="reward-condition">${r.dormant}</small>` : ''}</p></details>`).join('') : '<p class="empty-inscription">尚无领悟</p>'}</div>
    ${summonBuild(world)}
    ${b.is('spirit') ? summonGuide() : ''}${arrayGuide(world)}${slayerGuide(world)}</div></div><footer class="folio-footer"><button class="quiet-button" data-action="back">返回</button>${world.canFinishRun ? '<button class="quiet-button" data-action="finish-run">结束历练</button>' : ''}<button class="text-button" data-action="reset">重新启程</button></footer>`;
}

export function buildStatus(world: World): string {
  if (!world.build.destiny) return '';
  const b = world.build;
  const t = world.mechanics.tactics;
  return `${b.name} · 修为 ${b.progress}${b.stage ? ` · ${b.stage === 1 ? '觉醒' : '升华'}` : ''}${b.is('array') ? ` · ${world.mechanics.arrays.readyCount} 阵可放${world.mechanics.arrays.pure ? ' · 纯阵合鸣' : ''}` : b.has('beast') ? ` · 吞灵 ${world.mechanics.beastMarks}/${B.spirit.beastKills}` : b.is('spirit') ? ` · 灵体 ${world.mechanics.spirits.length}${b.stage === 2 ? ' · 共鸣 ' + Math.floor(world.mechanics.commands.resonance) + '/100' : ''}` : ''}${t.freeCast ? ' · 下一笔免费' : t.generation.size ? ` · 轮转 ${t.generation.size}/3` : ''}${t.swords ? ` · 藏剑 ${t.swords}` : ''}`;
}
