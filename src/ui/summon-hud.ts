import type { World } from '../game/world';
import { SUMMON } from '../game/summon-balance';
import { SummonRoster } from './summon-roster';
import { summonIntent } from './summon-status';
import { summonTechniqueText } from './summon-copy';
import './summon.css';

const write=(node:HTMLElement,value:string)=>{if(node.textContent!==value)node.textContent=value;};

export class SummonHud {
  private readonly root = document.createElement('aside');
  private readonly title: HTMLElement;
  private readonly value: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly roster: SummonRoster;
  private readonly toggle: HTMLButtonElement;
  private collapsed = true;
  private readonly off:(()=>void)[];
  private triggeredUntil=0;
  constructor(host: HTMLElement, private readonly world: World) {
    this.root.className='summon-hud is-collapsed';this.root.hidden=true;this.root.setAttribute('aria-label','御灵共鸣');
    this.root.innerHTML='<div class="summon-heading"><span></span><strong></strong><button class="summon-fold" type="button" aria-label="展开御灵面板" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/><path class="fold-vertical" d="M12 6v12"/></svg></button></div><div class="summon-meter" role="progressbar" aria-label="共鸣" aria-valuemin="0" aria-valuemax="100"><i></i></div><div class="summon-roster" aria-label="灵体状态"></div><p></p>';
    host.append(this.root);this.title=this.root.querySelector('span')!;this.value=this.root.querySelector('strong')!;this.bar=this.root.querySelector('i')!;this.detail=this.root.querySelector('p')!;
    this.detail.setAttribute('role','status');
    this.roster=new SummonRoster(this.root.querySelector('.summon-roster')!);
    this.toggle=this.root.querySelector('.summon-fold')!;
    this.toggle.addEventListener('click',this.fold);
    this.off=[world.events.on('summonOrder',e=>{if(e.kind==='focus'||e.kind==='move')this.triggeredUntil=0;if(e.kind==='union'){this.triggeredUntil=world.time+1.6;this.detail.textContent=e.pure?'同契已授 · 接敌后释放':'合击已授 · 接敌后释放';}}),world.events.on('summonTechnique',e=>{const copy=summonTechniqueText(e);if(!copy||world.time<this.triggeredUntil)return;this.triggeredUntil=world.time+.8;this.detail.textContent=copy.detail;}),world.events.on('phase',()=>{this.triggeredUntil=0;}),world.events.on('reset',()=>{this.triggeredUntil=0;this.roster.clear();})];
  }
  update(blocked:boolean):void {
    const cmd=this.world.mechanics.commands;this.root.hidden=blocked||this.world.combatStyle!=='spirit'||!cmd.active||this.world.phase!=='battle'||cmd.stormOnly&&this.world.ultimate.active;if(this.root.hidden)return;
    this.root.classList.toggle('ready',cmd.ready);this.root.classList.toggle('mixed',this.world.build.is('slayer'));
    write(this.title,cmd.pure?'万灵同契':'御灵共鸣');this.title.title=cmd.pure?'纯召唤：合击后追加一次追击':'混合构筑：保留群灵合击';write(this.value,cmd.ready?'合击就绪':`${Math.floor(cmd.resonance)} / ${SUMMON.resonanceMax}`);
    this.bar.style.transform=`scaleX(${cmd.resonance/SUMMON.resonanceMax})`;this.bar.parentElement!.setAttribute('aria-valuenow',String(Math.floor(cmd.resonance)));
    if(!this.collapsed)this.roster.update(this.world);
    const triggered=this.world.time<this.triggeredUntil;this.root.classList.toggle('triggered',triggered);
    if(!triggered)write(this.detail,summonIntent(this.world)+(cmd.fury>0?' · 战意 '+Number(cmd.fury.toFixed(1))+'/3':''));
  }
  private readonly fold=(event:MouseEvent):void=>{
    event.stopPropagation();
    this.collapsed=!this.collapsed;
    this.root.classList.toggle('is-collapsed',this.collapsed);
    this.toggle.setAttribute('aria-expanded',String(!this.collapsed));
    this.toggle.setAttribute('aria-label',this.collapsed?'展开御灵面板':'收起御灵面板');
    this.update(false);
  };
  dispose():void {this.off.forEach(off=>off());this.toggle.removeEventListener('click',this.fold);this.roster.clear();this.root.remove();}
}
