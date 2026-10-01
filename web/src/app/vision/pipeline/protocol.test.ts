import { describe, expect, it } from 'vitest';

import {
  NO_OVERLAP_MESSAGE,
  transferablesOf,
  unexpectedRequest,
} from './protocol';

describe('transferablesOf', () => {
  it('collects every typed array buffer in nested objects and arrays', () => {
    const bands = [new Uint8ClampedArray(6), new Uint8ClampedArray(3)];
    const spans = { start: new Int32Array(2), end: new Int32Array(2) };
    const buffers = transferablesOf({
      type: 'aligned',
      id: 1,
      frame: { image: { width: 1, height: 2, bandRows: 1, bands }, spans },
      matches: 3,
    });
    expect(buffers).toEqual([
      bands[0].buffer,
      bands[1].buffer,
      spans.start.buffer,
      spans.end.buffer,
    ]);
  });

  it('lists a buffer shared by several views once', () => {
    const buffer = new ArrayBuffer(8);
    const message = {
      low: new Uint8Array(buffer, 0, 4),
      high: new Uint8Array(buffer, 4, 4),
    };
    expect(transferablesOf(message)).toEqual([buffer]);
  });

  it('leaves out empty buffers, such as the one every freed band shares', () => {
    const empty = new Uint8ClampedArray(0);
    const full = new Uint8ClampedArray(3);
    expect(transferablesOf({ bands: [empty, full, empty] })).toEqual([
      full.buffer,
    ]);
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
