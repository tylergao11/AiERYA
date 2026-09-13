import { describe, expect, it } from 'vitest';
import { PanelNavigation } from '../src/ui/panel-navigation';
import { pausePanel, restartPanel, resultPanel } from '../src/ui/common-panels';
import { birthDetail, openingPanel } from '../src/ui/birth-panel';
import { buildPanel } from '../src/ui/rogue-panel';
import { helpPanel, HELP_CHAPTERS, type HelpChapter } from '../src/ui/help-panel';
import { World } from '../src/game/world';
import type { Destiny } from '../src/game/roguelike';

const talents: Destiny[] = [
  { serial: 1, fate: 'slayer', boon: 'three', tier: 'ordinary', roots: ['metal'] },
  { serial: 2, fate: 'spirit', boon: 'twins', tier: 'ordinary', roots: ['water'] },
  { serial: 3, fate: 'array', boon: 'living', tier: 'unusual', roots: ['earth'] },
];
describe('utility menu navigation', () => {
  it('returns a nested guide or restart dialog to pause without releasing the game', () => {
    const n = new PanelNavigation(); n.open('pause'); n.open('build'); n.open('restart');
    n.back(); expect(n.current).toBe('build'); expect(n.active).toBe(true);
    n.back(); expect(n.current).toBe('pause'); expect(n.has('pause')).toBe(true);
    n.back(); expect(n.active).toBe(false);
  });
  it('closes a guide opened from battle, with no invented pause screen', () => {
    const n = new PanelNavigation(); n.open('help'); n.back(); expect(n.active).toBe(false);
  });
  it('revisits an existing screen without cycles and clears the stack on restart', () => {
    const n = new PanelNavigation(); n.open('pause'); n.open('help'); n.open('build'); n.open('pause');
    expect(n.current).toBe('pause'); n.back(); expect(n.active).toBe(false);
    n.open('build'); n.open('restart'); n.clear(); expect(n.active).toBe(false);
  });
});
describe('entry handbook before choosing a build', () => {
  it('shows the illustrated basics and general rules without choosing a talent for the player', () => {
    const w = new World({ roguelike: true });
    const candidates = structuredClone(w.birthDraft.candidates);
    const html = helpPanel('basics', w, true);
    expect(html.match(/class="handbook-painting"/g)).toHaveLength(3);
    for (const title of ['圈地成阵', '即时出招', '停时齐发', '杀伐重斩']) expect(html).toContain(title);
    expect(html).toContain('战斗中杀伐每秒自然恢复');
    expect(html).not.toContain('当前战斗每秒自然恢复');
    expect(w.phase).toBe('destiny'); expect(w.build.active).toBe(false);
    expect(w.birthDraft.candidates).toEqual(candidates); expect(w.birthDraft.selected.size).toBe(0);
  });
  it('keeps the entry action across chapters and uses the ordinary return action when revisited', () => {
    const w = new World({ roguelike: true });
    for (const chapter of Object.keys(HELP_CHAPTERS) as HelpChapter[]) {
      const html = helpPanel(chapter, w, true);
      expect(html).toContain('data-action="back">开始修行</button>');
      expect(html).toContain(`data-chapter="${chapter}" aria-pressed="true"`);
    }
    w.chooseDestiny(talents[0]!);
    const revisited = helpPanel('basics', w);
    expect(revisited).toContain('data-action="back">返回</button>');
    expect(revisited).not.toContain('开始修行');
    expect(revisited).toContain('当前战斗每秒自然恢复');
  });
});
describe('mobile decisions and readable build identity', () => {
  it('can inspect all candidates after selecting two without changing either selection', () => {
    const w = new World({ roguelike: true }); w.birthDraft.candidates = talents;
    w.birthDraft.toggle(1); w.birthDraft.toggle(2);
    for (const t of talents) {
      w.birthDraft.inspect(t.serial);
      expect([...w.birthDraft.selected]).toEqual([1, 2]);
      const markup = birthDetail(t, w.birthDraft.selected.has(t.serial), true);
      expect(markup).toContain(t.serial === 3 ? 'disabled' : '取消选择');
    }
    const html = openingPanel(w);
    expect(html.match(/data-inspect=/g)).toHaveLength(3);
    expect(html.match(/data-selected="true"/g)).toHaveLength(2);
    for (const lane of ['slayer', 'spirit', 'array']) expect(html).toContain(`data-lane="${lane}"`);
    w.birthDraft.toggle(2); expect(birthDetail(talents[2]!, false, false)).not.toContain('disabled');
  });
  it('shows mixed build identity before guides and preserves actual results and costs', () => {
    const w = new World({ roguelike: true }); w.birthDraft.candidates = talents;
    w.birthDraft.toggle(1); w.birthDraft.toggle(2); w.chooseBirth();
    const html = buildPanel(w);
    expect(html).toContain('data-lane="slayer"'); expect(html).toContain('data-lane="spirit"');
    expect(html.indexOf('folio-heading')).toBeLessThan(html.indexOf('slayer-guide'));
    expect(html).not.toContain('class="help-more" open');
    expect(html).toContain('data-action="back"');
  });
  it('presents real success/failure statistics and distinguishes ending a run from restarting an active one', () => {
    const w = new World({ roguelike: true }); w.chooseDestiny(talents[0]!);
    w.wave = 10; w.kills = 327; w.health = 63.2; w.phase = 'won';
    const won = resultPanel(w);
    expect(won).toContain('<dd>327</dd>'); expect(won).toContain('<dd>64</dd>'); expect(won).toContain('continue-run');
    w.phase = 'lost'; w.health = 0;
    expect(resultPanel(w)).not.toContain('continue-run'); expect(resultPanel(w)).toContain('再守一夜');
    expect(pausePanel(w)).toContain('data-action="reset"'); expect(pausePanel(w)).not.toContain('confirm-reset');
    expect(restartPanel()).toContain('当前构筑与进度将归零'); expect(restartPanel()).toContain('data-focus>保留此局');
  });
});
