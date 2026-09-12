import { clamp } from '../core/math';
import type { Wolf } from '../game/contracts';
import { MAGE } from '../game/terrain';
import { flame, glow, oval } from './ink';
import { toArt } from './projection';
import type { ArtAssets } from './assets';

/** Atlas animation stays independent of the simulation and damage timers. */
export class ActorPainter {
  private readonly facings = new Map<number, number>();
  constructor(private readonly assets: ArtAssets) {}

  wolf(c: CanvasRenderingContext2D, wolf: Wolf, time: number): void {
    const p = toArt(wolf), dead = wolf.action === 'dead';
    const rate = wolf.rooted > 0 ? 0 : wolf.wet > 0 ? 5 : 10;
    const row = dead ? 2 : wolf.action === 'attack' ? 1 : 0;
    const frame = dead ? Math.min(3, Math.floor(wolf.age * 4)) : wolf.action === 'attack' ? Math.min(3, Math.floor((1.2 - wolf.attack) * 5)) : Math.floor(wolf.age * rate) % 4;
    const sx = Math.sin(wolf.heading); if (Math.abs(sx) > 0.12) this.facings.set(wolf.id, sx < 0 ? -1 : 1);
    const facing = this.facings.get(wolf.id) ?? -1;
    const width = 85 + wolf.id % 3 * 3, h = width;
    const cellW = this.assets.wolves.naturalWidth / 4, cellH = this.assets.wolves.naturalHeight / 3;
    c.save(); c.globalAlpha = dead ? clamp((2.1 - wolf.age) / 0.7, 0, 1) : 1;
    oval(c, p.x, p.y + 2, 27, 10, '#05141e70');
    const lift = !dead && wolf.action === 'run' && wolf.rooted <= 0 ? Math.sin(wolf.age * rate * Math.PI / 2) * 1.1 : 0;
    c.translate(p.x, p.y + lift); c.scale(facing, 1);
    if (wolf.hit > 0) c.filter = 'brightness(1.45) sepia(.22)';
    c.drawImage(this.assets.wolves, frame * cellW, row * cellH, cellW, cellH, -width * 0.5, -h * 0.79, width, h);
    c.filter = 'none'; c.restore();
    if (dead) return;
    if (wolf.wet > 0) { c.save(); c.strokeStyle = '#87dcd380'; c.lineWidth = 1; c.beginPath(); c.ellipse(p.x, p.y + 2, 29, 10, 0, 0, Math.PI * 2); c.stroke(); c.restore(); }
    if (wolf.rooted > 0) {
      c.save(); c.strokeStyle = '#172f27'; c.lineWidth = 5; c.beginPath(); c.moveTo(p.x - 22, p.y + 3); c.bezierCurveTo(p.x - 17, p.y - 25, p.x + 9, p.y + 15, p.x + 21, p.y - 15); c.stroke(); c.strokeStyle = '#789956'; c.lineWidth = 2; c.stroke(); c.restore();
    }
    if (wolf.burning > 0) { flame(c, p.x - 15, p.y - 20, 22, time, wolf.id); flame(c, p.x + 10, p.y - 18, 17, time, wolf.id + 2); }
    if (wolf.hit > 0 && wolf.hp < wolf.maxHp) {
      c.fillStyle = '#0a1820'; c.fillRect(p.x - 18, p.y - 58, 36, 3);
      c.fillStyle = '#d1af80'; c.fillRect(p.x - 18, p.y - 58, 36 * Math.max(0, wolf.hp / wolf.maxHp), 2);
    }
  }

  mage(c: CanvasRenderingContext2D, time: number, casting: number): void {
    const p = toArt(MAGE);
    const h = 155, w = h * this.assets.mage.naturalWidth / this.assets.mage.naturalHeight;
    oval(c, p.x - 18, p.y - 7, 24, 7, '#08141b75');
    c.save(); c.translate(p.x, p.y); c.rotate(Math.sin(time * 1.6) * 0.004 - Math.sin(casting * Math.PI) * 0.035);
    c.drawImage(this.assets.mage, -w * 0.72, -h * 0.962, w, h); c.restore();
    if (casting > 0) { glow(c, p.x + 13, p.y - 46, 19, '#f3d994', Math.sin(casting * Math.PI) * 0.28); }
  }
  prune(wolves: readonly Wolf[]): void { const ids = new Set(wolves.map(wolf => wolf.id)); for (const id of this.facings.keys()) if (!ids.has(id)) this.facings.delete(id); }
  clear(): void { this.facings.clear(); }
}
