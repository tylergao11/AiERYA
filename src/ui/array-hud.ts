import type { World } from '../game/world';
import { ARRAY, ARRAY_SUPPORT_NAMES } from '../game/array-balance';
import { ROOT_NAMES } from '../game/roguelike';
import { ARRAY_TINT } from '../render/array-momentum';

export class ArrayHud {
  private readonly root=document.createElement('aside');
  private readonly eyes:HTMLElement;
  private readonly message:HTMLElement;
  private readonly title:HTMLElement;
  private readonly flourish:HTMLElement;
  private flourishUntil=0;
  private messageUntil=0;
  private readonly off:(()=>void)[];
  private signature='';
  constructor(host:HTMLElement,private readonly world:World){
    this.root.className='array-hud';this.root.hidden=true;this.root.setAttribute('aria-label','阵势与纯阵合鸣');
    this.root.innerHTML='<button class="array-hud-title" data-action="build" aria-label="查看阵势说明"></button><div class="array-eyes"></div><div class="array-hud-message" role="status"></div><div class="array-flourish" aria-hidden="true"><small></small><strong></strong><i></i></div>';
    this.title=this.root.querySelector('.array-hud-title')!;this.eyes=this.root.querySelector('.array-eyes')!;this.message=this.root.querySelector('.array-hud-message')!;
    this.flourish=this.root.querySelector('.array-flourish')!;
    host.append(this.root);this.off=[world.events.on('arrayEffect',e=>{
      if(e.kind==='mark'||e.kind==='feed')return;const now=performance.now();this.message.textContent=e.label;this.messageUntil=now+1900;
      const harmony=e.kind==='harmony'||e.label.includes('周天');
      if(harmony||(e.kind==='release'&&e.energy>=70&&now>this.flourishUntil)){
        this.flourish.dataset.harmony=String(harmony);this.flourish.querySelector('small')!.textContent=harmony?'诸阵同鸣 · 一笔贯通':'阵势奔涌 · 放势';
        this.flourish.querySelector('strong')!.textContent=harmony?(e.label.includes('周天')?'周天合鸣':'纯阵合鸣'):e.label.replace('五行归一 · ','');
        this.flourishUntil=now+1450;this.root.classList.add('array-flaring');
      }
    }),world.events.on('reset',()=>{this.messageUntil=0;this.flourishUntil=0;this.signature='';this.root.classList.remove('array-flaring');}),world.events.on('phase',e=>{if(e.phase!=='battle'){this.flourishUntil=0;this.root.classList.remove('array-flaring');}})];
  }
  update(blocked:boolean):void{
    const system=this.world.mechanics.arrays;this.root.hidden=blocked||this.world.combatStyle!=='array'||!system.active||!['prepare','battle'].includes(this.world.phase);if(this.root.hidden)return;
    this.root.classList.toggle('array-flaring',this.world.phase==='battle'&&performance.now()<this.flourishUntil);
    this.root.dataset.mixed=String(this.world.build.is('slayer')||this.world.build.is('spirit'));
    this.root.dataset.summon=String(this.world.build.is('spirit')&&!this.world.build.is('slayer')&&this.world.phase==='battle');
    this.title.textContent=system.pure?'阵势 · 纯阵合鸣':'阵势 · 五行运转';
    const nodes=system.nodes,signature=nodes.map(n=>`${n.id}:${n.ward.element}`).join(',');
    if(signature!==this.signature){this.signature=signature;this.eyes.innerHTML=nodes.map(n=>`<span class="array-eye" data-eye="${n.id}" style="--array-tint:${ARRAY_TINT[n.ward.element]}"><b>${ROOT_NAMES[n.ward.element]}</b><i role="progressbar" aria-label="${ROOT_NAMES[n.ward.element]}阵势" aria-valuemin="0" aria-valuemax="100"><em></em></i><small>0</small><span class="array-assist-status"></span></span>`).join('');}
    for(const node of nodes){const el=this.eyes.querySelector<HTMLElement>(`[data-eye="${node.id}"]`)!;const energy=system.charge(node.id)?.energy??0;
      el.classList.toggle('ready',energy>=ARRAY.ready);el.classList.toggle('full',energy>=ARRAY.capacity-.1);el.querySelector('small')!.textContent=String(Math.floor(energy));el.querySelector<HTMLElement>('em')!.style.transform=`scaleX(${energy/ARRAY.capacity})`;
      el.classList.toggle('silenced',node.ward.suppressed>0||this.world.enemyAbilities.silenced(node));el.querySelector('i')!.setAttribute('aria-valuenow',String(Math.floor(energy)));
      const assists=system.support.fields.filter(f=>f.ward.id===node.id),status=el.querySelector<HTMLElement>('.array-assist-status')!;
      status.textContent=assists.map(f=>ARRAY_SUPPORT_NAMES[f.element].split(' · ')[1]!.slice(0,2)).join('·');status.hidden=!assists.length;
      status.title=assists.map(f=>`${ARRAY_SUPPORT_NAMES[f.element]} · ${f.remaining.toFixed(1)} 秒`).join('；');
    }
    const charged=nodes.filter(n=>(system.charge(n.id)?.energy??0)>=ARRAY.ready&&n.ward.suppressed<=0&&!this.world.enemyAbilities.silenced(n));
    const pair=system.harmonyReady;
    this.root.classList.toggle('harmony-ready',system.pure&&pair);
    if(performance.now()>this.messageUntil)this.message.textContent=!nodes.length?'留痕五秒 · 相生续势，相克引爆':system.pure?pair?'合鸣就绪 · 同系划过阵眼放势触发':`邻近两阵各 ${ARRAY.ready} 势且有敌 → 合鸣 · ${charged.length} 阵蓄足`:`${system.readyCount} 阵可放 · 相生传势，相克放势`;
  }
  dispose():void{this.off.forEach(off=>off());this.root.remove();}
}
