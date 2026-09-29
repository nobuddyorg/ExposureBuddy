import { describe, expect, it } from 'vitest';

import {
  NO_OVERLAP_MESSAGE,
  transferablesOf,
  unexpectedRequest,
} from './protocol';

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

  it('walks past nulls, missing values and primitives without tripping', () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    const message = {
      nothing: null,
      missing: undefined,
      count: 3,
      name: 'x',
      flag: true,
      nested: { nothing: null, image },
    };
    expect(transferablesOf(message)).toEqual([image.data.buffer]);
  });
});

describe('unexpectedRequest', () => {
  it('names the handler and the type it got', () => {
    expect(unexpectedRequest('align service', { type: 'bogus' }).message).toBe(
      'The align service got a request it does not know: bogus.',
    );
  });

  it('copes with a request that is not even an object', () => {
    expect(unexpectedRequest('worker', null).message).toBe(
      'The worker got a request it does not know: undefined.',
    );
  });
});

describe('NO_OVERLAP_MESSAGE', () => {
  it('says what happened, in the words the coordinator matches on', () => {
    expect(NO_OVERLAP_MESSAGE).toBe('The aligned photos share no common area.');
  });
});
