import type { World } from '../game/world';
import './waves.css';

/** The boss appears only when its real entity is on the battlefield. No wave forecasts. */
export class WaveHud {
  private readonly root=document.createElement('aside');
  private readonly label:HTMLElement;
  private readonly bar:HTMLElement;
  constructor(host:HTMLElement,private readonly world:World){
    this.root.className='wave-boss';this.root.hidden=true;this.root.setAttribute('aria-label','狼王生命');
    this.root.innerHTML='<span></span><div><i></i></div>';this.label=this.root.querySelector('span')!;this.bar=this.root.querySelector('i')!;host.append(this.root);
  }
  update(blocked:boolean):void{
    const king=this.world.wolves.find(v=>v.kind==='king'&&v.action!=='dead');
    this.root.hidden=blocked||this.world.phase!=='battle'||!king;if(!king)return;
    this.label.textContent=`狼王 · ${Math.ceil(king.hp/king.maxHp*100)}%${this.world.enemyAbilities.casting(king.id)?' · 火破阵招':''}`;
    this.bar.style.transform=`scaleX(${Math.max(0,king.hp/king.maxHp)})`;
  }
  dispose():void{this.root.remove();}
}