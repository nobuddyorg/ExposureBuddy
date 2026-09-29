/** Returns `0, step, 2·step, …` below `count`: the rows or samples a kernel walks, listed once so no loop needs a bound. */
export function indices(count: number, step = 1): number[] {
  return Array.from(
    { length: Math.ceil(count / step) },
    (_, index) => index * step,
  );
}
