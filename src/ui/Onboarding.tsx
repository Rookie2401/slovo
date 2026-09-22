import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { markIntroduced } from '../alphabet/mastery';
import { symbolsForLevel } from '../alphabet/curriculum';
import { setSettings, type ScriptLevel } from '../database/settings';
import { symbolInfo } from '../alphabet/inventory';

const LEVELS: Array<{ id: ScriptLevel; label: string; sub: string }> = [
  { id: 'none', label: 'I cannot read it yet', sub: 'We start with А and К, and you reach real sentences within the first stage.' },
  { id: 'some', label: 'I know some letters', sub: 'A short check, then the stages you have not met.' },
  { id: 'sound-out', label: 'I can sound words out', sub: 'Transcription shows only on tap; stress and vowel reduction still get lessons.' },
  { id: 'slow', label: 'I can read slowly', sub: 'Script help off by default; grammar help stays one tap away.' },
  { id: 'comfortable', label: 'I read Cyrillic comfortably', sub: 'Straight to the book. The alphabet chart remains available.' },
];

/** Five letters spanning the stages: a two-minute diagnostic for "I know some letters". */
const DIAG = ['А', 'Р', 'Ж', 'Ы', 'Щ'];

export function Onboarding() {
  const nav = useNavigate();
  const [level, setLevel] = useState<ScriptLevel | null>(null);
  const [diag, setDiag] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<'level' | 'diag'>('level');

  const finish = async (lvl: ScriptLevel, extraKnown: string[] = []) => {
    const known = new Set([...symbolsForLevel(lvl), ...extraKnown]);
    await markIntroduced(Array.from(known));
    setSettings({
      onboarded: true,
      scriptLevel: lvl,
      stressMarks: lvl === 'none' ? 'always' : lvl === 'some' ? 'unknown' : lvl === 'sound-out' ? 'tap' : lvl === 'slow' ? 'unknown' : 'never',
      translitMode: lvl === 'none' ? 'always' : lvl === 'some' ? 'unknown' : lvl === 'sound-out' ? 'tap' : 'never',
      highlightUnknownGraphemes: lvl !== 'slow' && lvl !== 'comfortable',
    });
    nav('/', { replace: true });
  };

  if (step === 'diag') {
    return (
      <main className="page onb route-fade">
        <p className="label label--accent">Quick check</p>
        <h1 className="onb__q">Which of these letters can you already read?</h1>
        <div className="grid-chart grid-chart--5" style={{ maxWidth: '24rem', margin: '0 auto' }}>
          {DIAG.map((s) => (
            <button key={s} className={`glyph${diag[s] ? ' glyph--mastered' : ''}`} aria-pressed={!!diag[s]} onClick={() => setDiag({ ...diag, [s]: !diag[s] })}>
              <span className="ru">{s}</span>
              <small>{diag[s] ? symbolInfo(s)?.ipa[0] : '?'}</small>
            </button>
          ))}
        </div>
        <p className="muted-note" style={{ marginTop: '1rem' }}>Tap the ones you know. No score, no exam — it only sets where the script lessons begin.</p>
        <div className="sheet__actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn--primary" onClick={() => void finish('some', Object.keys(diag).filter((k) => diag[k]))}>Start reading</button>
        </div>
      </main>
    );
  }

  return (
    <main className="page onb route-fade">
      <h1 className="home__title"><span className="ru">Слово</span></h1>
      <p className="home__subtitle">A Russian reader that teaches the script and the grammar from the book itself.</p>
      <div className="home__rule" />
      <h2 className="onb__q">How well can you read Cyrillic?</h2>
      <div className="onb__opts">
        {LEVELS.map((l) => (
          <button key={l.id} className="onb__opt" aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
            {l.label}
            <small>{l.sub}</small>
          </button>
        ))}
      </div>
      <div className="sheet__actions" style={{ justifyContent: 'center' }}>
        <button className="btn btn--primary" disabled={!level} onClick={() => (level === 'some' ? setStep('diag') : void finish(level!))}>
          Continue
        </button>
      </div>
      <p className="muted-note" style={{ marginTop: '1.5rem' }}>You can change every assistance setting later. The goal is always to get you back to reading.</p>
    </main>
  );
}
