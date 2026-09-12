import { describe, expect, it } from 'vitest';
import { Camera2D } from '../src/render/projection';

describe('drawing on the illustration', () => {
  it.each([[1440,900], [1280,720], [844,390], [390,844]])('keeps pointer and world positions aligned at %sx%s', (width, height) => {
    const camera = new Camera2D(); camera.resize(width, height);
    for (const delta of [0, -300, 700]) {
      camera.changeZoom(delta);
      for (const point of [{x:-10,z:-5}, {x:6,z:8}, {x:0,z:0}]) {
        const pixel = camera.project(point), restored = camera.unproject(pixel.x, pixel.y);
        expect(restored.x).toBeCloseTo(point.x, 8); expect(restored.z).toBeCloseTo(point.z, 8);
      }
    }
  });
});
