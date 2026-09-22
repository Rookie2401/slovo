import Dexie, { type EntityTable } from 'dexie';
import type {
  AlphabetProgress,
  AlphabetSymbolRecord,
  AnalysisSourceRecord,
  AnalysisVersion,
  Book,
  Chapter,
  Construction,
  ConstructionMember,
  Dependency,
  Explanation,
  KnownWord,
  LearningState,
  Lexeme,
  Paragraph,
  ReadingProgress,
  Sentence,
  Setting,
  Token,
  TokenAnalysis,
  Translation,
  UserCorrection,
  WordEncounter,
} from './types';

/** Bump when the deterministic engines change so stale analyses regenerate. */
export const ENGINE_VERSION = '0.1.0';

export class HindiReaderDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  paragraphs!: EntityTable<Paragraph, 'id'>;
  sentences!: EntityTable<Sentence, 'id'>;
  tokens!: EntityTable<Token, 'id'>;
  lexemes!: EntityTable<Lexeme, 'id'>;
  token_analyses!: EntityTable<TokenAnalysis, 'id'>;
  constructions!: EntityTable<Construction, 'id'>;
  construction_members!: EntityTable<ConstructionMember, 'id'>;
  dependencies!: EntityTable<Dependency, 'id'>;
  translations!: EntityTable<Translation, 'id'>;
  explanations!: EntityTable<Explanation, 'id'>;
  word_encounters!: EntityTable<WordEncounter, 'id'>;
  known_words!: EntityTable<KnownWord, 'id'>;
  learning_state!: EntityTable<LearningState, 'id'>;
  alphabet_symbols!: EntityTable<AlphabetSymbolRecord, 'id'>;
  alphabet_progress!: EntityTable<AlphabetProgress, 'id'>;
  reading_progress!: EntityTable<ReadingProgress, 'id'>;
  user_corrections!: EntityTable<UserCorrection, 'id'>;
  analysis_versions!: EntityTable<AnalysisVersion, 'id'>;
  analysis_sources!: EntityTable<AnalysisSourceRecord, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = 'hindi-reader') {
    super(name);
    this.version(1).stores({
      books: '++id, title, content_hash, created_at',
      chapters: '++id, book_id, [book_id+index]',
      paragraphs: '++id, chapter_id, [chapter_id+index], book_id',
      sentences: '++id, paragraph_id, chapter_id, [chapter_id+index], book_id',
      tokens: '++id, sentence_id, paragraph_id, chapter_id, book_id, key, [book_id+key], [chapter_id+para_index]',
      lexemes: '++id, &key, lemma, pos',
      token_analyses: '++id, token_id, [token_id+rank], book_id, lexeme_key, analysis_version, [book_id+analysis_version]',
      constructions: '++id, sentence_id, book_id, type, pattern, analysis_version, *token_ids',
      construction_members: '++id, construction_id, token_id',
      dependencies: '++id, sentence_id, dependent_token_id, book_id, analysis_version',
      translations: '++id, sentence_id, book_id',
      explanations: '++id, [target_type+target_id], book_id',
      word_encounters: '++id, lexeme_key, token_id, book_id, chapter_id, [lexeme_key+kind], at',
      known_words: '++id, &lexeme_key, status, updated_at',
      learning_state: '++id, &key',
      alphabet_symbols: '++id, &symbol',
      alphabet_progress: '++id, &symbol, mastered, introduced',
      reading_progress: '++id, [book_id+chapter_id], book_id, updated_at',
      user_corrections: '++id, [target_type+target_id], target_type, book_id, active, created_at',
      analysis_versions: '++id, book_id, [book_id+chapter_id], version',
      analysis_sources: '++id, &name',
      settings: '&key',
    });
  }
}

export const db = new HindiReaderDB();

export const ANALYSIS_SOURCES: AnalysisSourceRecord[] = [
  { name: 'user_correction', description: 'A correction entered by the reader. Always wins.', priority: 100 },
  { name: 'manual', description: 'Hand-verified data shipped with the app.', priority: 90 },
  { name: 'rule', description: 'Deterministic linguistic rule.', priority: 80 },
  { name: 'dictionary', description: 'Verified lexicon entry.', priority: 70 },
  { name: 'morphological_engine', description: 'Paradigm-based morphological analysis.', priority: 60 },
  { name: 'syntax_engine', description: 'Sentence-level syntactic model.', priority: 50 },
  { name: 'statistical', description: 'Frequency-based guess.', priority: 30 },
  { name: 'ai', description: 'Language-model explanation. Never the final linguistic authority.', priority: 10 },
];

export async function ensureAnalysisSources(): Promise<void> {
  const n = await db.analysis_sources.count();
  if (n === 0) await db.analysis_sources.bulkAdd(ANALYSIS_SOURCES);
}
