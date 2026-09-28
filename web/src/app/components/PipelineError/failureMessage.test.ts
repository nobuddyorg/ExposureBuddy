import { describe, expect, it } from 'vitest';

import { failureMessage } from './failureMessage';

// Echoes the key with its values, so each case asserts which literal it picked.
const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length > 0 ? JSON.stringify(values) : ''}`;
const tCount = (key: string, count: number) =>
  `${count === 1 ? `${key}_one` : key}{"count":${count}}`;

describe('failureMessage', () => {
  it('borrows the picker notice for an unsupported browser', () => {
    expect(failureMessage(t, tCount, { kind: 'unsupported' })).toBe(
      'picker.unsupported',
    );
  });

  it('says how many photos lined up, singular and plural', () => {
    expect(
      failureMessage(t, tCount, { kind: 'too_few_aligned', count: 1 }),
    ).toBe('errors.too_few_aligned_one{"count":1}');
    expect(
      failureMessage(t, tCount, { kind: 'too_few_aligned', count: 0 }),
    ).toBe('errors.too_few_aligned{"count":0}');
  });

  it('explains a burst with no common area', () => {
    expect(failureMessage(t, tCount, { kind: 'no_overlap' })).toBe(
      'errors.no_overlap',
    );
  });

  it('names the file that could not be read', () => {
    expect(
      failureMessage(t, tCount, { kind: 'decode_failed', name: 'a.jpg' }),
    ).toBe('errors.decode_failed{"name":"a.jpg"}');
  });

  it('reports a cancellation', () => {
    expect(failureMessage(t, tCount, { kind: 'cancelled' })).toBe(
      'errors.cancelled',
    );
  });

  it('passes an unknown error message through', () => {
    expect(
      failureMessage(t, tCount, { kind: 'unknown', message: 'boom' }),
    ).toBe('errors.unknown{"message":"boom"}');
  });
});
