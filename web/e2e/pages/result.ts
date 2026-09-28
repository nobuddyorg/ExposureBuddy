import {
  type Download,
  expect,
  type Locator,
  type Page,
} from '@playwright/test';

import type { DecodedPng } from '../png';

export type Slider = 'ghost' | 'blur' | 'glow';

interface Result {
  (): Locator;
  do: {
    canvasDigest(): Promise<number>;
    canvasPixels(): Promise<DecodedPng>;
    download(): Promise<Download>;
    setSlider(slider: Slider, fraction: number): Promise<void>;
    startOver(): Promise<void>;
    toggleCompare(): Promise<void>;
  };
  locators: {
    buttons: {
      compare: Locator;
      download: Locator;
      share: Locator;
      startOver: Locator;
    };
    canvas: Locator;
    sliders: Record<Slider, Locator>;
    stats: Locator;
  };
}

/** A cheap fingerprint of the whole canvas, for "did it change" without shipping the pixels out. */
function canvasDigest(canvas: Locator) {
  return canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d');
    if (!context) throw new Error('result canvas has no 2d context');
    const { width, height } = element as HTMLCanvasElement;
    const { data } = context.getImageData(0, 0, width, height);
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 1) {
      hash = Math.imul(hash ^ data[index], 16777619);
    }
    return hash >>> 0;
  });
}

/** Sets a range input's value through the prototype setter, so React's value tracker sees the change; false when already there. */
function setRangeValue(input: Locator, fraction: number) {
  return input.evaluate((element, value) => {
    const range = element as HTMLInputElement;
    const min = Number(range.min || 0);
    const max = Number(range.max || 100);
    const next = String(min + (max - min) * value);
    if (range.value === next) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(range, next);
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, fraction);
}

/** The screen with the composite and its sliders. */
export function initResult(page: Page): Result {
  const root = page
    .getByRole('main')
    .filter({ has: page.getByTestId('result-canvas') });
  const locators = {
    buttons: {
      compare: page.getByTestId('compare-toggle'),
      download: page.getByTestId('download'),
      share: page.getByTestId('share'),
      startOver: page.getByTestId('start-over'),
    },
    canvas: page.getByTestId('result-canvas'),
    sliders: {
      ghost: page.getByTestId('ghost-slider'),
      blur: page.getByTestId('blur-slider'),
      glow: page.getByTestId('glow-slider'),
    },
    stats: page.getByTestId('result-stats'),
  };
  // The composite re-renders in a worker after a debounce: wait for a change, then for two identical reads of it.
  const waitForRender = async (previousDigest: number) => {
    await expect
      .poll(() => canvasDigest(locators.canvas), { timeout: 15_000 })
      .not.toBe(previousDigest);
    await expect
      .poll(async () => {
        const first = await canvasDigest(locators.canvas);
        const second = await canvasDigest(locators.canvas);
        return first === second;
      })
      .toBe(true);
  };
  const interactions = {
    canvasDigest: () => canvasDigest(locators.canvas),
    // The backing store, not the CSS size: what the pipeline drew, at its resolution.
    canvasPixels: () =>
      locators.canvas.evaluate((element) => {
        const context = (element as HTMLCanvasElement).getContext('2d');
        if (!context) throw new Error('result canvas has no 2d context');
        const { width, height } = element as HTMLCanvasElement;
        const image = context.getImageData(0, 0, width, height);
        return { width: image.width, height: image.height, data: image.data };
      }),
    download: async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        locators.buttons.download.click(),
      ]);
      return download;
    },
    // `fraction` is 0–1 of the input's own range; returns once the canvas shows the new value.
    setSlider: async (slider: Slider, fraction: number) => {
      const before = await canvasDigest(locators.canvas);
      const changed = await setRangeValue(locators.sliders[slider], fraction);
      if (changed) await waitForRender(before);
    },
    startOver: async () => {
      await locators.buttons.startOver.click();
    },
    toggleCompare: async () => {
      await locators.buttons.compare.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
