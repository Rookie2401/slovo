import { db } from '../database/db';
import { lettersOf } from '../tokenizer/cyrillic';

/**
 * Corpus frequencies for a book: letters, word forms and (a proxy for) lemma
 * counts. Computed once per book after import and cached in learning_state;
 * used to order the alphabet curriculum, choose example words and (later)
 * chapter preparation.
 *
 * TODO(integration): `lemmas` currently counts by `token.key` (the loose
 * dictionary key) rather than a true resolved lexeme id, because
 * `src/morphology/analyze.ts` (package D's `analyzeWord`) does not exist yet
 * in this tree. Once it ships, replace the `lc.key = form` placeholder below
 * with `analyzeWord(surface, key, ctx)[0]?.key` the way the reference
 * implementation (`hindi-reader/src/curriculum/frequency.ts`) uses its
 * `analyzeWord`. Until then, `lemmas` is a reasonable but coarser proxy
 * (identical inflected forms are already merged by `key`, but different
 * forms of the same lexeme are not merged).
 */
export interface BookFrequencies {
  bookId: number;
  computedAt: number;
  tokenCount: number;
  /** canonical upper-case letter → count */
  letters: Record<string, number>;
  /** loose key → count */
  forms: Record<string, number>;
  /** proxy lemma key (= loose key, see TODO above) → count */
  lemmas: Record<string, number>;
  firstChapter: { letters: Record<string, number>; forms: Record<string, number>; lemmas: Record<string, number> };
  chapters: Array<{ chapterId: number; index: number; tokens: number; distinctForms: number }>;
}

const memo = new Map<number, BookFrequencies>();
/** in-flight computations, so two screens asking for the same book at once share one pass (and one write) */
const inflight = new Map<number, Promise<BookFrequencies>>();

export async function bookFrequencies(bookId: number, opts: { force?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<BookFrequencies> {
  if (!opts.force && memo.has(bookId)) return memo.get(bookId)!;
  const running = inflight.get(bookId);
  if (running && !opts.force) return running;
  const p = computeFrequencies(bookId, opts).finally(() => { if (inflight.get(bookId) === p) inflight.delete(bookId); });
  inflight.set(bookId, p);
  return p;
}

async function computeFrequencies(bookId: number, opts: { force?: boolean; onProgress?: (done: number, total: number) => void }): Promise<BookFrequencies> {
  const stored = opts.force ? undefined : await db.learning_state.where('key').equals(`freq:${bookId}`).first();
  if (stored) {
    memo.set(bookId, stored.value as BookFrequencies);
    return stored.value as BookFrequencies;
  }
  const chapters = (await db.chapters.where('book_id').equals(bookId).toArray()).sort((a, b) => a.index - b.index);
  const f: BookFrequencies = { bookId, computedAt: Date.now(), tokenCount: 0, letters: {}, forms: {}, lemmas: {}, firstChapter: { letters: {}, forms: {}, lemmas: {} }, chapters: [] };
  const inc = (o: Record<string, number>, k: string, n = 1) => (o[k] = (o[k] ?? 0) + n);
  const first = (o: Record<string, number>, k: string, ch: number) => {
    if (!(k in o)) o[k] = ch;
  };
  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci]!;
    const toks = await db.tokens.where('chapter_id').equals(ch.id!).toArray();
    const formsInChapter = new Set<string>();
    let n = 0;
    for (const t of toks) {
      if (t.kind !== 'word') continue;
      n++;
      const form = t.key;
      inc(f.forms, form);
      first(f.firstChapter.forms, form, ch.index);
      formsInChapter.add(form);
      // proxy lemma — see TODO(integration) above
      inc(f.lemmas, form);
      first(f.firstChapter.lemmas, form, ch.index);
      for (const l of lettersOf(t.surface_normalized)) {
        const upper = l.lower.toUpperCase();
        inc(f.letters, upper);
        first(f.firstChapter.letters, upper, ch.index);
      }
    }
    f.tokenCount += n;
    f.chapters.push({ chapterId: ch.id!, index: ch.index, tokens: n, distinctForms: formsInChapter.size });
    opts.onProgress?.(ci + 1, chapters.length);
  }
  // upsert by the unique `key` / `symbol` indexes inside one transaction: `put` without a primary
  // key is an add, and two concurrent computations (or a forced recomputation) would otherwise
  // hit a ConstraintError on the unique index
  await db.transaction('rw', [db.learning_state, db.alphabet_symbols], async () => {
    const key = `freq:${bookId}`;
    const prev = await db.learning_state.where('key').equals(key).first();
    if (prev) await db.learning_state.update(prev.id!, { value: f, updated_at: Date.now() });
    else await db.learning_state.add({ key, value: f, updated_at: Date.now() });
    // per-letter frequency table for the alphabet screens
    for (const [symbol, count] of Object.entries(f.letters)) {
      const cur = await db.alphabet_symbols.where('symbol').equals(symbol).first();
      const frequency = { ...(cur?.frequency ?? {}), [String(bookId)]: count };
      if (cur) await db.alphabet_symbols.update(cur.id!, { frequency });
      else await db.alphabet_symbols.add({ symbol, frequency });
    }
  });
  memo.set(bookId, f);
  return f;
}

export function topEntries(o: Record<string, number>, n = 20): Array<[string, number]> {
  return Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
