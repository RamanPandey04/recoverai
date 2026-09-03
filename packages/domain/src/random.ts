export function seededUnit(seedText: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
  return (h >>> 0) / 4294967296;
}

export function seededPick<T>(values: readonly T[], seed: string): T {
  return values[Math.floor(seededUnit(seed) * values.length)]!;
}
