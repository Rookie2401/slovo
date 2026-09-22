import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { KnownWord, LearningStatus } from '../database/types';
import { lexemeEntry } from '../lexicon';
import { allKnownWords, onVocabChange, STATUS_LABEL, STATUS_ORDER } from '../vocabulary';
import { BackLink, Topbar } from './components';

export function VocabularyScreen() {
  const [rows, setRows] = useState<KnownWord[]>([]);
  const [filter, setFilter] = useState<LearningStatus | 'all'>('all');
  const [q, setQ] = useState('');
  useEffect(() => {
    const load = () => void allKnownWords().then(setRows);
    load();
    return onVocabChange(load);
  }, []);
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const shown = rows.filter((r) => (filter === 'all' || r.status === filter) && (!q || r.lexeme_key.includes(q) || (lexemeEntry(r.lexeme_key)?.gloss ?? '').toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="shell route-fade">
      <Topbar title="Vocabulary" left={<BackLink />} />
      <main className="page page--narrow">
        <div className="stat-row">
          {STATUS_ORDER.map((s) => <div key={s} className="stat"><b>{counts.get(s) ?? 0}</b><span>{STATUS_LABEL[s]}</span></div>)}
        </div>
        <div className="segmented" style={{ margin: '0.6rem 0' }}>
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>all</button>
          {STATUS_ORDER.map((s) => <button key={s} aria-pressed={filter === s} onClick={() => setFilter(s)}>{STATUS_LABEL[s]}</button>)}
          <button aria-pressed={filter === 'ignored'} onClick={() => setFilter('ignored')}>ignored</button>
        </div>
        <div className="field"><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search lemma or meaning" aria-label="Search vocabulary" /></div>
        <p className="muted-note">Tracked by lexeme (dictionary word). Encounters count when you scroll past a paragraph; lookups when you tap. The list never interferes with reading.</p>
        <div>
          {shown.slice(0, 400).map((r) => {
            const e = lexemeEntry(r.lexeme_key);
            const [lemma, pos] = r.lexeme_key.replace(/^\?/, '').split('|');
            return (
              <Link key={r.lexeme_key} className="vocab__row" to={`/word/${encodeURIComponent(r.lexeme_key)}`}>
                <span className="dv">{lemma}</span>
                <span className="g">{e?.gloss ?? pos}</span>
                <span className="m">{STATUS_LABEL[r.status]} · {r.encounters}×{r.lookups ? ` · ${r.lookups} lookups` : ''}</span>
              </Link>
            );
          })}
          {shown.length === 0 && <p className="faint">Nothing here yet.</p>}
        </div>
      </main>
    </div>
  );
}
