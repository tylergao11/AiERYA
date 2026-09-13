import { clamp } from '../core/math';
import type { Element, Wolf } from '../game/contracts';
import { MAGE } from '../game/terrain';
import { COLORS, flame, glow, line, oval, shape } from './ink';
import { toArt } from './projection';
import type { ArtAssets } from './assets';
import { wolfName, wolfProfile } from '../game/wolves';
import { wolfFrame } from './wolf-frame';
import { mageFrame, wolfAnchors } from './actor-anchors';
import { ELITE_AFFIXES, hasAffix } from '../game/elite-affixes';

/** Atlas animation stays independent of the simulation and damage timers. */
export class ActorPainter {
  private readonly facings = new Map<number, number>();
  constructor(private readonly assets: ArtAssets) {}

  wolf(c: CanvasRenderingContext2D, wolf: Wolf, time: number, uiScale=1): void {
    const { ground: p, body, scale } = wolfAnchors(wolf), dead = wolf.action === 'dead';
    const profile = wolfProfile(wolf), motion = wolf.motion, pose = motion?.pose;
    const { row, column: frame } = wolfFrame(wolf);
    const sx = Math.sin(wolf.heading); if (Math.abs(sx) > 0.12) this.facings.set(wolf.id, sx < 0 ? -1 : 1);
    const facing = this.facings.get(wolf.id) ?? -1;
    const width = (112 + wolf.id % 3 * 3) * profile.scale;
    const special = !!wolf.kind && wolf.kind !== 'normal', atlas = special ? this.assets.wolfTiers : this.assets.wolves;
    const cellW = atlas.naturalWidth / 4;
    // The generated sheet's last two rows have different gutters; calibrate source rectangles, never stretch the animals.
    const atlasRow = row + (wolf.kind === 'king' ? 3 : 0);
    const cuts = [0, 256, 512, 768, 1024, 1244, 1536];
    const sourceY = special ? cuts[atlasRow]! : row * atlas.naturalHeight / 3;
    const cellH = special ? cuts[atlasRow + 1]! - sourceY : atlas.naturalHeight / 3;
    const feet = [[230,244,242,250], [236,236,236,238], [234,234,234,234], [224,236,236,244], [212,214,214,214], [232,234,234,242]];
    const anchor = special ? feet[atlasRow]![frame]! / cellW : 0.79;
    c.save(); c.globalAlpha = dead ? clamp((2.1 - wolf.age) / 0.7, 0, 1) : 1;
    const air = dead ? 0 : motion?.lift ?? 0;
    oval(c, p.x, p.y + 2, 32 * profile.scale * (1 - air / 130), 9 * profile.scale, '#05141e70');
    if(!dead&&wolf.affixes?.length){
      const color=ELITE_AFFIXES[wolf.affixes[0]!].color;
      c.strokeStyle=color;c.lineWidth=1.7;c.beginPath();c.ellipse(p.x,p.y+2,30*profile.scale,10*profile.scale,0,0,Math.PI*2);c.stroke();
      if(hasAffix(wolf,'swift')&&pose==='run')for(let i=0;i<3;i++)line(c,[{x:p.x-facing*(25+i*8),y:p.y-13-i*7},{x:p.x-facing*(44+i*8),y:p.y-13-i*7}],color+'aa',1.4);
      if(hasAffix(wolf,'rage')&&wolf.hp/wolf.maxHp<.4)glow(c,p.x,p.y-25,38+Math.sin(time*14)*5,'#e6684850');
      if(hasAffix(wolf,'regen')&&!wolf.recentDamage&&wolf.hp<wolf.maxHp){const rise=(time+wolf.id*.3)%1;line(c,[{x:p.x-4,y:p.y-25-rise*22},{x:p.x+4,y:p.y-25-rise*22}],'#abd99b',2);line(c,[{x:p.x,y:p.y-29-rise*22},{x:p.x,y:p.y-21-rise*22}],'#abd99b',2);}
    }
    const bob = !dead && pose === 'run' && wolf.rooted <= 0 ? Math.sin((motion?.stride ?? 0) * Math.PI / 2) * 1.2 : 0;
    const anticipation = !dead && (pose === 'windup' || pose === 'vaultWindup') ? Math.min(1, (motion?.elapsed ?? 0) / profile.windup) : 0;
    const recoil = !dead && pose === 'stagger' ? 1 - Math.min(1, (motion?.elapsed ?? 0) / profile.stagger) : 0;
    c.translate(p.x - facing * recoil * 4, p.y - air + bob); c.scale(facing * (1 + anticipation * 0.04), 1 - anticipation * 0.12);
    c.rotate(-recoil * 0.075);
    if (wolf.hit > 0 && !dead) c.filter = 'brightness(1.35) sepia(.18)';
    // A narrow gutter excludes neighboring paws that extend into these generated cells.
    const gutter = special ? 20 : 0, rightGutter = special ? 3 : 0;
    c.drawImage(atlas, frame * cellW + gutter, sourceY, cellW - gutter - rightGutter, cellH,
      -width * 0.5 + width * gutter / cellW, -width * anchor, width * (cellW - gutter - rightGutter) / cellW, width * cellH / cellW);
    c.filter = 'none'; c.restore();
    if (dead) return;
    if (motion && motion.landing > 0) {
      const t = 1 - motion.landing / 0.24;
      c.save(); c.globalAlpha = (1 - t) * 0.65; c.strokeStyle = '#b6a18a'; c.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) { const sign = i % 2 ? -1 : 1, x = p.x + sign * (16 + i * 5 + t * 15) * profile.scale;
        c.beginPath(); c.moveTo(x, p.y + i % 3); c.lineTo(x + sign * (3 + t * 6), p.y - Math.sin(t * Math.PI) * (3 + i)); c.stroke(); }
      c.restore();
    }
    if (wolf.wet > 0) {
      c.save(); c.globalAlpha = Math.min(1, wolf.wet * 2); c.strokeStyle = '#9bc7bd99'; c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const t = (time * 1.4 + i * 0.31 + wolf.id * 0.17) % 1, x = p.x + (i - 1) * 18;
        c.beginPath(); c.ellipse(x, p.y + 2, 4 + t * 7, 1.5 + t * 2, 0, 0.4 + i, 3 + i); c.stroke();
        oval(c, x + 2, body.y + 4 + (p.y - body.y - 4) * t, 0.8, 1.6, '#a3ccbd');
      }
      c.restore();
    }
    if (wolf.rooted > 0) {
      c.save(); c.globalAlpha = Math.min(1, wolf.rooted * 4);
      for (let i = 0; i < 2; i++) {
        c.beginPath(); c.moveTo(p.x - 25 + i * 5, p.y + 5); c.bezierCurveTo(p.x - 20 + i * 6, p.y - 24, p.x + 8, p.y + 10, p.x + 24, p.y - 10 + i * 8);
        c.strokeStyle = '#1d2c26'; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#93794d'; c.lineWidth = 2.5; c.stroke();
      }
      shape(c, [p.x - 22, p.y - 6, p.x - 32, p.y - 15, p.x - 21, p.y - 16, p.x - 17, p.y - 10], '#83965b', '#354532', 1); c.restore();
    }
    const burning = Math.max(wolf.burning, wolf.campBurning ?? 0);
    if (burning > 0) {
      c.save(); c.globalAlpha = Math.min(1, burning * 2);
      flame(c, body.x - 13 * scale, body.y, 20 * scale, time, wolf.id); flame(c, body.x + 10 * scale, body.y + 2 * scale, 15 * scale, time, wolf.id + 2);
      const ember = (time * 1.3 + wolf.id * 0.37) % 1;
      c.globalAlpha *= Math.sin(ember * Math.PI); oval(c, body.x - 7 + ember * 12, body.y - 9 - ember * 23, 0.9, 1.5, '#ecc28c'); c.restore();
    }
    if (wolf.hp < wolf.maxHp || special) {
      const bar = 36 * profile.scale, top = p.y - (special ? width * (pose === 'stagger' ? 0.96 : 0.77) : 58) - air;
      c.fillStyle = '#0a1820'; c.fillRect(p.x - bar / 2, top, bar, 4);
      c.fillStyle = wolf.kind === 'king' ? '#dcbd88' : wolf.kind === 'elite' ? '#b49e90' : '#d1af80'; c.fillRect(p.x - bar / 2, top, bar * Math.max(0, wolf.hp / wolf.maxHp), 2);
      if (special) { c.save(); c.textAlign = 'center'; c.font = `600 ${Math.max(14,10/uiScale)}px "Microsoft YaHei UI",sans-serif`; c.fillStyle = wolf.affixes?.[0]?ELITE_AFFIXES[wolf.affixes[0]].color:'#ead6b3'; c.strokeStyle = '#16202a'; c.lineWidth = 3/uiScale; c.strokeText(wolfName(wolf), p.x, top - 6); c.fillText(wolfName(wolf), p.x, top - 6); c.restore(); }
    }
  }

  mage(c: CanvasRenderingContext2D, time: number, casting: number, tracingSeconds = 0, element: Element = 'fire'): void {
    const p = toArt(MAGE);
    const h = 155, sheet = this.assets.mage, cw = sheet.naturalWidth / 4, ch = sheet.naturalHeight / 2, scale = h / ch;
    const frame = mageFrame(casting, tracingSeconds), col = frame % 4, row = Math.floor(frame / 4);
    const left = frame === 5 ? 65 : 0, width = frame === 4 ? 448 : cw - left;
    const anchorX = frame === 4 ? 161 : 184;
    oval(c, p.x - 18, p.y - 7, 24, 7, '#08141b75');
    c.save(); c.translate(p.x - 18, p.y - 7); c.scale(1, 1 + Math.sin(time * 1.7) * 0.004);
    c.drawImage(sheet, col * cw + left, row * ch, width, ch, (left - anchorX) * scale, -495 * scale, width * scale, h);
    if (casting > 0 || tracingSeconds > 0) {
      const hands = [[278,280],[236,165],[302,79],[328,126],[405,123],[346,268],[289,279],[271,280]];
      const hand = hands[frame]!, x = (hand[0]! - anchorX) * scale, y = (hand[1]! - 495) * scale;
      const strength = casting > 0 ? Math.sin(Math.min(1, casting * 1.3) * Math.PI) : Math.min(0.75, tracingSeconds * 2);
      glow(c, x, y, 13, COLORS[element], 0.22 + strength * 0.18);
      for (let i = 0; i < 3; i++) { const t = (time * 1.2 + i / 3) % 1, a = i * 2.4;
        const px = x + Math.cos(a) * (1 - t) * 17, py = y + Math.sin(a) * (1 - t) * 12;
        line(c, [{ x: px, y: py }, { x: px + Math.cos(a) * 3, y: py + Math.sin(a) * 2 }], COLORS[element], 1.2);
      }
    }
    c.restore();
  }
  prune(wolves: readonly Wolf[]): void { const ids = new Set(wolves.map(wolf => wolf.id)); for (const id of this.facings.keys()) if (!ids.has(id)) this.facings.delete(id); }
  clear(): void { this.facings.clear(); }
}
