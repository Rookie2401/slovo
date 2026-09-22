import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../database/db';
import type { KnownWord, LearningStatus, Token } from '../database/types';
import { lexeme } from '../dictionary';
import { splitAccent, withAcute } from '../dictionary/accent';
import { pronounce } from '../pronunciation';
import { lexemeBookForms, lexemeStats, onVocabChange, setFormStatus, setStatus, type LexemeStats } from '../vocabulary';
import { BackLink, Topbar } from './components';
import { StatusPicker } from '../reader/WordPanel';
import { Paradigm } from '../reader/Paradigm';
import { STATUS_ORDER } from '../vocabulary';
import type { DictLexeme } from '../dictionary/types';

const POS_LABEL: Record<string, string> = { noun: 'noun', proper: 'proper noun', pronoun: 'pronoun', adjective: 'adjective', verb: 'verb', adverb: 'adverb', preposition: 'preposition', conjunction: 'conjunction', particle: 'particle', interjection: 'interjection', numeral: 'numeral', predicative: 'predicative', unknown: 'unknown' };

/** Lexeme page: meaning, paradigm, every form met in the library with counts, encounter history. */
export function WordScreen() {
  const { key: keyS } = useParams();
  const key = decodeURIComponent(keyS ?? '');
  const [entry, setEntry] = useState<DictLexeme | undefined>(undefined);
  const [stats, setStats] = useState<LexemeStats | null>(null);
  const [forms, setForms] = useState<Array<{ form: string; count: number }>>([]);
  const [occ, setOcc] = useState<Array<{ token: Token; text: string; chapterIndex: number; chapterTitle: string }>>([]);
  const [status, setSt] = useState<KnownWord | undefined>();
  const bareKey = key.replace(/^\?/, '');
  const [pos, lemmaFromKey] = bareKey.includes(':') ? bareKey.split(':') : [undefined, bareKey];

  const load = async () => {
    const e = await lexeme(key).catch(() => undefined);
    setEntry(e);
    const s = await lexemeStats(key);
    setStats(s);
    setSt(s.status);
    const book = await db.books.orderBy('created_at').first();
    if (book) setForms(await lexemeBookForms(book.id!, key));
    const rows = await db.token_analyses.where('lexeme_key').equals(key).filter((r) => r.rank === 0 && !r.superseded).limit(40).toArray();
    const toks = (await db.tokens.bulkGet(rows.map((r) => r.token_id))).filter((t): t is Token => !!t);
    const sents = await db.sentences.bulkGet(Array.from(new Set(toks.map((t) => t.sentence_id))));
    const chapters = await db.chapters.bulkGet(Array.from(new Set(toks.map((t) => t.chapter_id))));
    const sById = new Map(sents.filter((s2) => s2).map((s2) => [s2!.id!, s2!]));
    const cById = new Map(chapters.filter((c) => c).map((c) => [c!.id!, c!]));
    const seenSent = new Set<number>();
    const out: typeof occ = [];
    for (const t of toks) {
      if (seenSent.has(t.sentence_id)) continue;
      seenSent.add(t.sentence_id);
      const s2 = sById.get(t.sentence_id);
      const c = cById.get(t.chapter_id);
      if (s2 && c) out.push({ token: t, text: s2.text, chapterIndex: c.index, chapterTitle: c.title });
      if (out.length >= 12) break;
    }
    setOcc(out);
  };
  useEffect(() => {
    void load();
    return onVocabChange(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const lemma = entry?.lemma ?? lemmaFromKey ?? '';
  const { plain, stress } = entry?.acc ? splitAccent(entry.acc) : { plain: lemma, stress: -1 };
  const accentedLemma = stress >= 0 ? withAcute(plain, stress) : lemma;
  const pron = pronounce(plain, stress);

  return (
    <div className="shell route-fade">
      <Topbar title="Lexeme" left={<BackLink to="/vocabulary" />} />
      <main className="page page--narrow">
        <div className="card__surface ru">{accentedLemma}</div>
        <div className="card__translit">{pron.translit}{pron.confidence < 0.8 && <span title="pronunciation less certain"> ?</span>}</div>
        <div className="card__gloss">{entry?.gloss ?? '(not in the dictionary — likely a name, or a rule-generated form)'}</div>
        <div className="card__line"><span className="k">class</span><span>{POS_LABEL[entry?.pos ?? pos ?? 'unknown'] ?? entry?.pos ?? pos}{entry?.gender ? ` · ${entry.gender === 'm' ? 'masculine' : entry.gender === 'f' ? 'feminine' : entry.gender === 'n' ? 'neuter' : 'common'}` : ''}{entry?.aspect ? ` · ${entry.aspect === 'perfective' ? 'perfective' : entry.aspect === 'imperfective' ? 'imperfective' : 'biaspectual'}` : ''}{entry?.animacy ? ` · ${entry.animacy === 'anim' ? 'animate' : 'inanimate'}` : ''}</span></div>
        {entry?.senses && entry.senses.length > 0 && <div className="card__line"><span className="k">senses</span><span>{entry.senses.join('; ')}</span></div>}
        {entry?.partner && <div className="card__line"><span className="k">aspect partner</span><Link className="ru" to={`/word/${encodeURIComponent(entry.partner)}`}>{entry.partner.split(':')[1]}</Link></div>}
        {entry?.extra?.note && <div className="card__line"><span className="k">note</span><span>{entry.extra.note}</span></div>}
        <StatusPicker lexemeKey={key} form={lemma} status={status} onStatus={(k, s) => void setStatus(k, s as LearningStatus)} />
        {stats && (
          <div className="stat-row">
            <div className="stat"><b>{stats.encounters}</b><span>read encounters</span></div>
            <div className="stat"><b>{stats.lookups}</b><span>lookups</span></div>
            <div className="stat"><b>{stats.chapters.length}</b><span>chapters</span></div>
          </div>
        )}
        {entry?.rank && <p className="muted-note">Frequency rank: #{entry.rank} of 50,000.</p>}
        {entry?.paradigm && <Paradigm paradigm={entry.paradigm} currentForm={lemma} />}
        {forms.length > 0 && (
          <div className="card__section">
            <span className="label">Forms in the book</span>
            <ul className="list">
              {forms.map((f) => {
                const fs = status?.form_status?.[f.form];
                return (
                  <li key={f.form} className="list__row">
                    <span className="ru">{f.form}</span>
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
                <div className="excerpt" lang="ru">{o.text.split(o.token.surface_original).flatMap((part, i, arr) => (i < arr.length - 1 ? [part, <mark key={i}>{o.token.surface_original}</mark>] : [part]))}</div>
                <div className="excerpt-cite"><Link to={`/read/${o.token.book_id}/${o.chapterIndex}?s=${o.token.sentence_id}`}>{o.chapterTitle}</Link></div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
