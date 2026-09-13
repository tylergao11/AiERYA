import { ELEMENTS, type Element } from './contracts';
import { ROGUE as B } from './rogue-balance';
import { ARRAY_REWARDS } from './array-balance';
import { SUMMON_REWARDS } from './summon-balance';

export type Fate = 'slayer' | 'array' | 'spirit';
export type Boon = 'three' | 'scar' | 'debt' | 'twinArray' | 'fivefold' | 'living' | 'twins' | 'mimic' | 'beast';
export type FateTier = 'ordinary' | 'unusual' | 'heaven';
/** roots stores rolled elemental affinities. The protagonist always possesses all five elements. */
export interface Destiny { readonly serial: number; readonly fate: Fate; readonly roots: readonly Element[]; readonly tier: FateTier; readonly boon: Boon | null }
export const ROOT_NAMES: Record<Element, string> = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
export const FATES = {
  slayer: { name: '杀伐命', rule: '轻刀积势 · 重刀破甲 · 无属性剑术', glyph: '斩', awaken: '回锋', ascend: '裂空' },
  array: { name: '阵师命', rule: '相生起辅 · 留敌养势 · 相克放势', glyph: '阵', awaken: '五行通脉', ascend: '周天合鸣' },
  spirit: { name: '御灵命', rule: '点按集火 · 跃进回防 · 共鸣合击', glyph: '灵', awaken: '双灵并行', ascend: '群灵觉醒' },
} as const;
export const BOONS: Record<Boon, { name: string; detail: string; chase: string }> = {
  three: { name: '一笔三锋', detail: '一笔实击，左右再出两道侧锋。侧锋各有 45% 威力，共享本笔投入与蓄力。', chase: '快刀切群攒先手 · 重斩后接回锋' },
  scar: { name: '留痕成刃', detail: '旧战痕保留 5 秒，下一笔交叉时引爆交点；威力受两笔实际投入限制。', chase: '重斩横留刀痕 · 快刀纵切引爆并追破' },
  debt: { name: '借命狂书', detail: '满蓄命中后 2.2 秒内，下一笔付费快刀借势追斩，最多追加本笔 60% 威力，并受上一重斩投入的 30% 限制。仍可透支至 −36 灵力，透支基础威力 +60%，回灵先还债。', chase: '满蓄开势 · 快刀狂书 · 回灵再战' },
  twinArray: { name: '五行回环', detail: '前两座手绘阵附正副古阵之力；引阵后阵势沿附近相生阵自动再传一站。', chase: '回环引阵延长路线 · 三才回响兑现多行阵势' },
  fivefold: { name: '五行辅阵', detail: '相生划过阵眼，同时激活原阵与来笔两种五行辅助：金破甲、木留敌、水聚怪、火续燃、土护阵。', chase: '水生木先聚后缚 · 木生火缚敌续燃 · 相克一笔兑现阵势' },
  living: { name: '移山换阵', detail: `从阵眼拖动可迁移古阵，落地冲击；每次消耗 ${B.array.moveCost} 灵力，可连续迁阵。`, chase: '迁阵携带阵势 · 落点有敌时花阵势释放本命招式' },
  twins: { name: '双生伴灵', detail: '开局主灵与伴灵同行，伴灵独享 65% 战力；觉醒再添支援灵。', chase: '协鸣提高攻速 · 驭令指挥集火' },
  mimic: { name: '拟法之灵', detail: '主灵亲自命中御令后，复奏一次 35% 强化效果；初始伴灵也能复奏，攻击仍检查距离与土墙。', chase: '双印接续五行 · 余音追向残血 · 共鸣合击' },
  beast: { name: '吞灵祖兽', detail: '主灵化为近战祖兽，贴身扑击带近身溅伤；主灵击杀积印，12 印蜕变。', chase: '灵威强化祖兽 · 觉醒转为吞灵强化' },
};
const POOLS: Record<Fate, readonly Boon[]> = { slayer: ['three', 'scar', 'debt'], array: ['twinArray', 'fivefold', 'living'], spirit: ['twins', 'mimic', 'beast'] };
export const HEAVENS = { slayer: '千锋刻命', array: '周天双阵', spirit: '双生拟法' } as const;
export const TIER_NAMES: Record<FateTier, string> = { ordinary: '奇缘', unusual: '异数', heaven: '天授' };
export function destinyBoons(d: Destiny): readonly Boon[] { return d.tier === 'heaven' ? POOLS[d.fate].slice(0, 2) : [d.boon!]; }
export function destinyName(d: Destiny): string { return d.tier === 'heaven' ? HEAVENS[d.fate] : BOONS[d.boon!].name; }
export function destinyKey(d: Destiny): string { return `${d.fate}:${[...d.roots].sort().join(',')}:${d.tier}:${d.boon}`; }
export function validDestiny(d: Destiny): boolean {
  return !!d && Object.hasOwn(FATES, d.fate) && Object.hasOwn(TIER_NAMES, d.tier)
    && Array.isArray(d.roots) && d.roots.length >= 1 && d.roots.length <= 2 && new Set(d.roots).size === d.roots.length
    && d.roots.every(r => ELEMENTS.includes(r)) && Number.isSafeInteger(d.serial) && d.serial >= 0
    && (d.tier === 'heaven' ? d.boon === null : d.tier === 'unusual' ? d.boon === POOLS[d.fate][2] : POOLS[d.fate].slice(0, 2).includes(d.boon!));
}
const copyDestiny = (d: Destiny): Destiny => Object.freeze({ ...d, roots: Object.freeze([...d.roots]) });
export class FateRoller {
  count = 0;
  missed = 0;
  current: Destiny;
  readonly saved: Destiny[] = [];
  recent: Destiny | null = null;
  constructor(private readonly rng: () => number = Math.random) { this.current = this.roll(); }
  roll(): Destiny {
    const choose = <T>(a: readonly T[]): T => a[Math.floor(this.rng() * a.length)]!;
    const fate = choose(Object.keys(FATES) as Fate[]), roots = [choose(ELEMENTS)];
    if (this.rng() < 0.25) roots.push(choose(ELEMENTS.filter(r => r !== roots[0])));
    // Ordered roots also define reproducible primary/secondary spirit and array elements.
    roots.sort((a, b) => ['fire', 'water', 'wood', 'metal', 'earth'].indexOf(a) - ['fire', 'water', 'wood', 'metal', 'earth'].indexOf(b));
    const chance = this.rng(), tier: FateTier = this.missed >= 19 || chance >= .95 ? 'heaven' : chance >= .7 ? 'unusual' : 'ordinary';
    const boon = tier === 'heaven' ? null : tier === 'unusual' ? POOLS[fate][2]! : choose(POOLS[fate].slice(0, 2));
    this.current = copyDestiny({ serial: ++this.count, fate, roots, tier, boon });
    this.missed = tier === 'heaven' ? 0 : this.missed + 1;
    if (tier === 'heaven') this.recent = this.current;
    return this.current;
  }
  save(): boolean {
    if (this.saved.length >= 3 || this.saved.some(d => destinyKey(d) === destinyKey(this.current))) return false;
    this.saved.push(this.current); return true;
  }
  select(index: number): void { const d = index === -1 ? this.recent : this.saved[index]; if (d) this.current = d; }
}

