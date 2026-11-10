import { describe, expect, it } from 'vitest';

import { seededRandom } from '../golden.test-support';
import { toRgba } from '../image/banded';
import { composite } from '../stack/composite';
import { stackFrames } from '../stack/synthetic.test-support';
import { rectSpans } from '../stack/synthetic.test-support';
import type { AlignedFrame, CompositeParams, RgbaImage } from '../types';
import { bandedFromRgba } from '../image/banded';
import { createStackSession } from './stackSession';

const SIZE = { width: 64, height: 48 };
const ALL_ROWS = { start: 0, end: SIZE.height };
const MEDIAN: CompositeParams = {
  background: 'median',
  ghostStrength: 0,
  ghostBlur: 0,
  glow: 0,
  trails: false,
  trail: 1,
};

function gaussian(random: () => number): number {
  return (
    Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
  );
}

/** Nine frames of a flat grey scene with sensor noise of `sigma`; the first is the reference. */
function burst(sigma: number): RgbaImage[] {
  const random = seededRandom(3);
  return Array.from({ length: 9 }, () => {
    const data = new Uint8ClampedArray(SIZE.width * SIZE.height * 4);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c += 1)
        data[i + c] = 120 + gaussian(random) * sigma;
      data[i + 3] = 255;
    }
    return { ...SIZE, data };
  });
}

const asFrame = (image: RgbaImage): AlignedFrame => ({
  image: bandedFromRgba(image),
  spans: rectSpans(SIZE, { x: 0, y: 0, ...SIZE }),
});

function sessionOf(frames: RgbaImage[]) {
  const session = createStackSession();
  session.addReference(frames[0], SIZE.height);
  frames
    .slice(1)
    .forEach((frame, index) => session.addFrame(index + 1, asFrame(frame)));
  session.crop();
  session.stackRows(ALL_ROWS);
  return session;
}

/** What the plain stack gives, without the smoothing. */
function plainMedian(frames: RgbaImage[]): RgbaImage {
  const stack = stackFrames(frames.map(asFrame), {
    rect: { x: 0, y: 0, ...SIZE },
  });
  return composite(stack, MEDIAN);
}

const spread = (image: RgbaImage): number => {
  const values = Array.from(
    { length: SIZE.width * SIZE.height },
    (_, i) => image.data[i * 4 + 1],
  );
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
  );
};

describe('createStackSession, smoothing', () => {
  it('smooths the background of a burst that is still noisy after stacking', () => {
    const frames = burst(30);
    const smoothed = sessionOf(frames).render(MEDIAN);
    expect(spread(smoothed)).toBeLessThan(spread(plainMedian(frames)) * 0.6);
  });

  it('leaves the background of a clean burst exactly as stacked', () => {
    const frames = burst(0.8);
    expect([...sessionOf(frames).render(MEDIAN).data]).toEqual([
      ...plainMedian(frames).data,
    ]);
  });

  it('smooths once: a second render of the same look is the same picture', () => {
    const session = sessionOf(burst(30));
    const first = session.render(MEDIAN);
    expect([...session.render(MEDIAN).data]).toEqual([...first.data]);
  });

  it('smooths the long exposure too, so the ghosts are not noisier than the scene', () => {
    const frames = burst(30);
    const everything: CompositeParams = { ...MEDIAN, ghostStrength: 1 };
    const stacked = stackFrames(frames.map(asFrame), {
      rect: { x: 0, y: 0, ...SIZE },
    });
    const plainMean = composite(stacked, everything);
    expect(spread(sessionOf(frames).render(everything))).toBeLessThan(
      spread(plainMean) * 0.8,
    );
  });

  it('keeps the size of the picture', () => {
    const out = sessionOf(burst(30)).render(MEDIAN);
    expect([out.width, out.height]).toEqual([SIZE.width, SIZE.height]);
    expect(toRgba(bandedFromRgba(out)).data).toHaveLength(
      SIZE.width * SIZE.height * 4,
    );
  });
});
