import type { Wolf } from '../game/contracts';
import { wolfProfile } from '../game/wolves';
import { toArt } from './projection';

/** Ground contacts stay fixed while attached material follows the airborne body. */
export function wolfAnchors(wolf: Wolf) {
  const ground = toArt(wolf), scale = wolfProfile(wolf).scale;
  const lift = wolf.action === 'dead' ? 0 : wolf.motion?.lift ?? 0;
  return { ground, body: { x: ground.x, y: ground.y - lift - 20 * scale }, lift, scale };
}
export function mageFrame(casting: number, tracingSeconds: number): number {
  if (casting > 0) return Math.min(7, 4 + Math.floor((1 - casting) * 4));
  return tracingSeconds > 0 ? Math.min(3, 1 + Math.floor(tracingSeconds * 5)) : 0;
}
