import { afterEach, describe, expect, it, vi } from 'vitest';

import { mlAssetBase, pageAssetBase } from './assetBase';

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

describe('pageAssetBase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is the page's origin and the build's base path", () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://example.github.io' },
    });
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/ExposureBuddy');
    expect(pageAssetBase()).toBe('https://example.github.io/ExposureBuddy/ml');
  });

  it('has no base path when the build set none', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    expect(pageAssetBase()).toBe('http://localhost:3000/ml');
  });
});
