// Synthetic bursts for the e2e suite (`npm run fixtures`): a textured street seen through small camera shakes, with a walker.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputRoot = resolve(scriptDirectory, '../e2e/fixtures/generated');

const CHANNELS = 3;
const PERSON_COLOR = [240, 40, 190];
const NOISE_SIGMA = 2;
const MAX_ROTATION_DEGREES = 1.5;
const MAX_TRANSLATION_FRACTION = 0.03;
const MAX_SCALE_JITTER = 0.015;
const MAX_GAIN_JITTER = 0.05;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random, low, high) => low + (high - low) * random();

function gaussian(random) {
  const radius = Math.sqrt(-2 * Math.log(1 - random()));
  return radius * Math.cos(2 * Math.PI * random());
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function pngChunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  return Buffer.concat([uint32(data.length), typed, uint32(crc32(typed))]);
}

/** 8-bit RGB PNG, one filter-0 scanline per row. */
function encodePng({ width, height, data }) {
  const depthAndType = Buffer.from([8, 2, 0, 0, 0]);
  const header = Buffer.concat([uint32(width), uint32(height), depthAndType]);
  const stride = width * CHANNELS;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    scanlines.set(
      data.subarray(row * stride, (row + 1) * stride),
      row * (stride + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const createImage = (width, height) => ({
  width,
  height,
  data: new Uint8Array(width * height * CHANNELS),
});

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  image.data.set(color, (y * image.width + x) * CHANNELS);
}

const gray = (value) => [value, value, value];

function fillRect(image, rect, color) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      setPixel(image, x, y, color);
    }
  }
}

function fillEllipse(image, center, radiusX, radiusY, color) {
  const left = Math.floor(center.x - radiusX);
  const top = Math.floor(center.y - radiusY);
  for (let y = top; y <= center.y + radiusY; y += 1) {
    for (let x = left; x <= center.x + radiusX; x += 1) {
      const dx = (x - center.x) / radiusX;
      const dy = (y - center.y) / radiusY;
      if (dx * dx + dy * dy <= 1) setPixel(image, x, y, color);
    }
  }
}

function fillRoof(image, base, color) {
  for (let row = 0; row < base.height; row += 1) {
    const inset = Math.round((base.width / 2) * (1 - row / base.height));
    const y = base.y - base.height + row;
    for (let x = base.x + inset; x < base.x + base.width - inset; x += 1) {
      setPixel(image, x, y, color);
    }
  }
}

function paintSky(image, horizon) {
  for (let y = 0; y < horizon; y += 1) {
    const mix = y / horizon;
    const color = [170 + 55 * mix, 190 + 35 * mix, 215 + 20 * mix];
    for (let x = 0; x < image.width; x += 1) setPixel(image, x, y, color);
  }
}

/** Bricks shaded one by one, so every corner has a neighbourhood of its own and descriptors stay distinct. */
function paintBricks(image, wall, shade, random) {
  const brickWidth = 12;
  const brickHeight = 6;
  for (let y = wall.y; y < wall.y + wall.height; y += brickHeight) {
    const stagger = ((y - wall.y) / brickHeight) % 2 === 0 ? 0 : brickWidth / 2;
    for (let x = wall.x - stagger; x < wall.x + wall.width; x += brickWidth) {
      const left = Math.max(x, wall.x);
      const right = Math.min(x + brickWidth - 1, wall.x + wall.width);
      const bottom = Math.min(y + brickHeight - 1, wall.y + wall.height);
      const brick = { x: left, y, width: right - left, height: bottom - y };
      fillRect(image, brick, gray(shade + between(random, -14, 14)));
    }
  }
}

function paintWindows(image, wall, random) {
  const columns = Math.floor(between(random, 2, 5));
  const rows = Math.floor(between(random, 2, 4));
  const cellWidth = wall.width / columns;
  const cellHeight = wall.height / rows;
  const pane = gray(between(random, 35, 70));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = Math.round(wall.x + cellWidth * (column + 0.3));
      const y = Math.round(wall.y + cellHeight * (row + 0.25));
      const width = Math.round(cellWidth * 0.4);
      const height = Math.round(cellHeight * 0.45);
      const frame = {
        x: x - 1,
        y: y - 1,
        width: width + 2,
        height: height + 2,
      };
      fillRect(image, frame, gray(230));
      fillRect(image, { x, y, width, height }, pane);
    }
  }
}

