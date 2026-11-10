import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadLearnedDetector } from './learnedDetector';

const WEIGHTS = readFileSync(
  new URL('../../../../public/ml/xfeat-core.bin', import.meta.url),
);

afterEach(() => vi.unstubAllGlobals());

describe('loadLearnedDetector', () => {
  it('reads the weights from the asked folder, whether or not it ends in a slash, and returns a detector', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requested.push(url);
        return new Response(WEIGHTS, {
          headers: { 'content-length': String(WEIGHTS.byteLength) },
        });
      }),
    );
    const detector = await loadLearnedDetector('https://example.test/ml/');
    await loadLearnedDetector('https://example.test/ml');
    expect(requested).toEqual([
      'https://example.test/ml/xfeat-core.bin',
      'https://example.test/ml/xfeat-core.bin',
    ]);
    expect(detector).toBeTypeOf('function');
  });
});
