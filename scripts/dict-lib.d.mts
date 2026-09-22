/**
 * Ambient types for dict-lib.mjs (plain JS on purpose — see its header comment —
 * so `node scripts/build-dictionary.mjs` works without a TS loader). Picked up
 * automatically by TS module resolution from the sibling .mjs file's basename.
 */
import type { CoreLexeme, DictLexeme, FormReading, Paradigm } from '../src/dictionary/types';
export function isCyrillicLetter(ch: string): boolean;
export function isCombiningMark(ch: string): boolean;
export function isVowel(ch: string): boolean;
export function normalize(s: string): string;
export function looseKey(s: string): string;
export function extractWordSurfaces(text: string): string[];

export function splitAccent(acc: string): { plain: string; stress: number };
export function withAcute(plain: string, stress: number): string;

export function parseTsv(text: string): { header: string[]; rows: Record<string, string>[] };
export function splitAlternatives(cell: string): string[];
export function splitSenses(cell: string): string[];

export function shardLetter(ch: string): string;
export function foldedPrefix(key: string, len: number): string;
export function lemmaOfLexemeId(id: string): string;
export function resolveShardName(key: string, known: Record<string, string>): string | undefined;
export function groupAndSplit(
  entries: Array<[string, unknown]>,
  letterOf: (key: string) => string,
  prefixOfDepth: (key: string, depth: number) => string,
  maxBytes: number,
): Map<string, Array<[string, unknown]>>;

export const PREPOSITIONS: Set<string>;
export const CONJUNCTIONS: Set<string>;
export const PARTICLES: Set<string>;
export const NUMERALS: Set<string>;
export const PREDICATIVES: Set<string>;
export const PERSONAL_PRONOUNS: Set<string>;
export const PERSONAL_PRONOUN_INFO: Record<string, { person?: number; number?: 'sg' | 'pl'; gender?: 'm' | 'f' | 'n'; pronoun_type?: string; code: string }>;
export const SKIP_PRONOUN_CASE_FORMS: Set<string>;
export const PRONOUN_ADJ_LEMMAS: Set<string>;

export interface ClassifiedOther {
  skip?: boolean;
  pos?: string;
  code?: string;
  gender?: 'm' | 'f' | 'n';
  extra?: { pronoun_type?: string; note?: string };
  guessed?: boolean;
  note?: string;
}
export function classifyOther(bare: string): ClassifiedOther;

export function makeIdAssigner(): (pos: string, lemma: string) => string;
export function lookupRank(rankMap: Map<string, number>, lemma: string): number | undefined;
export function parseRu50k(text: string): Map<string, number>;

// --------------------------------------------------------------- CoreLexeme / per-work bundles

export function paradigmCells(paradigm: Paradigm | undefined): string[];
export function longestCommonPrefix(strings: string[]): string;
export function computeStem(paradigm: Paradigm | undefined): string;
export function toCoreLexeme(lex: DictLexeme | Omit<DictLexeme, 'stem'>, maxSenses?: number): CoreLexeme;
export function buildWorkBundle(opts: {
  book: { chapters?: Array<{ paragraphs?: Array<{ text?: string }> }> };
  formIndex: Map<string, FormReading[]>;
  lexemeById: Map<string, DictLexeme>;
  maxSenses?: number;
}): { forms: Record<string, FormReading[]>; lexemes: Record<string, CoreLexeme> };

// --------------------------------------------------------------- curated overrides

export interface DictOverridePatch {
  gender?: 'm' | 'f' | 'n' | 'common';
  animacy?: 'anim' | 'inan';
  pos?: DictLexeme['pos'];
  gloss?: string;
  aspect?: 'perfective' | 'imperfective' | 'biaspectual';
  partner?: string;
  drop?: true;
  why: string;
}
export function applyOverrides(opts: {
  lexemes: DictLexeme[];
  lexemeById: Map<string, DictLexeme>;
  idsByPosLemma: Map<string, string[]>;
  overrides: Record<string, DictOverridePatch>;
  onUnknownId?: (id: string, patch: DictOverridePatch) => void;
}): number;
