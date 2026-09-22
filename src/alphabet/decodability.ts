import { lettersOf } from '../tokenizer/cyrillic';

/**
 * Decodability: which of a word's letters the learner already knows. Russian
 * has no conjuncts/ligatures to worry about (unlike Devanagari) — this is a
 * straightforward per-letter check against the known set, canonicalised to
 * upper case (the same canonical form as AlphabetProgress.symbol / SymbolInfo.symbol).
 */
export type Decodability = 'fully' | 'nearly' | 'not-yet';

export interface DecodeReport {
  known: number;
  total: number;
  ratio: number;
  category: Decodability;
  /** letters the learner does not know yet, in reading order (deduplicated, upper case) */
  unknown: string[];
}

export function decodability(word: string, known: Set<string>): DecodeReport {
  const uses = lettersOf(word);
  let total = 0;
  let knownCount = 0;
  const unknown: string[] = [];
  for (const u of uses) {
    const upper = u.lower.toUpperCase();
    total++;
    if (known.has(upper) || known.has(u.lower)) knownCount++;
    else if (!unknown.includes(upper)) unknown.push(upper);
  }
  const ratio = total === 0 ? 1 : knownCount / total;
  const category: Decodability = ratio === 1 ? 'fully' : unknown.length <= 1 && ratio >= 0.6 ? 'nearly' : 'not-yet';
  return { known: knownCount, total, ratio, category, unknown };
}
