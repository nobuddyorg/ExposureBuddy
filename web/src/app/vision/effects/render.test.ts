import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EFFECTS, type EffectParams } from './effectParams';
import {
  pixelOf,
  rectMask,
  solidImage,
  withRect,
} from './effects.test-support';
import { prepareScene, reachPixels, renderScene } from './render';

const BACKGROUND = [100, 100, 100, 255];
const PERSON = { x: 90, y: 30, width: 20, height: 60 };
const photo = withRect(
  solidImage(200, 120, [100, 100, 100]),
  PERSON,
  [255, 0, 0],
);
const scene = prepareScene(photo, rectMask(200, 120, PERSON));
if (!scene) throw new Error('the scene should have a person');

const render = (params: Partial<EffectParams>) =>
  renderScene(scene, { effect: 'motion', strength: 1, angle: 0, ...params });

describe('prepareScene', () => {
  it('finds nobody in an empty mask', () => {
    expect(
      prepareScene(
        photo,
        rectMask(200, 120, { x: 0, y: 0, width: 0, height: 0 }),
      ),
    ).toBeNull();
  });

  it('bounds the people, feather included', () => {
    expect(scene.bounds.x).toBeLessThanOrEqual(PERSON.x);
    expect(scene.bounds.x).toBeGreaterThanOrEqual(PERSON.x - 3);
    expect(scene.bounds.y + scene.bounds.height).toBeGreaterThanOrEqual(
      PERSON.y + PERSON.height,
    );
  });

  it('shows the empty scene on the plate where the people stood, and the photo elsewhere', () => {
    expect(pixelOf(scene.plate, 100, 60)).toEqual(BACKGROUND);
    expect(pixelOf(scene.plate, 90, 30)).toEqual(BACKGROUND);
    expect(pixelOf(scene.plate, 10, 10)).toEqual(BACKGROUND);
  });

  it('lifts the people off the photo as opaque colour in the middle and nothing far away', () => {
    expect(
      Array.from(
        scene.people.data.subarray(
          (60 * 200 + 100) * 4,
          (60 * 200 + 100) * 4 + 4,
        ),
      ),
    ).toEqual([255, 0, 0, 255]);
    expect(scene.people.data[(10 * 200 + 10) * 4 + 3]).toBe(0);
  });
});

describe('prepareScene on a larger photo', () => {
  it('feathers by a share of the long edge: one pixel at 200, two at 800', () => {
    const big = withRect(
      solidImage(800, 600, [100, 100, 100]),
      { x: 360, y: 200, width: 80, height: 240 },
      [255, 0, 0],
    );
    const bigScene = prepareScene(
      big,
      rectMask(800, 600, { x: 360, y: 200, width: 80, height: 240 }),
    );
    if (!bigScene) throw new Error('the scene should have a person');
    expect(360 - bigScene.bounds.x).toBeGreaterThanOrEqual(3);
    expect(360 - bigScene.bounds.x).toBeLessThanOrEqual(4);
    expect(PERSON.x - scene.bounds.x).toBeGreaterThanOrEqual(1);
    expect(PERSON.x - scene.bounds.x).toBeLessThanOrEqual(2);
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
      expect(pixelOf(out, 100, 60)).toEqual([255, 0, 0, 255]);
      expect(pixelOf(out, 150, 60)).toEqual(BACKGROUND);
    }
  });

  it('motion blur ghosts the people sideways and leaves the rows above them alone', () => {
    const out = render({ effect: 'motion', angle: 0 });
    const [r, g] = pixelOf(out, 118, 60);
    expect(r).toBeGreaterThan(100);
    expect(g).toBeLessThan(100);
    expect(pixelOf(out, 100, 15)).toEqual(BACKGROUND);
    const [centre] = pixelOf(out, 100, 60);
    expect(centre).toBeLessThan(255);
    expect(centre).toBeGreaterThan(100);
  });

  it('motion blur follows the angle: down ghosts the rows below, not the columns beside', () => {
    const out = render({ effect: 'motion', angle: 90 });
    expect(pixelOf(out, 100, 100)[0]).toBeGreaterThan(100);
    expect(pixelOf(out, 118, 60)).toEqual(BACKGROUND);
  });

  it('smear trails behind a movement to the right: ghost on the left, clean on the right', () => {
    const out = render({ effect: 'smear', angle: 0 });
    expect(pixelOf(out, 75, 60)[0]).toBeGreaterThan(100);
    expect(pixelOf(out, 118, 60)).toEqual(BACKGROUND);
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
    // Reach 30 at full strength, so the trail is 45 px long: 45 px left of the people's edge at 90, the trail has faded out.
    const out = render({ effect: 'smear', angle: 0 });
    expect(pixelOf(out, 60, 60)[0]).toBeGreaterThan(100);
    expect(pixelOf(out, 48, 60)[0]).toBeGreaterThan(100);
    expect(pixelOf(out, 40, 60)).toEqual(BACKGROUND);
  });

  it('smoke is translucent: neither the person nor the plate in the middle of the cloud', () => {
    const out = render({ effect: 'smoke' });
    let translucent = 0;
    for (let x = 92; x < 108; x += 1) {
      const [r] = pixelOf(out, x, 60);
      if (r > 100 && r < 255) translucent += 1;
    }
    expect(translucent).toBeGreaterThan(8);
  });

  it('touches nothing outside the reach of the effect, and always returns an opaque photo of the same size', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EFFECTS),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 359 }),
        (effect, strength, angle) => {
          const out = renderScene(scene, { effect, strength, angle });
          expect([out.width, out.height]).toEqual([200, 120]);
          const margin = Math.ceil(reachPixels(strength, scene.plate) * 2);
          const left = scene.bounds.x - margin;
          for (let y = 0; y < 120; y += 7) {
            for (let x = 0; x < 200; x += 5) {
              const pixel = pixelOf(out, x, y);
              expect(pixel[3]).toBe(255);
              if (x < left - 1) expect(pixel).toEqual(BACKGROUND);
            }
          }
        },
      ),
      // Each run renders a whole photo; a few dozen cover the property.
      { numRuns: 40 },
    );
  });
});
