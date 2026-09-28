import { describe, expect, it } from 'vitest';

import { transferablesOf } from './protocol';

describe('transferablesOf', () => {
  it('collects the buffers of images, coverage masks and nested frames, nothing else', () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    const coverage = new Uint8Array(1);
    const buffers = transferablesOf({
      type: 'aligned',
      id: 1,
      frame: { image, coverage },
      matches: 3,
      features: {
        keypoints: [{ x: 1, y: 2 }],
        descriptors: new Uint32Array(8),
      },
    });
    expect(buffers).toEqual([image.data.buffer, coverage.buffer]);
  });

  it('returns nothing for a message without pixel buffers', () => {
    expect(transferablesOf({ type: 'stack', id: 2 })).toEqual([]);
  });
});
