import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { copyRuntime, RUNTIME_FILES } from './copy-ml-assets.mjs';

describe('copyRuntime', () => {
  it('copies the classic build of the loader and the binary, and nothing else, to the destination', () => {
    const packageDirectory = mkdtempSync(join(tmpdir(), 'mp-'));
    mkdirSync(join(packageDirectory, 'wasm'));
    for (const name of [...RUNTIME_FILES, 'vision_wasm_extra.js'])
      writeFileSync(join(packageDirectory, 'wasm', name), `content of ${name}`);
    const destination = join(
      mkdtempSync(join(tmpdir(), 'ml-')),
      'nested',
      'ml',
    );

    const copied = copyRuntime(packageDirectory, destination);

    expect(copied).toEqual(RUNTIME_FILES);
    expect(readdirSync(destination).sort()).toEqual([...RUNTIME_FILES].sort());
    for (const name of RUNTIME_FILES)
      expect(readFileSync(join(destination, name), 'utf8')).toBe(
        `content of ${name}`,
      );
  });

  it('names the two files MediaPipe loads in a classic worker', () => {
    expect(RUNTIME_FILES).toEqual([
      'vision_wasm_internal.js',
      'vision_wasm_internal.wasm',
    ]);
  });

  it('fails when the package lacks a file, rather than shipping an app that cannot find people', () => {
    const empty = mkdtempSync(join(tmpdir(), 'mp-'));
    mkdirSync(join(empty, 'wasm'));
    expect(() => copyRuntime(empty, join(empty, 'out'))).toThrow(/ENOENT/);
  });
});
