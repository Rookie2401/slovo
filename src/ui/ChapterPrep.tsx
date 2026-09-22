import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../database/db';
import type { Chapter } from '../database/types';
import { chapterPrep, type ChapterPrep } from '../curriculum/chapterPrep';
import { knownSymbols, markIntroduced } from '../alphabet/mastery';
import { symbolInfo } from '../alphabet/inventory';
import { BackLink, Topbar } from './components';
import { pronounce } from '../pronunciation';

/**
 * Chapter preparation → read → review. Deliberately brief: new letters, the
 * most frequent new words, the names introduced here, the constructions to
 * notice. The chapter is the lesson.
 */
export function ChapterPrepScreen() {
  const { bookId: b, chapterIndex: ci } = useParams();
  const bookId = Number(b);
  const chapterIndex = Number(ci);
  const [prep, setPrep] = useState<ChapterPrep | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const ch = await db.chapters.where('[book_id+index]').equals([bookId, chapterIndex]).first();
      if (!ch) throw new Error('This chapter does not exist.');
      const k = await knownSymbols();
      const p = await chapterPrep(bookId, ch.id!, k);
      if (!alive) return;
      setChapter(ch);
      setKnown(k);
      setPrep(p);
    })().catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [bookId, chapterIndex]);
  if (err) return <div className="page"><p className="card__err">{err}</p></div>;
  if (!prep || !chapter) return <div className="page"><p className="faint"><span className="spinner" /> Looking through the chapter…</p></div>;
  return (
    <div className="shell route-fade">
      <Topbar title="Before you read" left={<BackLink to={`/read/${bookId}/${chapterIndex}`} />} />
      <main className="page page--narrow">
        <h1 className="ru" style={{ fontSize: '1.7rem' }}>{chapter.title}</h1>
        <p className="muted-note">{prep.tokens.toLocaleString()} words · {prep.distinctForms.toLocaleString()} distinct forms. Two minutes here, then read.</p>

        {prep.newLetters.length > 0 && (
          <div className="prep__section">
            <span className="label">Letters you meet here for the first time</span>
            <div className="grid-chart grid-chart--auto">
              {prep.newLetters.map((s) => (
                <Link key={s.symbol} className={`glyph${known.has(s.symbol) ? ' glyph--known' : ' glyph--unknown'}`} to={`/alphabet/letter/${encodeURIComponent(s.symbol)}`}><span className="ru">{s.symbol}</span><small>{symbolInfo(s.symbol)?.ipa[0] ?? '?'} · {s.count}</small></Link>
              ))}
            </div>
            <div className="card__actions"><button className="btn btn--small" onClick={() => void markIntroduced(prep.newLetters.map((s) => s.symbol)).then(() => setKnown(new Set([...known, ...prep.newLetters.map((s) => s.symbol)])))}>Mark these as met</button></div>
          </div>
        )}
        {prep.newLetters.length === 0 && <p className="card__text">No new letters in this chapter.</p>}

        {prep.newWords.length > 0 && (
          <div className="prep__section">
            <span className="label">Frequent words that first appear here</span>
            <div className="examples">
              {prep.newWords.map((w) => (
                <Link key={w.key} className="example" to={`/word/${encodeURIComponent(w.key)}`}>
                  <span className="ru">{w.lemma}</span>
                  <span className="g">{pronounce(w.lemma).translit} · {w.unknownToDictionary ? <i>not in the dictionary (likely rule-generated)</i> : w.gloss}</span>
                  <span className="meta">{w.pos} · ×{w.count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {prep.newNames.length > 0 && (
          <div className="prep__section">
            <span className="label">Names introduced in this chapter</span>
            <div className="examples">
              {prep.newNames.map((n) => (
                <Link key={n.key} className="example" to={`/names/${bookId}`}>
                  <span className="ru">{n.canonical}</span>
                  <span className="meta">×{n.count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {prep.constructions.length > 0 && (
          <div className="prep__section">
            <span className="label">Grammar to notice</span>
            <div className="examples">
              {prep.constructions.map((x) => (
                <div key={x.pattern} className="example"><span className="ru">{x.example}</span><span className="g">{x.label}</span><span className="meta">×{x.count}</span></div>
              ))}
            </div>
          </div>
        )}
        {prep.prepositions.length > 0 && (
          <div className="prep__section">
            <span className="label">Prepositions in this chapter</span>
            <div className="chips">{prep.prepositions.map((p) => <span key={p.form} className="chip"><span className="ru">{p.form}</span> ×{p.count}</span>)}</div>
          </div>
        )}
        <div className="card__actions" style={{ marginTop: '1.5rem' }}>
          <Link className="btn btn--primary" to={`/read/${bookId}/${chapterIndex}`}>Read the chapter</Link>
        </div>
      </main>
    </div>
  );
}
