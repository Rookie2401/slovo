/**
 * Persistent model. Book → Chapter → Paragraph → Sentence → Token is the
 * authoritative structure of a text; the original strings are never altered.
 * Everything linguistic hangs off tokens/sentences/lexemes and carries
 * provenance (`AnalysisSource`), a version and a confidence.
 *
 * Russian specifics live in `MorphFeatures`, `Pos`, `ConstructionType` and the
 * `characters` / `parallel_texts` tables (names index, English chapter parallel).
 */

export type AnalysisSource = 'manual' | 'dictionary' | 'rule' | 'morphological_engine' | 'syntax_engine' | 'ai' | 'user_correction' | 'statistical' | 'source_text';
export type ReviewStatus = 'unreviewed' | 'verified' | 'disputed' | 'superseded';

export interface Provenance {
  analysis_version: number;
  engine_version: string;
  analysis_source: AnalysisSource;
  confidence: number; // 0..1
  review_status: ReviewStatus;
  created_at: number;
}

/** Reading-ladder level of a bundled work (1 = Tolstoy's graded reader … 6 = the great novels). */
export type LadderLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface Book {
  id?: number;
  title: string;
  author?: string;
  language: 'ru';
  source_format: 'epub' | 'html' | 'txt' | 'json' | 'library';
  source_name?: string;
  license?: string;
  created_at: number;
  chapter_count: number;
  token_count: number;
  /** sha256 of the normalized full text: used to detect duplicate imports */
  content_hash?: string;
  /** bundled library works: manifest slug, ladder level, English parallel availability */
  slug?: string;
  level?: LadderLevel;
  year?: number;
  has_english?: boolean;
}

export interface Chapter {
  id?: number;
  book_id: number;
  index: number;
  title: string;
  /** original title text before any cleanup */
  title_original?: string;
  /** part / book / volume grouping as printed (e.g. "Часть первая") */
  part?: string;
  paragraph_count: number;
  token_count: number;
  /** spine href or source location, for traceability */
  source_ref?: string;
}

export type ParagraphKind = 'text' | 'heading' | 'subheading' | 'verse' | 'quote' | 'note' | 'letter';

export interface EmphasisRange {
  start: number;
  end: number;
  kind: 'em' | 'strong';
}

export interface Paragraph {
  id?: number;
  book_id: number;
  chapter_id: number;
  index: number;
  kind: ParagraphKind;
  /** the exact source text of the paragraph (authoritative for display) */
  text: string;
  emphasis?: EmphasisRange[];
}

export interface Sentence {
  id?: number;
  book_id: number;
  chapter_id: number;
  paragraph_id: number;
  index: number;
  /** offsets into Paragraph.text */
  start: number;
  end: number;
  text: string;
}

export type TokenKind = 'word' | 'number' | 'punct' | 'latin' | 'other';

export interface Token {
  id?: number;
  book_id: number;
  chapter_id: number;
  paragraph_id: number;
  sentence_id: number;
  /** position within the sentence */
  index: number;
  /** position within the paragraph token stream */
  para_index: number;
  kind: TokenKind;
  /** offsets into Paragraph.text */
  start: number;
  end: number;
  surface_original: string;
  /** NFC, combining stress marks removed (see tokenizer.normalize) */
  surface_normalized: string;
  /** loose lookup key: lower-case, ё→е, pre-reform letters folded (see tokenizer.looseKey) */
  key: string;
  /** stressed vowel index within surface_normalized when the SOURCE carried an accent mark (Azbuka texts), else undefined */
  source_stress?: number;
}

// ----------------------------------------------------------------- lexicon

export type Pos =
  | 'noun'
  | 'proper'
  | 'pronoun'
  | 'adjective'
  | 'verb'
  | 'adverb'
  | 'preposition'
  | 'conjunction'
  | 'particle'
  | 'interjection'
  | 'numeral'
  | 'predicative'
  | 'unknown';

export type Gender = 'm' | 'f' | 'n' | 'common';
export type Animacy = 'anim' | 'inan';
export type Aspect = 'perfective' | 'imperfective' | 'biaspectual';

export interface Lexeme {
  id?: number;
  /**
   * stable key. Dictionary lexemes use the shard id `pos:lemma` (lemma keeps ё),
   * e.g. "verb:говорить", "noun:человек"; rule guesses are prefixed with "?"
   * ("?noun:каморка"); user-created ones "user:…".
   */
  key: string;
  lemma: string;
  /** lemma with an apostrophe after the stressed vowel (dictionary convention), when known */
  lemma_accented?: string;
  pos: Pos;
  gender?: Gender;
  animacy?: Animacy;
  aspect?: Aspect;
  /** aspect partner's lexeme key */
  partner?: string;
  indeclinable?: boolean;
  reflexive?: boolean;
  gloss: string;
  senses?: string[];
  notes?: string;
  /** rank in the 50k frequency list (1 = most frequent), when present */
  frequency_rank?: number;
  /** derived: number of tokens in the library resolved to this lexeme */
  frequency?: number;
  source: AnalysisSource;
  created_at: number;
}

