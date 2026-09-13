import {describe,it,expect,vi} from 'vitest';
import {World} from '../src/game/world';
import {REWARDS} from '../src/game/roguelike';
import type {Ward,Wolf} from '../src/game/contracts';
import {summonIntent,summonStatus} from '../src/ui/summon-status';
import {summonBuild} from '../src/ui/summon-build';

function setup(){const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['wood']});w.mechanics.spirits.forEach((s,i)=>Object.assign(s,{x:-6,z:4+i}));return w;}
function learn(w:World,id:string){const r=REWARDS.find(r=>r.id===id)!;w.build.offers=[{...r,level:1,tag:'',detail:r.detail(1)}];expect(w.build.choose(id,100)).not.toBeNull();}

describe('summoner UI reports actual roles, intent and finite stock without advancing combat',()=>{
  it('shows autonomous contact, current focus and real rally instead of claiming an attacking party is waiting',()=>{
    const w=setup(),cmd=w.mechanics.commands,s=w.mechanics.spirits[0]!;w.startWave();
    const target:Wolf={id:501,x:-4,z:5,hp:100,maxHp:100,action:'run',kind:'normal',speed:0,heading:0,age:0,attack:0,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null};w.wolves=[target];s.targetId=target.id;
    expect(summonIntent(w)).toBe('自主接敌');cmd.targetId=target.id;expect(summonIntent(w)).toMatch(/^集火 · /);
    target.action='dead';expect(summonIntent(w)).toBe('点按指挥 · 划线强化');cmd.command({x:-8,z:8});expect(summonIntent(w)).toBe('前往集合点');
    cmd.resonance=100;expect(summonIntent(w)).toBe('划线授令 · 发动合击');
  });
  it('keeps native role and movement visible while an order is stocked',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!;w.startWave();w.wolves=[];w.selected='water';expect(w.invoke([{x:-1,z:6},{x:0,z:6}])).toBe(true);
    expect(w.mechanics.commands.command({x:-8,z:8})).toBe(true);
    const before=structuredClone(s),state=summonStatus(w,s);
    expect(state).toMatchObject({name:'木主灵',style:'近战',state:'集合',element:'water',stock:.5});expect(state.label).toContain('0.5 份');expect(s).toEqual(before);
    const destination=w.mechanics.commands.destination(s)!;Object.assign(s,destination);w.mechanics.commands.destination(s);
    expect(summonStatus(w,s).state).toBe('驻守');
  });
  it('does not claim a bound spirit is moving to the global rally',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!;w.startWave();w.wolves=[];w.mechanics.commands.command({x:-8,z:8});
    s.wardId=123;w.wards.push({id:123,health:100,suppressed:0} as Ward);
    expect(summonStatus(w,s).state).toBe('守阵');w.wards[0]!.suppressed=1;expect(summonStatus(w,s).state).toBe('受压');
  });
  it('shows silence separately from a prepared union and retains its real stock',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!;w.startWave();w.wolves=[];w.mechanics.commands.resonance=100;
    expect(w.invoke([{x:-2,z:6},{x:2,z:6}])).toBe(true);
    const spy=vi.spyOn(w.enemyAbilities,'silenced').mockReturnValue(true);
    const state=summonStatus(w,s);expect(state.state).toBe('沉默');expect(state.united).toBe(true);expect(state.order).toBe('合击待发');expect(state.stock).toBe(2);spy.mockRestore();
  });
  it('keeps tiny remaining amounts distinct from zero',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!;const spy=vi.spyOn(w.mechanics.commands,'amount').mockReturnValue(.02);
    expect(summonStatus(w,s).quantity).toBe('不足0.1');spy.mockRestore();
  });
  it('warns only about old paid stock when a fresh order changes its element',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!,cmd=w.mechanics.commands;w.startWave();w.wolves=[];
    w.selected='fire';w.invoke([{x:-2,z:6},{x:2,z:6}]);cmd.tick(6.1);
    w.selected='water';w.invoke([{x:-2,z:6},{x:2,z:6}]);
    const before=[w.time,w.health,w.spirit,w.kills,cmd.amount(s.id)],body=structuredClone(s),status=summonStatus(w,s);
    expect(status).toMatchObject({stock:4,stockText:'4',orderElement:'水',expiry:{stock:2,union:false}});
    expect(status.label).toContain('其中 2 份即将消散');expect([w.time,w.health,w.spirit,w.kills,cmd.amount(s.id)]).toEqual(before);expect(s).toEqual(body);
    cmd.take(s);expect(summonStatus(w,s)).toMatchObject({stock:3,expiry:{stock:1}});
    cmd.tick(2);expect(summonStatus(w,s)).toMatchObject({stock:2,expiry:{stock:0}});expect(summonStatus(w,s).label).not.toContain('即将消散');
  });
  it('keeps the union deadline distinct from ordinary stock and clears both on reset',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!,cmd=w.mechanics.commands;w.startWave();w.wolves=[];cmd.resonance=100;
    w.invoke([{x:-2,z:6},{x:2,z:6}]);cmd.tick(6.1);expect(summonStatus(w,s)).toMatchObject({stock:2,united:true,expiry:{stock:2,union:false}});
    cmd.tick(4);expect(summonStatus(w,s)).toMatchObject({stock:0,united:true,expiry:{stock:0,union:true}});expect(summonStatus(w,s).label).toContain('合击即将消散');
    cmd.clear();expect(summonStatus(w,s)).toMatchObject({stock:0,united:false,expiry:{stock:0,union:false}});
  });
  it('invalidates the roster text cache when an equally stocked union changes element',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!,cmd=w.mechanics.commands;w.startWave();w.wolves=[];cmd.resonance=100;w.selected='fire';
    const line=[{x:-2,z:6},{x:2,z:6}];w.invoke(line);w.invoke(line);const before=summonStatus(w,s);
    cmd.resonance=100;w.selected='water';w.invoke(line);const after=summonStatus(w,s);
    expect(before.stock).toBe(4);expect(after.stock).toBe(4);expect(before.united&&after.united).toBe(true);
    expect(after.orderElement).toBe('水');expect(after.label).not.toBe(before.label);expect(after.label).toContain('合击待发（水）');
  });
  it('explains current purity and names the skill that broke it',()=>{
    const w=setup();learn(w,'common-regen');learn(w,'root-water-ripple');expect(summonBuild(w)).toContain('纯召唤 · 合击后全队追击');
    learn(w,'slayer-edge');const html=summonBuild(w);expect(html).toContain('纯系追击未生效');expect(html).toContain('已兼修'+REWARDS.find(r=>r.id==='slayer-edge')!.title);expect(html).not.toContain('纯召唤 · 合击后全队追击');
  });
  it('makes preparation changes accessible and keeps ancestor roles melee for every element',()=>{
    const w=setup(),s=w.mechanics.spirits[0]!;expect(summonBuild(w)).toContain('切换本命 ↻');
    w.startWave();expect(summonBuild(w)).toContain('战中本命固定');expect(summonBuild(w)).toContain(`data-spirit="${s.id}" disabled`);
    const beast=new World({roguelike:true});beast.chooseDestiny({serial:1,fate:'spirit',tier:'unusual',boon:'beast',roots:['fire']});
    expect(summonBuild(beast)).toContain('火祖兽<span>近战</span>');expect(summonBuild(beast)).not.toContain('远射火羽');
  });
});
