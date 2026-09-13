import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { REWARDS } from '../src/game/roguelike';
import type { GameEvents, Wolf } from '../src/game/contracts';
import { makeSummonTechniqueArt } from '../src/render/summon-technique-art';

function setup(id: string) {
  const w = new World({ roguelike: true }); w.chooseDestiny({ serial: 1, fate: 'spirit', tier: 'ordinary', boon: 'twins', roots: ['metal'] }); w.startWave();
  const reward = REWARDS.find(r => r.id === id)!; w.build.offers = [{ ...reward, level: 1, tag: '', detail: reward.detail(1) }]; w.build.choose(id, 100);
  w.mechanics.spirits.forEach((s,i) => Object.assign(s,{x:-6,z:5+i*2}));
  const target: Wolf = { id: 9910, x: 0, z: 6, hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0, attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null };
  w.wolves = [target]; return { w, target, main: w.mechanics.spirits[0]!, twin: w.mechanics.spirits[1]!, cmd: w.mechanics.commands };
}
const stroke = [{x:-2,z:6},{x:2,z:6}];

describe('coordination pictures follow real contacts', () => {
  it('records both pincer owners and keeps the first contact source after that pet moves', () => {
    const {w,target,main,twin,cmd}=setup('spirit-pincer'),events:GameEvents['summonTechnique'][]=[];
    w.events.on('summonTechnique',e=>events.push(e));w.selected='water';w.invoke(stroke);
    cmd.land(main,target,cmd.take(main));main.x=-8;cmd.land(twin,target,cmd.take(twin));
    const e=events.find(e=>e.kind==='pincer')!;expect(e).toMatchObject({spiritId:twin.id,targetId:target.id,element:'water',from:{x:-6,z:7},partner:{spiritId:main.id,at:{x:-6,z:5},element:'water'}});
    main.x=-9;twin.x=-7;expect(e.partner!.at).toEqual({x:-6,z:5});expect(e.from).toEqual({x:-6,z:7});
    cmd.land(twin,target,cmd.take(twin));expect(events.filter(e=>e.kind==='pincer')).toHaveLength(1);
  });
  it.each([false,true])('reports a second imprint only if its contact can happen (old lethal=%s)',lethal=>{
    const {w,target,main,cmd}=setup('spirit-seal');w.selected='fire';w.invoke(stroke);cmd.land(main,target,cmd.take(main));
    const events:GameEvents['summonTechnique'][]=[],materials:string[]=[];w.events.on('summonTechnique',e=>events.push(e));w.events.on('summonImpact',e=>materials.push(e.element));
    if(lethal)target.hp=1;w.selected='water';w.invoke(stroke);cmd.land(main,target,cmd.take(main));
    const e=events.find(e=>e.kind==='seal')!;expect(e).toMatchObject({spiritId:main.id,targetId:target.id,element:'fire'});
    expect(e.toElement).toBe(lethal?undefined:'water');expect(materials).toEqual(lethal?['fire']:['fire','water']);
  });
  it('snapshots both rendered casting points and contact data without retaining mutable objects',()=>{
    const at={x:1,z:5},from={x:-3,z:5},partner={spiritId:2,at:{x:-5,z:8},element:'fire' as const};
    const point={x:210,y:150},event={kind:'pincer' as const,spiritId:1,targetId:7,at,from,element:'water' as const,partner};
    const art=makeSummonTechniqueArt(event,()=>point);at.x=20;from.z=30;partner.at.x=40;point.x=700;
    expect(art.at).toEqual({x:1,z:5});expect(art.from).toEqual({x:-3,z:5});expect(art.partner!.at).toEqual({x:-5,z:8});expect(art.source.x).toBe(210);expect(art.partnerSource!.x).toBe(210);
    const fallback=makeSummonTechniqueArt(event,()=>undefined);expect(Number.isFinite(fallback.source.x)).toBe(true);
  });
});
