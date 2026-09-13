import type { Reward, RunBuild } from '../game/roguelike';
import type { RunSpirit } from '../game/rogue-combat';
import { ROGUE as B } from '../game/rogue-balance';
import { SUMMON as S } from '../game/summon-balance';
import { arrayRewardArt } from './array-reward-art';
import { summonRewardArt } from './summon-reward-art';
import { summonGrowthCast, type SummonGrowthCast } from './summon-growth-art';
import { slayerRewardArt } from './slayer-reward-art';

type Scene = 'slash' | 'echo' | 'mana' | 'power' | 'ward' | 'spirit' | 'ripple' | 'root' | 'fire' | 'earth' | 'evolve' | 'cycle';
export interface RewardExample { scene: Scene; steps: readonly string[]; result: string; tone: string; actor?: 'beast'; keepWard?: boolean; companion?: boolean; arrayMechanic?: string; summonMechanic?: string; summonCast?: SummonGrowthCast; slayerMechanic?: string }
const ex = (scene: Scene, steps: string[], result: string, tone = '#d4bb88'): RewardExample => ({ scene, steps, result, tone });

/** Every offer has a concrete example. Values describe the offered total level, not a fake DPS forecast. */
export function rewardExample(r: Reward, build?: RunBuild, spirits?: readonly Pick<RunSpirit, 'role' | 'element'>[]): RewardExample {
  const n = r.level, p = (v: number) => `${Math.round(v * 100)}%`;
  const examples: Record<string, RewardExample> = {
    'spirit-pincer': { ...ex('spirit',['两灵强化命中','协同夹击'],`每令一次 · 追加 ${p(S.pincerPower)} 夹击`,'#91bfb0'), companion:true },
    'spirit-hunt': { ...ex('spirit',['御令击杀集火狼','接续追猎'],'转火邻敌 · 全队短时加速','#91bfb0'), companion:true },
    'spirit-sweep': { ...ex('earth',['祖兽贴身','爪击横扫'],`额外最多三敌 · 各 ${p(S.sweepPower)} 威力`,'#baa77e'),actor:'beast' },
    'spirit-fury': { ...ex('spirit',['御令击杀','攒满三层重击'],`三层后 · 下次御令 +${p(S.furyPower)}`,'#baa77e'),actor:'beast' },
    'spirit-seal': ex('cycle',['命中留旧印','换令接新印'],`先复奏旧印 ${p(S.sealPower)} · 再放新令`,'#91bfb0'),
    'spirit-echo': ex('echo',['原目标倒下','回响追邻敌'],'拟法回响可转移一次','#91bfb0'),
    'slayer-edge': ex('slash', ['快刀命中积先手', '下次更快蓄满'], `最多提前 ${Number((.15 + n * .15).toFixed(2))} 秒 · 重斩消耗`),
    'slayer-return': ex('echo', ['重斩留下刀路', '空段交叉打远端'], `回锋 ${35 + n * 15}% · 按本笔投入折算`, '#9ab9ac'),
    'slayer-focus': ex('power', ['满蓄重斩开破绽', '快刀追破'], `下一刀 +${15 + n * 15}% · 破绽保留 3 秒`),
    'array-echo': ex('echo', ['阵势经过三种五行', '放势后再响一次'], '相克引爆 +42% · 阵势放势追加回响'),
    'array-remnant': ex('ward', ['放势击杀敌人', '划过尸体上的阵痕'], '阵痕续爆 · 不再生产阵痕'),
    'array-messenger': ex('cycle', ['敌人从阵中带走阵印', '跑进另一种阵'], '相生送势 · 相克放势'),
    'array-density': ex('ward', ['先养满阵势', '放势后留下刻印'], '笔痕延长 1 秒 · 留住 24% 已用阵势'),
    'array-cycle': ex('cycle', ['划过阵眼', '力量自动接往下一阵'], '相生笔痕强化至 1.9 倍 · 古阵多传一站'),
    'array-invoke': ex('ward', ['手动放势', '原阵再起五行辅助'], '金破甲 · 木留敌 · 水聚怪 · 火续燃 · 土护阵'),
    'spirit-might': ex('spirit', ['灵体出手', '命中更重'], `全部灵体威力 +${p(n * B.growth.power)}`, '#91bfb0'),
    'spirit-harmony': ex('spirit', ['灵体接连出手', '更快一击'], `全部灵体攻速 +${p(n * B.growth.power)}`, '#91bfb0'),
    'spirit-command': ex('spirit', ['点按标记', '灵体集火'], `对集火目标 +${p(n * B.growth.command)}`, '#91bfb0'),
    'root-metal-pursuit': ex('echo', ['金系击杀', '飞剑追下一只'], `追击基准 ${B.roots.pursuitBase + n * B.roots.pursuitPerLevel}`),
    'root-wood-seed': ex('root', ['束缚敌人死亡', '根芽爆开'], `范围基准 ${B.roots.seedBase + n * B.roots.seedPerLevel}`, '#9ab982'),
    'root-water-ripple': ex('ripple', ['水击减速狼', '水波扩散'], `基准 ${B.roots.rippleBase + n * B.roots.ripplePerLevel} · 间隔 ${B.roots.rippleCooldown}s`, '#8cbaca'),
    'root-fire-ember': ex('fire', ['灼烧敌人死亡', '余火传邻敌'], `最多传给 ${n + 1} 只 · 较弱余烬`, '#d5a07f'),
    'root-earth-fracture': ex('earth', ['土击三次', '震裂重击'], `额外基准 ${B.roots.fractureBase + n * B.roots.fracturePerLevel}`, '#baa77e'),
    'common-regen': ex('mana', ['自然回灵更快', '击杀收入受上限约束'], `自然回灵 +${p(n * .12)}`, '#9ab9ac'),
    'common-capacity': ex('mana', ['领悟灵资', '恢复灵力'], '立即恢复 30 灵力 · 上限 100', '#9ab9ac'),
    'common-spell': build?.is('spirit') && !build.is('slayer') ? ex('spirit', ['下达进攻', '宝宝命中'], `御令威力 +${p(n * B.growth.power)}`, '#91bfb0') : ex('slash', ['亲手划线', '本体增强'], `手动施法 +${p(n * B.growth.power)}`),
    'common-repair': ex('mana', ['营火将熄', '修复营地'], `营地 +${B.growth.repair} · 上限 100`, '#b8bd93'),
    'common-overdrive': ex('power', ['攻击更强', '自然回灵减少'], `威力 +${p(B.growth.overdrive)} / 自然回灵 −20%`, '#d5a07f'),
    'reaction-cycle': ex('cycle', ['6s 内三种相生', '下一笔免费'], '手动或御令命中 · 同种不重复', '#b5a7ca'),
    'reaction-vortex': ex('ripple', ['金生水聚怪', '接土缠足'], `漩涡 ${B.tactics.vortexSeconds}s · 泥沼敌人受缚`, '#8cbaca'),
    'reaction-steam': ex('ripple', ['水克火爆炸', '湿雾再挂水'], `湿雾 ${B.tactics.mistSeconds}s · 可接土或木`, '#8cbaca'),
    'reaction-cut': ex('echo', ['金克木断根', '两刃追邻敌'], '每笔一次 · 追击另外两敌'),
    'reaction-forge': ex('echo', ['火克金藏剑', '后续三笔追加'], `储 ${B.tactics.forgeCharges} 剑 · ${B.tactics.forgeSeconds}s 内使用`),
    'opportunity-three': ex('echo', ['划一笔', '左右追加两锋'], '侧锋各 45% 威力'),
    'opportunity-scar': ex('slash', ['留下一道战痕', '交叉引爆'], '战痕保留 5s'),
    'opportunity-debt': ex('power', ['满蓄命中', '2.2 秒内接快刀'], '狂书追斩 · 最多借势 +60%，仍可透支', '#d5a07f'),
    'opportunity-twinArray': ex('cycle', ['相生传势', '自动再走一站'], '开局双古阵 · 每笔自动续接'),
    'opportunity-fivefold': ex('cycle', ['水生木点阵', '先聚怪，再缠足'], '原阵与来笔双辅同开 · 五行各有用途'),
    'opportunity-living': ex('ward', ['携势迁阵', '落地放势'], `每次 ${B.array.moveCost} 灵力 · 可连续迁阵`),
    'opportunity-twins': { ...ex('spirit', ['主灵同行', '伴灵加入'], '伴灵独享追加 65% 战力', '#91bfb0'), companion: true },
    'opportunity-mimic': ex('echo', ['御令命中', '灵体复奏'], '回响 35% 强化效果 · 检查射程', '#91bfb0'),
    'opportunity-beast': { ...ex('spirit', ['祖兽贴身爪击', '吞灵蜕变'], `${B.spirit.beastKills} 次主灵击杀后进化`, '#baa77e'), actor: 'beast' },
    replenish: ex('mana', ['领取补给', '灵力入账'], '获得 30 灵力', '#9ab9ac'),
  };
  if (r.id === 'awaken' || r.id === 'ascend') {
    if (build?.is('slayer') && !build.is('array')) return { ...ex('echo', r.id === 'awaken' ? ['亲手出锋', '原线折返'] : ['积够三笔投入', '追加裂空'], r.id === 'awaken' ? '回锋 55% 威力' : '每三笔标准投入追加裂空'), slayerMechanic: r.id };
    const array = build?.is('array');
    if(array)return r.id==='awaken'
      ? { ...ex('cycle', ['相生点阵激活辅助', '下一座相生阵接力'], '笔痕威力 +20% · 五行辅助接力', '#91bfb0'), arrayMechanic:'awaken' }
      : ex('evolve', ['积攒力量', '释放绝技'], '三色笔痕相克 +40% · 五印合鸣', '#c7b289');
    const example:RewardExample=r.id==='awaken'
      ? { ...ex('spirit', ['本命觉醒', build?.has('beast') ? '祖兽强化' : '支援灵加入'], build?.has('beast') ? `祖兽威力 +${p(B.spirit.awakenedPower-1)}` : '追加战力 · 主灵不被分摊', '#91bfb0'), ...(build?.has('beast') ? { actor: 'beast' as const } : { companion: true }) }
      : ex('spirit', ['共鸣蓄满', '下一令全队合击'], `共鸣合击从 ${S.unionPower} 倍提升至 ${S.unionAscendPower} 倍`, '#c7b289');
    return {...example,summonMechanic:r.id,summonCast:summonGrowthCast(build,n,spirits)};
  }
  const example=examples[r.id] ?? ex('power', ['领悟', '加入构筑'], r.detail);
  if (['slayer-edge','slayer-return','slayer-focus','opportunity-three','opportunity-scar','opportunity-debt'].includes(r.id)) example.slayerMechanic=r.id;
  if(['spirit-pincer','spirit-hunt','spirit-sweep','spirit-fury','spirit-seal','spirit-echo'].includes(r.id))example.summonMechanic=r.id;
  if(['spirit-might','spirit-harmony','spirit-command','opportunity-twins','opportunity-mimic','opportunity-beast'].includes(r.id)||r.id==='common-spell'&&build?.is('spirit')&&!build.is('slayer')){
    example.summonMechanic=r.id;example.summonCast=summonGrowthCast(build,n,spirits);
  }
  if(build?.pureSummoner&&(r.lane==='slayer'||r.lane==='array'))example.result+=' · 混搭将失去万灵同契';
  return r.id.startsWith('array-')||r.id==='opportunity-twinArray'||r.id==='opportunity-living'||r.id==='opportunity-fivefold' ? {...example,arrayMechanic:r.id,tone:'#b5bc8c'} : example;
}

