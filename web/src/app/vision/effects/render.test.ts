import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { digest } from '../golden.test-support';
import { EFFECTS, type EffectParams } from './effectParams';
import {
  pixelOf,
  rectMask,
  solidImage,
  withRect,
} from './effects.test-support';
import {
  featherRadius,
  prepareScene,
  reachPixels,
  renderScene,
} from './render';

const BACKGROUND = [100, 100, 100, 255];
const PERSON = { x: 45, y: 15, width: 10, height: 30 };
const photo = withRect(
  solidImage(100, 60, [100, 100, 100]),
  PERSON,
  [255, 0, 0],
);
function buildScene() {
  const scene = prepareScene(photo, rectMask(100, 60, PERSON));
  if (!scene) throw new Error('the scene should have a person');
  return scene;
}

// Built on first use, not at load (a scene made on import would make prepareScene code every test depends on), and shared: renderScene never changes it.
let sharedScene: ReturnType<typeof buildScene> | undefined;
function makeScene() {
  sharedScene ??= buildScene();
  return sharedScene;
}

const render = (params: Partial<EffectParams>) =>
  renderScene(makeScene(), {
    effect: 'motion',
    strength: 1,
    angle: 0,
    ...params,
  });

describe('prepareScene', () => {
  it('finds nobody in an empty mask', () => {
    expect(
      prepareScene(
        photo,
        rectMask(100, 60, { x: 0, y: 0, width: 0, height: 0 }),
      ),
    ).toBeNull();
  });

  it('bounds the people, feather included', () => {
    const scene = buildScene();
    expect(scene.bounds.x).toBeLessThanOrEqual(PERSON.x);
    expect(scene.bounds.x).toBeGreaterThanOrEqual(PERSON.x - 3);
    expect(scene.bounds.y + scene.bounds.height).toBeGreaterThanOrEqual(
      PERSON.y + PERSON.height,
    );
  });

  it('shows the empty scene on the plate where the people stood, and the photo elsewhere', () => {
    const scene = buildScene();
    expect(pixelOf(scene.plate, 50, 30)).toEqual(BACKGROUND);
    expect(pixelOf(scene.plate, 45, 15)).toEqual(BACKGROUND);
    expect(pixelOf(scene.plate, 5, 5)).toEqual(BACKGROUND);
  });

  it('lifts the people off the photo as opaque colour in the middle and nothing far away', () => {
    const scene = buildScene();
    expect(
      Array.from(
        scene.people.data.subarray(
          (30 * 100 + 50) * 4,
          (30 * 100 + 50) * 4 + 4,
        ),
      ),
    ).toEqual([255, 0, 0, 255]);
    expect(scene.people.data[(5 * 100 + 5) * 4 + 3]).toBe(0);
  });
});

describe('featherRadius', () => {
  it('is a 400th of the long edge, rounded, and never less than one pixel', () => {
    expect(featherRadius({ width: 200, height: 120 })).toBe(1);
    expect(featherRadius({ width: 120, height: 200 })).toBe(1);
    expect(featherRadius({ width: 10, height: 10 })).toBe(1);
    expect(featherRadius({ width: 800, height: 600 })).toBe(2);
    expect(featherRadius({ width: 600, height: 800 })).toBe(2);
    expect(featherRadius({ width: 1599, height: 1200 })).toBe(4);
    expect(featherRadius({ width: 1000, height: 1000 })).toBe(3);
  });

  it('is what prepareScene feathers by: the people reach no further than twice that past the mask', () => {
    const scene = buildScene();
    const spread = PERSON.x - scene.bounds.x;
    expect(spread).toBeGreaterThanOrEqual(1);
    expect(spread).toBeLessThanOrEqual(2 * featherRadius(photo));
  });
});

describe('reachPixels', () => {
  it('is 15 % of the long edge at full strength, scaled by strength', () => {
    expect(reachPixels(1, { width: 200, height: 120 })).toBe(30);
    expect(reachPixels(1, { width: 120, height: 200 })).toBe(30);
    expect(reachPixels(0.5, { width: 200, height: 120 })).toBe(15);
    expect(reachPixels(0, { width: 200, height: 120 })).toBe(0);
  });
});

