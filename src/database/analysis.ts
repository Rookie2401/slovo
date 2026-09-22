import { db, ENGINE_VERSION } from './db';
import type { CharacterRecord, Construction, Dependency, Sentence, Token, TokenAnalysis, UserCorrection } from './types';
import type { Candidate } from '../morphology/candidate';
import { chosen, type AnalyzedToken, type FoundConstruction, type SentenceAnalysis } from '../morphology/sentence';
import { ENGINE_RULES_VERSION } from '../morphology/analyze';
import type { AnalysisContext } from '../morphology/dictionary';
import { analyzeSentence, type SentenceInput } from '../syntax';
// TODO(integration): package B is adding preloadWork(slug) to src/dictionary/index.ts (a per-work
// bundle of forms + core lexemes, so a chapter of a bundled library book no longer downloads every
// shard its keys happen to land in). Not shipped yet — this import will resolve once it lands.
import { preloadForms, preloadWork, readingsFor, lexemeSync } from '../dictionary';

/**
 * Analysis persistence. Every chapter is analysed on first open and the
 * result is stored with the engine version. When the engine changes, old rows
 * are marked superseded (never deleted) and a new version is written. User
 * corrections are stored separately and re-applied on top of every version.
 */

export interface ChapterAnalysis {
  bookId: number;
  chapterId: number;
  version: number;
  sentences: Map<number, SentenceAnalysis>; // sentence id → analysis
  tokensBySentence: Map<number, Token[]>;
  corrections: Map<number, UserCorrection>; // token id → active correction
  sentenceCorrections: Map<number, UserCorrection>;
}

const memo = new Map<number, ChapterAnalysis>();

export function invalidateChapter(chapterId: number): void {
  memo.delete(chapterId);
}

export function clearAnalysisMemo(): void {
  memo.clear();
}

export function currentVersionTag(): string {
  return `${ENGINE_VERSION}+r${ENGINE_RULES_VERSION}`;
}

async function loadTokens(chapterId: number): Promise<Map<number, Token[]>> {
  const toks = await db.tokens.where('chapter_id').equals(chapterId).toArray();
  toks.sort((a, b) => a.sentence_id - b.sentence_id || a.index - b.index);
  const m = new Map<number, Token[]>();
  for (const t of toks) {
    const list = m.get(t.sentence_id) ?? [];
    list.push(t);
    m.set(t.sentence_id, list);
  }
  return m;
}

/** Build the dictionary + names lookup handed to the syntax engine. */
function buildContext(characters: CharacterRecord[]): AnalysisContext {
  const byForm = new Map<string, { canonical: string; kind: string }>();
  for (const c of characters) for (const f of c.forms) if (!byForm.has(f.form)) byForm.set(f.form, { canonical: c.canonical, kind: f.kind });
  return {
    readings: readingsFor,
    lexeme: lexemeSync,
    character: (form: string) => byForm.get(form.toLowerCase()),
  };
}

function candidateToRow(t: Token, c: Candidate, rank: number, version: number, at: AnalyzedToken, chosenIdx: boolean): TokenAnalysis {
  return {
    token_id: t.id!, book_id: t.book_id, rank, lexeme_key: c.key, lemma: c.lemma, pos: c.pos, gloss: c.gloss,
    gloss_in_context: chosenIdx ? at.glossInContext : undefined,
    features: c.features, morphemes: c.morphemes, notes: chosenIdx ? [...c.notes, ...at.notes] : c.notes,
    ambiguous: chosenIdx ? at.ambiguous : undefined,
    analysis_version: version, engine_version: currentVersionTag(), analysis_source: c.source, confidence: c.confidence,
    review_status: 'unreviewed', created_at: Date.now(),
  };
}

function constructionToRow(sentence: Sentence, c: FoundConstruction, tokens: Token[], version: number): Construction {
  return {
    book_id: sentence.book_id, sentence_id: sentence.id!, type: c.type, pattern: c.pattern, label: c.label, gloss: c.gloss, explanation: c.explanation,
    features: c.features, token_ids: c.tokens.map((i) => tokens[i]!.id!),
    analysis_version: version, engine_version: currentVersionTag(), analysis_source: c.source, confidence: c.confidence, review_status: 'unreviewed', created_at: Date.now(),
  };
}

