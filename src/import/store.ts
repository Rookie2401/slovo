import { db } from '../database/db';
import { clearAnalysisMemo } from '../database/analysis';
import type { Book, Chapter, Paragraph, Sentence, Token } from '../database/types';
import { looseKey, normalize, sentenceRanges, sourceStressIndex, tokenize } from '../tokenizer/cyrillic';
import type { ImportedBook, ImportedParagraph } from './types';
import { ImportRefused } from './types';

export interface SegmentedParagraph {
  sentences: Array<{ start: number; end: number; text: string; tokens: Array<{ text: string; start: number; end: number; kind: Token['kind'] }> }>;
}

/** Sentence + token segmentation of one paragraph; offsets index paragraph text. */
export function segmentParagraph(text: string): SegmentedParagraph {
  const toks = tokenize(text);
  const ranges = sentenceRanges(toks);
  const sentences = ranges.map(([a, b]) => {
    const first = toks[a]!;
    const last = toks[b - 1]!;
    return { start: first.start, end: last.end, text: text.slice(first.start, last.end), tokens: toks.slice(a, b).map((t) => ({ text: t.text, start: t.start, end: t.end, kind: t.kind })) };
  });
  return { sentences };
}

export async function contentHash(book: ImportedBook): Promise<string> {
  const text = book.chapters.map((c) => c.paragraphs.map((p) => normalize(p.text)).join('\n')).join('\n\n');
  const buf = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // fallback (tests without WebCrypto): FNV-1a
  let h = 0x811c9dc5;
  for (const b of buf) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'fnv-' + h.toString(16);
}

export interface StoreResult {
  bookId: number;
  chapterIds: number[];
  tokenCount: number;
}

function paragraphRecords(p: ImportedParagraph): { text: string; kind: Paragraph['kind']; emphasis?: Paragraph['emphasis'] } {
  return { text: p.text, kind: p.kind, emphasis: p.emphasis };
}

/**
 * Persist an imported book. Runs in one transaction so a failed import leaves
 * nothing behind. `appendTo` adds the chapters to an existing book instead.
 * Stress marks present in the source (Wikisource Azbuka editions) are kept in
 * `surface_original` and their position recorded as `source_stress`; they are
 * stripped from `surface_normalized` and from the dictionary key.
 */
