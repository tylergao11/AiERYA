import type { World } from '../game/world';
import { summonStatus } from './summon-status';

/** Reuse the actual painted bodies, including the ancestor silhouette. */
export function summonPortrait(element: string, beast = false, closeup=false): string {
  const boxes:Record<string,string>={metal:'0 70 308 435',wood:'319 65 291 456',water:'611 73 312 451',fire:'923 70 285 458',earth:'1210 116 326 398'};
  const faces:Record<string,string>={metal:'85 125 175 305',wood:'405 155 205 310',water:'695 95 220 285',fire:'992 88 220 320',earth:'1270 137 266 320'};
  return `<svg viewBox="${beast?closeup?'390 75 365 355':'0 0 768 512':(closeup?faces:boxes)[element]}" aria-hidden="true"><image href="./art/${beast?'ancestor-beast':'element-spirit'}-atlas.webp" width="1536" height="1024"/></svg>`;
}

interface PetNode {root:HTMLElement;portrait:HTMLElement;name:HTMLElement;state:HTMLElement;role:HTMLElement;pips:HTMLElement[];warnings:HTMLElement[];order:HTMLElement;count:HTMLElement;growth:HTMLElement;growthText:HTMLElement;growthBar:HTMLElement;marks:number;fedUntil:number;identity:string;label:string}
/** Keep illustrated nodes stable while state, charges and targets change. */
export class SummonRoster {
  private readonly pets=new Map<number,PetNode>();
  constructor(private readonly root:HTMLElement){}
  update(world:World):void {
    const live=new Set(world.mechanics.spirits.map(s=>s.id));
    for(const [id,node] of this.pets)if(!live.has(id)){node.root.remove();this.pets.delete(id);}
    for(const spirit of world.mechanics.spirits){
      const s=summonStatus(world,spirit);let node=this.pets.get(s.id);
      if(!node){const root=document.createElement('span');root.className='summon-pet';root.setAttribute('role','img');root.dataset.spiritId=String(s.id);
        root.innerHTML='<span class="summon-avatar"></span><span class="summon-pet-copy"><b></b><small><em></em><span></span></small></span><span class="summon-stock" aria-hidden="true"><span class="summon-order-element"></span><sup></sup><i><u></u><s></s></i><i><u></u><s></s></i><i><u></u><s></s></i><i><u></u><s></s></i></span><span class="summon-growth" hidden aria-hidden="true"><span></span><i><u></u></i></span>';
        node={root,portrait:root.querySelector('.summon-avatar')!,name:root.querySelector('b')!,state:root.querySelector('small span')!,role:root.querySelector('em')!,pips:[...root.querySelectorAll<HTMLElement>('.summon-stock u')],warnings:[...root.querySelectorAll<HTMLElement>('.summon-stock s')],order:root.querySelector('.summon-order-element')!,count:root.querySelector('sup')!,growth:root.querySelector('.summon-growth')!,growthText:root.querySelector('.summon-growth>span')!,growthBar:root.querySelector('.summon-growth u')!,marks:-1,fedUntil:0,identity:'',label:''};
        this.pets.set(s.id,node);this.root.append(root);
      }
      const identity=`${spirit.element}:${s.beast}`;
      if(identity!==node.identity){node.identity=identity;node.portrait.innerHTML=summonPortrait(spirit.element,s.beast,true);}
      if(s.growth&&node.marks>=0&&s.growth.marks>node.marks)node.fedUntil=world.time+.58;
      node.marks=s.growth?.marks??-1;node.root.classList.toggle('feeding',world.time<node.fedUntil);
      if(s.label===node.label)continue;node.label=s.label;
      node.root.setAttribute('aria-label',s.label);node.root.title=s.label;node.root.dataset.element=s.element??spirit.element;
      node.root.classList.toggle('silenced',s.silenced||s.suppressed);node.root.classList.toggle('infused',s.stock>0);node.root.classList.toggle('united',s.united);node.root.dataset.state=s.state;
      node.root.classList.toggle('expiring',s.expiry.stock>0);node.root.classList.toggle('union-expiring',s.expiry.union);
      node.name.textContent=s.name;node.role.textContent=s.style==='近战'?'近':'远';node.state.textContent=(spirit.hp??1)<=0?s.state:`${s.state} ${Math.ceil((spirit.hp??1)/(spirit.maxHp??1)*100)}%`;
      node.pips.forEach((pip,i)=>pip.style.transform=`scaleX(${Math.max(0,Math.min(1,s.stock-i))})`);
      node.warnings.forEach((pip,i)=>pip.style.transform=`scaleX(${Math.max(0,Math.min(1,s.expiry.stock-i))})`);
      node.order.textContent=s.orderElement;node.count.textContent=(s.stock>0?s.stockText:'')+(s.united?'◆':'');
      node.growth.hidden=!s.growth;node.root.classList.toggle('evolved',!!s.growth?.evolved);
      if(s.growth){node.growthText.textContent=s.growth.evolved?'已蜕变':`${s.growth.marks}/${s.growth.goal}`;node.growthBar.style.transform=`scaleX(${s.growth.marks/s.growth.goal})`;}
    }
  }
  clear():void {this.pets.clear();this.root.replaceChildren();}
}
