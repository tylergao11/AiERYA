import type { World } from '../game/world';
import type { RunSpirit } from '../game/rogue-combat';
import { ROOT_NAMES } from '../game/roguelike';
import { spiritProfile } from '../game/spirit-profile';
import { SpiritMovement } from '../game/spirit-movement';
import { ORDERS } from '../game/summon-balance';
import { spiritRestriction } from '../game/spirit-restrictions';
import { wolfName } from '../game/wolves';
import { ROGUE } from '../game/rogue-balance';

export function summonIntent(world:World):string {
  const cmd=world.mechanics.commands,target=world.wolves.find(w=>w.id===cmd.targetId&&w.action!=='dead');
  if(cmd.ready)return '进攻 · 发动合击';
  if(target)return '集火 · '+wolfName(target);
  if(cmd.rally){
    const mobile=cmd.troops.filter(s=>s.wardId===undefined);
    return !mobile.length?'阵灵守阵':mobile.every(s=>cmd.rallied(s.id))?'集合点驻守':'前往集合点';
  }
  if(cmd.troops.some(s=>world.wolves.some(w=>w.id===s.targetId&&w.action!=='dead')))return '自主接敌';
  return '点按集火 · 指令调度';
}

export function summonStatus(world:World,spirit:RunSpirit){
  const cmd=world.mechanics.commands,beast=spirit.role==='main'&&world.build.has('beast');
  const role=beast?'祖兽':spirit.role==='main'?'主灵':spirit.role==='twin'?'伴灵':spirit.role==='support'?'援灵':'阵灵';
  const style=spiritProfile(spirit).style==='melee'?'近战':'远攻';
  const target=world.wolves.find(w=>w.id===spirit.targetId&&w.action!=='dead');
  const restriction=spiritRestriction(world,spirit),silenced=restriction==='silenced',suppressed=restriction==='suppressed';
  const stock=Math.max(0,cmd.amount(spirit.id)),element=cmd.element(spirit.id),united=cmd.united(spirit.id);
  const expiry=cmd.expiry(spirit.id);
  const state=(spirit.hp ?? 1)<=0 ? '暂退 '+Math.ceil(spirit.revive??0)+'秒' : suppressed?'受压':silenced?'沉默':spirit.cast>0?'出手':target?(SpiritMovement.canHit(spirit,target,world.wards)?'接战':'追击'):spirit.wardId!==undefined?'守阵':cmd.rally?(cmd.rallied(spirit.id)?'驻守':'集合'):'待命';
  const order=united?'合击待发':element&&stock>0?ORDERS[element].name:'未受令';
  const quantity=stock>0&&stock<.1?'不足0.1':Number(stock.toFixed(1)).toString();
  const name=`${ROOT_NAMES[spirit.element]}${role}`;
  const expiring=expiry.stock>0&&expiry.stock<.1?'不足0.1':Number(expiry.stock.toFixed(1)).toString();
  const growth=beast?{marks:Math.min(ROGUE.spirit.beastKills,world.mechanics.beastMarks),goal:ROGUE.spirit.beastKills,evolved:world.mechanics.beastEvolved}:null;
  return {id:spirit.id,beast,name,role,style,state,silenced,suppressed,stock,element,united,order,quantity,expiry,growth,
    orderElement:element?ROOT_NAMES[element]:'本命',stockText:stock>0&&stock<.1?'<0.1':quantity,
    label:`${name}，${style}，${state}，生命 ${Math.ceil(spirit.hp??0)}/${Math.ceil(spirit.maxHp??0)}，${order}${united&&element?'（'+ROOT_NAMES[element]+'）':''}${stock>0?'，御令余量 '+quantity+' 份':''}${expiry.stock>0?'，其中 '+expiring+' 份即将消散':''}${expiry.union?'，合击即将消散':''}${growth?growth.evolved?'，已蜕变':`，吞灵 ${growth.marks}/${growth.goal}`:''}`};
}
