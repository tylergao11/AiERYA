import type { World } from '../game/world';
import { CAMP } from '../game/terrain';
import { clamp } from '../core/math';
import { flame, line, oval } from './ink';
import { ART, toArt } from './projection';

/** Short local feedback, with no camera movement that could displace a player's stroke. */
export class SceneFeedback {
  impact = 0;
  private warning = 0;
  private king = 0;
  private kingSeen = new Set<number>();
  private readonly off: (() => void)[];
  constructor(private readonly world: World) {
    this.off = [world.events.on('campHit', () => { this.impact = 0.45; if (world.health <= 30) this.warning = 1.5; }),
      world.events.on('phase', ({ phase }) => { if (phase !== 'battle') this.clear(); if (phase === 'lost') this.warning = 1.5; }), world.events.on('reset', () => this.clear())];
  }
  update(dt: number): void {
    this.impact = Math.max(0, this.impact - dt); this.warning = Math.max(0, this.warning - dt); this.king = Math.max(0, this.king - dt);
    for (const wolf of this.world.wolves) if (wolf.kind === 'king' && wolf.action !== 'dead' && !this.kingSeen.has(wolf.id)) { this.kingSeen.add(wolf.id); this.king = 2.4; }
  }
  paint(c: CanvasRenderingContext2D, time: number): void {
    if (this.impact > 0) {
      const p = toArt(CAMP), t = 1 - this.impact / 0.45;
      c.save(); c.globalAlpha = (1 - t) * 0.8;
      for (let i = 0; i < 9; i++) { const a = i * 2.4, x = p.x + Math.cos(a) * (15 + t * 39), y = p.y + Math.sin(a) * t * 20 - Math.sin(t * Math.PI) * (8 + i % 3 * 5);
        if (i % 3) line(c, [{ x, y }, { x: x + Math.cos(a) * 5, y: y - 2 }], '#d8b784', 1.5);
        else { oval(c, x, y, 4, 2, '#96886c'); }
      }
      if (t < 0.45) flame(c, p.x + 8, p.y, Math.sin(t / 0.45 * Math.PI) * 31, time, 7);
      c.restore();
    }
    if (this.warning > 0) {
      const p = toArt(CAMP); c.save(); c.globalAlpha = Math.min(0.7, this.warning * 0.6);
      c.strokeStyle = '#da9b70'; c.lineWidth = 2; c.beginPath(); c.ellipse(p.x, p.y + 6, 58, 23, 0, 0.3, 2.8); c.stroke();
      c.font = '600 15px "Microsoft YaHei UI",sans-serif'; c.textAlign = 'center'; c.strokeStyle = '#1b2426'; c.lineWidth = 4;
      const text = this.world.health <= 0 ? '营地失守' : '营地危急'; c.strokeText(text, p.x, p.y - 76); c.fillStyle = '#e5b28e'; c.fillText(text, p.x, p.y - 76); c.restore();
    }
    if (this.king > 0) {
      c.save(); c.globalAlpha = clamp(Math.min((2.4 - this.king) * 4, this.king * 2), 0, 1);
      const x = ART.width - 230, y = 148;
      line(c, [{ x: x - 62, y: y + 10 }, { x: x + 62, y: y + 10 }], '#b8a27b', 1);
      c.font = '600 20px "Microsoft YaHei UI",sans-serif'; c.textAlign = 'center'; c.strokeStyle = '#10202b'; c.lineWidth = 5;
      c.strokeText('狼王逼近', x, y); c.fillStyle = '#e5d4b2'; c.fillText('狼王逼近', x, y); c.restore();
    }
  }
  clear(): void { this.impact = 0; this.warning = 0; this.king = 0; this.kingSeen.clear(); }
  dispose(): void { this.off.forEach(off => off()); this.clear(); }
}
