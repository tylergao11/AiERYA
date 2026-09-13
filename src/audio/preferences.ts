export interface AudioPreferences { master: number; music: number; effects: number; ambience: number; muted: boolean }
export const AUDIO_PREFERENCES_KEY = 'forest-ward.audio.v1';
export const DEFAULT_AUDIO: Readonly<AudioPreferences> = { master: .85, music: .8, effects: .85, ambience: .6, muted: false };
export function normalizeAudio(value: unknown): AudioPreferences {
  const input = value && typeof value === 'object' ? value as Partial<AudioPreferences> : {};
  const volume = (key: 'master' | 'music' | 'effects' | 'ambience') => typeof input[key] === 'number' && Number.isFinite(input[key]) ? Math.max(0, Math.min(1, input[key]!)) : DEFAULT_AUDIO[key];
  return { master: volume('master'), music: volume('music'), effects: volume('effects'), ambience: volume('ambience'), muted: typeof input.muted === 'boolean' ? input.muted : false };
}
export function readAudioPreferences(): AudioPreferences {
  try { return normalizeAudio(JSON.parse(localStorage.getItem(AUDIO_PREFERENCES_KEY) ?? 'null')); } catch { return { ...DEFAULT_AUDIO }; }
}
export function saveAudioPreferences(value: AudioPreferences): void {
  try { localStorage.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(normalizeAudio(value))); } catch { /* Sound remains usable when storage is unavailable. */ }
}
