import type { Phase } from '../game/contracts';

/** Static run panels keep their score and ending cues. Explicit play pauses
 * and background tabs suspend the audio clock; settings retain a live preview. */
export function audioShouldPause(phase: Phase, blocked: boolean, hidden: boolean, settingsOpen: boolean): boolean {
  return hidden || (!settingsOpen && blocked && !['destiny', 'rest', 'won', 'lost'].includes(phase));
}
