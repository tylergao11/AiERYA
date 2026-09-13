import type { Wolf } from './contracts';
import type { VaultPlan } from './wolf-vault';
import { encounter } from './encounters';
import { ELITE_AFFIXES, hasAffix } from './elite-affixes';

export type WolfKind = 'normal' | 'elite' | 'king';
export type WolfPose = 'run' | 'windup' | 'lunge' | 'bite' | 'recover' | 'stagger' | 'vaultWindup' | 'vault' | 'vaultRecover';
export interface WolfMotion {
  pose: WolfPose; elapsed: number; stride: number; lift: number; landing: number;
  immunity: number; cooldown: number; targetId: number | null;
  vault?: VaultPlan; vaultCooldown?: number; vaultStagger?: boolean;
}

/** Enemy presentation and locomotion tuning; player damage and rewards live elsewhere. */
export const WOLF_KINDS = {
  normal: { name: '普通狼', radius: 0.62, scale: 1, hp: 1, speed: 1, attack: 1, control: 1, windup: 0.3, strike: 0.24, recovery: 0.6, stagger: 0.12, staggerGuard: 0.72 },
  elite: { name: '精英狼', radius: 0.76, scale: 1.18, hp: 6, speed: 1.06, attack: 1.3, control: .75, windup: 0.35, strike: 0.26, recovery: 0.63, stagger: 0.09, staggerGuard: 1.1 },
  king: { name: '狼王', radius: 0.96, scale: 1.5, hp: 18, speed: 0.83, attack: 2, control: .5, windup: 0.55, strike: 0.38, recovery: 0.82, stagger: 0.065, staggerGuard: 1.65 },
} as const;
const GIANT_PROFILE={...WOLF_KINDS.elite,scale:1.42};
export const wolfProfile = (wolf: Pick<Wolf, 'kind' | 'affixes'>) => wolf.kind==='elite'&&hasAffix(wolf,'giant')?GIANT_PROFILE:WOLF_KINDS[wolf.kind ?? 'normal'];
export function wolfKindForWave(wave: number, index: number): WolfKind {
  return encounter(wave).spawns[index]?.kind ?? 'normal';
}
export function eliteRole(wave: number, index: number): NonNullable<Wolf['eliteSkill']> {
  return encounter(wave).spawns[index]?.eliteSkill ?? 'guard';
}
export function wolfName(wolf: Pick<Wolf, 'kind' | 'eliteSkill' | 'affixes'>): string {
  const name=wolf.kind === 'elite' && wolf.eliteSkill ? { guard: '锋甲', call: '唤群', silence: '封阵', hunt: '猎灵', mend: '血祭', rush: '突袭' }[wolf.eliteSkill] : wolf.kind==='elite'?'':wolfProfile(wolf).name;
  return [...(wolf.affixes??[]).map(a=>ELITE_AFFIXES[a].name),name].filter(Boolean).join(' · ')||'精英狼';
}
export function wolfMotion(wolf: Wolf): WolfMotion {
  return wolf.motion ??= { pose: 'run', elapsed: 0, stride: wolf.id * 0.27, lift: 0, landing: 0, immunity: 0, cooldown: 0, targetId: null };
}
