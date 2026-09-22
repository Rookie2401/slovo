// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate } from '../src/morphology/candidate';
import type { SentenceAnalysis } from '../src/morphology/sentence';

// database/analysis.ts calls analyzeSentence (package D's src/syntax/index.ts, not shipped yet)
// and the dictionary runtime (package B, shipped, but its preloadForms() fetches
// ./dict/manifest.json over the network — unavailable in this test environment). Both are mocked
// here per the harness's testing note ("mock those modules with vi.mock in your tests").
const fakeCandidate: Candidate = {
  key: 'noun:город',
  lemma: 'город',
  lemmaAccented: 'го́род',
  pos: 'noun',
  gloss: 'city',
  features: { case: 'nom', number: 'sg', gender: 'm', stress: 1 },
  morphemes: [{ text: 'город', role: 'stem', gloss: 'stem' }],
  notes: [],
  source: 'dictionary',
  confidence: 1,
};

function fakeAnalysis(text: string): SentenceAnalysis {
  return {
    tokens: [
      {
        i: 0,
        text,
        norm: text,
        key: 'город',
        kind: 'word',
        candidates: [fakeCandidate],
        chosen: 0,
        notes: [],
      },
    ],
    constructions: [],
    dependencies: [],
    clause: { notes: [] },
    clauses: [{ notes: [] }],
    rulesVersion: 1,
  };
}

vi.mock('../src/syntax', () => ({
  analyzeSentence: vi.fn((input: Array<{ text: string }>) => fakeAnalysis(input[0]?.text ?? '')),
}));
vi.mock('../src/dictionary', () => ({
  preloadForms: vi.fn(async () => {}),
  readingsFor: vi.fn(() => []),
  lexemeSync: vi.fn(() => undefined),
  lexeme: vi.fn(async () => undefined),
}));

const { db, ENGINE_VERSION, ensureAnalysisSources, ANALYSIS_SOURCES } = await import('../src/database/db');
const { getSettings, setSettings, DEFAULTS } = await import('../src/database/settings');
const { storeBook } = await import('../src/import/store');
const { ensureChapterAnalysis, invalidateChapter, clearAnalysisMemo, correctToken, correctSentence, revokeCorrection, currentVersionTag } = await import('../src/database/analysis');
const { ENGINE_RULES_VERSION } = await import('../src/morphology/analyze');

beforeEach(async () => {
  localStorage.clear();
  clearAnalysisMemo();
  await Promise.all(db.tables.map((t) => t.clear()));
});
afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('SlovoDB schema', () => {
  it('opens with the expected table set and can round-trip a book/chapter/paragraph/token', async () => {
    expect(db.name).toBe('slovo');
    const bookId = (await db.books.add({ title: 'Т', language: 'ru', source_format: 'json', created_at: Date.now(), chapter_count: 0, token_count: 0 })) as number;
    const chapterId = (await db.chapters.add({ book_id: bookId, index: 0, title: 'Глава первая', paragraph_count: 0, token_count: 0 })) as number;
    const found = await db.chapters.where('[book_id+index]').equals([bookId, 0]).first();
    expect(found?.id).toBe(chapterId);
  });

  it('seeds the analysis_sources table exactly once, in priority order matching ANALYSIS_SOURCES', async () => {
    await ensureAnalysisSources();
    await ensureAnalysisSources();
    const rows = await db.analysis_sources.toArray();
    expect(rows.length).toBe(ANALYSIS_SOURCES.length);
    expect(rows.find((r) => r.name === 'user_correction')?.priority).toBe(100);
    expect(rows.find((r) => r.name === 'source_text')).toBeTruthy();
  });

  it('supports the characters and parallel_texts tables', async () => {
    const bookId = (await db.books.add({ title: 'Т', language: 'ru', source_format: 'library', created_at: Date.now(), chapter_count: 0, token_count: 0 })) as number;
    await db.characters.add({ book_id: bookId, canonical: 'Родион Раскольников', forms: [{ form: 'родя', kind: 'diminutive' }], source: 'manual', confidence: 1 });
    const chapterId = (await db.chapters.add({ book_id: bookId, index: 0, title: 'I', paragraph_count: 0, token_count: 0 })) as number;
    await db.parallel_texts.add({ book_id: bookId, chapter_id: chapterId, language: 'en', paragraphs: ['Once upon a time.'], alignment_confidence: 1 });
    expect((await db.characters.where('book_id').equals(bookId).toArray()).length).toBe(1);
    expect((await db.parallel_texts.where('[book_id+chapter_id]').equals([bookId, chapterId]).toArray()).length).toBe(1);
  });
});

