import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../database/db';
import type { Book, CharacterRecord } from '../database/types';
import { BackLink, Topbar } from './components';

const KIND_LABEL: Record<string, string> = {
  full: 'full name',
  given: 'given name',
  patronymic: 'patronymic',
  surname: 'surname',
  diminutive: 'diminutive — intimate register',
  nickname: 'nickname — familiar register',
  title: 'title',
  other: 'other',
};

/** The cast of a book: canonical name, every surface form it takes, and register notes. */
export function NamesScreen() {
  const { bookId: b } = useParams();
  const bookId = Number(b);
  const [book, setBook] = useState<Book | null>(null);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const bk = await db.books.get(bookId);
      const cs = (await db.characters.where('book_id').equals(bookId).toArray()).sort((a, c) => a.canonical.localeCompare(c.canonical, 'ru'));
      if (!alive) return;
      setBook(bk ?? null);
      setCharacters(cs);
    })();
    return () => {
      alive = false;
    };
  }, [bookId]);

  const shown = characters.filter((c) => !q || c.canonical.toLowerCase().includes(q.toLowerCase()) || c.forms.some((f) => f.form.includes(q.toLowerCase())));
  const curated = shown.filter((c) => c.source === 'manual');
  const detected = shown.filter((c) => c.source !== 'manual');

  return (
    <div className="shell route-fade">
      <Topbar title="Names" left={<BackLink to="/" />} />
      <main className="page page--narrow">
        {book && <h1 className="ru" style={{ fontSize: '1.4rem' }}>{book.title}</h1>}
        <p className="muted-note">Diminutives, patronymics and nicknames the novel uses for each character, resolved to a canonical name; tap a chapter reference to jump to a sentence that uses that form.</p>
        <div className="field"><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search a name or form" aria-label="Search names" /></div>

        {characters.length === 0 && <p className="faint">No cast list for this book yet.</p>}

        {curated.length > 0 && (
          <div className="home__list" style={{ marginTop: '1rem' }}>
            <div className="home__list-divider">Cast</div>
            {curated.map((c) => <CharacterCard key={c.id} c={c} />)}
          </div>
        )}
        {detected.length > 0 && (
          <div className="home__list" style={{ marginTop: '1.4rem' }}>
            <div className="home__list-divider">Detected in the text</div>
            {detected.map((c) => <CharacterCard key={c.id} c={c} />)}
          </div>
        )}
      </main>
    </div>
  );
}

function CharacterCard({ c }: { c: CharacterRecord }) {
  return (
    <div className="card__section" style={{ borderTop: 'none', paddingTop: 0 }}>
      <div className="card__line"><span className="ru" style={{ fontSize: '1.3rem' }}>{c.canonical}</span>{c.role && <span className="soft"> · {c.role}</span>}</div>
      {(c.given || c.patronymic || c.surname) && (
        <p className="muted-note">
          {[c.given, c.patronymic, c.surname].filter(Boolean).join(' ')}
        </p>
      )}
      <div className="chips" style={{ marginTop: '0.4rem' }}>
        {c.forms.map((f, i) => (
          <span key={i} className="chip" title={KIND_LABEL[f.kind] ?? f.kind}>
            <span className="ru">{f.form}</span>
          </span>
        ))}
      </div>
      {c.note && <p className="card__text" style={{ marginTop: '0.4rem' }}>{c.note}</p>}
      {c.confidence < 0.9 && <p className="card__prov">confidence: {Math.round(c.confidence * 100)}%</p>}
    </div>
  );
}
