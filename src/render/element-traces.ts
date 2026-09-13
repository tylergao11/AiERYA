import type { World } from '../game/world';
import { BATTLE } from '../game/battle-rules';
import { COLORS } from './ink';
import { ART, toArt } from './projection';

export function paintElementTraces(c: CanvasRenderingContext2D, world: World): void {
  for (const field of world.traces.fields) {
    if (field.points.length < 2) continue;
    c.save(); c.globalAlpha = Math.min(.75, field.remaining * .7); c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); field.points.forEach((point, index) => { const p = toArt(point); if (!index) c.moveTo(p.x,p.y); else c.lineTo(p.x,p.y); });
    c.strokeStyle = COLORS[field.element]; c.lineWidth = BATTLE.trace.width * ART.unitY * 2; c.globalAlpha *= .24; c.stroke();
    c.globalAlpha *= 3; c.lineWidth = 3; c.stroke();
    c.strokeStyle = '#edcd81'; c.lineWidth = 1; c.setLineDash([8,9]); c.stroke(); c.restore();
  }
}
