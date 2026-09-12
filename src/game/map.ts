import type { Point } from '../core/math';

// Shared illustration calibration, used by simulation and rendering.
export const MAP = { width: 1600, height: 1000, x: 800, y: 450, unitX: 28, unitY: 18 } as const;
export const mapPoint = (x: number, y: number): Point => ({ x: (x - MAP.x) / MAP.unitX, z: (y - MAP.y) / MAP.unitY });
const polygon = (coordinates: readonly number[]): Point[] => {
  const result: Point[] = []; for (let i = 0; i < coordinates.length; i += 2) result.push(mapPoint(coordinates[i]!, coordinates[i + 1]!)); return result;
};

export const CLEARING = polygon([220,235, 500,205, 800,245, 1090,220, 1330,340, 1390,555, 1260,675, 1010,775, 720,800, 420,765, 250,580, 155,390]);
export const RIVER = polygon([1300,171, 1240,188, 1250,216, 1300,230, 1340,264, 1400,302, 1445,326, 1440,357, 1488,397, 1525,431, 1570,460, 1610,472, 1660,520, 1600,585, 1530,615, 1535,642, 1485,660, 1400,695, 1350,725, 1288,748, 1230,758, 1195,778, 1170,759, 1100,778, 1105,811, 1135,827, 1155,875, 1200,898, 1180,945, 1200,1005, 1270,1005, 1320,963, 1300,946, 1375,903, 1360,859, 1403,825, 1390,795, 1447,779, 1440,752, 1510,721, 1560,676, 1610,650, 1690,610, 1700,350, 1580,345, 1505,305, 1450,274, 1410,245, 1345,222, 1295,202, 1340,182]);
