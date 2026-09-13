/** Keep browser gestures from scaling the game; single-finger menu scrolling remains native. */
export function lockPageZoom(): () => void {
  const events = new AbortController(), options = { passive: false, capture: true, signal: events.signal };
  const prevent = (event: Event) => event.preventDefault();
  const touch = (event: TouchEvent) => { if (event.touches.length > 1) event.preventDefault(); };
  document.addEventListener('touchstart', touch, options);
  document.addEventListener('touchmove', touch, options);
  document.addEventListener('gesturestart', prevent, options);
  document.addEventListener('gesturechange', prevent, options);
  document.addEventListener('dblclick', prevent, options);
  document.addEventListener('wheel', event => { if (event.ctrlKey || event.metaKey) event.preventDefault(); }, options);
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) event.preventDefault();
  }, { capture: true, signal: events.signal });
  return () => events.abort();
}
