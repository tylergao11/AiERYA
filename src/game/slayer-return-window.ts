import type { Point } from '../core/math';
import { COMBAT, strokeTouches, type CombatStroke } from './combat';
import type { ReturnCut } from './slayer-techniques';
import type { World } from './world';
import { returnCrossing } from './slayer-return-crossing';

export interface SlayerReturnWindow {
  state: 'empty' | 'ready' | 'guarded' | 'frozen';
  total: number;
  guarded: number;
  contacts: readonly Point[];
}
interface Sample {
  cut: ReturnCut;
  time: number;
  wolves: World['wolves'];
  total: number;
  guarded: number;
  contacts: Point[];
  targets: World['wolves'];
  bounds: { left: number; right: number; top: number; bottom: number };
}
const samples = new WeakMap<World, Sample>();

/** Current occupancy, not a hit prediction: enemies can move before the paid return resolves. */
export function slayerReturnWindow(world: World): SlayerReturnWindow | null {
  const cut = world.slayerTechniques.returnCut;
  if (!cut || cut.remaining <= 0 || world.phase !== 'battle' || !world.build.is('slayer')) {
    samples.delete(world); return null;
  }
  let sample = samples.get(world);
  if (!sample || sample.cut !== cut) {
    const points = [...cut.stroke.points, ...(cut.stroke.loop ?? [])], width = cut.stroke.width ?? COMBAT.strokeWidth;
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const p of points) {
      bounds.left = Math.min(bounds.left, p.x - width); bounds.right = Math.max(bounds.right, p.x + width);
      bounds.top = Math.min(bounds.top, p.z - width); bounds.bottom = Math.max(bounds.bottom, p.z + width);
    }
    sample = { cut, time: NaN, wolves: world.wolves, total: 0, guarded: 0, contacts: [], targets: [], bounds };
    samples.set(world, sample);
  }
  // HUD and ground art share one exact geometry pass per simulation frame.
  if (sample.time !== world.time || sample.wolves !== world.wolves) {
    sample.time = world.time; sample.wolves = world.wolves; sample.total = 0; sample.guarded = 0; sample.contacts = []; sample.targets = [];
    const b = sample.bounds;
    for (const wolf of world.wolves) {
      if (wolf.action === 'dead' || wolf.hp <= 0 || wolf.x < b.left || wolf.x > b.right || wolf.z < b.top || wolf.z > b.bottom || !strokeTouches(wolf, cut.stroke)) continue;
      sample.total++;
      sample.targets.push(wolf);
      if (cut.element === 'metal' && world.enemyAbilities.armored(wolf)) sample.guarded++;
      else if (sample.contacts.length < 6 && !sample.contacts.some(p => Math.hypot(p.x - wolf.x, p.z - wolf.z) < 2)) sample.contacts.push({ x: wolf.x, z: wolf.z });
    }
  }
  return { state: world.ultimate.active ? 'frozen' : !sample.total ? 'empty' : sample.guarded === sample.total ? 'guarded' : 'ready', total: sample.total, guarded: sample.guarded, contacts: sample.contacts };
}

export function returnWindowLabel(window: SlayerReturnWindow): string {
  return window.state === 'frozen' ? '停时暂存' : window.state === 'empty' ? '等敌入线' : window.state === 'guarded' ? '金印受阻' : '交叉回锋';
}

export function returnWindowHint(window: SlayerReturnWindow, remaining: number): string {
  const time = remaining.toFixed(1);
  return window.state === 'frozen' ? '回锋暂存 · 停时后接刀'
    : window.state === 'empty' ? `回锋 ${time}s · 等敌入线`
    : window.state === 'guarded' ? `金印 ${time}s · 先用火破甲`
    : `回锋 ${time}s · ${window.total - window.guarded}敌入线`;
}

export interface SlayerReturnGesture {
  at: Point;
  mode: 'remote' | 'overlap' | 'empty' | 'guarded' | 'heavy' | 'unpaid' | 'unaffordable';
  remote: number;
  contacts: readonly Point[];
}

/** Counts enemies outside the current quick stroke, without predicting deaths or firing either cut. */
export function slayerReturnGesture(world: World, quote: { stroke: CombatStroke; cost: number } | null): SlayerReturnGesture | null {
  const window=slayerReturnWindow(world), saved=world.slayerTechniques.returnCut;
  if(!window || !saved || !quote)return null;
  const at=returnCrossing(quote.stroke.points,saved.stroke.points);
  if(!at)return null;
  const result:SlayerReturnGesture={at,mode:'empty',remote:0,contacts:[]};
  if(world.ultimate.active || quote.cost<=0)return {...result,mode:'unpaid'};
  if(world.spirit-quote.cost<world.mechanics.debtFloor)return {...result,mode:'unaffordable'};
  if((quote.stroke.charge??0)>=2)return {...result,mode:'heavy'};
  if(window.state==='empty')return result;
  if(window.state==='guarded')return {...result,mode:'guarded'};
  const remote=samples.get(world)!.targets.filter(w=>!(saved.element==='metal'&&world.enemyAbilities.armored(w))&&!strokeTouches(w,quote.stroke));
  const contacts:Point[]=[];
  for(const w of remote)if(contacts.length<6&&!contacts.some(p=>Math.hypot(p.x-w.x,p.z-w.z)<2))contacts.push({x:w.x,z:w.z});
  return {at,mode:remote.length?'remote':'overlap',remote:remote.length,contacts};
}

export function returnGestureLabel(gesture:SlayerReturnGesture):string {
  return {remote:'远端回锋',overlap:'同区接斩',empty:'旧线已空',guarded:'金印受阻',heavy:'重斩换印',unpaid:'免耗不牵锋',unaffordable:'灵力不足'}[gesture.mode];
}

export function returnGestureHint(gesture:SlayerReturnGesture):string {
  return gesture.mode==='remote'?`回锋 · ${gesture.remote}敌在远端`
    :gesture.mode==='overlap'?'同区接斩 · 空段牵锋'
    :gesture.mode==='heavy'?'已转重斩 · 命中换新印'
    :gesture.mode==='guarded'?'金回锋 · 留意锋甲'
    :gesture.mode==='unpaid'?'牵回锋需要付费快刀'
    :gesture.mode==='unaffordable'?'灵力不足 · 缩短快刀'
    :'旧线已空 · 等敌入线';
}
