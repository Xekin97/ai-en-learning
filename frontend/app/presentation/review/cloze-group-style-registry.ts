import type { ClozeGroupRef } from "@application/shared/models";

export const CLOZE_TONES = [
  "jade",
  "amber",
  "blue",
  "plum",
  "rose",
  "slate",
] as const;
export const CLOZE_PATTERNS = ["solid", "stripe", "dot", "double"] as const;

export interface RandomSource {
  nextInt(maxExclusive: number): number;
}

export interface ClozeGroupStyleModel {
  toneToken: (typeof CLOZE_TONES)[number];
  patternToken: (typeof CLOZE_PATTERNS)[number];
  anonymousName: string;
  domHandle: string;
}

export class ClozeGroupStyleRegistry {
  readonly itemKey: string;
  readonly #styles = new Map<ClozeGroupRef, ClozeGroupStyleModel>();

  constructor(
    itemKey: string,
    groupRefs: readonly ClozeGroupRef[],
    random: RandomSource = browserRandomSource,
  ) {
    this.itemKey = itemKey;
    const tones = shuffled(CLOZE_TONES, random);
    const patterns = shuffled(CLOZE_PATTERNS, random);
    const uniqueGroups = [...new Set(groupRefs)];
    uniqueGroups.forEach((groupRef, index) => {
      const combinationIndex = index % (tones.length * patterns.length);
      const tone = tones[combinationIndex % tones.length];
      const pattern = patterns[Math.floor(combinationIndex / tones.length)];
      if (!tone || !pattern) throw new Error("Cloze style palette is empty");
      this.#styles.set(groupRef, {
        toneToken: tone,
        patternToken: pattern,
        anonymousName: anonymousName(index),
        domHandle: `cloze-set-${index + 1}`,
      });
    });
  }

  styleFor(groupRef: ClozeGroupRef): ClozeGroupStyleModel {
    const style = this.#styles.get(groupRef);
    if (!style) throw new Error("Cloze group is not registered");
    return style;
  }
}

export const browserRandomSource: RandomSource = {
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0)
      throw new RangeError("maxExclusive must be a positive integer");
    const range = 0x1_0000_0000;
    const limit = range - (range % maxExclusive);
    const values = new Uint32Array(1);
    let value = range;
    while (value >= limit) {
      globalThis.crypto.getRandomValues(values);
      value = values[0] ?? range;
    }
    return value % maxExclusive;
  },
};

function shuffled<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = random.nextInt(index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

export function anonymousName(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new RangeError("index must be a non-negative integer");
  let current = index + 1;
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

/** An attempt keeps the same anonymous palette after reload or locale changes. */
export function stableClozeRegistry(
  attemptId: string,
  refs: readonly ClozeGroupRef[],
): ClozeGroupStyleRegistry {
  const groups = [...new Set(refs)].sort();
  let seed = 2166136261;
  for (const char of attemptId + "|" + groups.join("|")) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  return new ClozeGroupStyleRegistry(attemptId, groups, {
    nextInt(max) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % max;
    },
  });
}