/** Apply active corrections onto an in-memory analysis (corrections always win). */
export function applyCorrections(a: SentenceAnalysis, tokens: Token[], corrections: Map<number, UserCorrection>): void {
  a.tokens.forEach((at, i) => {
    const tok = tokens[i];
    if (!tok?.id) return;
    const corr = corrections.get(tok.id);
    if (!corr) return;
    const p = corr.payload as Partial<Candidate>;
    const base = chosen(at);
    const fixed: Candidate = {
      key: (p.key as string) ?? (p.lemma ? `?${p.pos ?? base?.pos ?? 'unknown'}:${p.lemma}` : base?.key ?? `?unknown:${at.norm}`),
      lemma: (p.lemma as string) ?? base?.lemma ?? at.norm,
      lemmaAccented: (p.lemmaAccented as string) ?? base?.lemmaAccented,
      pos: (p.pos as Candidate['pos']) ?? base?.pos ?? 'unknown',
      gloss: (p.gloss as string) ?? base?.gloss ?? '',
      senses: base?.senses,
      features: { ...(base?.features ?? {}), ...((p.features as Candidate['features']) ?? {}) },
      morphemes: (p.morphemes as Candidate['morphemes']) ?? base?.morphemes ?? [{ text: at.norm, role: 'stem', gloss: 'corrected', start: 0, end: at.norm.length }],
      notes: [...(base?.notes ?? []), 'corrected by you' + (corr.note ? ': ' + corr.note : '')],
      source: 'user_correction',
      confidence: 1,
    };
    at.candidates = [fixed, ...at.candidates];
    at.chosen = 0;
    at.decided = true;
    at.ambiguous = false;
    if (p.gloss) at.glossInContext = undefined;
  });
}

/**
 * Analyse (or load) a chapter. Persists a new version when none exists for
 * the current engine; keeps older versions as superseded.
 */
export async function ensureChapterAnalysis(bookId: number, chapterId: number, opts: { force?: boolean } = {}): Promise<ChapterAnalysis> {
  const cached = memo.get(chapterId);
  if (cached && !opts.force) return cached;
  const sentences = await db.sentences.where('chapter_id').equals(chapterId).toArray();
  sentences.sort((a, b) => a.paragraph_id - b.paragraph_id || a.index - b.index);
  const tokensBySentence = await loadTokens(chapterId);
  const tokenIds = Array.from(tokensBySentence.values()).flat().map((t) => t.id!);
  const corrRows = await db.user_corrections.where('target_type').equals('token').filter((c) => c.active && c.book_id === bookId).toArray();
  const corrections = new Map<number, UserCorrection>();
  for (const c of corrRows) if (typeof c.target_id === 'number' && tokenIds.includes(c.target_id)) corrections.set(c.target_id, c);
  const sentCorrRows = await db.user_corrections.where('target_type').equals('sentence').filter((c) => c.active && c.book_id === bookId).toArray();
  const sentenceCorrections = new Map<number, UserCorrection>();
  for (const c of sentCorrRows) if (typeof c.target_id === 'number') sentenceCorrections.set(c.target_id, c);

  // dictionary data for every word key in the chapter: a bundled library book (book.slug set)
  // fetches its own pre-built per-work bundle (forms + core lexemes) in one shot; an imported
  // text falls back to the per-shard loader, since it has no bundle of its own.
  const book = await db.books.get(bookId);
  const allTokens = Array.from(tokensBySentence.values()).flat();
  if (book?.slug) await preloadWork(book.slug);
  else await preloadForms(allTokens.filter((t) => t.kind === 'word').map((t) => t.key));
  const characters = await db.characters.where('book_id').equals(bookId).toArray();
  const ctx = buildContext(characters);

  const existing = await db.analysis_versions.where('[book_id+chapter_id]').equals([bookId, chapterId]).toArray();
  const current = existing.find((v) => v.engine_version === currentVersionTag());
  const version = current?.version ?? (existing.length ? Math.max(...existing.map((v) => v.version)) + 1 : 1);

  const result: ChapterAnalysis = { bookId, chapterId, version, sentences: new Map(), tokensBySentence, corrections, sentenceCorrections };
  // always compute in memory (fast, deterministic); persist only when the version is new
  const analysisRows: TokenAnalysis[] = [];
  const constructionRows: Construction[] = [];
  const dependencyRows: Dependency[] = [];
  for (const s of sentences) {
    const toks = tokensBySentence.get(s.id!) ?? [];
    const input: SentenceInput[] = toks.map((t) => ({ text: t.surface_original, kind: t.kind, id: t.id, sourceStress: t.source_stress }));
    const a = analyzeSentence(input, ctx);
    applyCorrections(a, toks, corrections);
    result.sentences.set(s.id!, a);
    if (!current || opts.force) {
      a.tokens.forEach((at, i) => {
        const tok = toks[i]!;
        if (tok.kind !== 'word') return;
        const top = at.candidates.slice(0, 3);
        top.forEach((c, rank) => {
          const isChosen = at.candidates.indexOf(c) === at.chosen;
          if (c.source === 'user_correction') return; // corrections live in their own table
          analysisRows.push(candidateToRow(tok, c, isChosen ? 0 : rank + 1, version, at, isChosen));
        });
      });
      for (const c of a.constructions) constructionRows.push(constructionToRow(s, c, toks, version));
      for (const d of a.dependencies) dependencyRows.push({ book_id: s.book_id, sentence_id: s.id!, head_token_id: d.head == null ? null : toks[d.head]!.id!, dependent_token_id: toks[d.dependent]!.id!, relation: d.relation, explanation: d.explanation, analysis_version: version, engine_version: currentVersionTag(), analysis_source: 'syntax_engine', confidence: d.confidence, review_status: 'unreviewed', created_at: Date.now() });
    }
  }
  if (!current || opts.force) {
    await db.transaction('rw', [db.token_analyses, db.constructions, db.dependencies, db.analysis_versions], async () => {
      // supersede older versions for this chapter (never delete)
      const olderTokenRows = await db.token_analyses.where('token_id').anyOf(tokenIds).filter((r) => !r.superseded && r.analysis_version !== version).toArray();
      if (olderTokenRows.length) await db.token_analyses.bulkPut(olderTokenRows.map((r) => ({ ...r, superseded: true, review_status: 'superseded' as const })));
      const sentIds = sentences.map((s) => s.id!);
      const olderC = await db.constructions.where('sentence_id').anyOf(sentIds).filter((r) => !r.superseded && r.analysis_version !== version).toArray();
      if (olderC.length) await db.constructions.bulkPut(olderC.map((r) => ({ ...r, superseded: true, review_status: 'superseded' as const })));
      const olderD = await db.dependencies.where('sentence_id').anyOf(sentIds).filter((r) => !r.superseded && r.analysis_version !== version).toArray();
      if (olderD.length) await db.dependencies.bulkPut(olderD.map((r) => ({ ...r, superseded: true, review_status: 'superseded' as const })));
      // remove rows of the same version (a forced regeneration) before writing
      if (opts.force && current) {
        await db.token_analyses.where('token_id').anyOf(tokenIds).filter((r) => r.analysis_version === version).delete();
        await db.constructions.where('sentence_id').anyOf(sentIds).filter((r) => r.analysis_version === version).delete();
        await db.dependencies.where('sentence_id').anyOf(sentIds).filter((r) => r.analysis_version === version).delete();
      }
      await db.token_analyses.bulkAdd(analysisRows);
      await db.constructions.bulkAdd(constructionRows);
      await db.dependencies.bulkAdd(dependencyRows);
      if (!current) await db.analysis_versions.add({ book_id: bookId, chapter_id: chapterId, version, engine_version: currentVersionTag(), created_at: Date.now(), token_count: tokenIds.length, note: existing.length ? 'regenerated after an engine update; earlier versions kept as superseded' : 'first analysis' });
    });
  }
  memo.set(chapterId, result);
  return result;
}