function paintHouses(image, horizon, random) {
  const count = random() < 0.5 ? 4 : 5;
  const slot = image.width / count;
  for (let index = 0; index < count; index += 1) {
    const width = Math.round(slot * between(random, 0.6, 0.9));
    const height = Math.round(image.height * between(random, 0.2, 0.4));
    const x = Math.round(slot * index + between(random, 0, slot - width));
    const wall = { x, y: horizon - height, width, height };
    paintBricks(image, wall, between(random, 120, 200), random);
    paintWindows(image, wall, random);
    const roof = {
      ...wall,
      height: Math.round(image.height * between(random, 0.06, 0.12)),
    };
    fillRoof(image, roof, gray(between(random, 50, 110)));
  }
}

function paintGround(image, horizon, roadTop, random) {
  const band = (y, height) => ({ x: 0, y, width: image.width, height });
  fillRect(image, band(horizon, roadTop - horizon), gray(140));
  fillRect(image, band(roadTop, image.height - roadTop), gray(80));
  const dashY = Math.round((roadTop + image.height) / 2);
  for (let x = 0; x < image.width; x += 34) {
    fillRect(image, { x, y: dashY, width: 20, height: 2 }, gray(200));
  }
  for (let y = horizon; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * CHANNELS;
      const grain = between(random, -5, 5);
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        image.data[offset + channel] += grain;
      }
    }
  }
}

function paintLampPost(image, horizon, roadTop, random) {
  const x = Math.round(between(random, 0.1, 0.9) * image.width);
  const top = Math.round(horizon - image.height * 0.15);
  fillRect(image, { x, y: top, width: 3, height: roadTop - top }, gray(40));
  const lamp = { x: x - 4, y: top - 6, width: 11, height: 6 };
  fillRect(image, lamp, [250, 235, 160]);
}

/** The static scene for `seed`: sky, brick houses with windows and roofs, sidewalk, road, lamp post. */
function renderScene(seed, width, height) {
  const random = mulberry32(seed);
  const image = createImage(width, height);
  const horizon = Math.round(height * 0.55);
  const roadTop = Math.round(height * 0.7);
  paintSky(image, horizon);
  paintGround(image, horizon, roadTop, random);
  paintHouses(image, horizon, random);
  paintLampPost(image, horizon, roadTop, random);
  return { image, roadTop };
}

/** Ellipse head over a rectangle body, about 8% of the height, standing with the feet at `feet`. */
function personShape(height) {
  const headRadiusY = Math.round(height * 0.02);
  return {
    headRadiusX: Math.round(height * 0.015),
    headRadiusY,
    bodyWidth: Math.round(height * 0.036),
    bodyHeight: Math.round(height * 0.045),
    totalHeight: headRadiusY * 2 + Math.round(height * 0.045),
  };
}

function paintPerson(image, feet, shape) {
  const body = {
    x: Math.round(feet.x - shape.bodyWidth / 2),
    y: feet.y - shape.bodyHeight,
    width: shape.bodyWidth,
    height: shape.bodyHeight,
  };
  fillRect(image, body, PERSON_COLOR);
  const head = { x: feet.x, y: body.y - shape.headRadiusY };
  fillEllipse(image, head, shape.headRadiusX, shape.headRadiusY, PERSON_COLOR);
}

/** Inverse-maps every output pixel through the similarity (frame = c + s·R(θ)(scene − c) + t) and samples bilinearly. */
function renderFrame(scene, transform, gain, random) {
  const { width, height } = scene;
  const frame = createImage(width, height);
  const cosine = Math.cos(-transform.angle) / transform.scale;
  const sine = Math.sin(-transform.angle) / transform.scale;
  const centerX = width / 2;
  const centerY = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX - transform.tx;
      const dy = y - centerY - transform.ty;
      const sourceX = centerX + cosine * dx - sine * dy;
      const sourceY = centerY + sine * dx + cosine * dy;
      const x0 = Math.max(0, Math.min(width - 2, Math.floor(sourceX)));
      const y0 = Math.max(0, Math.min(height - 2, Math.floor(sourceY)));
      const fx = Math.max(0, Math.min(1, sourceX - x0));
      const fy = Math.max(0, Math.min(1, sourceY - y0));
      const topLeft = (y0 * width + x0) * CHANNELS;
      const target = (y * width + x) * CHANNELS;
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        const top =
          scene.data[topLeft + channel] * (1 - fx) +
          scene.data[topLeft + CHANNELS + channel] * fx;
        const bottom =
          scene.data[topLeft + width * CHANNELS + channel] * (1 - fx) +
          scene.data[topLeft + (width + 1) * CHANNELS + channel] * fx;
        const value =
          (top * (1 - fy) + bottom * fy) * gain +
          gaussian(random) * NOISE_SIGMA;
        frame.data[target + channel] = Math.round(
          Math.max(0, Math.min(255, value)),
        );
      }
    }
  }
  return frame;
}

