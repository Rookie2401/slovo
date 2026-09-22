/** Ambient types for coverage.mjs (plain JS — see its header comment). */
export function computeCoverage(opts: { corpusDir: string; hasKey: (key: string) => boolean }): {
  overall: number;
  byWork: Record<string, number>;
  totalTokens: number;
  coveredTokens: number;
  unknownTop300: Array<[string, number]>;
};
