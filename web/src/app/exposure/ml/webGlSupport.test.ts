import { describe, expect, it, vi } from 'vitest';

import { hasWebGlInWorker } from './webGlSupport';

const canvasThatAnswers = (answer: unknown) =>
  class {
    getContext = vi.fn(() => answer);
  };

describe('hasWebGlInWorker', () => {
  it('is true when an offscreen canvas gives a WebGL 2 context', () => {
    expect(hasWebGlInWorker({ OffscreenCanvas: canvasThatAnswers({}) })).toBe(
      true,
    );
  });

  it('is false when the canvas gives no context', () => {
    expect(hasWebGlInWorker({ OffscreenCanvas: canvasThatAnswers(null) })).toBe(
      false,
    );
  });

  it('is false when there is no OffscreenCanvas at all', () => {
    expect(hasWebGlInWorker({})).toBe(false);
  });

  it('is false when making the canvas or the context throws', () => {
    const throwing = class {
      constructor() {
        throw new Error('no GL');
      }
      getContext() {
        return {};
      }
    };
    expect(hasWebGlInWorker({ OffscreenCanvas: throwing })).toBe(false);
    const contextThrows = class {
      getContext(): unknown {
        throw new Error('no GL');
      }
    };
    expect(hasWebGlInWorker({ OffscreenCanvas: contextThrows })).toBe(false);
  });

  it('asks a one-pixel canvas for exactly a webgl2 context', () => {
    const made: [number, number][] = [];
    const asked: string[] = [];
    const recording = class {
      constructor(width: number, height: number) {
        made.push([width, height]);
      }
      getContext(id: string) {
        asked.push(id);
        return {};
      }
    };
    hasWebGlInWorker({ OffscreenCanvas: recording });
    expect(made).toEqual([[1, 1]]);
    expect(asked).toEqual(['webgl2']);
  });
});
