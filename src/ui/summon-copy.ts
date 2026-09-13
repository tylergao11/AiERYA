import type { GameEvents } from '../game/contracts';

/** Battle captions and the squad HUD describe the same resolved technique. */
export function summonTechniqueText(event: GameEvents['summonTechnique']): { title: string; detail: string } | null {
  switch(event.kind){
    case 'pincer': return {title:'合围',detail:'合围 · 双灵夹击'};
    case 'hunt': return {title:'追猎',detail:'追猎 · 自动接续目标'};
    case 'furyReady': return {title:'战意满',detail:'战意已满 · 下一击重扑'};
    case 'fury': return {title:'吞势',detail:'吞势 · 强化重击'};
    case 'seal': return event.toElement ? {title:'双印',detail:'双印 · 旧印接新令'} : {title:'旧印终结',detail:'旧印终结 · 目标已倒下'};
    case 'echo': return null;
  }
}
