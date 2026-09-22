/**
 * The bundled reading ladder: `public/corpus/index.json` + `<slug>.json`
 * (+ optional `<slug>.en.json` English parallel, `<slug>.cast.json` cast
 * list) are built at build time by `scripts/build-corpus.mjs` from
 * `data/corpus-manifest.json` (see scripts/corpus-lib.mjs, fetch-corpus.mjs,
 * align-english.mjs). This module is the runtime side: list the ladder,
 * fetch-on-demand a work into Dexie through `storeBook`, then fill its
 * English parallel and character index.
 *
 * Base URL is relative (`./corpus/…`) so the built app works from any
 * sub-path (GitHub Pages project site, local preview, etc).
 */
import { db } from '../database/db';
import type { CharacterRecord, EmphasisRange, LadderLevel, ParagraphKind, ParallelText } from '../database/types';
import { storeBook } from './store';
import type { ImportedBook, ImportedChapter } from './types';

const CORPUS_BASE = './corpus';

export interface LibraryIndexEntry {
  slug: string;
  title: string;
  author: string;
  year: number;
  level: LadderLevel;
  chapter_count: number;
  word_count: number;
  bytes: number;
  has_english: boolean;
}

export interface LibraryIndex {
  works: LibraryIndexEntry[];
}

interface CorpusParagraphJson {
  kind: ParagraphKind;
  text: string;
  emphasis?: EmphasisRange[];
}

interface CorpusChapterJson {
  title: string;
  title_original?: string;
  part?: string;
  source_ref?: string;
  paragraphs: CorpusParagraphJson[];
}

interface CorpusWorkJson {
  slug: string;
  title: string;
  author?: string;
  year?: number;
  level: LadderLevel;
  source: { name: string; url: string; license: string };
  chapters: CorpusChapterJson[];
  word_count: number;
}

interface CorpusEnglishChapterJson {
  index: number;
  paragraphs: string[];
  alignment_confidence: number;
  alignment_note?: string;
}

interface CorpusEnglishJson {
  slug: string;
  translator?: string;
  source?: string;
  chapters: CorpusEnglishChapterJson[];
}

type CastEntryJson = Omit<CharacterRecord, 'id' | 'book_id'>;

/**
 * Fetch one corpus file. A missing optional file is `undefined`, never a throw:
 * the dev server and the PWA navigate fallback answer unknown paths with
 * index.html and status 200, so `res.ok` alone is not enough — check the
 * content type and guard the parse.
 */
async function fetchJson<T>(path: string): Promise<T | undefined> {
  const res = await fetch(`${CORPUS_BASE}/${path}`);
  if (!res.ok) return undefined;
  const type = res.headers?.get?.('content-type') ?? '';
  if (type && !/json/i.test(type)) return undefined;
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

/** The reading ladder: every bundled work, in level order, with sizes for the Home screen. */
export async function libraryIndex(): Promise<LibraryIndex> {
  const data = await fetchJson<LibraryIndex>('index.json');
  if (!data) throw new Error('Could not load the library index (public/corpus/index.json) — has the corpus been built (npm run corpus:build)?');
  return data;
}

/**
 * Fetch a bundled work's JSON and store it as a new book. Also fills its
 * English parallel (`addParallel`) and cast list (`seedCast`) when present
 * for that slug — both are best-effort: a missing `.en.json` or
 * `.cast.json` is normal for most works and is not an error.
 */
export async function addLibraryWork(slug: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const doc = await fetchJson<CorpusWorkJson>(`${slug}.json`);
  if (!doc) throw new Error(`Unknown library work "${slug}" (public/corpus/${slug}.json not found).`);

  // The reader prints the book and chapter titles itself; drop the source's leading
  // heading paragraphs that merely repeat them (the text is unchanged, only not shown twice).
  const same = (a: string, b?: string) => !!b && a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
  const chapters: ImportedChapter[] = doc.chapters.map((c) => {
    const paragraphs = c.paragraphs.map((p) => ({ kind: p.kind, text: p.text, emphasis: p.emphasis }));
    while (paragraphs.length > 1 && (paragraphs[0]!.kind === 'heading' || paragraphs[0]!.kind === 'subheading') && (same(paragraphs[0]!.text, c.title) || same(paragraphs[0]!.text, c.title_original) || same(paragraphs[0]!.text, doc.title) || same(paragraphs[0]!.text, c.part))) paragraphs.shift();
    return { title: c.title, title_original: c.title_original, part: c.part, source_ref: c.source_ref, paragraphs };
  });

  const book: ImportedBook = {
    title: doc.title,
    author: doc.author,
    language: 'ru',
    license: doc.source.license,
    source_format: 'library',
    source_name: doc.source.name,
    chapters,
    warnings: [],
    slug: doc.slug,
    level: doc.level,
    year: doc.year,
    has_english: false, // set below once we know whether the parallel actually loaded
  };

  const { bookId } = await storeBook(book, { onProgress });

  // best-effort extras: a failure here must never lose the book that was just stored
  try {
    const hadEnglish = await addParallel(bookId, slug);
    if (hadEnglish) await db.books.update(bookId, { has_english: true });
  } catch (e) {
    console.warn(`English parallel for ${slug} not added:`, e);
  }
  try {
    await seedCast(bookId, slug);
  } catch (e) {
    console.warn(`Cast list for ${slug} not added:`, e);
  }

  return bookId;
}

/**
 * Fetch `<slug>.en.json` (the chapter-level English parallel built by
 * scripts/align-english.mjs) and store it into `parallel_texts`, matched to
 * this book's chapters by array position (`en chapter.index` = the
 * corresponding Russian chapter's 0-based index, exactly as the two JSON
 * files were built together). Returns whether a parallel was found at all.
 */
export async function addParallel(bookId: number, slug: string): Promise<boolean> {
  const data = await fetchJson<CorpusEnglishJson>(`${slug}.en.json`);
  if (!data || data.chapters.length === 0) return false;

  // idempotent: a second call for the same book (a retry, a repeated add) must not duplicate rows
  if ((await db.parallel_texts.where('book_id').equals(bookId).count()) > 0) return true;

  const chapters = await db.chapters.where('book_id').equals(bookId).sortBy('index');
  const records: ParallelText[] = [];
  for (const enCh of data.chapters) {
    const chapter = chapters[enCh.index];
    if (!chapter?.id) continue;
    if (enCh.alignment_confidence <= 0) continue; // no confident English text for this chapter — don't store an empty/noisy row
    records.push({
      book_id: bookId,
      chapter_id: chapter.id,
      language: 'en',
      translator: data.translator,
      source: data.source,
      paragraphs: enCh.paragraphs,
      alignment_confidence: enCh.alignment_confidence,
      alignment_note: enCh.alignment_note,
    });
  }
  if (records.length === 0) return false;
  await db.parallel_texts.bulkAdd(records);
  return true;
}

/**
 * Fetch `<slug>.cast.json` (hand-written `data/cast/<slug>.json`, copied at
 * build time) and store it into `characters`. Most works have no curated
 * cast list — that's normal, not an error.
 */
export async function seedCast(bookId: number, slug: string): Promise<boolean> {
  const list = await fetchJson<CastEntryJson[]>(`${slug}.cast.json`);
  if (!list || list.length === 0) return false;
  const existing = await db.characters.where('book_id').equals(bookId).count();
  if (existing > 0) return false; // already seeded (e.g. addLibraryWork called twice) — never duplicate
  const records: CharacterRecord[] = list.map((c) => ({ ...c, book_id: bookId }));
  await db.characters.bulkAdd(records);
  return true;
}
