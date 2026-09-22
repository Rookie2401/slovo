import type { AnalysisSource, Morpheme, MorphFeatures, Pos } from '../database/types';

/**
 * One possible reading of a word form. Produced by the dictionary lookup
 * (source 'dictionary', confidence 1 for an exact form hit), by the closed-class
 * tables (pronouns, numerals, prepositions — source 'rule'), or by the guesser
 * for out-of-dictionary forms (key prefixed "?" and confidence ≤ 0.65; the UI
 * says so). Never invent a lemma without marking it as a guess.
 */
export interface Candidate {
  /** lexeme key: dictionary id ("verb:идти"), or "?pos:lemma" for a guess */
  key: string;
  lemma: string;
  /** lemma with combining acute on the stressed vowel, when known */
  lemmaAccented?: string;
  pos: Pos;
  gloss: string;
  senses?: string[];
  features: MorphFeatures;
  /** printed slices: prefix / stem / suffix / ending / postfix (-ся) with glosses */
  morphemes: Morpheme[];
  notes: string[];
  source: AnalysisSource;
  confidence: number;
  /** aspect partner lexeme key, when known */
  partner?: string;
  /** frequency rank of the lexeme (1 = most frequent) */
  rank?: number;
  /** true when this is a spelling/orthographic variant of another candidate (ё/е, pre-reform) rather than a different reading */
  variant?: boolean;
}
