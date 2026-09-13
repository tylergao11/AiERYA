import type { World } from '../game/world';
import { FATES, ROOT_NAMES } from '../game/roguelike';
import { ROGUE, SPIRIT_SKILLS } from '../game/rogue-balance';
import { summonPortrait } from './summon-roster';
import { summonStatus } from './summon-status';

const ACTIONS={metal:'剑锋穿刺 → 贯穿后排',wood:'近身擒抱 → 根须留敌',water:'水弹命中 → 漩涡聚敌',fire:'火羽叠印 → 连锁爆燃',earth:'践踏狼群 → 震退护营'};
const BEAST_ACTIONS={metal:'近身爪击 → 金锋贯穿',wood:'近身擒抱 → 根须留敌',water:'近身爪击 → 聚流留敌',fire:'近身爪击 → 火印爆燃',earth:'近身践踏 → 震退护营'};

export function summonBuild(world:World):string {
  const b=world.build,pets=world.mechanics.spirits;if(!pets.length)return '';
  const crossed=[...new Set([...b.fates.filter(f=>f!=='spirit').map(f=>FATES[f].name),...b.learned.filter(r=>r.lane==='slayer'||r.lane==='array').map(r=>r.title)])];
  const contract=b.is('spirit')?`<div class="summon-contract ${b.pureSummoner?'pure':'mixed'}"><strong>${b.pureSummoner?'万灵同契':'群灵合击'}</strong><span>${b.pureSummoner?'纯召唤 · 合击后全队追击':'混搭 · 保留全队合击'}</span><p>${b.pureSummoner?'通用、五行领悟保留同契；取得其他流派技能才会失去追击。':`已兼修${crossed.slice(0,2).join('、')}${crossed.length>2?'等':''}，纯系追击未生效。`}</p></div>`:'';
  return `<section class="summon-build" aria-label="御灵队伍"><h3 class="folio-section-title">御灵队伍 · ${pets.length}</h3>${contract}<div class="summon-build-pets">${pets.map(pet=>{
    const s=summonStatus(world,pet),canChange=world.phase==='prepare'&&pet.wardId===undefined&&!pet.originWard;
    const growth=s.beast?`<span class="summon-beast-growth">${world.mechanics.beastEvolved?'已蜕变':`吞灵 ${world.mechanics.beastMarks} / ${ROGUE.spirit.beastKills}`}</span>`:'';
    const mode=pet.wardId!==undefined?'阵域内活动':pet.originWard?'古阵化灵 · 独立行动':'点按指挥';
    const detail=s.beast?`${BEAST_ACTIONS[pet.element]}；祖兽始终近战。${pet.element==='earth'?'邻近土墙受损时可修补。':''}`:SPIRIT_SKILLS[pet.element].detail;
    return `<article class="summon-build-pet" data-element="${pet.element}"><div class="summon-build-portrait">${summonPortrait(pet.element,s.beast)}</div><div class="summon-build-copy"><h4>${s.name}<span>${s.style}</span></h4><p>${(s.beast?BEAST_ACTIONS:ACTIONS)[pet.element]}</p><small>${mode}</small>${growth}</div><details><summary>招式说明</summary><p>${detail}</p></details><button data-spirit="${pet.id}" ${canChange?'':'disabled'} aria-label="${canChange?'切换':'查看'}${s.role}本命，当前${ROOT_NAMES[pet.element]}行${s.style}">${canChange?'切换本命 ↻':pet.wardId!==undefined?'五行随原阵':pet.originWard?'保留古阵本命':'战中本命固定'}</button></article>`;
  }).join('')}</div><p class="summon-build-note">准备时切换本命；战中划线授令，保留宝宝原有形态与近远分工。</p></section>`;
}
