import { describe, expect, it } from 'vitest';

import { isPipelineSupported } from './support';

const full = {
  Worker: class {},
  OffscreenCanvas: class {},
  createImageBitmap: () => Promise.resolve(),
};

describe('isPipelineSupported', () => {
  it('needs all three browser features', () => {
    expect(isPipelineSupported(full)).toBe(true);
    expect(isPipelineSupported({ ...full, Worker: undefined })).toBe(false);
    expect(isPipelineSupported({ ...full, OffscreenCanvas: undefined })).toBe(
      false,
    );
    expect(isPipelineSupported({ ...full, createImageBitmap: undefined })).toBe(
      false,
    );
  });

  it('reads globalThis by default, which Node lacks', () => {
    expect(isPipelineSupported()).toBe(false);
  });
});
