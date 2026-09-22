import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../database/db';
import type { Book } from '../database/types';
import { importFile, importPastedText, ImportRefused, storeBook, type ImportedBook } from '../import';
import { bookFrequencies } from '../curriculum/frequency';
import { BackLink, Topbar } from './components';

export function ImportScreen() {
  const nav = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [target, setTarget] = useState<number | 'new'>('new');
  const [preview, setPreview] = useState<ImportedBook | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refused, setRefused] = useState<ImportRefused | null>(null);

  useEffect(() => {
    void db.books.toArray().then(setBooks);
  }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    setRefused(null);
    setPreview(null);
    setBusy(`Reading ${f.name}…`);
    try {
      const b = await importFile(f);
      setPreview(b);
      setTitle(b.title);
    } catch (e) {
      if (e instanceof ImportRefused) setRefused(e);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onPaste = () => {
    setErr(null);
    setRefused(null);
    try {
      const b = importPastedText(text, title || 'Pasted text');
      setPreview(b);
      if (!title) setTitle(b.title);
    } catch (e) {
      if (e instanceof ImportRefused) setRefused(e);
      else setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    if (!preview) return;
    setBusy('Importing…');
    try {
      const b = { ...preview, title: title || preview.title };
      const r = await storeBook(b, { appendTo: target === 'new' ? undefined : target, onProgress: (d, t) => setBusy(`Importing chapter ${d} of ${t}…`) });
      setBusy('Computing corpus frequencies…');
      await bookFrequencies(r.bookId, { force: true }).catch(() => {});
      const first = await db.chapters.get(r.chapterIds[0]!);
      nav(`/read/${r.bookId}/${first?.index ?? 0}`);
    } catch (e) {
      if (e instanceof ImportRefused) setRefused(e);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const words = preview ? preview.chapters.reduce((n, c) => n + c.paragraphs.reduce((k, p) => k + p.text.split(/\s+/).length, 0), 0) : 0;

  return (
    <div className="shell route-fade">
      <Topbar title="Import" left={<BackLink />} />
      <main className="page page--narrow">
        <div className="note">
          Import a Russian text you can lawfully read: an ordinary <b>EPUB</b>, <b>HTML/XHTML</b>, <b>TXT</b> or a <b>JSON corpus</b>. Protected files (.acsm, encrypted EPUBs) are refused — this reader never bypasses DRM. The text is stored only in this browser.
        </div>
        <div className="field">
          <label htmlFor="imp-file">Choose a file</label>
          <input id="imp-file" type="file" accept=".epub,.html,.htm,.xhtml,.txt,.json,.md,application/epub+zip,text/html,text/plain,application/json" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        <div className="field">
          <label htmlFor="imp-text">…or paste text (blank lines separate paragraphs; a standalone line such as “Глава I” starts a chapter)</label>
          <textarea id="imp-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste Russian text here…" />
          <div>
            <button className="btn btn--small" onClick={onPaste} disabled={!text.trim()}>Preview pasted text</button>
          </div>
        </div>
        {refused && (
          <div className={`note ${refused.reason === 'drm' ? 'note--warn' : ''}`}>
            <b>{refused.reason === 'drm' ? 'Protected file' : refused.reason === 'unsupported' ? 'Unsupported' : 'Could not import'}:</b> {refused.message}
          </div>
        )}
        {err && <p className="card__err">{err}</p>}
        {busy && <p className="faint"><span className="spinner" /> {busy}</p>}
        {preview && (
          <div className="card__section">
            <span className="label">Preview</span>
            <div className="field">
              <label htmlFor="imp-title">Title</label>
              <input id="imp-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="stat-row">
              <div className="stat"><b>{preview.chapters.length}</b><span>chapters</span></div>
              <div className="stat"><b>{words.toLocaleString()}</b><span>words (approx.)</span></div>
              <div className="stat"><b>{preview.source_format.toUpperCase()}</b><span>format</span></div>
            </div>
            {preview.author && <p className="card__text">Author: {preview.author}</p>}
            {preview.license && <p className="card__text">Rights: {preview.license}</p>}
            {preview.warnings.map((w, i) => <p key={i} className="muted-note">{w}</p>)}
            <ul className="list" style={{ marginTop: '0.5rem' }}>
              {preview.chapters.slice(0, 40).map((c, i) => (
                <li key={i} className="list__row"><span className="ru">{c.title}</span><span className="list__meta">{c.paragraphs.length} ¶</span></li>
              ))}
              {preview.chapters.length > 40 && <li className="muted-note">… and {preview.chapters.length - 40} more</li>}
            </ul>
            <div className="excerpt" style={{ marginTop: '0.8rem' }}>{preview.chapters[0]?.paragraphs.find((p) => p.kind === 'text')?.text.slice(0, 220)}…</div>
            {books.length > 0 && (
              <div className="field" style={{ marginTop: '1rem' }}>
                <label htmlFor="imp-target">Add to</label>
                <select id="imp-target" value={String(target)} onChange={(e) => setTarget(e.target.value === 'new' ? 'new' : Number(e.target.value))}>
                  <option value="new">a new book</option>
                  {books.map((b) => <option key={b.id} value={b.id}>{b.title} (append chapters)</option>)}
                </select>
              </div>
            )}
            <div className="sheet__actions">
              <button className="btn btn--primary" onClick={() => void save()} disabled={!!busy}>Import {preview.chapters.length} chapter{preview.chapters.length === 1 ? '' : 's'}</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
