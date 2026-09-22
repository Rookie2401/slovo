import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../database/db';
import type { KnownWord, LearningStatus, Token } from '../database/types';
import { lexemeEntry, lookupForm, type Candidate } from '../lexicon';
import { lexemeBookForms, lexemeStats, onVocabChange, setFormStatus, setStatus, type LexemeStats } from '../vocabulary';
import { BackLink, Topbar } from './components';
import { StatusPicker } from '../reader/WordPanel';
import { Paradigm } from '../reader/Paradigm';
import { pronounce } from '../pronunciation/translit';
import { NOUN_CLASS_LABEL } from '../morphology/nouns';
import { STATUS_ORDER } from '../vocabulary';

/** Lexeme page: meaning, paradigm, every form met in the library with counts, encounter history. */
export function WordScreen() {
  const { key: keyS } = useParams();
  const key = decodeURIComponent(keyS ?? '');
  const [stats, setStats] = useState<LexemeStats | null>(null);
  const [forms, setForms] = useState<Array<{ form: string; count: number }>>([]);
  const [occ, setOcc] = useState<Array<{ token: Token; text: string; chapterId: number; chapterTitle: string }>>([]);
  const [status, setSt] = useState<KnownWord | undefined>();
  const entry = lexemeEntry(key);
  const [lemma, pos] = key.replace(/^\?/, '').split('|');
  const cand: Candidate | undefined = lookupForm(lemma ?? '').find((c) => c.key === key) ?? lookupForm(lemma ?? '')[0];

  const load = async () => {
    const s = await lexemeStats(key);
    setStats(s);
    setSt(s.status);
    const book = await db.books.orderBy('created_at').first();
    if (book) setForms(await lexemeBookForms(book.id!, key));
    const rows = await db.token_analyses.where('lexeme_key').equals(key).filter((r) => r.rank === 0 && !r.superseded).limit(40).toArray();
    const toks = (await db.tokens.bulkGet(rows.map((r) => r.token_id))).filter((t): t is Token => !!t);
    const sents = await db.sentences.bulkGet(Array.from(new Set(toks.map((t) => t.sentence_id))));
    const chapters = await db.chapters.bulkGet(Array.from(new Set(toks.map((t) => t.chapter_id))));
    const sById = new Map(sents.filter((s) => s).map((s) => [s!.id!, s!]));
    const cById = new Map(chapters.filter((c) => c).map((c) => [c!.id!, c!]));
    const seenSent = new Set<number>();
    const out: typeof occ = [];
    for (const t of toks) {
      if (seenSent.has(t.sentence_id)) continue;
      seenSent.add(t.sentence_id);
      const s = sById.get(t.sentence_id);
      const c = cById.get(t.chapter_id);
      if (s && c) out.push({ token: t, text: s.text, chapterId: c.id!, chapterTitle: c.title });
      if (out.length >= 12) break;
    }
    setOcc(out);
  };
  useEffect(() => {
    void load();
    return onVocabChange(() => void load());
  }, [key]);

  const pron = pronounce(lemma ?? '', entry?.pron);
  return (
    <div className="shell route-fade">
      <Topbar title="Lexeme" left={<BackLink to="/vocabulary" />} />
      <main className="page page--narrow">
        <div className="card__surface dv">{lemma}</div>
        <div className="card__translit">{pron.pronunciation}</div>
        <div className="card__gloss">{entry?.gloss ?? cand?.gloss ?? '(not in the lexicon)'}</div>
        <div className="card__line"><span className="k">class</span><span>{pos}{entry?.gender ? ` · ${entry.gender === 'm' ? 'masculine' : 'feminine'}` : ''}{entry?.cls ? ` · ${NOUN_CLASS_LABEL[entry.cls]}` : ''}{entry?.trans !== undefined ? ` · ${entry.trans ? 'transitive' : 'intransitive'} (ने: ${entry.ne})` : ''}{entry?.ety ? ` · ${entry.ety}` : ''}</span></div>
        {entry?.senses && <div className="card__line"><span className="k">senses</span><span>{entry.senses.join('; ')}</span></div>}
        {entry?.notes && <div className="card__line"><span className="k">notes</span><span>{entry.notes}</span></div>}
        <StatusPicker lexemeKey={key} form={lemma ?? ''} status={status} onStatus={(k, s: LearningStatus) => void setStatus(k, s)} />
        {stats && (
          <div className="stat-row">
            <div className="stat"><b>{stats.encounters}</b><span>read encounters</span></div>
            <div className="stat"><b>{stats.lookups}</b><span>lookups</span></div>
            <div className="stat"><b>{stats.chapters.length}</b><span>chapters</span></div>
          </div>
        )}
        {cand && <Paradigm cand={cand} surface={lemma ?? ''} />}
        {forms.length > 0 && (
          <div className="card__section">
            <span className="label">Forms in the book</span>
            <ul className="list">
              {forms.map((f) => {
                const fs = status?.form_status?.[f.form];
                return (
                  <li key={f.form} className="list__row">
                    <span className="dv">{f.form}</span>
                    <span className="soft">× {f.count}</span>
                    <span className="list__meta">
                      <select value={fs ?? ''} onChange={(e) => void setFormStatus(key, f.form, (e.target.value || null) as LearningStatus | null)} aria-label={`status of the form ${f.form}`} style={{ background: 'transparent', border: '1px solid var(--rule)', borderRadius: 4, fontSize: '0.8rem' }}>
                        <option value="">form: as lexeme</option>
                        {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="muted-note">A hard inflected form can carry its own status without changing the lexeme.</p>
          </div>
        )}
        {occ.length > 0 && (
          <div className="card__section">
            <span className="label">In context</span>
            {occ.map((o) => (
              <div key={o.token.id} style={{ marginBottom: '0.7rem' }}>
                <div className="excerpt" lang="hi">{o.text.split(o.token.surface_original).flatMap((part, i, arr) => (i < arr.length - 1 ? [part, <mark key={i}>{o.token.surface_original}</mark>] : [part]))}</div>
                <div className="excerpt-cite"><Link to={`/read/${o.token.book_id}/${o.chapterId}?s=${o.token.sentence_id}`}>{o.chapterTitle}</Link></div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
