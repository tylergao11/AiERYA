/** Small line icons share one stroke weight; text labels remain on the buttons. */
const paths = {
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  soundOff: '<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.2.7-1.5 1-1.5 2.5M12 17h.01"/>',
} as const;
export const uiIcon = (name: keyof typeof paths): string => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
