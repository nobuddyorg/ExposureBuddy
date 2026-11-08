import { describe, expect, it } from 'vitest';

import { mlAssetBase } from './assetBase';

describe('mlAssetBase', () => {
  it('puts ml/ under the base path of the deployed build', () => {
    expect(mlAssetBase('https://example.github.io', '/ExposureBuddy')).toBe(
      'https://example.github.io/ExposureBuddy/ml',
    );
  });

  it('puts ml/ at the root when there is no base path, as in development', () => {
    expect(mlAssetBase('http://localhost:3000', '')).toBe(
      'http://localhost:3000/ml',
    );
  });
});
