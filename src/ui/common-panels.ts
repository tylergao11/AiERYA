import type { World } from '../game/world';
import { CAMPAIGN_WAVES } from '../game/encounters';
import { paintedArt, laneMark } from './manuscript-art';

export const panelClose = (label = '返回') => `<button class="folio-close" data-action="back" aria-label="${label}">×</button>`;
export const panelHeading = (title: string, kicker = '', closable = true) => `<header class="folio-heading"><div>${kicker ? `<p class="eyebrow">${kicker}</p>` : ''}<h2>${title}</h2></div>${closable ? panelClose() : ''}</header>`;

export function pausePanel(world: World): string {
  return `<section class="panel-card pause-panel" role="dialog" aria-modal="true" aria-label="暂停">${panelClose('继续游戏')}
    <span class="rest-emblem" aria-hidden="true">歇</span><h2>山林暂歇</h2><p class="menu-state">${world.wave ? `第 ${world.wave} 波` : '初入山林'}${world.build.active ? ` · ${world.build.name}` : ''}</p>
    <button class="primary" data-action="resume" data-focus>继续 <span aria-hidden="true">→</span></button>
    <nav class="pause-links" aria-label="游戏菜单">${world.build.active ? '<button data-action="build">构筑</button>' : ''}<button data-action="help">手记</button><button data-action="settings">调音</button></nav>
    <button class="text-button restart-link" data-action="reset">重新启程</button></section>`;
}

export function restartPanel(): string {
  return `<section class="panel-card confirm-panel" role="dialog" aria-modal="true" aria-label="重新启程">${panelClose('保留此局')}<span class="rest-emblem" aria-hidden="true">启</span><h2>重推天命</h2><p class="confirm-copy">当前构筑与进度将归零。</p><div class="folio-actions"><button class="quiet-button" data-action="back" data-focus>保留此局</button><button class="primary" data-action="confirm-reset">重新启程 →</button></div></section>`;
}

export function resultPanel(world: World): string {
  const won = world.phase === 'won';
  return `<section class="panel-card result-panel ${won ? 'result-won' : 'result-lost'}" role="dialog" aria-modal="true" aria-label="${won ? '守夜成功' : '守夜结束'}">
    <div class="result-illustration" aria-hidden="true">${paintedArt('rewards', won ? 3 : 4)}<span class="result-stamp">${won ? '守' : '憾'}</span></div>
    <div class="result-story"><p class="eyebrow">${won ? world.wave === CAMPAIGN_WAVES ? '十波尽退 · 狼王已伏' : '历练已毕' : `第 ${world.wave} 波 · 防线失守`}</p><h2>${won ? '天光破晓' : '营火已熄'}</h2>${world.build.active ? `<div class="build-lanes">${world.build.fates.map(laneMark).join('')}</div><p class="result-build">${world.build.name}</p>` : ''}
    <dl class="result-stats"><div><dt>波次</dt><dd>${world.wave}</dd></div><div><dt>击退</dt><dd>${world.kills}</dd></div><div><dt>营地</dt><dd>${Math.max(0, Math.ceil(world.health))}</dd></div></dl>
    <div class="result-actions">${won && world.build.active ? `<button class="primary" data-action="continue-run" data-focus>继续历练 →</button><button class="quiet-button" data-action="confirm-reset">再守一夜</button>` : '<button class="primary" data-action="confirm-reset" data-focus>再守一夜 →</button>'}${world.build.active ? '<button class="text-button" data-action="build">查看构筑</button>' : ''}</div></div></section>`;
}
