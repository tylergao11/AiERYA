import { describe, expect, it } from 'vitest';
import { REWARDS, OPPORTUNITIES, RunBuild } from '../src/game/roguelike';
import { rewardExample, exampleMarkup } from '../src/ui/reward-examples';
import { ImpactMotion } from '../src/render/impact-motion';

describe('all random offers explain a visible consequence',()=>{
  it('covers every ordinary reward and opportunity with a short explicit case',()=>{
    const offers=[...REWARDS.map(r=>({...r,detail:r.detail(1),tag:'',level:1})),...OPPORTUNITIES];
    for(const r of offers){const e=rewardExample(r);expect(e.steps.length).toBeGreaterThan(1);expect(e.result.length).toBeLessThan(40);expect(exampleMarkup(e)).toContain('aria-label="举例：');}
  });
  it('keeps the cost of overdrive and the condition of focusing visible',()=>{
    const base={title:'',detail:'',tag:'',level:2};expect(rewardExample({...base,id:'common-overdrive'}).result).toContain('−20%');expect(rewardExample({...base,id:'slayer-focus'}).steps[0]).toContain('满蓄');expect(rewardExample({...base,id:'slayer-focus'}).result).toContain('45%');
  });
  it('all array awakenings illustrate terrain-preserving auxiliary relay',()=>{
    const b=new RunBuild(),r={id:'awaken',title:'',detail:'',tag:'',level:1};b.begin({serial:1,fate:'array',boon:'living',tier:'unusual',roots:['earth']});expect(rewardExample(r,b).result).toContain('原位保留');b.begin({serial:2,fate:'array',boon:'fivefold',tier:'ordinary',roots:['earth']});expect(rewardExample(r,b).result).toContain('原位保留');
  });
  it('keeps ancestor art in the summon lane and shows fivefold as an array mechanism',()=>{
    const r={id:'opportunity-beast',title:'',detail:'',tag:'',level:1};expect(exampleMarkup(rewardExample(r))).toContain('ancestor-beast-atlas.webp');expect(rewardExample({...r,id:'opportunity-fivefold'}).arrayMechanic).toBe('opportunity-fivefold');expect(rewardExample({...r,id:'opportunity-twins'}).companion).toBe(true);
  });
  it('gives each Slayer route a distinct diagram and preserves the actual follow-up condition', () => {
    const build = new RunBuild(); build.begin({ serial: 1, fate: 'slayer', boon: 'three', tier: 'ordinary', roots: ['metal'] });
    const ids = ['slayer-edge', 'slayer-return', 'slayer-focus', 'opportunity-three', 'opportunity-scar', 'opportunity-debt', 'awaken', 'ascend'];
    const drawings = ids.map(id => {
      const example = rewardExample({ id, title: '', detail: '', tag: '', level: 1 }, build);
      expect(example.slayerMechanic).toBe(id);
      const markup = exampleMarkup(example); expect(markup).toContain('class="slayer-diagram"');
      expect(markup).not.toContain('undefined'); expect(markup).not.toContain('NaN'); return markup;
    });
    expect(new Set(drawings).size).toBe(ids.length);
    expect(drawings[1]).toContain('交叉空段'); expect(drawings[1]).toContain('牵回远端'); expect(drawings[2]).toContain('满蓄开破绽');
    expect(drawings[5]).toContain('2.2 秒内接快刀'); expect(drawings[7]).toContain('三笔标准投入');
  });
});
describe('screen feedback stays bounded and drawing stays still',()=>{
  it('decays quickly and never exceeds the screen-space limit',()=>{const m=new ImpactMotion();m.kick(200);for(let i=0;i<20;i++){const p=m.update(1/60);expect(Math.abs(p.x)).toBeLessThanOrEqual(4.5);expect(Math.abs(p.y)).toBeLessThanOrEqual(2.16);}expect(m.update(.1)).toEqual({x:0,y:0});});
  it('cancels pending shaking while a finger is tracing',()=>{const m=new ImpactMotion();m.kick(4);expect(m.update(.01,true)).toEqual({x:0,y:0});expect(m.update(.01)).toEqual({x:0,y:0});});
});
