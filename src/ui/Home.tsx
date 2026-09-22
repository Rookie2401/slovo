import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../database/db';
import type { Book, Chapter, LadderLevel, ReadingProgress } from '../database/types';
import { deleteBook } from '../import';
// TODO(integration): package A ships src/import/library.ts. Signatures assumed from
// docs/PLAN.md §A: libraryIndex(): Promise<LibraryIndex>; addLibraryWork(slug, onProgress?): Promise<bookId>;
// addParallel(bookId, slug); seedCast(bookId, slug). LibraryWork fields per §A: slug/title/author/year/
// level/word_count/chapter_count/has_english.
import { libraryIndex, addLibraryWork } from '../import/library';
import { I, IconBtn, Sheet, Topbar } from './components';

interface LibraryWork {
  slug: string;
  title: string;
  author: string;
  year: number;
  level: LadderLevel;
  word_count: number;
  chapter_count: number;
  has_english: boolean;
}
interface LibraryIndex {
  works: LibraryWork[];
}

interface Row {
  book: Book;
  chapters: Chapter[];
  progress?: ReadingProgress;
}

const LEVEL_LABEL: Record<LadderLevel, string> = {
  1: 'Level 1 — Tolstoy’s readers for children',
  2: 'Level 2 — short tales',
  3: 'Level 3 — longer stories',
  4: 'Level 4 — Dostoevsky, short fiction',
  5: 'Level 5 — early novels',
  6: 'Level 6 — the great novels',
};