// ----------------------------------------------------------------- analyses

/** loc = second locative (в лесу́), part = partitive genitive (чаю), voc = new vocative (Тань!) */
export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'inst' | 'prep' | 'loc' | 'part' | 'voc';
export type Number_ = 'sg' | 'pl';
export type Person = 1 | 2 | 3;

export type VerbForm =
  | 'infinitive'
  | 'present-future'
  | 'past'
  | 'imperative'
  | 'participle-act-pres'
  | 'participle-act-past'
  | 'participle-pass-pres'
  | 'participle-pass-past'
  | 'participle-short'
  | 'gerund-pres'
  | 'gerund-past';

export type Degree = 'positive' | 'comparative' | 'superlative' | 'short';

export interface Morpheme {
  /** printed slice of the surface form when segmentable, otherwise a pedagogical component */
  text: string;
  role: 'prefix' | 'stem' | 'root' | 'suffix' | 'ending' | 'postfix' | 'clitic' | 'component';
  gloss: string;
  /** offsets into the surface form when the morpheme is a printed slice */
  start?: number;
  end?: number;
}

export interface MorphFeatures {
  gender?: Gender;
  number?: Number_;
  case?: Case;
  person?: Person;
  animacy?: Animacy;
  verb_form?: VerbForm;
  aspect?: Aspect;
  tense?: 'present' | 'past' | 'future';
  mood?: 'indicative' | 'imperative' | 'conditional';
  voice?: 'active' | 'passive' | 'middle';
  reflexive?: boolean;
  degree?: Degree;
  /** pronoun subclass: personal, possessive, demonstrative, interrogative, relative, reflexive, indefinite, negative, determinative */
  pronoun_type?: string;
  /** index (in the normalized surface) of the stressed vowel; -1 = unknown / monosyllabic clitic */
  stress?: number;
  /** motion verbs: unidirectional (идти) vs multidirectional (ходить) */
  motion?: 'uni' | 'multi';
  paradigm?: string;
}

export interface TokenAnalysis extends Provenance {
  id?: number;
  token_id: number;
  book_id: number;
  /** ranking among alternatives: 0 = preferred */
  rank: number;
  lexeme_key: string;
  lemma: string;
  pos: Pos;
  gloss: string;
  /** contextual gloss (may differ from the lexical gloss) */
  gloss_in_context?: string;
  features: MorphFeatures;
  morphemes: Morpheme[];
  /** short human explanation for level 2 ("genitive because governed by у") */
  notes: string[];
  /** flagged ambiguity: the engine could not decide between alternatives */
  ambiguous?: boolean;
  superseded?: boolean;
}

export type ConstructionType =
  | 'aspect'
  | 'motion'
  | 'reflexive'
  | 'impersonal'
  | 'possession'
  | 'negation-genitive'
  | 'numeral-phrase'
  | 'prepositional-phrase'
  | 'agreement'
  | 'participle-clause'
  | 'gerund-clause'
  | 'conditional'
  | 'purpose'
  | 'comparative'
  | 'name'
  | 'passive'
  | 'modal'
  | 'idiom'
  | 'negation';

export interface Construction extends Provenance {
  id?: number;
  book_id: number;
  sentence_id: number;
  type: ConstructionType;
  /** identifier of the pattern (e.g. 'impersonal:dative-experiencer', 'prep:в+acc') */
  pattern: string;
  label: string;
  gloss: string;
  explanation: string;
  features?: MorphFeatures & { nuance?: string; head_lexeme?: string; negated?: boolean; preposition?: string };
  /** token ids in reading order */
  token_ids: number[];
  superseded?: boolean;
}

export interface ConstructionMember {
  id?: number;
  construction_id: number;
  token_id: number;
  role: string;
}

export type DependencyRelation =
  | 'subject'
  | 'object'
  | 'indirect-object'
  | 'prepositional-object'
  | 'preposition'
  | 'predicate'
  | 'modifier'
  | 'possessor'
  | 'auxiliary'
  | 'adverbial'
  | 'negation'
  | 'conjunction'
  | 'vocative'
  | 'relative-clause'
  | 'complement'
  | 'agreement-target'
  | 'experiencer'
  | 'apposition'
  | 'name-part'
  | 'root';

export interface Dependency extends Provenance {
  id?: number;
  book_id: number;
  sentence_id: number;
  head_token_id: number | null;
  dependent_token_id: number;
  relation: DependencyRelation;
  explanation?: string;
  superseded?: boolean;
}

