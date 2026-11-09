/** At most `limit` of `keys`, evenly spread along them and always including the first and the last; all of them when they are few. */
export function spreadOut<Key>(keys: readonly Key[], limit: number): Key[] {
  if (keys.length <= limit) return [...keys];
  if (limit < 2) return keys.slice(0, 1);
  const lastIndex = keys.length - 1;
  return Array.from(
    { length: limit },
    (_, position) => keys[Math.round((position * lastIndex) / (limit - 1))],
  );
}