describe('renderScene', () => {
  it('keeps the people and the scene at strength 0, whatever the effect', () => {
    for (const effect of EFFECTS) {
      const out = render({ effect, strength: 0 });
      expect(pixelOf(out, 50, 30)).toEqual([255, 0, 0, 255]);
      expect(pixelOf(out, 75, 30)).toEqual(BACKGROUND);
    }
  });

  it('motion blur ghosts the people sideways and leaves the rows above them alone', () => {
    const out = render({ effect: 'motion', angle: 0 });
    const [r, g] = pixelOf(out, 59, 30);
    expect(r).toBeGreaterThan(100);
    expect(g).toBeLessThan(100);
    expect(pixelOf(out, 50, 7)).toEqual(BACKGROUND);
    const [centre] = pixelOf(out, 50, 30);
    expect(centre).toBeLessThan(255);
    expect(centre).toBeGreaterThan(100);
  });

  it('motion blur follows the angle: down ghosts the rows below, not the columns beside', () => {
    const out = render({ effect: 'motion', angle: 90 });
    expect(pixelOf(out, 50, 50)[0]).toBeGreaterThan(100);
    expect(pixelOf(out, 59, 30)).toEqual(BACKGROUND);
  });

  it('smear trails behind a movement to the right: ghost on the left, clean on the right', () => {
    const out = render({ effect: 'smear', angle: 0 });
    expect(pixelOf(out, 37, 30)[0]).toBeGreaterThan(100);
    expect(pixelOf(out, 59, 30)).toEqual(BACKGROUND);
  });

  it('liquid moves the people around the same place every time', () => {
    const first = render({ effect: 'liquid' });
    const second = render({ effect: 'liquid' });
    expect(second.data).toEqual(first.data);
    expect(first.data).not.toEqual(
      render({ effect: 'liquid', strength: 0 }).data,
    );
  });

  it('smear trails one and a half times the reach behind the people, and no further', () => {
    // Reach 15 at full strength, so the trail is 22 px long: 25 px left of the people's edge at 45, the trail has faded out.
    const out = render({ effect: 'smear', angle: 0 });
    expect(pixelOf(out, 30, 30)[0]).toBeGreaterThan(100);
    expect(pixelOf(out, 24, 30)[0]).toBeGreaterThan(100);
    expect(pixelOf(out, 20, 30)).toEqual(BACKGROUND);
  });

  it('smoke is translucent: neither the person nor the plate in the middle of the cloud', () => {
    const out = render({ effect: 'smoke' });
    let translucent = 0;
    for (let x = 46; x < 54; x += 1) {
      const [r] = pixelOf(out, x, 30);
      if (r > 100 && r < 255) translucent += 1;
    }
    expect(translucent).toBeGreaterThan(4);
  });

  it('touches nothing outside the reach of the effect, and always returns an opaque photo of the same size', () => {
    const scene = makeScene();
    fc.assert(
      fc.property(
        fc.constantFrom(...EFFECTS),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 359 }),
        (effect, strength, angle) => {
          const out = renderScene(scene, { effect, strength, angle });
          expect([out.width, out.height]).toEqual([100, 60]);
          const margin = Math.ceil(reachPixels(strength, scene.plate) * 2);
          const left = scene.bounds.x - margin;
          const wrong: string[] = [];
          for (let y = 0; y < 60; y += 4) {
            for (let x = 0; x < 100; x += 3) {
              const pixel = pixelOf(out, x, y);
              if (pixel[3] !== 255) wrong.push(`${x},${y} not opaque`);
              if (x < left - 1 && pixel.join() !== BACKGROUND.join())
                wrong.push(`${x},${y} changed outside the reach`);
            }
          }
          expect(wrong).toEqual([]);
        },
      ),
      // Each run renders a whole photo; a few dozen cover the property.
      { numRuns: 10 },
    );
  });
});

// Digests of the plate and of every effect on a textured photo, recorded from output checked by eye on a real street photo:
// they pin the noise, the drift, the feather and the order of the passes, which the behavioural tests above cannot see.
describe('renderScene, golden digests', () => {
  const GOLDEN_PERSON = { x: 90, y: 30, width: 20, height: 60 };
  function textured() {
    const base = solidImage(200, 120, [100, 100, 100]);
    for (let y = 0; y < 120; y += 1)
      for (let x = 0; x < 200; x += 1)
        base.data.set(
          [
            60 + ((x * 3 + y * 5) % 90),
            80 + ((x * 7) % 60),
            90 + ((y * 11) % 70),
            255,
          ],
          (y * 200 + x) * 4,
        );
    return withRect(base, GOLDEN_PERSON, [250, 20, 40]);
  }
  let built: ReturnType<typeof prepareScene>;
  function textureScene() {
    built ??= prepareScene(textured(), rectMask(200, 120, GOLDEN_PERSON));
    if (!built) throw new Error('the scene should have a person');
    return built;
  }
  const digestOf = (data: ArrayLike<number>) => {
    const hash = digest();
    for (let i = 0; i < data.length; i += 1) hash.add(Math.round(data[i]));
    return hash.value();
  };

  it('keeps the plate behind the people as it was recorded', () => {
    expect(digestOf(textureScene().plate.data)).toBe(1680082838);
  });

  it.each([
    ['motion', 3925492565],
    ['smear', 822021012],
    ['liquid', 3582543747],
    ['smoke', 2453103050],
  ] as const)('renders %s as recorded', (effect, expected) => {
    const out = renderScene(textureScene(), {
      effect,
      strength: 0.8,
      angle: 30,
    });
    expect(digestOf(out.data)).toBe(expected);
  });
});
