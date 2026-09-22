import { useState } from 'react';
import type { Pos, Token } from '../database/types';
import type { Candidate } from '../morphology/candidate';
import { correctToken, correctLexeme } from '../database/analysis';

const POS: Pos[] = ['noun', 'proper', 'pronoun', 'adjective', 'verb', 'adverb', 'preposition', 'conjunction', 'particle', 'interjection', 'numeral', 'predicative', 'unknown'];
const CASES = ['nom', 'gen', 'dat', 'acc', 'inst', 'prep', 'loc', 'part', 'voc'] as const;

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
      const payload = { lemma, pos, gloss, features, key: `${pos}:${lemma}` };
      if (scope === 'token') await correctToken(bookId, chapterId, token.id!, payload, note || undefined);
      else await correctLexeme(cand.key, payload, note || undefined);
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card__section">
      <span className="label">Исправить разбор</span>
      <div className="correct-grid">
        <div className="field"><label htmlFor="cf-lemma">Лемма</label><input id="cf-lemma" className="ru" type="text" value={lemma} onChange={(e) => setLemma(e.target.value)} /></div>
        <div className="field"><label htmlFor="cf-pos">Часть речи</label><select id="cf-pos" value={pos} onChange={(e) => setPos(e.target.value as Pos)}>{POS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div className="field field--wide"><label htmlFor="cf-gloss">Значение</label><input id="cf-gloss" type="text" value={gloss} onChange={(e) => setGloss(e.target.value)} /></div>
        <div className="field"><label htmlFor="cf-g">Род</label><select id="cf-g" value={gender} onChange={(e) => setGender(e.target.value as 'm' | 'f' | 'n' | 'common' | '')}><option value="">—</option><option value="m">муж.</option><option value="f">жен.</option><option value="n">ср.</option><option value="common">общий</option></select></div>
        <div className="field"><label htmlFor="cf-n">Число</label><select id="cf-n" value={number} onChange={(e) => setNumber(e.target.value as 'sg' | 'pl' | '')}><option value="">—</option><option value="sg">ед.</option><option value="pl">мн.</option></select></div>
        <div className="field"><label htmlFor="cf-c">Падеж</label><select id="cf-c" value={kase} onChange={(e) => setKase(e.target.value as (typeof CASES)[number] | '')}><option value="">—</option>{CASES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="cf-scope">Применить к</label><select id="cf-scope" value={scope} onChange={(e) => setScope(e.target.value as 'token' | 'lexeme')}><option value="token">только это вхождение</option><option value="lexeme">этой лексеме везде</option></select></div>
        <div className="field field--wide"><label htmlFor="cf-note">Заметка (необязательно)</label><input id="cf-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="почему" /></div>
      </div>
      <div className="sheet__actions">
        <button className="btn btn--primary btn--small" onClick={() => void submit()} disabled={busy || !lemma.trim()}>Сохранить исправление</button>
      </div>
      <p className="muted-note">Исправления хранятся отдельно от сгенерированного разбора и не перезаписываются при его пересчёте.</p>
    </div>
  );
}
