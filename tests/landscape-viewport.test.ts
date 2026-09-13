import { describe, expect, it } from 'vitest';
import { landscapeViewport } from '../src/core/landscape-viewport';
const zero = { top: 0, right: 0, bottom: 0, left: 0 };
describe('fixed landscape viewport', () => {
  it.each([[393, 852], [430, 932], [375, 667], [956, 440], [1280, 720]])('fills the available %s by %s viewport', (width, height) => {
    const frame = landscapeViewport(width, height, zero);
    expect(frame.width).toBeGreaterThanOrEqual(frame.height);
    expect(frame.width * frame.height).toBe(width * height);
    expect(frame.left - (frame.angle ? frame.height : 0)).toBe(0);
    expect(frame.top).toBe(0);
  });
  it('keeps the same logical landscape size when the device changes orientation', () => {
    const a = landscapeViewport(393, 852, zero), b = landscapeViewport(852, 393, zero);
    expect([a.width, a.height]).toEqual([b.width, b.height]); expect(a.angle).toBe(90); expect(b.angle).toBe(0);
  });
  it('keeps content clear of the notch and home indicator', () => {
    expect(landscapeViewport(393, 852, { top: 59, right: 0, bottom: 34, left: 0 }))
      .toEqual({ width: 759, height: 393, left: 393, top: 59, angle: 90 });
    expect(landscapeViewport(852, 393, { top: 0, right: 59, bottom: 21, left: 59 }))
      .toEqual({ width: 734, height: 372, left: 59, top: 0, angle: 0 });
  });
});
