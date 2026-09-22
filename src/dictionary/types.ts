import type { Animacy, Aspect, Case, Gender, MorphFeatures, Pos } from '../database/types';

/**
 * Shipped dictionary format (built by scripts/build-dictionary.mjs from the
 * OpenRussian CSV dump, CC BY-SA 4.0, + the hermitdave 50k frequency list).
 *
 * public/dict/manifest.json        DictManifest
 * public/dict/forms/<shard>.json   FormShard   — looseKey(form) → readings (corpus forms only)
 * public/dict/lex/<shard>.json     LexShard    — lexeme id → DictLexeme (with paradigm)
 *
 * Shard name = first letter of the key (ё folded to е; non-letters → "_"), split
 * into "<letter><second letter>" when a single-letter shard would exceed
 * ~250 KB — the manifest lists the actual shard names, the client never guesses.
 *
 * Lexeme id = `${pos}:${lemma}` with ё kept in the lemma (e.g. "verb:идти",
 * "noun:ёж"); homographs of the same pos get a numeric suffix "noun:замок#2".
 */

export interface DictManifest {
  version: number;
  built_at: string;
  sources: Array<{ name: string; license: string; url: string }>;
  /** shard name → file name under public/dict/forms/ */
  form_shards: Record<string, string>;
  /** shard name → file name under public/dict/lex/ */
  lex_shards: Record<string, string>;
  /** work slug → file name under public/dict/works/ (WorkBundle) — the fast path preloadWork() uses to read a bundled chapter without touching the global shards */
  work_bundles: Record<string, string>;
  lexeme_count: number;
  form_count: number;
  /** token coverage of the bundled corpus by the form index alone (0..1), per work slug and overall */
  coverage: { overall: number; by_work: Record<string, number> };
}

/**
 * Compact feature code, decoded by decodeFeatureCode():
 *  nouns      "n:sg:gen" | "n:pl:nom" | "n:sg:loc" | "n:sg:part" | "n:sg:voc"
 *  adjectives "a:m:sg:nom" | "a:pl:acc" | "a:short:f" | "a:short:pl" | "a:comp" | "a:sup:m:sg:nom"
 *  verbs      "v:inf" | "v:pf:sg1" … "v:pf:pl3" (present or future by aspect) | "v:past:m" | "v:past:pl" | "v:imp:sg" | "v:imp:pl"
 *             "v:pap" (participle act. pres.) "v:paa" (act. past) "v:ppp" (pass. pres.) "v:ppa" (pass. past) + ":m:sg:nom" etc.
 *             "v:pps:f" (short passive participle) | "v:ger:pres" | "v:ger:past"
 *  pronouns   "p:sg:gen" | "p:m:sg:nom" (declined like adjectives) | "p:1:sg:nom" (personal: person first)
 *  numerals   "num:nom" | "num:m:sg:nom"
 *  others     "x" (uninflected: adverbs, prepositions, conjunctions, particles, interjections, predicatives)
 */
export type FeatureCode = string;

/** [lexeme id, feature code, stressed-vowel index in the form (-1 unknown)] */
export type FormReading = [string, FeatureCode, number];

export type FormShard = Record<string, FormReading[]>;

export interface NounParadigm {
  kind: 'noun';
  sg?: Partial<Record<Case, string>>;
  pl?: Partial<Record<Case, string>>;
  sg_only?: boolean;
  pl_only?: boolean;
}

export interface AdjectiveParadigm {
  kind: 'adjective';
  m?: Partial<Record<Case, string>>;
  f?: Partial<Record<Case, string>>;
  n?: Partial<Record<Case, string>>;
  pl?: Partial<Record<Case, string>>;
  short?: { m?: string; f?: string; n?: string; pl?: string };
  comparative?: string;
  superlative?: string;
}

