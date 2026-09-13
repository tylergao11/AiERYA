import './ui/landscape-shell.css';
import { landscapeViewport } from './core/landscape-viewport';
import { lockPageZoom } from './ui/page-zoom';

// A real landscape viewport keeps CSS breakpoints and native pointer coordinates
// consistent. Resizing the same frame preserves the running game and opening film.
const host = document.querySelector<HTMLElement>('#landscape-host')!;
const unlockZoom = lockPageZoom();
const game = document.createElement('iframe');
game.title = '山野阵火'; game.allow = 'autoplay; fullscreen';
const source = new URL('game.html', document.baseURI);
source.search = location.search; source.hash = location.hash; game.src = source.href;
const resize = () => {
  const screen = window.visualViewport;
  const style = getComputedStyle(host);
  const viewport = landscapeViewport(screen?.width ?? innerWidth, screen?.height ?? innerHeight, {
    top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0,
  });
  game.style.width = `${viewport.width}px`; game.style.height = `${viewport.height}px`;
  game.style.left = `${viewport.left + (screen?.offsetLeft ?? 0)}px`;
  game.style.top = `${viewport.top + (screen?.offsetTop ?? 0)}px`;
  game.style.transform = `rotate(${viewport.angle}deg)`;
  game.contentWindow?.postMessage({ type: 'game-viewport-change' }, location.origin);
};
resize(); host.append(game);
game.addEventListener('load', resize);
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.visualViewport?.addEventListener('scroll', resize);
if (import.meta.hot) import.meta.hot.dispose(() => {
  unlockZoom();
  window.removeEventListener('resize', resize);
  window.visualViewport?.removeEventListener('resize', resize);
  window.visualViewport?.removeEventListener('scroll', resize);
  game.remove();
});
