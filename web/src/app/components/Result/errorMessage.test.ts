import { describe, expect, it } from 'vitest';

import { errorMessage } from './errorMessage';

describe('errorMessage', () => {
  it("takes an Error's message", () => {
    expect(errorMessage(new Error('worker gone'))).toBe('worker gone');
  });

  it('stringifies anything else', () => {
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage(42)).toBe('42');
  });
});
