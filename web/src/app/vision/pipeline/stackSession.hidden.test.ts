import { describe, expect, it } from 'vitest';

import {
  pixelOf,
  flatBanded,
  rectSpans,
  type Rgb,
} from '../stack/synthetic.test-support';
import type {
  AlignedFrame,
  CompositeParams,
  GrayImage,
  RgbaImage,
} from '../types';
import { createStackSession } from './stackSession';

const SIZE = { width: 4, height: 4 };
const ALL_ROWS = { start: 0, end: 4 };
const SCENE: Rgb = [100, 100, 100];
const PERSON: Rgb = [240, 20, 20];
const MEDIAN: CompositeParams = {
  background: 'median',
  ghostStrength: 0,
  ghostBlur: 0,
  glow: 0,
  trails: false,
};

const reference = (): RgbaImage => ({
  ...SIZE,
  data: Uint8ClampedArray.from({ length: 64 }, (_, i) =>
    i % 4 === 3 ? 255 : 100,
  ),
});

function frame(color: Rgb): AlignedFrame {
  return {
    image: flatBanded(SIZE, color),
    spans: rectSpans(SIZE, { x: 0, y: 0, ...SIZE }),
  };
}

const everywhere: GrayImage = { ...SIZE, data: new Uint8Array(16).fill(255) };
const nowhere: GrayImage = { ...SIZE, data: new Uint8Array(16) };

// The reference shows the scene, two frames a person: the plain median is not the scene (exposure matching shifts it, so tests compare, not hard-code).
function burst() {
  const session = createStackSession();
  session.addReference(reference(), 4);
  session.addFrame(1, frame(PERSON));
  session.addFrame(2, frame(PERSON));
  return session;
}

function medianAt(session: ReturnType<typeof burst>): number[] {
  session.crop();
  session.stackRows(ALL_ROWS);
  const image = session.render(MEDIAN);
  return Array.from(image.data.subarray(0, 3));
}

describe('createStackSession, masks', () => {
  it('leaves the frames with a person out of the background once every frame has a mask', () => {
    const session = burst();
    session.addMask('reference', nowhere);
    session.addMask(1, everywhere);
    session.addMask(2, everywhere);
    expect(medianAt(session)).toEqual([...SCENE]);
  });

  it('ignores the masks while one frame has none', () => {
    const session = burst();
    session.addMask('reference', nowhere);
    session.addMask(1, everywhere);
    expect(medianAt(session)).toEqual(medianAt(burst()));
    expect(medianAt(burst())).not.toEqual([...SCENE]);
  });

  it('forgets the mask of a dropped frame, so the others count again', () => {
    const session = burst();
    session.addMask('reference', nowhere);
    session.addMask(1, everywhere);
    session.addMask(2, everywhere);
    session.dropFrame(2);
    // Reference (scene) and frame 1 (person, masked) remain: only the reference is visible.
    expect(medianAt(session)).toEqual([...SCENE]);
  });

  it("does not use a dropped frame's mask for the frames that are left", () => {
    const session = burst();
    session.addMask('reference', nowhere);
    session.addMask(2, everywhere);
    session.dropFrame(1);
    // Frame 1 is gone; the reference and frame 2 each have a mask, and frame 2 is hidden.
    expect(medianAt(session)).toEqual([...SCENE]);
    expect(pixelOf(frame(SCENE).image, 0, 0)).toEqual([...SCENE]);
  });

  it('forgets every mask on dispose', () => {
    const session = burst();
    session.addMask('reference', nowhere);
    session.dispose();
    const next = burst();
    expect(medianAt(next)).not.toEqual([...SCENE]);
  });

  it('fills a pixel every frame shows a mover on from the colours around it', () => {
    const session = createStackSession();
    session.addReference(reference(), 4);
    session.addFrame(1, frame(PERSON));
    // Every frame is hidden in the same pixel; the rest of the picture is clear.
    const oneSpot: GrayImage = { ...SIZE, data: new Uint8Array(16) };
    oneSpot.data[1 * 4 + 1] = 255;
    session.addMask('reference', oneSpot);
    session.addMask(1, oneSpot);
    session.crop();
    session.stackRows(ALL_ROWS);
    const image = session.render(MEDIAN);
    const at = (x: number, y: number) =>
      Array.from(image.data.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 3));
    // The neighbours are the plain two-frame median; the hole takes their colour, not a mix of person and scene.
    expect(at(1, 1)).toEqual(at(2, 1));
  });

  it('leaves the median alone when no masks were given', () => {
    const session = burst();
    expect(medianAt(session)).toEqual(medianAt(burst()));
  });

  it('shows the replaced long exposure, cropped to what every frame covers', () => {
    const session = burst();
    session.crop();
    session.stackRows(ALL_ROWS);
    const long: RgbaImage = {
      ...SIZE,
      data: Uint8ClampedArray.from({ length: 64 }, (_, i) =>
        i % 4 === 3 ? 255 : 77,
      ),
    };
    session.setMean(long);
    const everything: CompositeParams = { ...MEDIAN, ghostStrength: 1 };
    expect(Array.from(session.render(everything).data.subarray(0, 3))).toEqual([
      77, 77, 77,
    ]);
    expect(Array.from(session.render(MEDIAN).data.subarray(0, 3))).not.toEqual([
      77, 77, 77,
    ]);
  });
});
