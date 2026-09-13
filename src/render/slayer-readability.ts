/** Keep local annotations legible when the whole valley fits a narrow phone. */
export function slayerDetailScale(cameraScale: number): number {
  const scale = Number.isFinite(cameraScale) && cameraScale > 0 ? cameraScale : 1;
  return Math.max(1, Math.min(4, .75 / scale));
}
