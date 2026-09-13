import { BOONS, LANES, ROOT_NAMES, TIER_NAMES, destinyBoons, destinyName, type Boon, type Destiny } from '../game/roguelike';
import type { World } from '../game/world';
import { ROGUE } from '../game/rogue-balance';
import { destinyArt, laneMark } from './manuscript-art';

const SUMMARY: Record<Boon, string> = {
  three: '一笔三锋 · 侧锋各 45% 威力', scar: '留痕 5 秒 · 交叉引爆', debt: '满蓄接快刀 · 狂书追斩<small>仍可透支 36 灵力</small>',
  twinArray: '双古阵 · 相生传势自动续接一阵', fivefold: '相生点阵 · 原阵与来笔双辅同开', living: `移阵落地，遇敌释放本系招式<small>${ROGUE.array.moveCost} 灵力 / 次 · 可连续迁阵</small>`,
  twins: '主灵与伴灵同行 · 伴灵追加 65% 战力', mimic: '御令命中后复奏 · 追加 35% 强化效果', beast: '祖兽近身溅伤 · 主灵 12 杀后蜕变',
};
const affinity = (d: Destiny): string => d.roots.map(r => ROOT_NAMES[r]).join('');

export function birthDetail(d: Destiny, selected = false, full = false): string {
  return `<article class="birth-detail lane-${d.fate}" aria-labelledby="talent-name">
    <div class="birth-demo"><button class="birth-replay" data-action="replay-talent" aria-label="重播天赋演示" title="重播">↻</button><span class="birth-demo-caption" role="status"></span></div>
    <div class="birth-explanation"><div class="birth-copy"><div class="birth-detail-title"><h3 id="talent-name">${destinyName(d)}</h3><small>${d.fate === 'slayer' ? '无属性剑术' : `${affinity(d)}行亲和 +${d.roots.length === 1 ? 20 : 12}%`}</small></div>
    <div class="birth-detail-meta">${laneMark(d.fate)}<span class="birth-tier-label" data-rarity="${d.tier}">${TIER_NAMES[d.tier]}</span></div>
    <div class="birth-description">${destinyBoons(d).map(b => `<p title="${BOONS[b].detail}">${SUMMARY[b]}</p>`).join('')}</div></div>
    <div class="birth-decision"><details class="birth-rules"><summary>详情</summary><div class="birth-rule-copy" tabindex="0" role="region" aria-label="天赋详情">${destinyBoons(d).map(b => `<p>${BOONS[b].detail}</p>`).join('')}</div></details><button class="birth-confirm ${selected ? 'quiet-button' : 'primary'}" data-action="toggle-talent" data-talent="${d.serial}" aria-label="${selected ? '取消' : '选定'}${destinyName(d)}" ${full && !selected ? 'disabled' : ''}>${selected ? '取消选择' : full ? '已选满' : '选定'}${!selected && !full ? ' <span aria-hidden="true">→</span>' : ''}</button></div></div>
  </article>`;
}

export function openingPanel(world: World): string {
  const draft = world.birthDraft, d = draft.detail, chosen = draft.choices;
  return `<section class="panel-card birth-screen" role="dialog" aria-modal="true" aria-labelledby="birth-title">
    <header class="birth-heading"><h2 id="birth-title">先天气运</h2></header>
    <div class="birth-body">${birthDetail(d, draft.selected.has(d.serial), chosen.length >= 2)}
      <aside class="birth-options" aria-label="随机气运">
        <div class="birth-list" role="group" aria-label="五个随机天赋，选择两项">${draft.candidates.map(talent => `<button class="birth-talent lane-${talent.fate}" data-inspect="${talent.serial}" data-inspected="${talent.serial === d.serial}" data-selected="${draft.selected.has(talent.serial)}" aria-current="${talent.serial === d.serial}" aria-label="查看${destinyName(talent)}，${LANES[talent.fate].name}，${TIER_NAMES[talent.tier]}${draft.selected.has(talent.serial) ? '，已选' : ''}">${destinyArt(talent)}<span class="birth-talent-copy"><b>${destinyName(talent)}</b><small>${laneMark(talent.fate)}<span>${talent.fate === 'slayer' ? '无属性剑术' : `${affinity(talent)}行亲和`}</span></small></span><span class="birth-tier-label" data-rarity="${talent.tier}">${TIER_NAMES[talent.tier]}</span><span class="birth-check" aria-hidden="true">定</span></button>`).join('')}</div>
        <p class="birth-hint" role="status" aria-live="polite">${draft.message ? '已选 2 项' : ''}</p>
      </aside>
    </div>
    <footer class="birth-footer"><span class="birth-count" aria-label="已选 ${chosen.length} 项，共需 2 项">${chosen.length}<small>/ 2</small></span><div class="birth-slots">${Array.from({ length: 2 }, (_, i) => { const talent = chosen[i]; return talent ? `<button class="birth-slot lane-${talent.fate}" data-talent="${talent.serial}" aria-label="移除${destinyName(talent)}">${laneMark(talent.fate)}<b>${destinyName(talent)}</b><span aria-hidden="true">×</span></button>` : `<div class="birth-slot empty" aria-label="待选第 ${i + 1} 项"><span aria-hidden="true">◇</span></div>`; }).join('')}</div>
      <div class="birth-actions"><button class="birth-reroll" data-action="roll" aria-label="重抽五项">↻ <span>重抽</span></button><button class="birth-enter" data-action="accept-fate" ${draft.ready ? '' : 'disabled'}>入山 <span aria-hidden="true">→</span></button></div>
    </footer>
  </section>`;
}
