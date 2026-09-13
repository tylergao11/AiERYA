import { BATTLE } from '../game/battle-rules';
import type { World } from '../game/world';
import { ARRAY } from '../game/array-balance';

/** Shared skills stay available. This guide describes only the array extension. */
export function arrayGuide(world: World): string {
  const a=world.mechanics.arrays;if(!a.active)return '';
  return `<details class="array-guide"><summary>阵势手册 · ${a.pure?'纯阵合鸣已激活':'五行运转'}</summary>
    <p><b>战斗笔痕：</b>每点阵法修为使笔痕威力增加 ${BATTLE.trace.growth * 100}%。沿敌人行进路线划线，元素残留五秒；标准八步笔画消耗 ${BATTLE.trace.cost} 灵力。最多六道笔痕，同系重叠不叠伤，同处最多两种元素生效。相生交叠加强新笔，相克交点引爆并打断精英，命中精英或至少两敌返 2 灵力，每波技巧回灵上限 36。</p>
    <p>每座手绘阵独立蓄势，阵法打出有效伤害才会积累。${ARRAY.ready} 势起可放，最多 ${ARRAY.capacity}；波间保留。</p>
    <p><b>五行辅助：</b>用相生元素划过阵眼，激活三秒阵域辅助：金破甲、木缚足、水聚敌、火续燃传火、土修阵减伤。每阵间隔 2.5 秒，短笔按投入缩短效果；空划不激活，土辅可用于修护受损阵。</p>
    <ol><li><b>养势：</b>把怪留在阵中，相生划线可以补势。</li><li><b>传势：</b>按水 → 木 → 火 → 土 → 金 → 水划过阵眼，把七成阵势传往下一阵，并携带五行印记。</li><li><b>放势：</b>同系划过阵眼释放本系招式；相克改成蒸汽、飞刃、根牢、熔金、泥牢。必须有敌人，短笔按投入限制放势。</li><li><b>续阵：</b>留势刻印接下一轮，三才回响接第二拍，借尸续阵让你再划一笔收尾。</li></ol>
    <p><b>试一笔：</b>水阵养势 → 划过木阵传势缠住敌人 → 接到火阵，选水反炼火阵，蒸汽清场。</p>
    <p>${a.pure?'所选开局天命全属阵法：主放势带动附近另一座已蓄势的阵出招，每座各付阵势。':'混修仍可使用完整阵势系统；纯阵合鸣要求所选开局天命全属阵法。'}</p>
    <p><b>五行辅阵：</b>同时附带来笔的辅助，例如水生木会先聚怪再缚足。<b>五行通脉：</b>觉醒后，再唤起附近下一座相生阵的辅助，每笔每阵最多一次。古阵不因时间或自身出手耗损，受到攻击仍会损毁；升华后集齐五行印记再放势，追加五式周天合鸣。</p></details>`;
}
