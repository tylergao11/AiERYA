import { clamp } from '../core/math';
import type { RunSpirit } from '../game/rogue-combat';
import { ART, toArt } from './projection';

/** Use painted height, not ground distance: tall flyers overlap several rows of terrain. */
export function spiritLanes(spirits: readonly RunSpirit[]): Map<number, number> {
  const lanes = new Map<number, number>();
  const bodies = spirits.map(s => {
    const beast = s.size >= 1.7, flying = !beast && ['metal', 'water', 'fire'].includes(s.element);
    const growth = beast ? s.size / 1.75 : Math.max(s.role === 'support' ? .9 : 0, s.size);
    const width = (beast ? 280 : flying ? 158 : 168) * growth;
    const height = (beast ? 180 : s.element === 'fire' ? 252 : s.element === 'water' ? 238 : s.element === 'metal' ? 190 : 178) * growth;
    const p = toArt(s); lanes.set(s.id, 0);
    return { id: s.id, x: p.x, y: p.y, width, height, flying };
  }).sort((a, b) => a.id - b.id);
  // Two small passes settle a pair or trio, with a strict presentation-only offset cap.
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i]!, b = bodies[j]!; if (!a.flying && !b.flying) continue;
    const overlapY = Math.min(a.y, b.y) - Math.max(a.y - a.height, b.y - b.height);
    if (overlapY < 26) continue;
    const ax = a.x + lanes.get(a.id)!, bx = b.x + lanes.get(b.id)!, dx = bx - ax;
    const overlap = (a.width + b.width) * .46 - Math.abs(dx); if (overlap <= 0) continue;
    const direction = Math.sign(dx) || 1, share = a.flying && b.flying ? .5 : 1;
    for (const [body, shift] of [[a, -direction], [b, direction]] as const) if (body.flying) {
      lanes.set(body.id, clamp(lanes.get(body.id)! + shift * overlap * share,
        Math.max(-84, body.width * .5 - body.x), Math.min(84, ART.width - body.width * .5 - body.x)));
    }
  }
  return lanes;
}