export async function storeBook(book: ImportedBook, opts: { appendTo?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<StoreResult> {
  if (book.chapters.length === 0) throw new ImportRefused('Nothing to import.', 'empty');
  const hash = await contentHash(book);
  if (!opts.appendTo) {
    const dup = await db.books.where('content_hash').equals(hash).first();
    if (dup) throw new ImportRefused(`This text is already in the library as “${dup.title}”.`, 'empty');
  }
  const total = book.chapters.length;
  const result = await db.transaction('rw', [db.books, db.chapters, db.paragraphs, db.sentences, db.tokens], async () => {
    let bookId: number;
    let chapterOffset = 0;
    if (opts.appendTo) {
      const existing = await db.books.get(opts.appendTo);
      if (!existing) throw new ImportRefused('The target book no longer exists.', 'malformed');
      bookId = existing.id!;
      chapterOffset = existing.chapter_count;
    } else {
      const rec: Book = {
        title: book.title,
        author: book.author,
        language: 'ru',
        source_format: book.source_format,
        source_name: book.source_name,
        license: book.license,
        created_at: Date.now(),
        chapter_count: 0,
        token_count: 0,
        content_hash: hash,
        slug: book.slug,
        level: book.level,
        year: book.year,
        has_english: book.has_english,
      };
      bookId = (await db.books.add(rec)) as number;
    }
    const chapterIds: number[] = [];
    let tokenTotal = 0;
    for (let ci = 0; ci < book.chapters.length; ci++) {
      const ch = book.chapters[ci]!;
      const chRec: Chapter = { book_id: bookId, index: chapterOffset + ci, title: ch.title, title_original: ch.title_original, part: ch.part, paragraph_count: ch.paragraphs.length, token_count: 0, source_ref: ch.source_ref };
      const chapterId = (await db.chapters.add(chRec)) as number;
      chapterIds.push(chapterId);
      let chTokens = 0;
      const paraRecs: Paragraph[] = ch.paragraphs.map((p, pi) => ({ book_id: bookId, chapter_id: chapterId, index: pi, ...paragraphRecords(p) }));
      const paraIds = (await db.paragraphs.bulkAdd(paraRecs, { allKeys: true })) as number[];
      const sentRecs: Sentence[] = [];
      const sentOwner: Array<{ paraIdx: number; tokens: SegmentedParagraph['sentences'][number]['tokens'] }> = [];
      const segs = ch.paragraphs.map((p) => segmentParagraph(p.text));
      segs.forEach((seg, pi) => {
        seg.sentences.forEach((s, si) => {
          sentRecs.push({ book_id: bookId, chapter_id: chapterId, paragraph_id: paraIds[pi]!, index: si, start: s.start, end: s.end, text: s.text });
          sentOwner.push({ paraIdx: pi, tokens: s.tokens });
        });
      });
      const sentIds = (await db.sentences.bulkAdd(sentRecs, { allKeys: true })) as number[];
      const tokRecs: Token[] = [];
      const paraCounters = new Map<number, number>();
      sentOwner.forEach((owner, si) => {
        const paraId = paraIds[owner.paraIdx]!;
        owner.tokens.forEach((t, ti) => {
          const pidx = paraCounters.get(paraId) ?? 0;
          paraCounters.set(paraId, pidx + 1);
          const norm = normalize(t.text);
          const stress = t.kind === 'word' ? sourceStressIndex(t.text) : -1;
          tokRecs.push({
            book_id: bookId,
            chapter_id: chapterId,
            paragraph_id: paraId,
            sentence_id: sentIds[si]!,
            index: ti,
            para_index: pidx,
            kind: t.kind,
            start: t.start,
            end: t.end,
            surface_original: t.text,
            surface_normalized: norm,
            key: t.kind === 'word' ? looseKey(norm) : norm,
            source_stress: stress >= 0 ? stress : undefined,
          });
        });
      });
      await db.tokens.bulkAdd(tokRecs);
      chTokens = tokRecs.filter((t) => t.kind === 'word').length;
      tokenTotal += chTokens;
      await db.chapters.update(chapterId, { token_count: chTokens });
      opts.onProgress?.(ci + 1, total);
    }
    const existing = await db.books.get(bookId);
    await db.books.update(bookId, { chapter_count: (existing?.chapter_count ?? 0) + book.chapters.length, token_count: (existing?.token_count ?? 0) + tokenTotal });
    return { bookId, chapterIds, tokenCount: tokenTotal };
  });
  return result;
}

export async function deleteBook(bookId: number, opts: { purgeStudyData?: boolean } = {}): Promise<void> {
  await db.transaction('rw', [db.books, db.chapters, db.paragraphs, db.sentences, db.tokens, db.token_analyses, db.constructions, db.dependencies, db.translations, db.explanations, db.characters, db.parallel_texts, db.reading_progress, db.analysis_versions, db.word_encounters, db.user_corrections], async () => {
    await db.tokens.where('book_id').equals(bookId).delete();
    await db.sentences.where('book_id').equals(bookId).delete();
    await db.paragraphs.where('book_id').equals(bookId).delete();
    await db.chapters.where('book_id').equals(bookId).delete();
    await db.token_analyses.where('book_id').equals(bookId).delete();
    await db.constructions.where('book_id').equals(bookId).delete();
    await db.dependencies.where('book_id').equals(bookId).delete();
    await db.translations.where('book_id').equals(bookId).delete();
    await db.explanations.where('book_id').equals(bookId).delete();
    await db.characters.where('book_id').equals(bookId).delete();
    await db.parallel_texts.where('book_id').equals(bookId).delete();
    await db.reading_progress.where('book_id').equals(bookId).delete();
    await db.analysis_versions.where('book_id').equals(bookId).delete();
    if (opts.purgeStudyData) {
      await db.word_encounters.where('book_id').equals(bookId).delete();
      await db.user_corrections.where('book_id').equals(bookId).delete();
    }
    await db.books.delete(bookId);
  });
  clearAnalysisMemo();
}
