import { describe, expect, it } from 'vitest';

import { failureMessage } from './failureMessage';

// Echoes the key with its values, so each case asserts which literal it picked.
const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length > 0 ? JSON.stringify(values) : ''}`;

describe('failureMessage', () => {
  it('borrows the picker notice for an unsupported browser', () => {
    expect(failureMessage(t, { kind: 'unsupported' })).toBe(
      'picker.unsupported',
    );
  });

  it('says how many photos lined up', () => {
    expect(failureMessage(t, { kind: 'too_few_aligned', count: 1 })).toBe(
      'errors.too_few_aligned{"count":1}',
    );
  });

  it('names the file that could not be read', () => {
    expect(failureMessage(t, { kind: 'decode_failed', name: 'a.jpg' })).toBe(
      'errors.decode_failed{"name":"a.jpg"}',
    );
  });

  it('reports a cancellation', () => {
    expect(failureMessage(t, { kind: 'cancelled' })).toBe('errors.cancelled');
  });

  it('passes an unknown error message through', () => {
    expect(failureMessage(t, { kind: 'unknown', message: 'boom' })).toBe(
      'errors.unknown{"message":"boom"}',
    );
  });
});
