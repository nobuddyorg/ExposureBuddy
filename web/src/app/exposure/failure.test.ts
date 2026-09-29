import { describe, expect, it } from 'vitest';

import { NO_OVERLAP_MESSAGE } from '../vision/pipeline/protocol';
import { PipelineError, toPipelineFailure } from './failure';

describe('PipelineError', () => {
  it('carries the failure and a readable message for every kind', () => {
    const cases = [
      [{ kind: 'unsupported' }, /Workers/],
      [{ kind: 'too_few_aligned', count: 1 }, /Only 1 photos/],
      [{ kind: 'no_overlap' }, /common area/],
      [{ kind: 'decode_failed', name: 'IMG_1.jpg' }, /IMG_1\.jpg/],
      [{ kind: 'cancelled' }, /cancelled/],
      [{ kind: 'unknown', message: 'weird' }, /weird/],
    ] as const;
    for (const [failure, message] of cases) {
      const error = new PipelineError(failure);
      expect(error.failure).toBe(failure);
      expect(error.message).toMatch(message);
      expect(error.name).toBe('PipelineError');
    }
  });
});

describe('toPipelineFailure', () => {
  it('keeps a pipeline error’s failure', () => {
    const failure = { kind: 'too_few_aligned', count: 0 } as const;
    expect(toPipelineFailure(new PipelineError(failure))).toBe(failure);
  });

  it('maps an abort to cancelled', () => {
    expect(toPipelineFailure(new DOMException('x', 'AbortError'))).toEqual({
      kind: 'cancelled',
    });
  });

  it("maps the stack's no-overlap error to its own kind", () => {
    expect(toPipelineFailure(new Error(NO_OVERLAP_MESSAGE))).toEqual({
      kind: 'no_overlap',
    });
  });

  it('maps anything else to unknown with its message', () => {
    expect(toPipelineFailure(new Error('oops'))).toEqual({
      kind: 'unknown',
      message: 'oops',
    });
    expect(toPipelineFailure('string')).toEqual({
      kind: 'unknown',
      message: 'string',
    });
  });
});
