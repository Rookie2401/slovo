import type { AnalysisSource, ConstructionType, DependencyRelation, MorphFeatures, TokenKind } from '../database/types';
import type { Candidate } from './candidate';

/** A token of a sentence with its candidate readings; `chosen` is the current pick. */
export interface AnalyzedToken {
  i: number;
  text: string;
  /** normalize(text) — stress marks removed, case kept */
  norm: string;
  /** looseKey(text) — the dictionary key */
  key: string;
  kind: TokenKind;
  candidates: Candidate[];
  chosen: number;
  /** context-level notes ("genitive because governed by у") */
  notes: string[];
  ambiguous?: boolean;
  /** a context rule fixed the reading; later passes must not override it */
  decided?: boolean;
  tokenId?: number;
  /** gloss for this token in this sentence when it differs from the lexical gloss */
  glossInContext?: string;
  /** stressed vowel index carried by the source text itself (accented Azbuka editions) */
  sourceStress?: number;
}

export function chosen(t: AnalyzedToken): Candidate | undefined {
  return t.candidates[t.chosen];
}

export function isWord(t: AnalyzedToken): boolean {
  return t.kind === 'word';
}

export interface FoundConstruction {
  type: ConstructionType;
  pattern: string;
  label: string;
  gloss: string;
  explanation: string;
  /** indices into the sentence token list, in reading order */
  tokens: number[];
  roles: Record<number, string>;
  features: MorphFeatures & { nuance?: string; head_lexeme?: string; negated?: boolean; preposition?: string; governed_case?: string };
  confidence: number;
  source: AnalysisSource;
  /** the index of the token the construction is "headed" by (verb, head noun, preposition) */
  head: number;
  uncertain?: string;
}

export interface FoundDependency {
  head: number | null;
  dependent: number;
  relation: DependencyRelation;
  explanation?: string;
  confidence: number;
}

export interface ClauseInfo {
  /** the finite verb / predicate token (or the aspect/modal construction that carries it) */
  verb?: FoundConstruction;
  predicate?: number;
  subject?: number;
  object?: number;
  indirectObject?: number;
  /** dative experiencer of an impersonal predicate (мне холодно, ему пришлось) */
  experiencer?: number;
  /** у + genitive possessor in a "have" clause (у меня есть) */
  possessor?: number;
  /** token window of this clause */
  range?: [number, number];
  /** subject–predicate agreement (person/number in present-future, gender/number in past) and why */
  agreement?: { target: number | null; targetLabel: string; expected: MorphFeatures; actual: MorphFeatures; matches: boolean | null; explanation: string };
  /** why this aspect here, in plain words, when the predicate is a verb */
  aspect?: { aspect: string; explanation: string; contrast?: string };
  /** word-order / emphasis observation (new information last, fronted object…) */
  wordOrder?: string;
  notes: string[];
}

export interface SentenceAnalysis {
  tokens: AnalyzedToken[];
  constructions: FoundConstruction[];
  dependencies: FoundDependency[];
  /** the main clause (last finite clause) */
  clause: ClauseInfo;
  /** every clause, in order */
  clauses: ClauseInfo[];
  rulesVersion: number;
}
