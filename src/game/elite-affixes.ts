import type { Wolf } from './contracts';
import type { World } from './world';
import { wolfSpawn } from './wolf-collision';
import { ENCOUNTERS, encounter } from './encounters';

export const ELITE_AFFIXES = {
  swift: { name: '神速', color: '#9be1da', detail: '移动快 45%；水减速、木束缚可拦截。' },
  giant: { name: '巨化', color: '#e0c48a', detail: '体型变大，生命多 35%，移动慢 10%。' },
  regen: { name: '再生', color: '#abd99b', detail: '脱离伤害 3 秒后每秒恢复 2% 生命；持续攻击可阻止。' },
  rage: { name: '狂暴', color: '#f19b86', detail: '生命低于 40% 后加速 25%，扑咬伤害提高 50%。' },
  split: { name: '分裂', color: '#c6a4dd', detail: '死亡散出两只脆弱幼狼；幼狼不再分裂，也不掉灵力。' },
} as const;
export type EliteAffix = keyof typeof ELITE_AFFIXES;
export const hasAffix = (wolf: Pick<Wolf,'affixes'>, affix: EliteAffix): boolean => wolf.affixes?.includes(affix) ?? false;
export function rollAffixes(wave: number, rng: () => number): EliteAffix[] {
  const pool: EliteAffix[] = wave <= 2 ? ['swift','giant'] : wave <= 4 ? ['swift','giant','regen','rage'] : ['swift','giant','regen','rage','split'];
  const first = pool.splice(Math.floor(rng()*pool.length),1)[0]!;
  const remaining = pool.filter(a=>!(['giant','regen'].includes(first)&&['giant','regen'].includes(a)));
  return wave >= 5 && rng() < .65 ? [first,remaining[Math.floor(rng()*remaining.length)]!] : [first];
}
export function affixSpeed(wolf: Wolf): number {
  return (hasAffix(wolf,'swift')?1.45:1)*(hasAffix(wolf,'giant')?.9:1)*(hasAffix(wolf,'rage')&&wolf.hp/wolf.maxHp<.4?1.25:1);
}
export function affixAttack(wolf: Wolf): number { return hasAffix(wolf,'rage')&&wolf.hp/wolf.maxHp<.4?1.5:1; }
export function tickAffixes(wolf: Wolf, dt: number): void {
  const recoveryTime=Math.max(0,dt-(wolf.recentDamage??0));
  wolf.recentDamage=Math.max(0,(wolf.recentDamage??0)-dt);
  if(hasAffix(wolf,'regen')&&recoveryTime>0&&wolf.hp>0)wolf.hp=Math.min(wolf.maxHp,wolf.hp+wolf.maxHp*.02*recoveryTime);
}
export function splitElite(world: World, wolf: Wolf): void {
  if(!hasAffix(wolf,'split')||wolf.summoned)return;
  world.mechanics.effect('burst',wolf,'wood','分裂 · 幼狼散出',2);
  let spawned = 0;
  for(let i=0;i<2&&world.wolves.filter(w=>w.action!=='dead').length<ENCOUNTERS.aliveLimit;i++){
    const direction=(wolf.id*.73+i*Math.PI)%(Math.PI*2),at=wolfSpawn({x:wolf.x+Math.cos(direction)*2.2,z:wolf.z+Math.sin(direction)*2.2},.62,world.wolves,world.wards);
    if(!at)continue;
    const hp=encounter(world.wave).health*.45;
    spawned++;
    world.wolves.push({...at,id:world.allocateEntityId(),kind:'normal',summoned:true,hp,maxHp:hp,speed:wolf.speed*1.15,
      heading:direction,action:'run',age:0,attack:.8,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,
      aura:null,auraTime:0,vx:Math.cos(direction)*2,vz:Math.sin(direction)*2,pack:wolf.pack,routeAge:0,waypoint:null});
  }
  if (spawned) world.events.emit('enemySplit', { at: { x: wolf.x, z: wolf.z } });
}