/** Save a token-level correction and refresh the in-memory analysis. */
export async function correctToken(bookId: number, chapterId: number, tokenId: number, payload: Record<string, unknown>, note?: string): Promise<void> {
  const prev = await db.user_corrections.where('[target_type+target_id]').equals(['token', tokenId]).filter((c) => c.active).toArray();
  await db.transaction('rw', db.user_corrections, async () => {
    for (const p of prev) await db.user_corrections.update(p.id!, { active: false });
    await db.user_corrections.add({ target_type: 'token', target_id: tokenId, book_id: bookId, payload, note, created_at: Date.now(), active: true });
  });
  invalidateChapter(chapterId);
}

export async function correctSentence(bookId: number, chapterId: number, sentenceId: number, payload: Record<string, unknown>, note?: string): Promise<void> {
  const prev = await db.user_corrections.where('[target_type+target_id]').equals(['sentence', sentenceId]).filter((c) => c.active).toArray();
  await db.transaction('rw', db.user_corrections, async () => {
    for (const p of prev) await db.user_corrections.update(p.id!, { active: false });
    await db.user_corrections.add({ target_type: 'sentence', target_id: sentenceId, book_id: bookId, payload, note, created_at: Date.now(), active: true });
  });
  invalidateChapter(chapterId);
}

export async function correctLexeme(lexemeKey: string, payload: Record<string, unknown>, note?: string): Promise<void> {
  const prev = await db.user_corrections.where('[target_type+target_id]').equals(['lexeme', lexemeKey]).filter((c) => c.active).toArray();
  await db.transaction('rw', db.user_corrections, async () => {
    for (const p of prev) await db.user_corrections.update(p.id!, { active: false });
    await db.user_corrections.add({ target_type: 'lexeme', target_id: lexemeKey, payload, note, created_at: Date.now(), active: true });
  });
  memo.clear();
}

export async function revokeCorrection(id: number): Promise<void> {
  await db.user_corrections.update(id, { active: false });
  memo.clear();
}

export async function lexemeCorrection(key: string): Promise<UserCorrection | undefined> {
  return db.user_corrections.where('[target_type+target_id]').equals(['lexeme', key]).filter((c) => c.active).first();
}