export interface Translation extends Provenance {
  id?: number;
  book_id: number;
  sentence_id: number;
  natural: string;
  literal: string;
  superseded?: boolean;
}

export interface Explanation extends Provenance {
  id?: number;
  book_id: number;
  target_type: 'sentence' | 'token' | 'construction' | 'lexeme';
  target_id: number | string;
  /** language of the explanation text */
  language: 'en' | 'ru' | 'ru-simple';
  text: string;
  /** structured points the AI produced (subject, verb construction, agreement…) */
  points?: Array<{ topic: string; text: string }>;
  superseded?: boolean;
}

// --------------------------------------------------------------- names

/**
 * A character / place name of a book with every form it takes in the text
 * (Родион Романович Раскольников → Родя, Роденька, Раскольников, Родион Романыч…).
 * Curated cast lists ship with the library; detected names are added with lower confidence.
 */
export interface CharacterRecord {
  id?: number;
  book_id: number;
  canonical: string;
  /** first name / patronymic / surname when applicable */
  given?: string;
  patronymic?: string;
  surname?: string;
  /** every surface form (lower-cased, ё kept) that refers to this character, with a note on register */
  forms: Array<{ form: string; kind: 'full' | 'given' | 'patronymic' | 'surname' | 'diminutive' | 'nickname' | 'title' | 'other'; note?: string }>;
  role?: string;
  note?: string;
  source: AnalysisSource;
  confidence: number;
}

// --------------------------------------------------------------- parallel text

/** English translation of one chapter, aligned at chapter level only. Off by default; shown last. */
export interface ParallelText {
  id?: number;
  book_id: number;
  chapter_id: number;
  language: 'en';
  translator?: string;
  source?: string;
  license?: string;
  paragraphs: string[];
  /** 1 = chapter boundaries matched exactly; lower when the aligner had to guess */
  alignment_confidence: number;
  alignment_note?: string;
}

// --------------------------------------------------------------- learning

export type LearningStatus = 'new' | 'seen' | 'recognizing' | 'known' | 'mastered' | 'ignored';

export interface WordEncounter {
  id?: number;
  lexeme_key: string;
  form: string;
  token_id: number;
  book_id: number;
  chapter_id: number;
  sentence_id: number;
  at: number;
  kind: 'read' | 'lookup';
}

export interface KnownWord {
  id?: number;
  lexeme_key: string;
  status: LearningStatus;
  /** per-form recognition status when a difficult inflected form needs its own tracking */
  form_status?: Record<string, LearningStatus>;
  encounters: number;
  lookups: number;
  first_seen: number;
  last_seen: number;
  updated_at: number;
}

export interface LearningState {
  id?: number;
  key: string; // 'script-level', 'onboarded', 'assist-level' ...
  value: unknown;
  updated_at: number;
}

export type AlphabetSkill = 'visual' | 'sound_recall' | 'sound_to_symbol' | 'symbol_to_sound' | 'syllable' | 'word' | 'context' | 'cursive';

export interface AlphabetProgress {
  id?: number;
  symbol: string;
  /** spaced repetition per skill */
  skills: Record<AlphabetSkill, { score: number; correct: number; wrong: number; interval_days: number; due: number; last: number }>;
  /** whether the learner has been introduced to the symbol at all */
  introduced: boolean;
  introduced_at?: number;
  mastered: boolean;
  updated_at: number;
}

export interface ReadingProgress {
  id?: number;
  book_id: number;
  chapter_id: number;
  /** paragraph index last visible */
  paragraph_index: number;
  /** paragraph ids the learner has scrolled past (encounters are counted for those) */
  read_paragraphs: number[];
  completed: boolean;
  updated_at: number;
}

export type CorrectionTarget = 'token' | 'sentence' | 'lexeme' | 'rule' | 'construction' | 'source' | 'character';

export interface UserCorrection {
  id?: number;
  target_type: CorrectionTarget;
  /** token id / sentence id / lexeme key / rule id */
  target_id: number | string;
  book_id?: number;
  /** partial analysis, translation, lexeme fields or a rule override */
  payload: Record<string, unknown>;
  note?: string;
  created_at: number;
  active: boolean;
}

export interface AnalysisVersion {
  id?: number;
  book_id: number;
  chapter_id?: number;
  version: number;
  engine_version: string;
  created_at: number;
  token_count: number;
  note?: string;
}

export interface AnalysisSourceRecord {
  id?: number;
  name: AnalysisSource;
  description: string;
  priority: number;
}

export interface AlphabetSymbolRecord {
  id?: number;
  symbol: string;
  /** corpus frequency per book */
  frequency: Record<string, number>;
}

export interface Setting {
  key: string;
  value: unknown;
}
