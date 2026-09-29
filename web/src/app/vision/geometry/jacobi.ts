export interface SymmetricEigen {
  /** Eigenvalue k belongs to column k of `vectors`; not sorted. */
  readonly values: Float64Array;
  /** Row-major `size × size` matrix whose columns are unit eigenvectors. */
  readonly vectors: Float64Array;
}

interface JacobiWorkspace {
  readonly matrix: Float64Array;
  readonly vectors: Float64Array;
  readonly size: number;
}

const MAX_SWEEPS = 60;
// Off-diagonal energy below this fraction of the total energy counts as diagonal.
const CONVERGENCE_RATIO = 1e-30;

function identity(size: number): Float64Array {
  // Row-major, so the diagonal sits at every (size + 1)th entry.
  return Float64Array.from({ length: size * size }, (_, index) =>
    index % (size + 1) === 0 ? 1 : 0,
  );
}

function isDiagonal(matrix: Float64Array, size: number): boolean {
  let offDiagonal = 0;
  let total = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const squared = matrix[row * size + column] ** 2;
      total += squared;
      if (row !== column) offDiagonal += squared;
    }
  }
  return offDiagonal <= CONVERGENCE_RATIO * total;
}

// Applies the Givens rotation that zeroes matrix[p][q]: A ← Jᵀ A J and V ← V J.
function rotatePair(workspace: JacobiWorkspace, p: number, q: number): void {
  const { matrix, vectors, size } = workspace;
  const offDiagonal = matrix[p * size + q];
  if (offDiagonal === 0) return;
  const theta =
    (matrix[q * size + q] - matrix[p * size + p]) / (2 * offDiagonal);
  const sign = theta < 0 ? -1 : 1;
  const tangent = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const cosine = 1 / Math.sqrt(tangent * tangent + 1);
  const sine = tangent * cosine;
  for (let row = 0; row < size; row += 1) {
    const entryP = matrix[row * size + p];
    const entryQ = matrix[row * size + q];
    matrix[row * size + p] = cosine * entryP - sine * entryQ;
    matrix[row * size + q] = sine * entryP + cosine * entryQ;
  }
  for (let column = 0; column < size; column += 1) {
    const entryP = matrix[p * size + column];
    const entryQ = matrix[q * size + column];
    matrix[p * size + column] = cosine * entryP - sine * entryQ;
    matrix[q * size + column] = sine * entryP + cosine * entryQ;
  }
  for (let row = 0; row < size; row += 1) {
    const entryP = vectors[row * size + p];
    const entryQ = vectors[row * size + q];
    vectors[row * size + p] = cosine * entryP - sine * entryQ;
    vectors[row * size + q] = sine * entryP + cosine * entryQ;
  }
}

/** Returns eigenvalues and orthonormal eigenvectors of a row-major symmetric `size × size` matrix (cyclic Jacobi). */
export function jacobiEigen(
  matrix: Float64Array,
  size: number,
): SymmetricEigen {
  if (matrix.length !== size * size) {
    throw new RangeError(
      `jacobiEigen: expected ${size * size} entries, got ${matrix.length}`,
    );
  }
  const workspace: JacobiWorkspace = {
    matrix: Float64Array.from(matrix),
    vectors: identity(size),
    size,
  };
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep += 1) {
    if (isDiagonal(workspace.matrix, size)) break;
    for (let p = 0; p < size; p += 1) {
      for (let q = p + 1; q < size; q += 1) {
        rotatePair(workspace, p, q);
      }
    }
  }
  const values = Float64Array.from(
    { length: size },
    (_, index) => workspace.matrix[index * size + index],
  );
  return { values, vectors: workspace.vectors };
}

/** Returns the unit eigenvector column of `eigen` with the smallest eigenvalue. */
export function smallestEigenvector(eigen: SymmetricEigen): Float64Array {
  const size = eigen.values.length;
  let smallest = 0;
  eigen.values.forEach((value, index) => {
    if (value < eigen.values[smallest]) smallest = index;
  });
  return Float64Array.from(
    { length: size },
    (_, row) => eigen.vectors[row * size + smallest],
  );
}
