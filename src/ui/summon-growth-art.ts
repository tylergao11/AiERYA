import type { Element } from '../game/contracts';
import type { RunBuild } from '../game/roguelike';
import type { RunSpirit } from '../game/rogue-combat';
import { ROGUE as B } from '../game/rogue-balance';
import { SUMMON as S } from '../game/summon-balance';
import { summonPortrait } from './summon-roster';

export interface SummonGrowthCast {
  element: Element;
  ancestor: boolean;
  arrival: Element;
  level: number;
}

const ids = new Set(['spirit-might', 'spirit-harmony', 'spirit-command', 'common-spell', 'awaken', 'ascend', 'opportunity-twins', 'opportunity-mimic', 'opportunity-beast']);
export const hasSummonGrowthArt = (id: string): boolean => ids.has(id);

/** Live bodies take precedence over birth affinities after a player changes their native element. */
export function summonGrowthCast(build: RunBuild | undefined, level: number, spirits: readonly Pick<RunSpirit, 'role' | 'element'>[] = []): SummonGrowthCast {
  const main = spirits.find(s => s.role === 'main') ?? spirits[0];
  const roots = build?.affinities ?? [];
  const initial = build?.has('mimic') && !build.has('twins') ? roots[1] ?? roots[0] : roots[0];
  return { element: main?.element ?? initial ?? 'water', ancestor: !!build?.has('beast') && (!main || main.role === 'main'), arrival: roots[1] ?? roots[0] ?? 'water', level: Math.max(1, Math.min(3, level)) };
}

