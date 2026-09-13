/** Small combat diagrams: each Slayer reward shows its own gesture and follow-up. */
export function slayerRewardArt(id: string): string {
  const blade = (x: number, y: number, angle = 0, scale = 1, cls = '') => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})"><g class="${cls}"><path d="M-42 4Q-12-18 43-5L27 2Q-8-4-42 4Z" fill="currentColor"/><path d="M-33 3Q1-7 35-4" fill="none" stroke="#fff2ca" stroke-width="1.1"/></g></g>`;
  const wolf = (x: number, y: number) => `<svg x="${x - 23}" y="${y - 25}" width="46" height="48" viewBox="0 0 256 256" overflow="hidden"><g transform="translate(256 0) scale(-1 1)"><image href="./art/wolf-atlas.webp" width="1024" height="768"/></g></svg>`;
  const arrow = (path: string) => `<path class="slayer-diagram-flow" d="${path}" fill="none" stroke="var(--slayer-diagram-reverse,#b8cbbb)" stroke-width="1.5" stroke-dasharray="4 4"/>`;
  const text = (x: number, y: number, value: string) => `<text x="${x}" y="${y}" text-anchor="middle" fill="currentColor" font-size="11" font-family="KaiTi,serif">${value}</text>`;
  const burst = (x: number, y: number) => `<g transform="translate(${x} ${y})"><g class="slayer-diagram-impact"><path d="M-18-14L-5-4L0-25L4-5L21-15L9 1L23 9L5 7L0 25L-5 7L-22 14L-10 0Z" fill="currentColor" opacity=".32"/><path d="M-15-10L15 10M-11 14L12-15" stroke="#fff1c7" stroke-width="2"/></g></g>`;
  const ground = '<path d="M12 90Q128 78 248 90" fill="none" stroke="#869b89" opacity=".22"/>';
  let art = '';
  if (id === 'slayer-edge') {
    art = [30, 55, 80].map((x, i) => blade(x, 54 - i * 9, -35, .45, 'slayer-diagram-first')).join('')
      + arrow('M84 69Q124 89 153 53L149 64M153 53L140 57')
      + '<g fill="currentColor"><path d="M154 28H161V37H154Z M166 24H173V37H166Z M178 19H185V37H178Z"/></g>'
      + wolf(211, 68) + blade(180, 56, -15, 1, 'slayer-diagram-second') + text(62, 101, '快刀积先手') + text(190, 101, '更快蓄满');
  } else if (id === 'slayer-return' || id === 'awaken') {
    art = wolf(198, 67) + '<path d="M35 61H221" stroke="currentColor" stroke-width="2" opacity=".3"/>'
      + blade(176, 58, 0, 1, 'slayer-diagram-first')
      + (id === 'slayer-return' ? `<g color="var(--slayer-diagram-follow,#df9f84)">${blade(124, 59, -78, .8, 'slayer-diagram-second')}</g>` : '')
      + arrow('M214 34Q124 4 43 40L56 37M43 40L49 28')
      + `<g color="var(--slayer-diagram-reverse,#b8d0be)">${blade(87, 51, 180, .8, 'slayer-diagram-second')}</g>`
      + text(128, 103, id === 'slayer-return' ? '交叉空段 · 牵回远端' : '原线折返 · 再斩沿途敌人');
  } else if (id === 'slayer-focus') {
    art = wolf(139, 65) + blade(79, 58, -30, 1.1, 'slayer-diagram-first')
      + '<path d="M129 41L143 52L135 62L148 76M125 64L130 58" fill="none" stroke="#ffe9b3" stroke-width="2.5"/>'
      + `<g color="var(--slayer-diagram-follow,#df9f84)">${blade(187, 63, 158, .68, 'slayer-diagram-second')}</g>` + burst(141, 55)
      + text(70, 102, '满蓄开破绽') + text(193, 102, '快刀追破');
  } else if (id === 'opportunity-three') {
    art = [30, 59, 86].map((y, i) => wolf(212, y) + blade(139, y, 0, i === 1 ? 1.3 : .88, i === 1 ? 'slayer-diagram-first' : 'slayer-diagram-second')).join('')
      + '<path d="M29 59L60 59M46 52L61 59L46 66M61 59L90 30M61 59L90 86" fill="none" stroke="currentColor" stroke-width="1.4"/>';
  } else if (id === 'opportunity-scar') {
    art = wolf(121, 64) + wolf(161, 75) + '<path d="M45 81L192 31" stroke="currentColor" stroke-width="3" opacity=".35"/>'
      + blade(122, 52, -20, 1.7, 'slayer-diagram-first') + `<g color="var(--slayer-diagram-follow,#df9f84)">${blade(130, 59, 66, 1.3, 'slayer-diagram-second')}</g>`
      + burst(128, 54) + text(126, 106, '横留刀痕 · 纵切引爆');
  } else if (id === 'opportunity-debt') {
    art = blade(72, 55, -35, 1.3, 'slayer-diagram-first')
      + '<path d="M21 75Q65 93 105 71" fill="none" stroke="currentColor" stroke-width="3"/>' + arrow('M108 46Q142 14 177 45L164 43M177 45L173 32')
      + wolf(220, 63) + `<g color="var(--slayer-diagram-follow,#e7aa84)">${blade(187, 56, -15, .9, 'slayer-diagram-second')}${blade(181, 68, -15, .75, 'slayer-diagram-second')}</g>`
      + text(67, 107, '重斩借势') + text(191, 107, '趁势接快刀');
  } else if (id === 'ascend') {
    art = '<g fill="none" stroke="currentColor"><circle cx="33" cy="68" r="8"/><circle cx="59" cy="68" r="8"/><circle cx="85" cy="68" r="8"/></g>'
      + arrow('M104 68H133L125 63M133 68L125 73') + wolf(209, 69)
      + blade(186, 54, -18, 1.35, 'slayer-diagram-second') + burst(200, 51) + text(124, 105, '积够三笔投入 · 追加裂空');
  }
  return `<g class="slayer-diagram" data-technique="${id}">${ground}${art}</g>`;
}
