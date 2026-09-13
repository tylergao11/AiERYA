import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { CombatFeedback } from '../src/render/combat-feedback';
import { SummonLabels, summonDetailScale } from '../src/render/summon-labels';
import { summonTechniqueText } from '../src/ui/summon-copy';
import { layoutCombatLabels } from '../src/render/combat-labels';
import type { Wolf } from '../src/game/contracts';
import { REWARDS } from '../src/game/roguelike';

afterEach(()=>vi.unstubAllGlobals());
function setup(){const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'spirit',boon:'twins',tier:'ordinary',roots:['fire']});world.startWave();world.wolves=[];return world;}
function canvas(){
  const drawn:{text:string;size:number;x:number;y:number;color:string}[]=[];
  const c={font:'',fillStyle:'',save(){},restore(){},strokeText(){},measureText(text:string){return {width:text.length*parseFloat(this.font.split(' ')[1]!)*.8};},fillText(text:string,x:number,y:number){drawn.push({text,size:parseFloat(this.font.split(' ')[1]!),x,y,color:this.fillStyle});}};
  return {drawn,c:c as unknown as CanvasRenderingContext2D};
}
const damage={at:{x:0,z:5},targetId:1,amount:48,element:'fire' as const,source:'companion' as const,ongoing:false};
const technique={kind:'pincer' as const,at:{x:0,z:5},from:{x:-5,z:5},element:'fire' as const};