export function Home() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [confirm, setConfirm] = useState<Book | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryIndex | null>(null);

  const load = async () => {
    const books = await db.books.orderBy('created_at').reverse().toArray();
    const out: Row[] = [];
    for (const b of books) {
      const chapters = (await db.chapters.where('book_id').equals(b.id!).toArray()).sort((a, c) => a.index - c.index);
      const progress = await db.reading_progress.where('book_id').equals(b.id!).reverse().sortBy('updated_at').then((p) => p[0]);
      out.push({ book: b, chapters, progress });
    }
    setRows(out);
  };
  useEffect(() => {
    let alive = true;
    load().catch((e) => alive && setErr(String(e)));
    libraryIndex().then((idx: LibraryIndex) => alive && setLibrary(idx)).catch(() => alive && setLibrary({ works: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const addWork = async (work: LibraryWork) => {
    setBusy(`Fetching “${work.title}”…`);
    setErr(null);
    try {
      // addLibraryWork also fills the English parallel and the cast list (best-effort) — do not repeat them here
      const bookId = await addLibraryWork(work.slug, (d: number, t: number) => setBusy(`Importing chapter ${d} of ${t}…`));
      await load();
      nav(`/prep/${bookId}/0`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const continueRow = rows?.find((r) => r.progress);
  const continueChapter = continueRow?.chapters.find((c) => c.id === continueRow.progress!.chapter_id);
  const libraryBooks = rows?.filter((r) => r.book.source_format === 'library') ?? [];
  const importedBooks = rows?.filter((r) => r.book.source_format !== 'library') ?? [];
  const haveSlug = new Set(libraryBooks.map((r) => r.book.slug));
  const levels: LadderLevel[] = [1, 2, 3, 4, 5, 6];

  return (
    <div className="shell route-fade">
      <Topbar title="Library" right={<><IconBtn to="/vocabulary" label="Vocabulary">{I.history}</IconBtn><IconBtn to="/settings" label="Settings">{I.settings}</IconBtn></>} />
      <main className="page home">
        <h1 className="home__title"><span className="ru">Слово</span></h1>
        <p className="home__subtitle">Dostoevsky and Tolstoy in the original, with the apparatus underneath.</p>
        <div className="home__rule" />

        {continueRow && continueRow.progress && (
          <Link className="home__continue" to={`/read/${continueRow.book.id}/${continueChapter?.index ?? 0}`}>
            <div className="home__continue-label">Continue reading</div>
            <div className="home__continue-ref ru">{continueChapter?.title ?? continueRow.book.title}</div>
            <div className="home__continue-sub">{continueRow.book.title}</div>
          </Link>
        )}

        <Link className="home__script" to="/alphabet">
          <span className="ru-big">Аа</span>
          <span className="home__script-text">
            <b>Alphabet &amp; pronunciation</b>
            The Cyrillic alphabet, cursive forms, stress and vowel reduction.
          </span>
          <span className="faint">{I.chevron}</span>
        </Link>

        {rows === null && <p className="faint"><span className="spinner" /> Loading…</p>}
        {err && <p className="card__err">{err}</p>}
        {busy && <p className="faint"><span className="spinner" /> {busy}</p>}

        {importedBooks.length > 0 && (
          <div className="home__list">
            <div className="home__list-divider">Your books</div>
            {importedBooks.map((r) => (
              <div key={r.book.id}>
                <div className="home__list-divider">{r.book.title}{r.book.author ? ` · ${r.book.author}` : ''} · {r.book.chapter_count} chapters · {r.book.token_count.toLocaleString()} words</div>
                {r.chapters.map((c) => (
                  <Link key={c.id} className="home__entry" to={`/read/${r.book.id}/${c.index}`}>
                    <span className="home__entry-name"><span className="ru">{c.title}</span><span className="home__entry-sub">{c.token_count.toLocaleString()} words</span></span>
                    <span className="home__entry-index">{r.progress?.chapter_id === c.id ? 'reading' : ''}</span>
                  </Link>
                ))}
                <div className="home__links" style={{ marginTop: '0.6rem' }}>
                  <button className="textlink" onClick={() => setConfirm(r.book)}>Remove this book</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="home__list" style={{ marginTop: '1.4rem' }}>
          <div className="home__list-divider">The reading ladder</div>
          {levels.map((lvl) => {
            const works = (library?.works ?? []).filter((w) => w.level === lvl);
            if (!works.length) return null;
            return (
              <div key={lvl}>
                <div className="home__list-divider">{LEVEL_LABEL[lvl]}</div>
                {works.map((w) => {
                  const owned = libraryBooks.find((r) => r.book.slug === w.slug);
                  return (
                    <div key={w.slug} className="home__entry" style={{ cursor: owned ? undefined : 'default' }}>
                      {owned ? (
                        <Link className="home__entry-name" to={`/read/${owned.book.id}/0`} style={{ display: 'contents' }}>
                          <span className="ru">{w.title}</span>
                          <span className="home__entry-sub">{w.author} · {w.year} · {w.chapter_count} chapters · {w.word_count.toLocaleString()} words{w.has_english ? ' · English parallel' : ''}</span>
                        </Link>
                      ) : (
                        <span className="home__entry-name">
                          <span className="ru">{w.title}</span>
                          <span className="home__entry-sub">{w.author} · {w.year} · {w.chapter_count} chapters · {w.word_count.toLocaleString()} words{w.has_english ? ' · English parallel' : ''}</span>
                        </span>
                      )}
                      <span className="home__entry-index">{owned ? 'on your shelf' : haveSlug.has(w.slug) ? '' : <button className="btn btn--small" disabled={!!busy} onClick={() => void addWork(w)}>Add to my shelf</button>}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="home__links">
          <Link to="/import">Import a book</Link>
          <Link to="/alphabet">Alphabet chart</Link>
        </div>
        <p className="home__about">Nothing leaves this device: books, analyses and progress live in your browser.</p>
      </main>
      {confirm && (
        <Sheet title="Remove book" onClose={() => setConfirm(null)}>
          <p className="card__text">Remove “{confirm.title}” from the library? Your vocabulary statuses stay; encounter history for this book is kept unless you choose to purge it.</p>
          <div className="sheet__actions">
            <button className="btn btn--quiet" onClick={() => setConfirm(null)}>Keep</button>
            <button className="btn btn--danger" onClick={() => { const b = confirm; setConfirm(null); void deleteBook(b.id!).then(load); }}>Remove</button>
            <button className="btn btn--danger" onClick={() => { const b = confirm; setConfirm(null); void deleteBook(b.id!, { purgeStudyData: true }).then(load); }}>Remove + purge history</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
