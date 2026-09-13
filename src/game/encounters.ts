import { random } from '../core/math';
import type { Wolf } from './contracts';
import type { WolfKind } from './wolves';
import { rollAffixes, type EliteAffix } from './elite-affixes';

export const CAMPAIGN_WAVES = 10;
export const ENCOUNTERS = { healthMultiplier: 2.25, waveGrowth: 1.1, extraElitesPerWave: 2, aliveLimit: 96, firstSpawn: .6, packSize: 6, packInterval: .12 } as const;
export type Entrance = 0 | 1 | 2;
type Elite = NonNullable<Wolf['eliteSkill']>;
export interface WaveSpawn {
  readonly at: number; readonly entrance: Entrance; readonly kind: WolfKind; readonly eliteSkill?: Elite;
  readonly healthScale: number; readonly beat: number; readonly pack: number;
  readonly spreadX: number; readonly spreadZ: number; readonly flank: number; readonly pace: number;
  readonly affixes: readonly EliteAffix[];
}
interface Definition { title: string; count: number; seconds: number; health: number; speed: number; campDamage: number; elites: readonly Elite[] }
const definitions: readonly Definition[] = [
  { title:'狼群漫入', count:36, seconds:28, health:12, speed:2.4, campDamage:2, elites:[] },
  { title:'长嚎四起', count:40, seconds:35, health:14, speed:2.45, campDamage:2, elites:['call','call'] },
  { title:'群锋扑火', count:44, seconds:40, health:16, speed:2.5, campDamage:2, elites:['guard','call','guard'] },
  { title:'封灵暗袭', count:46, seconds:43, health:18, speed:2.5, campDamage:2, elites:['silence','hunt','call','guard'] },
  { title:'百狼围营', count:48, seconds:47, health:20, speed:2.55, campDamage:2, elites:['guard','call','silence','hunt','call'] },
  { title:'势如破竹', count:50, seconds:45, health:14, speed:2.5, campDamage:2, elites:['call','guard'] },
  { title:'群山奔袭', count:52, seconds:48, health:21, speed:2.55, campDamage:2, elites:['hunt','guard','call','silence','hunt','guard'] },
  { title:'狼潮不息', count:56, seconds:50, health:22, speed:2.6, campDamage:2, elites:['guard','call','hunt','silence','call','hunt'] },
  { title:'长夜沸腾', count:58, seconds:53, health:23, speed:2.65, campDamage:2, elites:['silence','guard','call','hunt','guard','call','silence'] },
  { title:'狼王破晓', count:60, seconds:60, health:24, speed:2.6, campDamage:2, elites:['guard','call','silence','hunt','guard','call'] },
];
function compile(def: Definition, wave: number, king: boolean): readonly WaveSpawn[] {
  const rng = random(19037 + wave * 4217), intervals = Array.from({length:def.count}, (_, i) =>
    (.4 + rng() * 1.2) * (i / def.count > .35 && i / def.count < .8 ? .7 : 1));
  const total = intervals.reduce((a,b)=>a+b,0); let time = 0;
  const eliteCount = 2 + Math.floor((wave - 1) * .7);
  const eliteIndices = Array.from({length:eliteCount},(_,i)=>Math.floor(def.count*(.22+(i+.25)*.68/eliteCount)));
  const roles: readonly Elite[] = wave < 3 ? ['guard','call'] : wave < 5 ? ['guard','call','rush','mend'] : ['guard','mend','silence','hunt','rush','call'];
  return intervals.map((gap,index) => {
    time += gap;
    const slot = eliteIndices.indexOf(index);
    const elite = slot >= 0 ? roles[slot % roles.length] : undefined;
    const isKing = king && index === Math.floor(def.count * .65);
    const champion = !isKing && elite!==undefined;
    return { at: index === 0 ? ENCOUNTERS.firstSpawn : ENCOUNTERS.firstSpawn + time / total * def.seconds,
      entrance: Math.floor(rng()*3) as Entrance, kind:isKing?'king':champion?'elite':'normal', eliteSkill:elite,
      healthScale:isKing?1.25:champion?.5:1, beat:Math.min(2,Math.floor(index/def.count*3)), pack:index,
      spreadX:(rng()-.5)*12, spreadZ:(rng()-.5)*10, flank:(rng()-.5)*10, pace:.8+rng()*.45,
      affixes:champion?rollAffixes(wave,rng):[] };
  });
}
const plans = definitions.map((d,i)=>({...d,spawns:compile(d,i+1,i===9)}));
function scaleEncounter(n: number) {
  const index=n<=CAMPAIGN_WAVES?n-1:6+(n-CAMPAIGN_WAVES-1)%4, plan=plans[index]!;
  const extra=n<=CAMPAIGN_WAVES?0:Math.ceil((n-CAMPAIGN_WAVES)/4);
  const growth = ENCOUNTERS.waveGrowth ** (n - 1);
  // Keep the first wave as the baseline, including after campaign templates begin repeating.
  const baseline = plans[0]!;
  const spawns = plan.spawns;
  return { ...plan, spawns, count: spawns.length,
    health: baseline.health * ENCOUNTERS.healthMultiplier * growth,
    speed: Math.min(3.4, plan.speed + extra * .03),
    campDamage: baseline.campDamage * growth, attackMultiplier: growth };
}
let cached: { wave: number; plan: ReturnType<typeof scaleEncounter> } | undefined;
export function encounter(wave: number) {
  const n = Number.isFinite(wave)?Math.max(1,Math.floor(wave)):1;
  if (cached?.wave !== n) cached = { wave: n, plan: scaleEncounter(n) };
  return cached.plan;
}