describe('summoner battle text has one legible hierarchy',()=>{
  it.each([.2,.244,.4,.7])('keeps actual companion damage readable at camera scale %s',scale=>{
    const w=setup(),feedback=new CombatFeedback(w),{c,drawn}=canvas(),before=[w.time,w.health,w.spirit,w.kills];
    w.events.emit('damage',damage);feedback.paint(c,scale);expect(drawn).toHaveLength(1);
    expect(drawn[0]!.size*scale).toBeGreaterThanOrEqual(12);expect(drawn[0]!.color).toBe('#e3d6b7');expect([w.time,w.health,w.spirit,w.kills]).toEqual(before);feedback.dispose();
  });
  it('lets a technique title and fresh damage share one layout without covering reserved bodies',()=>{
    const w=setup(),feedback=new CombatFeedback(w),{c,drawn}=canvas();
    for(let i=0;i<12;i++)w.events.emit('summonTechnique',technique);
    w.events.emit('damage',damage);feedback.paint(c,.244,[{x:760,y:470,width:80,height:80}]);
    expect(drawn.filter(d=>d.text==='合围')).toHaveLength(1);expect(drawn.some(d=>d.text==='48')).toBe(true);
    for(const a of drawn)for(const b of drawn)if(a!==b)expect(Math.abs(a.y-b.y)>Math.min(a.size,b.size)||Math.abs(a.x-b.x)>50).toBe(true);
    expect(drawn.every(d=>d.y<470||d.x<700||d.x>900)).toBe(true);feedback.dispose();
  });
  it('uses the same truthful old-imprint text for the squad HUD and battlefield, then clears it on phase change',()=>{
    const w=setup(),labels=new SummonLabels(w),event={...technique,kind:'seal' as const};
    w.events.emit('summonTechnique',event);expect(labels.labels(1,()=>50)[0]!.text).toBe(summonTechniqueText(event)!.title);
    expect(summonTechniqueText(event)).toEqual({title:'旧印终结',detail:'旧印终结 · 目标已倒下'});
    expect(summonTechniqueText({...event,toElement:'water'})!.title).toBe('双印');
    w.events.emit('phase',{phase:'rest'});expect(labels.labels(1,()=>50)).toEqual([]);labels.dispose();
    w.events.emit('summonTechnique',technique);expect(labels.labels(1,()=>50)).toEqual([]);
  });
  it('replaces stale order captions on rapid input and never labels an echo as a new technique',()=>{
    const w=setup(),labels=new SummonLabels(w),at={x:1,z:5};
    for(const element of ['fire','water','metal'] as const)w.events.emit('summonOrder',{kind:'infuse',at,element,spiritIds:[]});
    at.x=20;w.events.emit('summonTechnique',{...technique,kind:'echo'});
    const marks=labels.labels(1,()=>50);expect(marks).toHaveLength(1);expect(marks[0]!.text).toBe('破锋');expect(marks[0]!.p.x).toBe(828);
    labels.update(0);expect(labels.labels(1,()=>50)).toEqual(marks);labels.update(1.1);expect(labels.labels(1,()=>50)).toEqual([]);labels.dispose();
  });
  it('gives current contact priority over an older full buffer of continuing damage',()=>{
    const w=setup(),feedback=new CombatFeedback(w),{c,drawn}=canvas();
    for(let i=0;i<80;i++)w.events.emit('damage',{...damage,targetId:i,amount:1,ongoing:true,at:{x:-12+i%5*5,z:2+Math.floor(i/5)%5*3}});
    feedback.update(.12);w.events.emit('damage',{...damage,targetId:101,amount:777});w.events.emit('summonTechnique',technique);feedback.paint(c,.244);
    expect(drawn[0]!.text).toBe('合围');expect(drawn.some(d=>d.text==='777')).toBe(true);expect(drawn.length).toBeLessThanOrEqual(12);feedback.dispose();
  });
  it('totals only same-target near-simultaneous summon contacts, keeping later echoes and burn ticks separate',()=>{
    const w=setup(),feedback=new CombatFeedback(w),{c,drawn}=canvas();
    w.events.emit('damage',damage);w.events.emit('damage',{...damage,amount:12,source:'steam'});feedback.paint(c,.4);
    expect(drawn.map(d=>d.text)).toEqual(['60']);drawn.length=0;
    feedback.update(.2);w.events.emit('damage',{...damage,amount:17});w.events.emit('damage',{...damage,amount:3,ongoing:true});feedback.paint(c,.4);
    expect(drawn.some(d=>d.text==='17')).toBe(true);expect(drawn.some(d=>d.text==='60')).toBe(true);expect(drawn.some(d=>d.text==='灼 3')).toBe(true);feedback.dispose();
  });
  it('shows the actual combined health loss when old and new imprints resolve together',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!,cmd=w.mechanics.commands,feedback=new CombatFeedback(w),{c,drawn}=canvas();
    Object.assign(s,{x:-6,z:5});const reward=REWARDS.find(r=>r.id==='spirit-seal')!;w.build.offers=[{...reward,level:1,tag:'',detail:reward.detail(1)}];w.build.choose(reward.id,100);
    const target={id:9910,x:0,z:6,hp:10000,maxHp:10000,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null} as Wolf;w.wolves=[target];
    const stroke=[{x:-2,z:6},{x:2,z:6}];w.selected='fire';w.invoke(stroke);cmd.land(s,target,cmd.take(s));feedback.update(1.2);
    const before=target.hp;w.selected='water';w.invoke(stroke);cmd.land(s,target,cmd.take(s));feedback.paint(c,.4);
    expect(drawn.filter(d=>/^\d+$/.test(d.text)).map(d=>d.text)).toEqual([String(Math.round(before-target.hp))]);feedback.dispose();
  });
  it('limits permanent status text to the focus target and leaves other enemies to their material effects',()=>{
    const w=setup(),feedback=new CombatFeedback(w),{c,drawn}=canvas();
    w.wolves=[{id:1,x:0,z:5,action:'run',rooted:0,slowAmount:.35},{id:2,x:8,z:5,action:'run',rooted:1,slowAmount:0}] as Wolf[];
    w.mechanics.commands.targetId=1;feedback.paint(c,.4);expect(drawn.map(d=>d.text)).toEqual(['减速']);feedback.dispose();
  });
  it('keeps dense technique captions bounded and finite under extreme projection inputs',()=>{
    const w=setup(),labels=new SummonLabels(w);for(let i=0;i<30;i++)w.events.emit('summonTechnique',{...technique,at:{x:-14+i%6*5,z:3+Math.floor(i/6)*3}});
    for(const scale of [NaN,Infinity,0,-1,.01,10])expect(Number.isFinite(summonDetailScale(scale))).toBe(true);
    const d=summonDetailScale(.244),marks=labels.labels(d,(s,n)=>s.length*n*.8),result=layoutCombatLabels(marks,[],{spacing:d,limit:12});
    expect(marks.length).toBeLessThanOrEqual(6);expect(result.length).toBeGreaterThan(0);labels.dispose();
  });
  it('keeps a new number beside a tall companion when all upward positions are occupied',()=>{
    const label={p:{x:800,y:520},text:'77',size:30,width:42,color:'#fff',alpha:1,priority:2},body={x:730,y:280,width:140,height:290};
    expect(layoutCombatLabels([label],[body],{spacing:2})).toEqual([]);
    const placed=layoutCombatLabels([label],[body],{spacing:2,sideLanes:true});expect(placed).toHaveLength(1);expect(Math.abs(placed[0]!.p.x-label.p.x)).toBeLessThanOrEqual(128);expect(placed[0]!.p.y).toBe(label.p.y);
  });
});
