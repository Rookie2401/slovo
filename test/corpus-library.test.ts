// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = await import('../src/database/db');
const { addLibraryWork, addParallel, libraryIndex, seedCast } = await import('../src/import/library');

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});
afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  vi.unstubAllGlobals();
});

const INDEX_JSON = {
  works: [{ slug: 'test-tale', title: 'Испытание', author: 'Автор Тестов', year: 1880, level: 2, chapter_count: 2, word_count: 6, bytes: 100, has_english: true }],
};

const WORK_JSON = {
  slug: 'test-tale',
  title: 'Испытание',
  author: 'Автор Тестов',
  year: 1880,
  level: 2,
  source: { name: 'lib.ru/klassika', url: 'http://az.lib.ru/x', license: 'public domain' },
  word_count: 6,
  chapters: [
    { title: 'I', part: 'Часть первая', source_ref: 'http://az.lib.ru/x#I', paragraphs: [{ kind: 'text', text: 'Первый абзац.' }] },
    { title: 'II', part: 'Часть первая', source_ref: 'http://az.lib.ru/x#II', paragraphs: [{ kind: 'text', text: 'Второй абзац.' }] },
  ],
};

const EN_JSON = {
  slug: 'test-tale',
  translator: 'A. Translator',
  source: 'Project Gutenberg #1 — Test Tale',
  chapters: [
    { index: 0, paragraphs: ['First paragraph.'], alignment_confidence: 1 },
    { index: 1, paragraphs: [], alignment_confidence: 0, alignment_note: 'no corresponding English chapter found' },
  ],
};

const CAST_JSON = [
  {
    canonical: 'Иван Иванович',
    given: 'Иван',
    patronymic: 'Иванович',
    forms: [{ form: 'Иван', kind: 'given' }],
    role: 'the protagonist',
    source: 'manual',
    confidence: 1,
  },
];

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input);
      for (const [path, body] of Object.entries(routes)) {
        if (url.endsWith(path)) {
          if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response;
          return { ok: true, status: 200, json: async () => body } as Response;
        }
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }),
  );
}

describe('libraryIndex', () => {
  it('fetches and returns the corpus index', async () => {
    mockFetch({ 'corpus/index.json': INDEX_JSON });
    const idx = await libraryIndex();
    expect(idx.works).toHaveLength(1);
    expect(idx.works[0]).toMatchObject({ slug: 'test-tale', has_english: true });
  });

  it('throws a clear error when the index is missing (corpus not built)', async () => {
    mockFetch({});
    await expect(libraryIndex()).rejects.toThrow(/corpus:build/);
  });
});

describe('addLibraryWork', () => {
  it('stores the work as a book with its chapters/paragraphs, and fills the English parallel + cast', async () => {
    mockFetch({
      'corpus/test-tale.json': WORK_JSON,
      'corpus/test-tale.en.json': EN_JSON,
      'corpus/test-tale.cast.json': CAST_JSON,
    });
    const bookId = await addLibraryWork('test-tale');
    const book = await db.books.get(bookId);
    expect(book).toMatchObject({ title: 'Испытание', source_format: 'library', slug: 'test-tale', level: 2, year: 1880, has_english: true });

    const chapters = await db.chapters.where('book_id').equals(bookId).sortBy('index');
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toMatchObject({ title: 'I', part: 'Часть первая' });

    const paragraphs = await db.paragraphs.where('book_id').equals(bookId).toArray();
    expect(paragraphs.map((p) => p.text)).toEqual(['Первый абзац.', 'Второй абзац.']);

    const parallels = await db.parallel_texts.where('book_id').equals(bookId).toArray();
    // only the confidently-aligned chapter (confidence 1) is stored; the 0-confidence one is skipped
    expect(parallels).toHaveLength(1);
    expect(parallels[0]).toMatchObject({ chapter_id: chapters[0]!.id, language: 'en', paragraphs: ['First paragraph.'], alignment_confidence: 1 });

    const characters = await db.characters.where('book_id').equals(bookId).toArray();
    expect(characters).toHaveLength(1);
    expect(characters[0]).toMatchObject({ canonical: 'Иван Иванович', book_id: bookId });
  });

  it('works fine for a work with no English parallel and no cast list (both optional)', async () => {
    mockFetch({ 'corpus/test-tale.json': WORK_JSON });
    const bookId = await addLibraryWork('test-tale');
    const book = await db.books.get(bookId);
    expect(book?.has_english).toBe(false);
    expect(await db.parallel_texts.where('book_id').equals(bookId).count()).toBe(0);
    expect(await db.characters.where('book_id').equals(bookId).count()).toBe(0);
  });

  it('rejects an unknown slug', async () => {
    mockFetch({});
    await expect(addLibraryWork('no-such-work')).rejects.toThrow(/no-such-work/);
  });
});

describe('addParallel / seedCast standalone', () => {
  it('addParallel returns false and stores nothing when there is no .en.json', async () => {
    mockFetch({ 'corpus/test-tale.json': WORK_JSON });
    const bookId = await addLibraryWork('test-tale');
    mockFetch({});
    const found = await addParallel(bookId, 'test-tale');
    expect(found).toBe(false);
  });

  it('seedCast never duplicates characters when called twice', async () => {
    mockFetch({ 'corpus/test-tale.json': WORK_JSON, 'corpus/test-tale.cast.json': CAST_JSON });
    const bookId = await addLibraryWork('test-tale'); // seeds once already
    const seededAgain = await seedCast(bookId, 'test-tale');
    expect(seededAgain).toBe(false);
    expect(await db.characters.where('book_id').equals(bookId).count()).toBe(1);
  });
});
