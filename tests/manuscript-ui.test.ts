import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { World } from '../src/game/world';
import { BOONS, OPPORTUNITIES, REWARDS, RunBuild, type Boon } from '../src/game/roguelike';
import { boonArt, rewardArt, rewardCondition, rewardSummary } from '../src/ui/manuscript-art';
import { openingPanel } from '../src/ui/birth-panel';
import { rewardPanel } from '../src/ui/rogue-panel';

describe('manuscript UI preserves decisions while removing redundant copy', () => {
  it('provides distinct art for all nine starting abilities and valid assets for all rewards', () => {
    expect(new Set(Object.keys(BOONS).map(b=>boonArt(b as Boon))).size).toBe(9);
    for (const r of [...OPPORTUNITIES,...REWARDS.map(r=>({...r,detail:r.detail(1),level:1,tag:''}))]) {
      const markup=rewardArt(r), path=markup.match(/url\('([^']+)'\)/)![1]!;
      expect(existsSync(`public${path}`),r.id).toBe(true);
    }
    expect(rewardArt({id:'spirit-command',title:'',detail:'',level:1,tag:''})).not.toBe(rewardArt({id:'spirit-hunt',title:'',detail:'',level:1,tag:''}));
  });
  it('keeps all selected abilities and numeric costs accessible, including paired heaven talents', () => {
    const w=new World({roguelike:true});
    w.birthDraft.candidates=[{serial:1,fate:'slayer',tier:'heaven',boon:null,roots:['metal']},{serial:2,fate:'array',tier:'unusual',boon:'living',roots:['earth']}];
    w.birthDraft.toggle(1);w.birthDraft.toggle(2);
    const html=openingPanel(w);
    expect(html).toContain('已选 2 项，共需 2 项');
    expect(html).toContain('heaven-art');
    expect(html).toContain('灵力 / 次');
    expect(html).not.toContain('无限重抽');
    expect(html).not.toContain('自由混搭');
    expect(html.match(/data-selected="true"/g)).toHaveLength(2);
  });
  it('keeps dormant conditions, penalties and complete mechanics available', () => {
    const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:'slayer',tier:'ordinary',boon:'scar',roots:['metal']});
    w.phase='rest';w.wave=1;
    const pool=w.build.rewardPool(100).map(p=>p.reward);
    w.build.offers=['spirit-command','common-overdrive','reaction-cycle'].map(id=>pool.find(r=>r.id===id)!);
    const html=rewardPanel(w);
    expect(html).toContain('需御灵机缘');
    expect(html).toContain('−20%');
    expect(html).toContain('6 秒内三种相生');
    expect(html).toContain('同种不能重复充数');
    expect(html).not.toContain('整批随机重抽');
    expect(html.match(/data-upgrade=/g)).toHaveLength(3);
    expect(rewardCondition(w.build.offers[0]!)).not.toContain('尚未生效：');
  });
  it('does not hide the consequence of leaving a pure summoner build', () => {
    const b=new RunBuild();b.begin({serial:1,fate:'spirit',tier:'ordinary',boon:'twins',roots:['wood']});
    const r=b.rewardPool(100).map(p=>p.reward).find(r=>r.id==='slayer-edge')!;
    expect(rewardSummary(r,b)).toContain('失去万灵同契');
  });
});
