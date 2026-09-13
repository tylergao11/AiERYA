import { panelHeading } from './common-panels';
import { slayerGuide } from './slayer-guide';
import { ELITE_AFFIXES } from '../game/elite-affixes';
import { summonGuide } from './summon-guide';
import { arrayGuide } from './array-guide';
import { REACTION_GUIDE } from '../game/reactions';
import { COMBAT } from '../game/combat';
import { BATTLE } from '../game/battle-rules';
import { ECONOMY } from '../game/economy';
import { CONCENTRATION } from '../game/concentration';
import type { World } from '../game/world';

export const HELP_CHAPTERS = { basics: '基础', reactions: '连招', spirits: '御灵', arrays: '阵势' } as const;
export type HelpChapter = keyof typeof HELP_CHAPTERS;

export function helpPanel(chapter: HelpChapter = 'basics', world?: World, introductory = false): string {
  const recovery = world?.build.active ? `当前战斗每秒自然恢复 ${Number(world.regeneration.toFixed(2))} 点` : `战斗中杀伐每秒自然恢复 ${BATTLE.mana.slayer.regen} 点，御灵 ${BATTLE.mana.spirit.regen} 点，画阵 ${BATTLE.mana.array.regen} 点`;
  const tabs = `<nav class="handbook-tabs" aria-label="手记章节">${Object.entries(HELP_CHAPTERS).map(([id, title]) => `<button data-action="help-chapter" data-chapter="${id}" aria-pressed="${id === chapter}">${title}</button>`).join('')}</nav>`;
  let content: string;
  if (chapter === 'basics') {
    content = `<div class="help-tiles">${[
      ['圈地成阵', '整备时围圈，首尾相接成阵'],
      ['即时出招', '战斗划过即生效，无需松手'],
      ['停时齐发', '停时三秒，双倍齐发'],
    ].map(([title, caption], i) => `<article><b><em>${i + 1}</em>${title}</b><span class="handbook-painting" style="--scene-x:${i * 50}%" aria-hidden="true"></span><p>${caption}</p></article>`).join('')}</div>
    ${!world?.build.active || world.build.is('slayer') ? '<div class="handbook-intro"><p><b>杀伐重斩：</b>原地按住不动蓄力，蓄好后划出去释放。移动不再蓄力，直接松手不会释放重斩；继续划动接普通快刀。</p></div>' : ''}
    <details class="help-more"><summary>灵力与操作</summary><p>灵力上限 ${COMBAT.capacity}，每波结束恢复 ${ECONOMY.waveRecovery}，余额跨波保留。${recovery}；击杀、返还与补给均不超过上限。准备、领悟、暂停与停时期间不自然恢复。归元提高自然回灵速度，灵资立即恢复 30 灵力。</p><p>准备阶段消耗翻倍：布阵花 ${CONCENTRATION.defaultInvestment * ECONOMY.preparationCostMultiplier}，战斗轻刀基价 ${BATTLE.blade.lightCost}，重刀约 ${BATTLE.blade.heavyCost+1}，画阵标准笔画 ${BATTLE.trace.cost} 灵力。御灵普通集火、移动免费，战术指令分别收费。战斗中划过即施法，沿新划过的路径即时扣灵力，松手不重复结算；短划省灵，灵力足够就能连续施法。杀伐原地按住蓄力不扣灵，划出重斩时只支付一次蓄力追加消耗。</p><p>每波可发动一次停时，冻结三秒；期间划线免灵力，笔画暂存，倒计时结束双倍齐发。准备时可花 ${ECONOMY.repairPrice * ECONOMY.preparationCostMultiplier} 灵力修营 +20 安危。</p><p>点击「撤阵」再点阵法，回收实付灵力 × 剩余耐久 × 80%。普通阵战中耗损，古阵不因时间或自身攻击耗损；受敌攻击仍会损毁，耐久跨波保留。阵师通过相生点阵激活五行辅助，觉醒后向相生邻阵接力；古阵始终留在手绘位置。</p></details>
    <details class="help-more"><summary>精英狼词缀</summary>${Object.values(ELITE_AFFIXES).map(a => `<p><b>${a.name}</b> · ${a.detail}</p>`).join('')}<p>后半夜出现双词缀精英；神速、狂暴可叠加。原生精英回灵为普通狼的三倍，狼王五倍；每波击杀回灵上限 12。</p><p>锋甲抵挡轻刀，重刀破甲。唤群增加援狼，血祭治疗附近狼群，突袭伤害营地；重刀、跃进落点或笔痕相克引爆可以打断。禁区内阵与灵停攻，离开禁区或击杀施术狼即可解除。</p></details>`;
  } else if (chapter === 'reactions') {
    content = `<div class="reaction-guide">${REACTION_GUIDE.map(([relation, title, detail]) => `<div><b>${relation} · ${title}</b><p>${detail}</p></div>`).join('')}</div>${slayerGuide(world)}`;
  } else if (chapter === 'spirits') {
    content = summonGuide();
  } else {
    content = world?.mechanics.arrays.active ? arrayGuide(world) : '<div class="handbook-intro"><h3>养势 · 传势 · 放势</h3><p>阵法命格为每座阵积累阵势。相生传势，同系或相克划过阵眼放势。</p><p>开局选择布阵天赋，即可修习阵势。</p></div>';
  }
  if (chapter === 'spirits' || chapter === 'arrays') content = content.replace('<details', '<details open');
  return panelHeading('五行手记') + tabs + `<div class="folio-scroll handbook-page" data-chapter="${chapter}">${content}</div><footer class="folio-footer"><button class="quiet-button" data-action="back">${introductory ? '开始修行' : '返回'}</button></footer>`;
}