/** Slowed, illustrated explanations. These never advance simulation or predict DPS. */
export function summonGrowthArt(id: string, cast: SummonGrowthCast, filter: string): string {
  const ancestor = cast.ancestor || id === 'opportunity-beast';
  const melee = ancestor || cast.element === 'wood' || cast.element === 'earth';
  const x = melee ? 73 : 47;
  const timed = (art: string, action: string, delay = 0) => `<g class="sum-case-${action}" style="animation-delay:${delay}s">${art}</g>`;
  const body = (at: number, y: number, element: Element, beast = false, action = 'cast', delay = 0) => {
    const w = beast ? 112 : element === 'earth' ? 76 : 67, h = beast ? w * 512 / 768 : 89;
    // Same registered paw point as the battle atlas; growth is anchored to the ground.
    const px = beast ? w * 425 / 768 : w / 2, py = beast ? w * 480 / 768 : h;
    return `<g data-native="${element}" data-body="${beast ? 'ancestor' : 'spirit'}" transform="translate(${at} ${y})"><ellipse cy="3" rx="${beast ? 43 : 20}" ry="4" fill="#675943" opacity=".17"/>${timed(`<svg x="${-px}" y="${-py}" width="${w}" height="${h}">${summonPortrait(element, beast)}</svg>`, action, delay)}</g>`;
  };
  const wolf = (action = 'recoil', delay = 0) => `<g transform="translate(207 96)"><ellipse cy="2" rx="21" ry="4" fill="#675943" opacity=".17"/>${timed('<svg x="-34" y="-57" width="68" height="63" viewBox="0 0 256 256"><g transform="translate(256 0) scale(-1 1)"><image href="./art/wolf-atlas.webp" width="1024" height="768"/></g></svg>', action, delay)}</g>`;
  const material = (layer: 0 | 1 | 2, at: number, y: number, width: number, height: number, element = cast.element) => {
    const edges = [0, 309, 623, 932, 1237, 1536], rows = [0, 300, 640, 1024], col = { metal: 0, wood: 1, water: 2, fire: 3, earth: 4 }[element];
    return `<g filter="url(#${filter})"><svg x="${at - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" viewBox="${edges[col]} ${rows[layer]} ${edges[col + 1]! - edges[col]!} ${rows[layer + 1]! - rows[layer]!}"><image href="./art/spirit-effects-atlas.webp" width="1536" height="1024"/></svg></g>`;
  };
  const impact = (delay = 0, large = false) => timed(material(large ? 2 : 1, 207, 70, large ? 88 : 62, large ? 78 : 58), 'hit', delay);
  const missile = (delay = 0, echo = false) => `<g transform="translate(${melee ? 132 : 64} 48)"><g class="sum-case-missile${echo ? ' is-echo' : ''}" style="--flight-x:${melee ? 65 : 133}px;--flight-y:19px;animation-delay:${delay}s">${material(0, 0, 0, 49, 30)}</g></g>`;
  const claw = () => timed('<g transform="translate(193 65)"><path d="M-22-23Q-14 2 24 17M-11-27Q-4-1 34 11M1-28Q7-4 40 3" fill="none" stroke="#76563a" stroke-width="4"/><path d="M-22-23Q-14 2 24 17M-11-27Q-4-1 34 11M1-28Q7-4 40 3" fill="none" stroke="#ead2a1" stroke-width="1.5"/></g>', 'claw');
  const delivery = () => melee ? ancestor ? claw() : timed(material(1, 188, 76, 72, 54), 'claw') : missile();
  const castBody = () => body(x, 101, cast.element, ancestor, melee ? 'lunge' : 'cast');
  const lock = timed('<path d="M189 52L183 57L189 62M225 52L231 57L225 62M203 30L207 35L211 30" fill="none" stroke="#8b6237" stroke-width="1.8"/>', 'lock');
  const label = (text: string, at = 130, y = 17) => `<text x="${at}" y="${y}" text-anchor="middle" fill="#76634a" font-size="13">${text}</text>`;
  let picture: string;
  let speed = 1;
  let action = melee ? 'melee' : 'ranged';

  if (id === 'opportunity-twins' || id === 'awaken' && !ancestor) {
    action = 'arrival';
    picture = body(62, 101, cast.element, ancestor, 'idle')
      + timed(material(2, 181, 84, 73, 50, cast.arrival), 'growth-arrival-light')
      + body(181, 101, cast.arrival, false, 'growth-arrival')
      + label('主灵', 62, 109) + label(id === 'awaken' ? '支援灵' : '伴灵', 181, 109);
  } else if (id === 'opportunity-beast') {
    action = 'evolution';
    picture = `<g transform="translate(0 3)">${body(126, 101, cast.element, true, 'growth-evolve')}</g>`
      + timed(material(2, 139, 87, 115, 50), 'growth-arrival-light');
  } else if (id === 'opportunity-mimic') {
    action = `${action}-echo`;
    picture = castBody() + wolf('double-recoil') + delivery() + impact() + missile(.75, true) + impact(.75);
  } else {
    const strong = id === 'spirit-might' || id === 'awaken' || id === 'ascend';
    picture = castBody() + wolf(strong ? 'growth-recoil' : 'recoil') + delivery() + impact(0, strong);
    if (id === 'spirit-harmony') {
      speed = 1 + cast.level * B.growth.power;
      picture += label(`出手节拍 ×${Number(speed.toFixed(2))}`, 160);
    }
    if (id === 'spirit-command') picture += lock + timed('<path d="M106 21Q159 7 201 30" fill="none" stroke="#8b6237" stroke-width="1.5" stroke-dasharray="3 4"/>', 'lock') + label('点按集火', 118, 13);
    if (id === 'common-spell') picture += timed('<path d="M17 100Q54 78 101 97" fill="none" stroke="#688c78" stroke-width="3" stroke-linecap="round"/>', 'growth-infusion');
    if (id === 'awaken') picture += label('祖兽强化');
    if (id === 'ascend') picture += label(`合击 ${S.unionPower} 倍 → ${S.unionAscendPower} 倍`, 145);
  }
  return `<g class="summon-example-art summon-growth-art" data-mechanic="${id}" data-action="${action}" style="--case-duration:${Number((4.8 / speed).toFixed(4))}s"><defs><filter id="${filter}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .34 .34 .32 0 0"/></filter></defs><path d="M12 103Q131 91 251 100" stroke="#7e705b" opacity=".2" fill="none"/>${picture}</g>`;
}
