import {
  DESCRIPTOR_WORDS,
  type GrayImage,
  type Point,
  type Rect,
} from '../types';
import { mulberry32 } from './random';

const SQUARE_GROUND = 30;
const SQUARE_BRIGHT = 220;

/** Returns a width × height gray image filled with `value`. */
export function flatGray(
  width: number,
  height: number,
  value: number,
): GrayImage {
  return { width, height, data: new Uint8Array(width * height).fill(value) };
}

/** Returns a dark image with one bright axis-aligned square covering `square` (exclusive far edges). */
export function brightSquare(
  width: number,
  height: number,
  square: Rect,
): GrayImage {
  const image = flatGray(width, height, SQUARE_GROUND);
  for (let y = square.y; y < square.y + square.height; y += 1) {
    image.data.fill(
      SQUARE_BRIGHT,
      y * width + square.x,
      y * width + square.x + square.width,
    );
  }
  return image;
}

/** Returns a seeded scene: a horizontal gradient, ~width·height/800 gray rectangles and ±4 noise, so FAST finds corners everywhere. */
export function texturedScene(width = 160, height = 120, seed = 7): GrayImage {
  const nextUniform = mulberry32(seed);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = 60 + Math.floor((80 * x) / width);
    }
  }
  const rectangleCount = Math.round((width * height) / 800);
  for (let rectangle = 0; rectangle < rectangleCount; rectangle += 1) {
    const left = Math.floor(nextUniform() * width);
    const top = Math.floor(nextUniform() * height);
    const right = Math.min(width, left + 8 + Math.floor(nextUniform() * 40));
    const bottom = Math.min(height, top + 8 + Math.floor(nextUniform() * 40));
    const value = 20 + Math.floor(nextUniform() * 200);
    for (let y = top; y < bottom; y += 1) {
      data.fill(value, y * width + left, y * width + right);
    }
  }
  for (let index = 0; index < data.length; index += 1) {
    const noise = Math.floor(nextUniform() * 9) - 4;
    data[index] = Math.min(255, Math.max(0, data[index] + noise));
  }
  return { width, height, data };
}

/** Returns `image` shifted by the integer (dx, dy), with uncovered pixels replicating the nearest source edge. */
export function shiftGray(image: GrayImage, dx: number, dy: number): GrayImage {
  const { width, height, data } = image;
  const shifted = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = clampIndex(y - dy, height);
    for (let x = 0; x < width; x += 1) {
      shifted[y * width + x] =
        data[sourceY * width + clampIndex(x - dx, width)];
    }
  }
  return { width, height, data: shifted };
}

/** Returns the centre of `image` as the rotation pivot `rotateGray` and `rotatePoint` share. */
export function centerOf(image: GrayImage): Point {
  return { x: (image.width - 1) / 2, y: (image.height - 1) / 2 };
}

/** Returns `point` rotated by `angleRadians` about `center`, y downward (positive angles turn clockwise on screen). */
export function rotatePoint(
  point: Point,
  center: Point,
  angleRadians: number,
): Point {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + cosine * dx - sine * dy,
    y: center.y + sine * dx + cosine * dy,
  };
}

/** Returns `image` rotated by `angleRadians` about its centre with bilinear sampling, edges replicated. */
export function rotateGray(image: GrayImage, angleRadians: number): GrayImage {
  const { width, height, data } = image;
  const center = centerOf(image);
  const rotated = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = rotatePoint({ x, y }, center, -angleRadians);
      rotated[y * width + x] = Math.round(
        sampleBilinear(data, width, height, source),
      );
    }
  }
  return { width, height, data: rotated };
}

function sampleBilinear(
  data: Uint8Array,
  width: number,
  height: number,
  point: Point,
): number {
  const x = Math.min(Math.max(point.x, 0), width - 1);
  const y = Math.min(Math.max(point.y, 0), height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fractionX = x - x0;
  const fractionY = y - y0;
  const top =
    data[y0 * width + x0] * (1 - fractionX) + data[y0 * width + x1] * fractionX;
  const bottom =
    data[y1 * width + x0] * (1 - fractionX) + data[y1 * width + x1] * fractionX;
  return top * (1 - fractionY) + bottom * fractionY;
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

/** Returns the number of differing bits between descriptor `first` of `a` and descriptor `second` of `b`. */
export function hammingDistance(
  a: Uint32Array,
  first: number,
  b: Uint32Array,
  second: number,
): number {
  let distance = 0;
  for (let word = 0; word < DESCRIPTOR_WORDS; word += 1) {
    let bits =
      a[first * DESCRIPTOR_WORDS + word] ^ b[second * DESCRIPTOR_WORDS + word];
    while (bits !== 0) {
      bits &= bits - 1;
      distance += 1;
    }
  }
  return distance;
}

/** Returns the signed difference `a − b` wrapped into (−π, π]. */
export function angleDifference(a: number, b: number): number {
  let difference = a - b;
  while (difference > Math.PI) difference -= 2 * Math.PI;
  while (difference <= -Math.PI) difference += 2 * Math.PI;
  return difference;
}