const wolf = (x: number, y: number, cls = '') => `<svg class="example-wolf ${cls}" x="${x}" y="${y}" width="65" height="62" viewBox="0 0 256 256" overflow="hidden"><g transform="translate(256 0) scale(-1 1)"><image href="./art/wolf-atlas.webp" width="1024" height="768" preserveAspectRatio="none"/></g></svg>`;
const spirit = `<svg class="example-spirit" x="35" y="12" width="68" height="79" viewBox="1210 116 326 398"><image href="./art/element-spirit-atlas.webp" width="1536" height="1024"/></svg>`;

export function exampleMarkup(example: RewardExample): string {
  const { scene, steps, tone } = example;
  if(example.slayerMechanic)return `<span class="reward-example slayer-example scene-${scene}" style="--example:${tone}" role="img" aria-label="举例：${steps.join('，')}。${example.result}"><svg viewBox="0 0 260 112" aria-hidden="true">${slayerRewardArt(example.slayerMechanic)}</svg><span class="example-caption">${steps.map(s=>`<span>${s}</span>`).join('<i>→</i>')}</span></span>`;
  if(example.summonMechanic)return `<span class="reward-example scene-${scene}" style="--example:${tone}" role="img" aria-label="举例：${steps.join('，')}。${example.result}"><svg viewBox="0 0 260 112" aria-hidden="true">${summonRewardArt(example.summonMechanic,example.summonCast)}</svg><span class="example-caption">${steps.map(s=>`<span>${s}</span>`).join('<i>→</i>')}</span></span>`;
  if(example.arrayMechanic)return `<span class="reward-example scene-${scene}" style="--example:${tone}" role="img" aria-label="举例：${steps.join('，')}。${example.result}"><svg viewBox="0 0 260 112" aria-hidden="true">${arrayRewardArt(example.arrayMechanic)}</svg><span class="example-caption">${steps.map(s=>`<span>${s}</span>`).join('<i>→</i>')}</span></span>`;
  const actor = example.actor === 'beast' ? `<svg class="example-spirit" x="12" y="14" width="111" height="79" viewBox="0 0 768 512" overflow="hidden"><image href="./art/ancestor-beast-atlas.webp" width="1536" height="1024"/></svg>` : spirit;
  const ward = `<g class="example-ward" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M24 73L55 52L103 62L119 85L75 99L27 87Z"/><path d="M30 78L87 65L99 87L45 90Z"/><path d="M36 75L103 84M61 57L73 95" opacity=".4"/></g>`;
  const blade = `<path class="example-blade" d="M71 57Q110 35 174 54L156 59Q112 51 71 57Z" fill="currentColor"/><path class="example-hit" d="M178 45L184 69M171 61L194 53M177 75L191 42" fill="none" stroke="currentColor" stroke-width="2"/>`;
  const pulse = `<g class="example-ripple" fill="none" stroke="currentColor"><ellipse cx="177" cy="80" rx="24" ry="9" stroke-width="2"/><ellipse cx="177" cy="80" rx="45" ry="17" opacity=".45"/></g>`;
  let drawing = '';
  if (scene === 'mana') drawing = `<path d="M46 83L38 48L70 42L102 48L94 83Z" fill="#172927" stroke="currentColor" opacity=".7"/><path class="example-fill" d="M46 77L94 77L99 55Q70 62 42 55Z" fill="currentColor" opacity=".55"/><path d="M140 69H219" stroke="#486059" stroke-width="10" stroke-linecap="round"/><path class="example-meter" d="M140 69H219" pathLength="100" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M113 65L122 69L113 73" fill="none" stroke="currentColor"/>`;
  else if (scene === 'evolve') drawing = `${ward}<g transform="translate(${example.keepWard ? 65 : 0} 0)"><g class="example-emerge">${actor}</g></g><path class="example-gather" d="M25 86Q71 18 113 83M30 61Q69 117 104 60" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
  else if (scene === 'cycle') drawing = `<g fill="none" stroke="currentColor" stroke-width="1.5"><path class="example-orbit" d="M57 75Q99 8 144 74Q185 123 220 50"/><circle cx="64" cy="64" r="19"/><circle cx="128" cy="64" r="19"/><circle cx="192" cy="64" r="19"/></g><g fill="currentColor" text-anchor="middle" font-size="20" font-family="KaiTi,serif"><text x="64" y="71">木</text><text x="128" y="71">火</text><text x="192" y="71">土</text></g>`;
  else {
    const spiritAction = `<g class="example-melee">${actor}</g>${example.companion ? `<g transform="translate(-12 18) scale(.7)"><g class="example-melee">${actor}</g></g>` : ''}`;
    drawing = `${scene === 'spirit' || example.actor ? spiritAction : scene === 'ward' ? ward : `<svg x="18" y="3" width="73" height="93" viewBox="1152 0 384 512" overflow="hidden"><image href="./art/mage-cast-atlas.webp" width="1536" height="1024"/></svg>`}${wolf(158, 30)}${blade}`;
    if (scene === 'echo') drawing += `<g class="example-echo">${wolf(202, 42)}<path d="M85 71Q139 61 219 78M82 37Q138 16 207 38" fill="none" stroke="currentColor" stroke-width="2"/></g>`;
    if (scene === 'ripple') drawing += pulse;
    if (scene === 'root') drawing += `<path class="example-root" d="M148 89Q161 51 168 82Q185 40 192 80Q209 65 215 90" fill="none" stroke="currentColor" stroke-width="3"/>`;
    if (scene === 'earth') drawing += `<path class="example-root" d="M151 89L174 78L171 95L194 88L216 97M171 95L157 101" fill="none" stroke="currentColor" stroke-width="2"/>`;
    if (scene === 'fire') drawing += `<g class="example-hit" fill="currentColor"><path d="M181 81Q164 67 180 48Q172 68 190 62Q201 75 181 81Z"/><path d="M213 88Q199 74 214 61Q209 76 221 75Z"/></g>`;
    if (scene === 'power') drawing += `<path class="example-charge" d="M66 71Q97 104 125 73" fill="none" stroke="currentColor" stroke-width="3"/>`;
  }
  return `<span class="reward-example scene-${scene}${example.keepWard ? ' example-coexist' : ''}" style="--example:${tone}" role="img" aria-label="举例：${steps.join('，')}。${example.result}"><svg viewBox="0 0 260 112" aria-hidden="true"><path d="M16 94Q128 78 244 94" fill="none" stroke="#7e9186" opacity=".2"/>${drawing}</svg><span class="example-caption">${steps.map(s => `<span>${s}</span>`).join('<i>→</i>')}</span></span>`;
}
