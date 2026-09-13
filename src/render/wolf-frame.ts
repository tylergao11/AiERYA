import type { Wolf } from '../game/contracts';
import { wolfProfile } from '../game/wolves';

/** Death, stun and attacks have dedicated frames; running follows actual distance travelled. */
export function wolfFrame(wolf: Wolf): { row: number; column: number } {
  if (wolf.action === 'dead') return { row: 2, column: Math.min(3, Math.floor(wolf.age * 5)) };
  switch (wolf.motion?.pose) {
    case 'stagger': return { row: 2, column: 0 };
    case 'windup': case 'vaultWindup': return { row: 1, column: 0 };
    case 'vault': return { row: 1, column: 1 };
    case 'lunge': return { row: 1, column: 2 };
    case 'bite': return { row: 1, column: 2 };
    case 'recover': case 'vaultRecover': return { row: 1, column: 3 };
    default: return { row: 0, column: Math.floor(wolf.motion?.stride ?? wolf.age * 10 * wolfProfile(wolf).speed) % 4 };
  }
}