describe('settings', () => {
  it('returns defaults when nothing is stored, and persists a patch', () => {
    expect(getSettings()).toEqual(DEFAULTS);
    setSettings({ stressMarks: 'always', englishParallel: true });
    expect(getSettings().stressMarks).toBe('always');
    expect(getSettings().englishParallel).toBe(true);
    // englishParallel defaults false per docs/PLAN.md §E
    expect(DEFAULTS.englishParallel).toBe(false);
  });
});

describe('ensureChapterAnalysis + corrections', () => {
  async function seedOneWordChapter(): Promise<{ bookId: number; chapterId: number; tokenId: number }> {
    const r = await storeBook({ title: 'Т', source_format: 'json', chapters: [{ title: 'Глава I', paragraphs: [{ kind: 'text', text: 'город.' }] }], warnings: [] });
    const chapterId = r.chapterIds[0]!;
    const token = await db.tokens.where('chapter_id').equals(chapterId).filter((t) => t.kind === 'word').first();
    return { bookId: r.bookId, chapterId, tokenId: token!.id! };
  }

  it('analyses a chapter, persists token_analyses and one analysis_versions row, and memoises', async () => {
    const { bookId, chapterId } = await seedOneWordChapter();
    const a1 = await ensureChapterAnalysis(bookId, chapterId);
    expect(a1.version).toBe(1);
    const stored = await db.token_analyses.where('book_id').equals(bookId).toArray();
    expect(stored.length).toBe(1);
    expect(stored[0]!.lexeme_key).toBe('noun:город');
    expect(stored[0]!.analysis_version).toBe(1);
    const versions = await db.analysis_versions.where('book_id').equals(bookId).toArray();
    expect(versions.length).toBe(1);
    expect(versions[0]!.engine_version).toBe(`${ENGINE_VERSION}+r${ENGINE_RULES_VERSION}`);
    expect(currentVersionTag()).toBe(versions[0]!.engine_version);

    // calling again hits the in-memory memo and does not duplicate the version row
    const a2 = await ensureChapterAnalysis(bookId, chapterId);
    expect(a2.version).toBe(1);
    expect((await db.analysis_versions.where('book_id').equals(bookId).toArray()).length).toBe(1);
  });

  it('a token correction always wins and is re-applied after the chapter is re-analysed', async () => {
    const { bookId, chapterId, tokenId } = await seedOneWordChapter();
    await ensureChapterAnalysis(bookId, chapterId);
    await correctToken(bookId, chapterId, tokenId, { lemma: 'посёлок', pos: 'noun', gloss: 'settlement', key: 'noun:посёлок' }, 'test correction');
    const a = await ensureChapterAnalysis(bookId, chapterId);
    const sentence = Array.from(a.sentences.values())[0]!;
    const chosenCandidate = sentence.tokens[0]!.candidates[sentence.tokens[0]!.chosen]!;
    expect(chosenCandidate.source).toBe('user_correction');
    expect(chosenCandidate.lemma).toBe('посёлок');
    expect(sentence.tokens[0]!.decided).toBe(true);

    // revoking the correction and forcing regeneration restores the dictionary reading
    const corr = await db.user_corrections.where('[target_type+target_id]').equals(['token', tokenId]).first();
    await revokeCorrection(corr!.id!);
    invalidateChapter(chapterId);
    const a2 = await ensureChapterAnalysis(bookId, chapterId);
    const sentence2 = Array.from(a2.sentences.values())[0]!;
    expect(sentence2.tokens[0]!.candidates[sentence2.tokens[0]!.chosen]!.source).toBe('dictionary');
  });

  it('a sentence-level correction (translation) is stored and revocable', async () => {
    const { bookId, chapterId } = await seedOneWordChapter();
    const a = await ensureChapterAnalysis(bookId, chapterId);
    const sentenceId = Array.from(a.sentences.keys())[0]!;
    await correctSentence(bookId, chapterId, sentenceId, { natural: 'City.', literal: 'city.' });
    const a2 = await ensureChapterAnalysis(bookId, chapterId, { force: true });
    expect(a2.sentenceCorrections.get(sentenceId)?.payload).toMatchObject({ natural: 'City.' });
  });
});
