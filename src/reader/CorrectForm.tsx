import { useState } from 'react';
import type { Pos, Token } from '../database/types';
import type { Candidate } from '../lexicon';
import { correctToken, correctLexeme } from '../database/analysis';

const POS: Pos[] = ['noun', 'proper', 'pronoun', 'adjective', 'verb', 'adverb', 'postposition', 'conjunction', 'particle', 'interjection', 'number', 'determiner', 'unknown'];

/** Token-level (this occurrence) or lexeme-level (every occurrence) correction. */
export function CorrectForm({ bookId, chapterId, token, cand, onDone }: { bookId: number; chapterId: number; token: Token; cand: Candidate; onDone: () => void }) {
  const [lemma, setLemma] = useState(cand.lemma);
  const [pos, setPos] = useState<Pos>(cand.pos);
  const [gloss, setGloss] = useState(cand.gloss);
  const [gender, setGender] = useState(cand.features.gender ?? '');
  const [number, setNumber] = useState(cand.features.number ?? '');
  const [kase, setKase] = useState(cand.features.case ?? '');
  const [scope, setScope] = useState<'token' | 'lexeme'>('token');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const features: Record<string, unknown> = {};
      if (gender) features.gender = gender;
      if (number) features.number = number;
      if (kase) features.case = kase;
      const payload = { lemma, pos, gloss, features, key: `${lemma}|${pos}${pos === 'noun' && gender ? '|' + gender : ''}` };
      if (scope === 'token') await correctToken(bookId, chapterId, token.id!, payload, note || undefined);
      else await correctLexeme(cand.key, payload, note || undefined);
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card__section">
      <span className="label">Correct this analysis</span>
      <div className="correct-grid">
        <div className="field"><label htmlFor="cf-lemma">Lemma</label><input id="cf-lemma" className="dv" type="text" value={lemma} onChange={(e) => setLemma(e.target.value)} /></div>
        <div className="field"><label htmlFor="cf-pos">Part of speech</label><select id="cf-pos" value={pos} onChange={(e) => setPos(e.target.value as Pos)}>{POS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div className="field field--wide"><label htmlFor="cf-gloss">Meaning</label><input id="cf-gloss" type="text" value={gloss} onChange={(e) => setGloss(e.target.value)} /></div>
        <div className="field"><label htmlFor="cf-g">Gender</label><select id="cf-g" value={gender} onChange={(e) => setGender(e.target.value as 'm' | 'f' | '')}><option value="">—</option><option value="m">masculine</option><option value="f">feminine</option></select></div>
        <div className="field"><label htmlFor="cf-n">Number</label><select id="cf-n" value={number} onChange={(e) => setNumber(e.target.value as 'sg' | 'pl' | '')}><option value="">—</option><option value="sg">singular</option><option value="pl">plural</option></select></div>
        <div className="field"><label htmlFor="cf-c">Case</label><select id="cf-c" value={kase} onChange={(e) => setKase(e.target.value as 'direct' | 'oblique' | 'vocative' | '')}><option value="">—</option><option value="direct">direct</option><option value="oblique">oblique</option><option value="vocative">vocative</option></select></div>
        <div className="field"><label htmlFor="cf-scope">Applies to</label><select id="cf-scope" value={scope} onChange={(e) => setScope(e.target.value as 'token' | 'lexeme')}><option value="token">this occurrence only</option><option value="lexeme">this lexeme everywhere</option></select></div>
        <div className="field field--wide"><label htmlFor="cf-note">Note (optional)</label><input id="cf-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="why" /></div>
      </div>
      <div className="sheet__actions">
        <button className="btn btn--primary btn--small" onClick={() => void submit()} disabled={busy || !lemma.trim()}>Save correction</button>
      </div>
      <p className="muted-note">Corrections are stored separately from generated analyses and are never overwritten by regeneration.</p>
    </div>
  );
}
