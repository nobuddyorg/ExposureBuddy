import { DESCRIPTOR_WORDS, type FeatureSet, type Match } from '../types';

/** Returns the number of set bits in `value` read as an unsigned 32-bit integer. */
export function popcount32(value: number): number {
  let bits = value >>> 0;
  bits -= (bits >>> 1) & 0x55555555;
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
  bits = (bits + (bits >>> 4)) & 0x0f0f0f0f;
  return Math.imul(bits, 0x01010101) >>> 24;
}

/** Returns the Hamming distance (0–256) between keypoint `aIndex` of `a` and keypoint `bIndex` of `b`. */
export function hammingDistance(
  a: Uint32Array,
  aIndex: number,
  b: Uint32Array,
  bIndex: number,
): number {
  const aOffset = aIndex * DESCRIPTOR_WORDS;
  const bOffset = bIndex * DESCRIPTOR_WORDS;
  let distance = 0;
  for (let word = 0; word < DESCRIPTOR_WORDS; word += 1) {
    distance += popcount32(a[aOffset + word] ^ b[bOffset + word]);
  }
  return distance;
}

export interface MatchOptions {
  /** Lowe's ratio: a match survives only when best < ratio × second best. */
  readonly ratio: number;
  /** Require the train keypoint's best query to be the matched query. */
  readonly crossCheck: boolean;
  /** Largest Hamming distance still accepted as a match. */
  readonly maxDistance: number;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  ratio: 0.8,
  crossCheck: true,
  maxDistance: 80,
};

const NO_MATCH = -1;

interface NearestNeighbours {
  readonly bestTrain: Int32Array;
  readonly bestDistance: Float64Array;
  readonly secondDistance: Float64Array;
  readonly trainBestQuery: Int32Array;
}

function findNearestNeighbours(
  query: FeatureSet,
  train: FeatureSet,
): NearestNeighbours {
  const queryCount = query.keypoints.length;
  const trainCount = train.keypoints.length;
  const bestTrain = new Int32Array(queryCount).fill(NO_MATCH);
  const bestDistance = new Float64Array(queryCount).fill(Infinity);
  const secondDistance = new Float64Array(queryCount).fill(Infinity);
  const trainBestQuery = new Int32Array(trainCount).fill(NO_MATCH);
  const trainBestDistance = new Float64Array(trainCount).fill(Infinity);
  for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
    for (let trainIndex = 0; trainIndex < trainCount; trainIndex += 1) {
      const distance = hammingDistance(
        query.descriptors,
        queryIndex,
        train.descriptors,
        trainIndex,
      );
      if (distance < bestDistance[queryIndex]) {
        secondDistance[queryIndex] = bestDistance[queryIndex];
        bestDistance[queryIndex] = distance;
        bestTrain[queryIndex] = trainIndex;
      } else if (distance < secondDistance[queryIndex]) {
        secondDistance[queryIndex] = distance;
      }
      if (distance < trainBestDistance[trainIndex]) {
        trainBestDistance[trainIndex] = distance;
        trainBestQuery[trainIndex] = queryIndex;
      }
    }
  }
  return { bestTrain, bestDistance, secondDistance, trainBestQuery };
}

/** Returns the brute-force matches from `query` into `train` that pass the ratio, distance and cross checks. */
export function matchDescriptors(
  query: FeatureSet,
  train: FeatureSet,
  options: Partial<MatchOptions> = {},
): Match[] {
  const { ratio, crossCheck, maxDistance } = {
    ...DEFAULT_MATCH_OPTIONS,
    ...options,
  };
  const neighbours = findNearestNeighbours(query, train);
  const matches: Match[] = [];
  for (
    let queryIndex = 0;
    queryIndex < query.keypoints.length;
    queryIndex += 1
  ) {
    const trainIndex = neighbours.bestTrain[queryIndex];
    // With no train descriptor the best distance is still Infinity, which the cap rejects.
    const distance = neighbours.bestDistance[queryIndex];
    if (distance > maxDistance) continue;
    if (distance >= ratio * neighbours.secondDistance[queryIndex]) continue;
    if (crossCheck && neighbours.trainBestQuery[trainIndex] !== queryIndex) {
      continue;
    }
    matches.push({ queryIndex, trainIndex, distance });
  }
  return matches;
}
