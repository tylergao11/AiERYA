import type { World } from '../game/world';
import { BATTLE } from '../game/battle-rules';
export function slayerGuide(world?: World): string {
 if (world && !world.build.is('slayer')) return '';
 return '<details class="help-more slayer-guide"><summary>斩天拔剑术 · 轻重相接</summary><p>剑术无属性。划动出轻刀；原地按住 0.65 秒后划出重刀，1.05 秒满蓄。松手不会空放重刀。</p><p>标准轻刀 '+BATTLE.blade.lightCost+' 灵力，重刀约 '+(BATTLE.blade.heavyCost+1)+'；长线增加消耗。两次有效轻刀积势，接重刀命中提高 50% 威力、返还 3 灵力。技巧回灵每波最多 36，空挥也收费。</p><p>锋甲狼减免 92% 轻刀伤害，重刀破甲三秒。重刀能打断唤群、血祭和突袭；精英不要求换元素破解。</p><p>回锋需要快刀交叉旧重斩轨迹；断岳留下的破绽用轻刀追击。轻刀收残血，把重刀留给怪群与精英。</p></details>';
}