function randomTransform(random, width) {
  return {
    angle: (between(random, -1, 1) * MAX_ROTATION_DEGREES * Math.PI) / 180,
    scale: 1 + between(random, -1, 1) * MAX_SCALE_JITTER,
    tx: between(random, -1, 1) * MAX_TRANSLATION_FRACTION * width,
    ty: between(random, -1, 1) * MAX_TRANSLATION_FRACTION * width,
  };
}

function writePng(directory, name, image) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, name), encodePng(image));
}

/** `frameCount` shaken frames of one scene with a walker crossing the road, plus the clean scene and meta.json; returns the frames. */
function writeBurst({ name, seed, width, height, frameCount }) {
  const directory = resolve(outputRoot, name);
  const random = mulberry32(seed + 1);
  const { image: background, roadTop } = renderScene(seed, width, height);
  const shape = personShape(height);
  const feetY = Math.round((roadTop + height) / 2) + shape.bodyHeight;
  const walkStart = Math.round(width * 0.15);
  const walkEnd = Math.round(width * 0.85);
  const stride = (walkEnd - walkStart) / Math.max(1, frameCount - 1);
  const frames = [];
  const images = [];
  for (let index = 0; index < frameCount; index += 1) {
    const feetX = Math.round(walkStart + stride * index);
    const scene = { width, height, data: background.data.slice() };
    paintPerson(scene, { x: feetX, y: feetY }, shape);
    const transform = randomTransform(random, width);
    const gain = 1 + between(random, -1, 1) * MAX_GAIN_JITTER;
    const file = `frame-${String(index).padStart(2, '0')}.png`;
    const image = renderFrame(scene, transform, gain, random);
    writePng(directory, file, image);
    images.push(image);
    frames.push({ file, transform, gain, person: { x: feetX, y: feetY } });
  }
  writePng(directory, 'background.png', background);
  const halfWidth = Math.ceil(shape.bodyWidth / 2) + 1;
  const meta = {
    width,
    height,
    frameCount,
    // The pipeline's reference is the middle frame, floor((n - 1) / 2).
    referenceIndex: Math.floor((frameCount - 1) / 2),
    // Convention: frame = center + scale * rotate(angle) * (scene - center) + (tx, ty), angle in radians.
    person: { width: shape.bodyWidth, height: shape.totalHeight },
    roadBand: {
      x: walkStart - halfWidth,
      y: feetY - shape.totalHeight,
      width: walkEnd - walkStart + 2 * halfWidth,
      height: shape.totalHeight + 1,
    },
    frames,
  };
  writeFileSync(resolve(directory, 'meta.json'), JSON.stringify(meta, null, 2));
  return images;
}

/** `image` smeared horizontally over `length` pixels, as a camera moving during the exposure would; edges replicated. */
function motionBlur(image, length) {
  const { width, height } = image;
  const blurred = createImage(width, height);
  const half = Math.floor(length / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        let sum = 0;
        for (let offset = -half; offset <= half; offset += 1) {
          const sourceX = Math.max(0, Math.min(width - 1, x + offset));
          sum += image.data[(y * width + sourceX) * CHANNELS + channel];
        }
        blurred.data[(y * width + x) * CHANNELS + channel] = Math.round(
          sum / (2 * half + 1),
        );
      }
    }
  }
  return blurred;
}

const BURSTS = [
  { name: 'burst-street', seed: 7, width: 640, height: 480, frameCount: 12 },
  { name: 'burst-tiny', seed: 11, width: 320, height: 240, frameCount: 3 },
];
const [street] = BURSTS.map(writeBurst);
// Soft enough to be left out as blurred, sharp enough to still align (a 7 px smear no longer does).
writePng(
  resolve(outputRoot, 'shaken'),
  'frame-07-blurred.png',
  motionBlur(street[7], 3),
);
const unrelated = resolve(outputRoot, 'unrelated');
writePng(unrelated, 'scene-a.png', renderScene(101, 640, 480).image);
writePng(unrelated, 'scene-b.png', renderScene(202, 640, 480).image);
writeFileSync(resolve(outputRoot, 'not-an-image.txt'), 'not a photo\n');
console.log(`fixtures written to ${outputRoot}`);
