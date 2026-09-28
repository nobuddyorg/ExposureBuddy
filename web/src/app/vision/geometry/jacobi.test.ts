import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { jacobiEigen, smallestEigenvector } from './jacobi';

function symmetricMatrix(size: number, upper: readonly number[]): Float64Array {
  const matrix = new Float64Array(size * size);
  let next = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = row; column < size; column += 1) {
      matrix[row * size + column] = upper[next];
      matrix[column * size + row] = upper[next];
      next += 1;
    }
  }
  return matrix;
}

const symmetricArbitrary = fc
  .integer({ min: 1, max: 9 })
  .chain((size) =>
    fc.tuple(
      fc.constant(size),
      fc.array(fc.double({ min: -10, max: 10, noNaN: true }), {
        minLength: (size * (size + 1)) / 2,
        maxLength: (size * (size + 1)) / 2,
      }),
    ),
  )
  .map(([size, upper]) => ({ size, matrix: symmetricMatrix(size, upper) }));

describe('jacobiEigen', () => {
  it('returns a diagonal matrix unchanged with identity eigenvectors', () => {
    const { values, vectors } = jacobiEigen(new Float64Array([3, 0, 0, -1]), 2);
    expect(Array.from(values)).toEqual([3, -1]);
    expect(Array.from(vectors)).toEqual([1, 0, 0, 1]);
  });

  it('finds the eigenpairs 1 and 3 of [[2, 1], [1, 2]]', () => {
    const { values, vectors } = jacobiEigen(new Float64Array([2, 1, 1, 2]), 2);
    const sorted = Array.from(values).sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(1, 12);
    expect(sorted[1]).toBeCloseTo(3, 12);
    const smallest = smallestEigenvector({ values, vectors });
    expect(Math.abs(smallest[0])).toBeCloseTo(Math.SQRT1_2, 12);
    expect(smallest[0] + smallest[1]).toBeCloseTo(0, 12);
  });

  it('throws when the buffer does not hold size × size entries', () => {
    expect(() => jacobiEigen(new Float64Array(8), 3)).toThrow(RangeError);
  });

  it('satisfies A·v = λ·v with orthonormal v for any symmetric matrix up to 9×9', () => {
    fc.assert(
      fc.property(symmetricArbitrary, ({ size, matrix }) => {
        const { values, vectors } = jacobiEigen(matrix, size);
        const norm = Math.max(1, ...Array.from(matrix, Math.abs));
        for (let k = 0; k < size; k += 1) {
          for (let row = 0; row < size; row += 1) {
            let product = 0;
            let dot = 0;
            for (let column = 0; column < size; column += 1) {
              product +=
                matrix[row * size + column] * vectors[column * size + k];
              dot += vectors[column * size + row] * vectors[column * size + k];
            }
            expect(product).toBeCloseTo(values[k] * vectors[row * size + k], 9);
            expect(dot / norm).toBeCloseTo((row === k ? 1 : 0) / norm, 9);
          }
        }
      }),
    );
  });

  it('picks the column whose eigenvalue is smallest, for any symmetric matrix', () => {
    fc.assert(
      fc.property(symmetricArbitrary, ({ size, matrix }) => {
        const eigen = jacobiEigen(matrix, size);
        const vector = smallestEigenvector(eigen);
        const minimum = Math.min(...Array.from(eigen.values));
        const column = Array.from(eigen.values).indexOf(minimum);
        for (let row = 0; row < size; row += 1) {
          expect(vector[row]).toBe(eigen.vectors[row * size + column]);
        }
      }),
    );
  });
});
