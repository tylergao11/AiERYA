import { distance, type Point } from '../core/math';
import type { Ward, Wolf } from './contracts';
import type { NavigationField } from './navigation';
import { CAMP } from './terrain';
import { moveWolf, wolfSegmentClear, wolfWall } from './wolf-collision';
import { wolfMotion, wolfProfile, type WolfPose } from './wolves';
import { ELITE_VAULT, landVault, planVault } from './wolf-vault';
import { affixSpeed } from './elite-affixes';

export function staggerWolf(wolf: Wolf): void {
  if (wolf.action === 'dead' || wolf.hp <= 0) return;
  const motion = wolfMotion(wolf);
  if (motion.immunity > 0) return;
  if (motion.pose === 'vault') { motion.vaultStagger = true; motion.immunity = wolfProfile(wolf).staggerGuard; return; }
  motion.vault = undefined;
  motion.pose = 'stagger'; motion.elapsed = 0; motion.lift = 0;
  motion.immunity = wolfProfile(wolf).staggerGuard; motion.cooldown = Math.max(motion.cooldown, 0.22);
  wolf.action = 'run';
}

export function tickWolfMotion(wolf: Wolf, dt: number, navigation: NavigationField, wards: readonly Ward[], wolves: readonly Wolf[], intent: Point, bite: (wall?: Ward) => void): void {
  if (wolf.action === 'dead') return;
  const m = wolfMotion(wolf), profile = wolfProfile(wolf);
  const slow = Math.max(wolf.slowAmount, (wolf.reactions?.mired ?? 0) > 0 ? wolf.reactions!.mireSlow : 0) * wolfProfile(wolf).control;
  m.immunity = Math.max(0, m.immunity - dt); m.cooldown = Math.max(0, m.cooldown - dt); m.landing = Math.max(0, m.landing - dt);
  m.vaultCooldown = Math.max(0, (m.vaultCooldown ?? 0) - dt);
  m.elapsed += dt;
  const setPose = (pose: WolfPose) => { m.pose = pose; m.elapsed = 0; m.lift = 0; wolf.action = pose === 'run' || pose === 'stagger' || pose.startsWith('vault') ? 'run' : 'attack'; };
  if (m.pose === 'vault' && m.vault) {
    const t = Math.min(1, m.elapsed / ELITE_VAULT.flight), plan = m.vault;
    wolf.x = plan.start.x + (plan.end.x - plan.start.x) * t; wolf.z = plan.start.z + (plan.end.z - plan.start.z) * t;
    m.lift = Math.sin(t * Math.PI) * ELITE_VAULT.height;
    if (t >= 1) { landVault(wolf, wards, wolves); setPose(m.vaultStagger ? 'stagger' : 'vaultRecover'); m.vaultStagger = false; }
    return;
  }
  // Roots cancel a pending bite or takeoff. A vault already in flight lands first.
  if (wolf.rooted > 0) { m.vault = undefined; setPose('run'); m.cooldown = 0.22; wolf.vx = 0; wolf.vz = 0; return; }
  if (m.pose === 'vaultWindup') {
    if (m.elapsed >= ELITE_VAULT.windup) {
      const plan = planVault(wolf, intent, wards, wolves);
      if (!plan) { m.vault = undefined; setPose('run'); m.vaultCooldown = 0.35; return; }
      m.vault = plan; m.vaultCooldown = ELITE_VAULT.cooldown;
      wolf.heading = Math.atan2(plan.end.x - plan.start.x, plan.end.z - plan.start.z); setPose('vault');
    }
    return;
  }
  if (m.pose === 'vaultRecover') { if (m.elapsed >= ELITE_VAULT.recovery) setPose('run'); return; }
  if (m.pose === 'stagger') {
    moveWolf(wolf, wolf.vx * dt, wolf.vz * dt, wards);
    wolf.vx *= Math.exp(-dt * 8); wolf.vz *= Math.exp(-dt * 8);
    if (m.elapsed >= profile.stagger) setPose('run');
    return;
  }
  const targetWall = m.targetId === null ? undefined : wards.find(w => w.id === m.targetId && w.health > 0);
  const inRange = () => m.targetId === null ? distance(wolf, CAMP) <= 2.05 + profile.radius * 0.25
    : !!targetWall && wolfWall(wolf, profile.radius + 0.22, [targetWall]) !== undefined;
  if (m.pose === 'windup') {
    if (m.targetId !== null && !targetWall) { setPose('run'); return; }
    if (m.elapsed >= profile.windup) setPose('lunge');
    return;
  }
  if (m.pose === 'lunge') {
    m.lift = 0;
    if (!inRange()) {
      const speed = 5.4 * (1 - slow);
      moveWolf(wolf, Math.sin(wolf.heading) * speed * dt, Math.cos(wolf.heading) * speed * dt, wards);
    }
    if (m.elapsed >= profile.strike) {
      m.landing = 0.24; setPose('bite');
      if (inRange()) bite(targetWall);
    }
    return;
  }
  if (m.pose === 'bite') { if (m.elapsed >= 0.13) setPose('recover'); return; }
  if (m.pose === 'recover') {
    if (m.elapsed >= profile.recovery) { setPose('run'); m.cooldown = 0.12; }
    return;
  }
  const vault = planVault(wolf, intent, wards, wolves);
  if (vault) { m.vault = vault; setPose('vaultWindup'); return; }
  if(wolf.approach && (distance(wolf,wolf.approach)<2 || distance(wolf,CAMP)<10))wolf.approach=undefined;
  const route = wolf.approach && wolfSegmentClear(wolf,wolf.approach,profile.radius,wards) ? wolf.approach : navigation.direction(wolf, profile.radius);
  const target = distance(wolf, CAMP) < 5 && wolfSegmentClear(wolf, intent, profile.radius, wards) ? intent : route;
  let dx = target.x - wolf.x, dz = target.z - wolf.z, length = Math.hypot(dx, dz) || 1;
  const ahead = { x: wolf.x + dx / length * 0.42, z: wolf.z + dz / length * 0.42 };
  const wall = wolfWall(ahead, profile.radius, wards);
  const nearCamp = distance(wolf, CAMP) < 3.55 && wolfSegmentClear(wolf, { x: wolf.x + (CAMP.x - wolf.x) * 0.3, z: wolf.z + (CAMP.z - wolf.z) * 0.3 }, profile.radius, wards);
  if (m.cooldown <= 0 && (wall || nearCamp)) {
    m.targetId = wall?.id ?? null;
    wolf.heading = Math.atan2(dx, dz); setPose('windup'); return;
  }
  dx /= length; dz /= length;
  for (const other of wolves) {
    if (other.id === wolf.id || other.action === 'dead') continue;
    const d = distance(wolf, other), clearance = profile.radius + wolfProfile(other).radius + (distance(wolf,CAMP)<6?.5:1.8);
    if (d > 0.01 && d < clearance) { const force = (clearance - d) / clearance * 1.25; dx += (wolf.x - other.x) / d * force; dz += (wolf.z - other.z) / d * force; }
  }
  length = Math.hypot(dx, dz) || 1;
  const speed = wolf.speed * affixSpeed(wolf) * (1 - slow);
  const moved = moveWolf(wolf, (dx / length * speed + wolf.vx) * dt, (dz / length * speed + wolf.vz) * dt, wards);
  m.stride += moved * 3.4; m.lift = 0;
  wolf.vx *= Math.exp(-dt * 5); wolf.vz *= Math.exp(-dt * 5);
  if (moved > 0.0001) wolf.heading = Math.atan2(dx, dz);
}
