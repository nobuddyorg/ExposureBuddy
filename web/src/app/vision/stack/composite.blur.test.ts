import { describe, expect, it, vi } from 'vitest';

import { boxBlurInPlace } from './boxBlur';
import { composite } from './composite';
import { flatFrame, stackFrames } from './synthetic.test-support';

vi.mock('./boxBlur', async (importOriginal) => {
  const original = await importOriginal<typeof import('./boxBlur')>();
  return { ...original, boxBlurInPlace: vi.fn(original.boxBlurInPlace) };
});

const SIZE = { width: 4, height: 3 };

function stack() {
  return stackFrames(
    [flatFrame(SIZE, [10, 20, 30]), flatFrame(SIZE, [200, 100, 50])],
    { rect: { x: 0, y: 0, ...SIZE } },
  );
}

// A blur costs three passes over a layer per channel; one whose weight is 0 cannot show, so it must not be paid for.
describe('composite blur work', () => {
  it('blurs neither layer when ghosts and glow are both off', () => {
    vi.mocked(boxBlurInPlace).mockClear();
    composite(stack(), {
      background: 'median',
      ghostStrength: 0,
      ghostBlur: 4,
      glow: 0,
      trails: false,
    });
    expect(boxBlurInPlace).not.toHaveBeenCalled();
  });

  it('blurs only the ghost layer when the glow is off, once per channel', () => {
    vi.mocked(boxBlurInPlace).mockClear();
    composite(stack(), {
      background: 'median',
      ghostStrength: 0.5,
      ghostBlur: 4,
      glow: 0,
      trails: false,
    });
    expect(boxBlurInPlace).toHaveBeenCalledTimes(3);
    expect(vi.mocked(boxBlurInPlace).mock.calls.map((call) => call[2])).toEqual(
      [4, 4, 4],
    );
  });

  it('blurs only the glow layer, wider, when the ghosts are off', () => {
    vi.mocked(boxBlurInPlace).mockClear();
    composite(stack(), {
      background: 'median',
      ghostStrength: 0,
      ghostBlur: 4,
      glow: 0.5,
      trails: false,
    });
    expect(vi.mocked(boxBlurInPlace).mock.calls.map((call) => call[2])).toEqual(
      [14, 14, 14],
    );
  });
});
