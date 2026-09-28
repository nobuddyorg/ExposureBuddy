// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installCanvasStubs,
  rgbaImage,
  type CanvasStubs,
} from './canvas.test-support';
import type { RgbaImage } from '../../vision/types';
import { useCanvasImage } from './useCanvasImage';

let stubs: CanvasStubs;

beforeEach(() => {
  stubs = installCanvasStubs();
});

afterEach(() => {
  stubs.restore();
});

function Canvas({ image }: { image: RgbaImage | null }) {
  const ref = useCanvasImage(image);
  return <canvas ref={ref} data-testid="canvas" />;
}

describe('useCanvasImage', () => {
  it('draws the image at its own size', () => {
    const image = rgbaImage(5, 2);
    const { getByTestId } = render(<Canvas image={image} />);
    const canvas = getByTestId('canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(5);
    expect(canvas.height).toBe(2);
    const [drawn, x, y] = stubs.context.putImageData.mock.calls[0] as [
      ImageData,
      number,
      number,
    ];
    expect([drawn.width, drawn.height, x, y]).toEqual([5, 2, 0, 0]);
    expect(drawn.data).toBe(image.data);
  });

  it('draws nothing for null and again once an image arrives', () => {
    const { rerender } = render(<Canvas image={null} />);
    expect(stubs.context.putImageData).not.toHaveBeenCalled();
    rerender(<Canvas image={rgbaImage(2, 2)} />);
    expect(stubs.context.putImageData).toHaveBeenCalledOnce();
  });

  it('redraws only when the image changes', () => {
    const image = rgbaImage(2, 2);
    const { rerender } = render(<Canvas image={image} />);
    rerender(<Canvas image={image} />);
    expect(stubs.context.putImageData).toHaveBeenCalledOnce();
    rerender(<Canvas image={rgbaImage(2, 2, 9)} />);
    expect(stubs.context.putImageData).toHaveBeenCalledTimes(2);
  });

  it('leaves the canvas alone when the browser gives no 2D context', () => {
    stubs.restore();
    stubs = installCanvasStubs();
    (
      HTMLCanvasElement.prototype.getContext as unknown as {
        mockImplementation: (f: () => null) => void;
      }
    ).mockImplementation(() => null);
    const { getByTestId } = render(<Canvas image={rgbaImage(3, 3)} />);
    expect((getByTestId('canvas') as HTMLCanvasElement).width).not.toBe(3);
    expect(stubs.context.putImageData).not.toHaveBeenCalled();
  });
});