export interface VerbParadigm {
  kind: 'verb';
  infinitive: string;
  imperative?: { sg?: string; pl?: string };
  past?: { m?: string; f?: string; n?: string; pl?: string };
  /** present (imperfective) or future (perfective) */
  presfut?: { sg1?: string; sg2?: string; sg3?: string; pl1?: string; pl2?: string; pl3?: string };
}

export type Paradigm = NounParadigm | AdjectiveParadigm | VerbParadigm;

/**
 * Everything `candidatesFor` needs except the full paradigm: shipped in the
 * lightweight per-work bundles (public/dict/works/<slug>.json) so reading a
 * chapter doesn't have to touch (much of) the global, letter-sharded form/lex
 * index. `stem` is precomputed at build time (longest common prefix of the
 * paradigm cells, plain/unaccented; '' for a suppletive lexeme or one with no
 * paradigm at all) so the reader never needs the paradigm just to segment a
 * surface form into stem + ending.
 */
export interface CoreLexeme {
  id: string;
  lemma: string;
  /** lemma with an apostrophe after the stressed vowel; equals lemma when unknown/monosyllabic */
  acc: string;
  pos: Pos;
  gloss: string;
  /** capped to 6 in the per-work bundles; uncapped on the full DictLexeme from the lex shards */
  senses: string[];
  gender?: Gender;
  animacy?: Animacy;
  aspect?: Aspect;
  /** aspect partner's lexeme id */
  partner?: string;
  indeclinable?: boolean;
  reflexive?: boolean;
  /** frequency rank (1 = most frequent) from the 50k list, matched on the lemma */
  rank?: number;
  /** pronoun subclass / motion verb class etc. for closed classes (hand-written tables) */
  extra?: { pronoun_type?: string; motion?: 'uni' | 'multi'; note?: string };
  /** kept for informational/debugging purposes only — candidatesFor() no longer relies on this, it
   *  derives stem/ending per surface form instead (see src/dictionary/index.ts); the longest-common-
   *  prefix-of-every-paradigm-cell it used to hold is wrong whenever the paradigm has consonant
   *  mutation or a stress-shift spelling change (e.g. verb:спуститься -> "спу", from presfut "спущусь",
   *  when the real per-form stem is "спусти"). */
  stem?: string;
  /** true only on a lighter, paradigm-less entry shipped in a work bundle (see toCoreLexeme in
   *  scripts/dict-lib.mjs); absent on the full DictLexeme from a lex shard, even when that full
   *  entry also happens to have no paradigm (e.g. a preposition). lexeme(id) uses this — not
   *  "does it have a paradigm?", which many genuinely-full entries never do — to decide whether
   *  a cached entry still needs upgrading to the authoritative one. */
  core?: true;
}

/** The full lexeme, as shipped in public/dict/lex/*.json — CoreLexeme plus the paradigm (all strings ACCENTED, apostrophe after the stressed vowel, as in the source dump). */
export interface DictLexeme extends CoreLexeme {
  paradigm?: Paradigm;
}

export type LexShard = Record<string, DictLexeme>;

/** public/dict/works/<slug>.json — everything one bundled work's chapters need to be read offline without touching the global shards. */
export interface WorkBundle {
  slug: string;
  forms: FormShard;
  lexemes: Record<string, CoreLexeme>;
}

/** Decode a FeatureCode into MorphFeatures (pure; implemented in src/dictionary/features.ts). */
export type DecodeFeatureCode = (code: FeatureCode, lexeme?: Pick<DictLexeme, 'pos' | 'aspect' | 'gender' | 'animacy'>) => MorphFeatures;

/** Accent helpers (implemented in src/dictionary/accent.ts). */
export interface AccentHelpers {
  /** "челове'к" → { plain: "человек", stress: 6 } (index of the stressed vowel in plain); stress -1 when no mark */
  splitAccent(acc: string): { plain: string; stress: number };
  /** put the combining acute over the stressed vowel for display: ("человек", 6) → "челове́к" */
  withAcute(plain: string, stress: number): string;
}
