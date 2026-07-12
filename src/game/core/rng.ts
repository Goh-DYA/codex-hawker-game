/** Serializable, deterministic xorshift32 random-number generator helpers. */

export interface RandomResult<T> {
  readonly value: T;
  readonly state: number;
}

export function hashSeed(seed: number | string): number {
  if (typeof seed === "number") {
    const normalized = seed >>> 0;
    return normalized === 0 ? 0x6d2b79f5 : normalized;
  }

  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = hash >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function nextUint32(state: number): RandomResult<number> {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  if (next === 0) next = 0x6d2b79f5;
  return { value: next, state: next };
}

export function nextFloat(state: number): RandomResult<number> {
  const next = nextUint32(state);
  return { value: next.value / 0x1_0000_0000, state: next.state };
}

export function nextInt(state: number, minInclusive: number, maxExclusive: number): RandomResult<number> {
  if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive) || maxExclusive <= minInclusive) {
    throw new RangeError("nextInt requires a non-empty integer range");
  }
  const next = nextFloat(state);
  return {
    value: minInclusive + Math.floor(next.value * (maxExclusive - minInclusive)),
    state: next.state,
  };
}

export function choose<T>(state: number, values: readonly T[]): RandomResult<T> {
  if (values.length === 0) throw new RangeError("Cannot choose from an empty collection");
  const index = nextInt(state, 0, values.length);
  return { value: values[index.value] as T, state: index.state };
}
