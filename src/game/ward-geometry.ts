import { area, inside, type Point } from '../core/math';

/** Each region has an outer contour followed by any excluded holes. */
export interface WardShape {
  readonly points: readonly Point[];
  readonly regions?: readonly (readonly (readonly Point[])[])[];
}
export const wardRegions = (shape: WardShape): readonly (readonly (readonly Point[])[])[] => shape.regions ?? [[shape.points]];
export const wardContours = (shape: WardShape): readonly (readonly Point[])[] => wardRegions(shape).flat();
export function wardContains(point: Point, shape: WardShape): boolean {
  return wardRegions(shape).some(region => inside(point, region[0]!) && !region.slice(1).some(hole => inside(point, hole)));
}
export const wardArea = (shape: WardShape): number => wardRegions(shape).reduce((sum, region) => sum + area(region[0]!) - region.slice(1).reduce((holes, ring) => holes + area(ring), 0), 0);