export type RewardLane = Fate | 'reaction' | 'root' | 'common';
export const LANES: Record<RewardLane, { name: string; glyph: string }> = { slayer: { name: '杀伐', glyph: '斩' }, spirit: { name: '召唤', glyph: '灵' }, array: { name: '布阵', glyph: '阵' }, reaction: { name: '相生相克', glyph: '化' }, root: { name: '五行强化', glyph: '行' }, common: { name: '通用', glyph: '修' } };
interface RewardDefinition { id: string; title: string; lane: RewardLane; root?: Element; max: number; detail: (level: number) => string }
export interface Reward { id: string; title: string; detail: string; level: number; tag: string; lane?: RewardLane; boon?: Boon; dormant?: string }
export const REWARDS: readonly RewardDefinition[] = [
  ...SUMMON_REWARDS,
  { id: 'slayer-edge', title: '游刃先手', lane: 'slayer', max: 3, detail: n => `有效快刀每笔标准投入攒 ${Number((.05 + .05 * n).toFixed(2))} 秒先手，最多 ${Number((.15 + .15 * n).toFixed(2))} 秒。下次按住蓄力 0.18 秒后计入进度，重斩消耗；空划不积攒。` },
  { id: 'slayer-return', title: '回锋纳气', lane: 'slayer', max: 3, detail: n => `重斩命中留下 2.8 秒回锋印，快刀与它交叉时逆向追加 ${35 + n * 15}% 回锋；威力按本笔投入折算。两次有效轻刀积势后，重刀命中返还 3 灵力；技巧回灵每波上限 36。` },
  { id: 'slayer-focus', title: '断岳追破', lane: 'slayer', max: 3, detail: n => `满蓄重斩命中留下 3 秒破绽；下一次有消耗的快刀对该目标额外造成 ${15 + n * 15}% 本笔伤害并消耗破绽。可以一刀追破多敌，短划按投入结算。` },
  ...ARRAY_REWARDS,
  { id: 'spirit-might', title: '灵威', lane: 'spirit', max: 3, detail: n => `全部灵体威力 +${n * 25}%，主灵、伴灵与支援灵共同受益` },
  { id: 'spirit-harmony', title: '协鸣', lane: 'spirit', max: 3, detail: n => `所有灵体攻击速度 +${n * 25}%` },
  { id: 'spirit-command', title: '驭令', lane: 'spirit', max: 3, detail: n => `灵体攻击你标记的目标时威力 +${n * 30}%` },
  { id: 'root-metal-pursuit', title: '追锋', lane: 'root', root: 'metal', max: 3, detail: n => `金系击杀后追击附近另一目标，造成 ${12 + n * 12} 点基准伤害` },
  { id: 'root-wood-seed', title: '寄生', lane: 'root', root: 'wood', max: 3, detail: n => `束缚目标死亡后留下根芽，随后造成 ${10 + n * 8} 点范围根击` },
  { id: 'root-water-ripple', title: '涟漪', lane: 'root', root: 'water', max: 3, detail: n => `水系命中已减速目标时扩散水波，基准伤害 ${6 + n * 6}，间隔 0.8 秒` },
  { id: 'root-fire-ember', title: '余烬', lane: 'root', root: 'fire', max: 3, detail: n => `灼烧目标死亡后向最多 ${n + 1} 个目标传播较弱余烬，不递归传火` },
  { id: 'root-earth-fracture', title: '震裂', lane: 'root', root: 'earth', max: 3, detail: n => `同一目标承受三次土击后重击，基准伤害 ${18 + n * 14}` },
  { id: 'common-regen', title: '归元', lane: 'common', max: 3, detail: n => `自然回灵速度 +${n * 12}%，击杀收入仍受每波上限约束` },
  { id: 'common-capacity', title: '灵资', lane: 'common', max: 3, detail: () => '立即恢复 30 灵力，最多恢复至 100' },
  { id: 'common-spell', title: '凝术', lane: 'common', max: 3, detail: n => `剑术、笔痕或御灵进攻的额外威力 +${n * 25}%；复奏只继承一次` },
  { id: 'common-repair', title: '修营', lane: 'common', max: Infinity, detail: () => '立即恢复 30 营地安危，最多恢复至 100' },
  { id: 'common-overdrive', title: '逆脉', lane: 'common', max: 1, detail: () => '基础威力 +35%，自然回灵速度与原生狼击杀收入 −20%' },
  { id: 'reaction-cycle', title: '五行轮转', lane: 'reaction', max: 1, detail: () => '6 秒内手动或御令命中触发三种不同相生，下一笔免灵力消耗；同种不能重复充数，派生不充能。' },
  { id: 'reaction-vortex', title: '回澜地牢', lane: 'reaction', max: 1, detail: () => '金生水留下 2 秒漩涡持续聚敌；漩涡中的泥沼敌人会被缠足一次，可接火烧与斩木。' },
  { id: 'reaction-steam', title: '沸雾还潮', lane: 'reaction', max: 1, detail: () => '水克火爆炸后留下 2.4 秒湿雾，进入的敌人挂水；可再接土克水、金生水或水生木。' },
  { id: 'reaction-cut', title: '斩木飞刃', lane: 'reaction', max: 1, detail: () => '金克木把消耗的根势化为两道飞刃，追斩附近另外两敌；每笔至多一次，飞刃不再追锋。' },
  { id: 'reaction-forge', title: '熔金剑藏', lane: 'reaction', max: 1, detail: () => '火克金藏入三柄剑，之后三笔非金手动法术各追加一柄金剑；优先打本笔目标，6 秒不用则散去。' },
];

