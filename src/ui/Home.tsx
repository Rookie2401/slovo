import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../database/db';
import type { Book, Chapter, ReadingProgress } from '../database/types';
import { deleteBook, storeBook } from '../import';
import { importJson } from '../import/json';
import { I, IconBtn, Sheet, Topbar } from './components';
import { knownSymbols } from '../alphabet/mastery';
import { STAGES } from '../alphabet/curriculum';
import { bookFrequencies } from '../curriculum/frequency';

interface LibraryItem {
  file: string;
  title: string;
  subtitle: string;
  license: string;
  kind: string;
  level?: string;
}

interface Row {
  book: Book;
  chapters: Chapter[];
  progress?: ReadingProgress;
}

export function Home() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Book | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  const load = async () => {
    const books = await db.books.orderBy('created_at').reverse().toArray();
    const out: Row[] = [];
    for (const b of books) {
      const chapters = (await db.chapters.where('book_id').equals(b.id!).toArray()).sort((a, c) => a.index - c.index);
      const progress = await db.reading_progress.where('book_id').equals(b.id!).reverse().sortBy('updated_at').then((p) => p[0]);
      out.push({ book: b, chapters, progress });
    }
    setRows(out);
    setKnown(await knownSymbols());
  };
  useEffect(() => {
    let alive = true;
    load().catch((e) => alive && setErr(String(e)));
    fetch(`${import.meta.env.BASE_URL}corpus/index.json`).then((r) => (r.ok ? r.json() : { items: [] })).then((j: { items: LibraryItem[] }) => alive && setLibrary(j.items ?? [])).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const addSample = async (file = 'hindi-bible-sample.json') => {
    setBusy('Loading the text…');
    setErr(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}corpus/${file}`);
      if (!res.ok) throw new Error('corpus file not found: ' + file);
      const book = importJson(await res.json(), { sourceName: file });
      const r = await storeBook(book, { onProgress: (d, t) => setBusy(`Importing chapter ${d} of ${t}…`) });
      setBusy('Computing corpus frequencies…');
      await bookFrequencies(r.bookId, { force: true });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const continueRow = rows?.find((r) => r.progress);
  const stageIdx = STAGES.findIndex((s) => !s.symbols.every((x) => known.has(x.symbol)));
  const stage = stageIdx < 0 ? null : STAGES[stageIdx]!;

  return (
    <div className="shell route-fade">
      <Topbar title="Library" right={<><IconBtn to="/vocabulary" label="Vocabulary">{I.history}</IconBtn><IconBtn to="/settings" label="Settings">{I.settings}</IconBtn></>} />
      <main className="page home">
        <h1 className="home__title"><span className="dv">पाठ</span>Hindi Reader</h1>
        <p className="home__subtitle">Real Hindi, read directly — with the grammar underneath when you need it.</p>
        <div className="home__rule" />

        {continueRow && continueRow.progress && (
          <Link className="home__continue" to={`/read/${continueRow.book.id}/${continueRow.progress.chapter_id}`}>
            <div className="home__continue-label">Continue reading</div>
            <div className="home__continue-ref dv">{continueRow.chapters.find((c) => c.id === continueRow.progress!.chapter_id)?.title ?? continueRow.book.title}</div>
            <div className="home__continue-sub">{continueRow.book.title}</div>
          </Link>
        )}

        <Link className="home__script" to={stage ? `/alphabet/stage/${stage.id}` : '/alphabet'}>
          <span className="dv-big">{stage ? stage.symbols[0]!.symbol : 'क'}</span>
          <span className="home__script-text">
            <b>{stage ? `Script: ${stage.title}` : 'Devanagari: all stages introduced'}</b>
            {stage ? `Stage ${stageIdx + 1} of ${STAGES.length} · ${stage.subtitle}` : 'Review what is due, or read on.'}
          </span>
          <span className="faint">{I.chevron}</span>
        </Link>

        {rows === null && <p className="faint"><span className="spinner" /> Loading…</p>}
        {rows && rows.length === 0 && (
          <div className="note">
            No books yet. Import your own EPUB, HTML, TXT or JSON — for the Hindi <i>Percy Jackson</i>, a DRM-free copy you own — or start with the openly licensed sample text.
          </div>
        )}
        <div className="home__list">
          {rows?.map((r) => (
            <div key={r.book.id}>
              <div className="home__list-divider">{r.book.title}{r.book.author ? ` · ${r.book.author}` : ''} · {r.book.chapter_count} chapters · {r.book.token_count.toLocaleString()} words</div>
              {r.chapters.map((c) => (
                <Link key={c.id} className="home__entry" to={`/read/${r.book.id}/${c.id}`}>
                  <span className="home__entry-name"><span className="dv">{c.title}</span><span className="home__entry-sub">{c.token_count.toLocaleString()} words</span></span>
                  <span className="home__entry-index">{r.progress?.chapter_id === c.id ? 'reading' : ''}</span>
                </Link>
              ))}
              <div className="home__links" style={{ marginTop: '0.6rem' }}>
                <button className="textlink" onClick={() => setConfirm(r.book)}>Remove this book</button>
                {r.book.license && <span className="muted-note">{r.book.license.split(' — ')[0]}</span>}
              </div>
            </div>
          ))}
        </div>

        {err && <p className="card__err">{err}</p>}
        {busy && <p className="faint"><span className="spinner" /> {busy}</p>}
        <div className="home__links">
          <Link to="/import">Import a book</Link>
          {!rows?.some((r) => r.book.source_format === 'sample') && <button className="textlink" onClick={() => void addSample()} disabled={!!busy}>Add the sample text (Hindi Bible, CC BY-SA)</button>}
          {library.length > 0 && <button className="textlink" onClick={() => setShowLibrary(!showLibrary)}>{showLibrary ? 'Hide open library' : 'Open library (free texts)'}</button>}
          <Link to="/alphabet">Devanagari chart</Link>
        </div>
        {showLibrary && (
          <div className="home__list" style={{ marginTop: '1.2rem' }}>
            <div className="home__list-divider">Open library — openly licensed Hindi texts bundled with the app</div>
            {library.map((it) => {
              const have = rows?.some((r) => r.book.source_name === it.file);
              return (
                <div key={it.file} className="home__entry" style={{ cursor: 'default' }}>
                  <span className="home__entry-name"><span className="dv">{it.title}</span><span className="home__entry-sub">{it.subtitle} · {it.license}</span></span>
                  <span className="home__entry-index">{have ? 'in library' : <button className="btn btn--small" disabled={!!busy} onClick={() => void addSample(it.file)}>Add</button>}</span>
                </div>
              );
            })}
            <p className="muted-note" style={{ padding: '0.4rem 0.6rem' }}>StoryWeaver stories are CC BY 4.0 (Pratham Books); each story ends with its author and illustrator credit. The Bible volumes are the Indian Revised Version, CC BY-SA 4.0.</p>
          </div>
        )}
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
      <span style={{ display: 'none' }} onClick={() => nav('/')} />
    </div>
  );
}
