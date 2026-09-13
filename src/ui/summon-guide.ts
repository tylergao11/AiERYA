import { TACTICAL_ORDERS } from '../game/battle-rules';
export function summonGuide():string {
 return '<details class="help-more"><summary>御灵 · 指挥与生存</summary><p>点敌集火、点地集合，均不耗灵力。灵体保留各自本命攻击，底栏用于指挥。</p><p>'+Object.values(TACTICAL_ORDERS).filter(o=>o.name!=='复令').map(o=>'<b>'+o.name+'</b> '+o.cost+' 灵力').join('；')+'。跃进后点落点，短暂无敌并打断落点附近敌人；进攻后点目标，授予两次强化攻击。回防加速撤回营地并减伤，回春治疗存活灵体 35% 生命。</p><p>复令按原价重复上次指令，共用原指令冷却。共鸣蓄满后用进攻释放合击；灵体倒下六秒后重返，提前回防比反复治疗更省灵力。</p></details>';
}