export const boonFate = (boon: Boon): Fate => (Object.keys(POOLS) as Fate[]).find(f => POOLS[f].includes(boon))!;
export const OPPORTUNITIES: readonly Reward[] = (Object.keys(BOONS) as Boon[]).map(boon => ({
  id: `opportunity-${boon}`, boon, lane: boonFate(boon), title: BOONS[boon].name, level: 1, tag: '稀有机缘 · 新神通',
  detail: `${BOONS[boon].detail.replace('开局', '立即')} 同时获得${FATES[boonFate(boon)].name}的基础能力。`,
}));

/** Run-local inventory and pure reward policy; combat applies these definitions at its own boundary. */
export class RunBuild {
  destiny: Destiny | null = null;
  starting: readonly Destiny[] = [];
  stage = 0;
  rerolls: number = B.rewards.rerolls;
  revision = 0;
  offers: readonly Reward[] = [];
  private levels = new Map<string, number>();
  private acquired = new Set<Boon>();
  constructor(private readonly rng: () => number = Math.random) {}
  get active(): boolean { return this.destiny !== null; }
  is(fate: Fate): boolean { return this.starting.some(d => d.fate === fate) || [...this.acquired].some(b => boonFate(b) === fate); }
  has(boon: Boon): boolean { return this.acquired.has(boon) || this.starting.some(d => destinyBoons(d).includes(boon)); }
  get gained(): readonly Boon[] { return [...this.acquired]; }
  get fates(): readonly Fate[] { return (Object.keys(FATES) as Fate[]).filter(f => this.is(f)); }
  get roots(): readonly Element[] { return ELEMENTS; }
  get affinities(): readonly Element[] { return [...new Set(this.starting.flatMap(d => d.roots))]; }
  affinityPower(element: Element): number { return this.starting.reduce((power, d) => Math.max(power, d.roots.includes(element) ? d.roots.length === 1 ? B.opening.singlePower : B.opening.dualPower : 1), 1); }
  get spellOnly(): boolean { return this.is('slayer') && !this.is('array') && !this.is('spirit'); }
  get pureSummoner(): boolean { return this.is('spirit') && !this.is('slayer') && !this.is('array') && !this.learned.some(r => r.lane === 'slayer' || r.lane === 'array'); }
  get name(): string { return this.starting.length > 1 ? '双命同修' : this.destiny ? destinyName(this.destiny) : ''; }
  owns(element: Element): boolean { return ELEMENTS.includes(element); }
  level(id: string): number { return this.levels.get(id) ?? 0; }
  get progress(): number { return REWARDS.filter(r => this.is(r.lane as Fate)).reduce((n, r) => n + this.level(r.id), 0); }
  get learned(): readonly Reward[] { return REWARDS.filter(r => this.level(r.id) && r.id !== 'common-repair').map(r => this.card(r, this.level(r.id))); }
  begin(destiny: Destiny): boolean {
    if (!validDestiny(destiny)) return false;
    this.clear(); this.destiny = copyDestiny(destiny); this.starting = [this.destiny]; this.revision++; return true;
  }
  beginPair(choices: readonly Destiny[]): boolean {
    if (choices.length !== 2 || !choices.every(validDestiny) || new Set(choices.map(destinyKey)).size !== 2) return false;
    this.clear(); this.starting = Object.freeze(choices.map(copyDestiny)); this.destiny = this.starting[0]!; this.revision++; return true;
  }
  clear(): void { this.destiny = null; this.starting = []; this.levels.clear(); this.acquired.clear(); this.stage = 0; this.rerolls = B.rewards.rerolls; this.offers = []; this.revision++; }
  private dormant(d: RewardDefinition): string | undefined {
    if ((d.id === 'spirit-sweep' || d.id === 'spirit-fury') && !this.has('beast')) return '需吞灵祖兽；可留待机缘';
    if (d.id === 'spirit-echo' && !this.has('mimic')) return '需拟法之灵；可留待机缘';
    if (d.id === 'spirit-pincer' && !this.has('twins') && (this.stage < 1 || this.has('beast'))) return '需至少两灵；可留待觉醒或机缘';
    if (d.lane === 'common' || d.lane === 'root' || d.lane === 'reaction' || this.is(d.lane)) return;
    return d.lane === 'spirit' ? '尚未生效：需御灵机缘' : `尚未生效：需${d.lane === 'slayer' ? '杀伐' : '阵师'}机缘`;
  }
  private card(d: RewardDefinition, level: number): Reward {
    const dormant = this.dormant(d);
    return { id: d.id, title: d.title, detail: d.detail(level), level, dormant, lane: d.lane, tag: dormant ? '留待机缘 · 可先领悟' : this.is(d.lane as Fate) ? '天命修为 +1' : d.lane === 'reaction' ? '五行连招 · 新机制' : d.lane === 'root' ? `${ROOT_NAMES[d.root!]}行强化` : d.lane === 'spirit' ? '召唤领悟' : d.id === 'common-overdrive' ? '收益与代价' : '通用领悟' };
  }
  private eligible(d: RewardDefinition, health: number): boolean {
    if (this.fates.length === 1 && this.is('slayer') && (d.lane === 'root' || d.lane === 'reaction')) return false;
    if (['slayer','spirit','array'].includes(d.lane) && !this.is(d.lane as Fate)) return false;
    if (d.id === 'spirit-seal' || d.id === 'reaction-cycle' || this.dormant(d)) return false;
    if (this.fates.length === 1 && this.is('array') && d.lane === 'reaction') return false;
    if (!this.is('array') && d.lane === 'root' && d.root && !this.affinities.includes(d.root)) return false;
    return this.level(d.id) < d.max && !(d.id === 'common-repair' && health >= 100);
  }
  core(): Reward | null {
    if (!this.destiny || this.stage >= 2 || this.progress < (this.stage === 0 ? B.rewards.awaken : B.rewards.ascend)) return null;
    const f = FATES[this.destiny.fate], awaken = this.stage === 0;
    let title: string = awaken ? f.awaken : f.ascend;
    let detail = this.is('slayer') ? awaken ? '每笔手动施法沿原轨迹追加 55% 威力回锋' : '每积累三笔标准灵力投入，追加裂空重击；短划按比例积累'
      : this.is('array') ? awaken ? '笔痕威力 +20%；相生点阵的五行辅助向邻阵接力一次，古阵保留' : '场上有三种笔痕时，相克引爆威力 +40%；古阵集齐五印后追加五式合鸣'
        : awaken ? '立即增添一只支援灵，独享追加战力，一同响应御令与共鸣合击' : '群灵合击由 2.8 倍强化至 3.6 倍御令威力，纯召唤追加协同追击';
    if (awaken && this.has('beast')) { title = '吞灵强化'; detail = '祖兽威力 +25%；共鸣仍由祖兽独立积攒，升华强化合击'; }

    if (this.fates.length > 1) {
      title = `${this.fates.length === 2 ? '双命' : '三才'}${awaken ? '觉醒' : '升华'}`;
      detail = [this.is('slayer') ? awaken ? '手动施法追加回锋' : '每三笔追加裂空' : '', this.is('array') ? awaken ? '五行辅助向下一座相生阵接力' : '集齐五印放势追加五式合鸣' : '', this.is('spirit') ? awaken ? this.has('beast') ? '祖兽威力 +25%' : '增添支援灵' : '强化群灵合击' : ''].filter(Boolean).join('；');
    }
    return { id: awaken ? 'awaken' : 'ascend', title, detail, level: awaken ? 1 : 2, lane: this.destiny.fate, tag: '天命突破 · 新机制' };
  }
  rewardPool(health: number): { reward: Reward; weight: number }[] {
    if (!this.destiny) return [];
    // Every slot draws from one pool. Affinity is a small bias, never a reserved slot or a guarantee.
    const pool: { reward: Reward; weight: number }[] = REWARDS.filter(d => this.eligible(d, health)).map(d => ({
      reward: this.card(d, this.level(d.id) + 1),
      weight: this.is(d.lane as Fate) ? B.rewards.ownWeight : d.root && this.affinities.includes(d.root) ? B.rewards.affinityWeight : B.rewards.ordinaryWeight,
    }));
    for (const reward of OPPORTUNITIES) if (!this.has(reward.boon!)) pool.push({ reward, weight: B.rewards.opportunityWeight });
    const core = this.core();
    if (core) pool.push({ reward: core, weight: B.rewards.coreWeight });
    return pool;
  }
  rollOffers(health: number): readonly Reward[] {
    if (!this.destiny) return [];
    const pool = this.rewardPool(health);
    const core = this.core();
    const own = core ? undefined : pool.filter(e => this.is(e.reward.lane as Fate) && !e.reward.dormant && !e.reward.boon);
    const guaranteed = own?.length ? own[Math.floor(this.rng()*own.length)]!.reward : undefined;
    const chosen: Reward[] = core ? [core] : guaranteed ? [guaranteed] : [];
    if (guaranteed) pool.splice(pool.findIndex(e=>e.reward.id===guaranteed.id),1);
    if (core) { const index = pool.findIndex(e => e.reward.id === core.id); if (index >= 0) pool.splice(index, 1); }
    while (chosen.length < B.rewards.count && pool.length) {
      let cursor = this.rng() * pool.reduce((sum, entry) => sum + entry.weight, 0);
      let index = 0;
      for (; index < pool.length - 1; index++) { cursor -= pool[index]!.weight; if (cursor < 0) break; }
      chosen.push(pool.splice(index, 1)[0]!.reward);
    }
    if (!chosen.length) chosen.push({ id: 'replenish', title: '灵资补给', detail: '立即恢复 30 灵力，最多恢复至 100', level: 1, tag: '即时补给' });
    this.offers = chosen; this.revision++; return chosen;
  }
  reroll(health: number): boolean { if (this.rerolls <= 0 || !this.offers.length) return false; this.rerolls--; this.rollOffers(health); return true; }
  choose(id: string, health: number): Reward | null {
    const offer = this.offers.find(o => o.id === id); if (!offer) return null;
    if (id === 'awaken' || id === 'ascend') { if (this.core()?.id !== id) return null; this.stage++; }
    else if (offer.boon) {
      if (this.has(offer.boon) || !OPPORTUNITIES.some(r => r.id === id && r.boon === offer.boon)) return null;
      this.acquired.add(offer.boon);
    } else if (id !== 'replenish') {
      const definition = REWARDS.find(r => r.id === id); if (!definition || !this.eligible(definition, health)) return null;
      this.levels.set(id, this.level(id) + 1);
    }
    this.offers = []; this.revision++; return offer;
  }
}
