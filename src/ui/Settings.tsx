import { useEffect, useState } from 'react';
import { db, ENGINE_VERSION } from '../database/db';
import { useSettings } from '../database/settings';
import { BackLink, Topbar } from './components';
import { ENGINE_RULES_VERSION } from '../morphology/analyze';
import { audioAvailable, russianVoice } from '../audio/speech';
import { revokeCorrection } from '../database/analysis';
import type { UserCorrection } from '../database/types';

export function SettingsScreen() {
  const [s, set] = useSettings();
  const [counts, setCounts] = useState<{ books: number; tokens: number; lexemes: number; analyses: number; corrections: number; versions: number } | null>(null);
  const [corrections, setCorrections] = useState<UserCorrection[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = async () => {
    setCounts({ books: await db.books.count(), tokens: await db.tokens.count(), lexemes: await db.lexemes.count(), analyses: await db.token_analyses.count(), corrections: await db.user_corrections.filter((c) => c.active).count(), versions: await db.analysis_versions.count() });
    setCorrections(await db.user_corrections.filter((c) => c.active).reverse().sortBy('created_at'));
  };
  useEffect(() => {
    void load();
  }, []);

  const exportData = async () => {
    const data = {
      exported_at: new Date().toISOString(),
      settings: { ...s, claudeKey: '' },
      known_words: await db.known_words.toArray(),
      alphabet_progress: await db.alphabet_progress.toArray(),
      reading_progress: await db.reading_progress.toArray(),
      user_corrections: await db.user_corrections.toArray(),
      learning_state: (await db.learning_state.toArray()).filter((l) => !l.key.startsWith('freq:')),
    };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `slovo-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as { known_words?: unknown[]; alphabet_progress?: unknown[]; reading_progress?: unknown[]; user_corrections?: unknown[]; learning_state?: unknown[] };
      await db.transaction('rw', [db.known_words, db.alphabet_progress, db.reading_progress, db.user_corrections, db.learning_state], async () => {
        for (const r of (data.known_words ?? []) as Array<{ lexeme_key: string }>) {
          const cur = await db.known_words.where('lexeme_key').equals(r.lexeme_key).first();
          if (cur) await db.known_words.update(cur.id!, { ...r, id: cur.id } as never);
          else await db.known_words.add({ ...(r as object), id: undefined } as never);
        }
        for (const r of (data.alphabet_progress ?? []) as Array<{ symbol: string }>) {
          const cur = await db.alphabet_progress.where('symbol').equals(r.symbol).first();
          if (cur) await db.alphabet_progress.update(cur.id!, { ...r, id: cur.id } as never);
          else await db.alphabet_progress.add({ ...(r as object), id: undefined } as never);
        }
        for (const r of (data.user_corrections ?? []) as Array<Record<string, unknown>>) await db.user_corrections.add({ ...r, id: undefined } as never);
      });
      setMsg('Progress imported (merged).');
      await load();
    } catch (e) {
      setMsg('Could not import: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="shell route-fade">
      <Topbar title="Settings" left={<BackLink />} />
      <main className="page page--narrow">
        <h2 className="label">Reading</h2>
        <div className="field field--row"><label>Theme</label><div className="segmented">{(['auto', 'light', 'dark'] as const).map((t) => <button key={t} aria-pressed={s.theme === t} onClick={() => set({ theme: t })}>{t}</button>)}</div></div>
        <div className="field field--row"><label htmlFor="st-size">Text size ({s.fontSize}px)</label><input id="st-size" type="range" min={16} max={40} value={s.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} /></div>
        <div className="field field--row"><label>Russian face</label><div className="segmented">{(['ptserif', 'system'] as const).map((f) => <button key={f} aria-pressed={s.russianFont === f} onClick={() => set({ russianFont: f })}>{f === 'ptserif' ? 'PT Serif' : 'System'}</button>)}</div></div>

        <h2 className="label" style={{ marginTop: '1.5rem' }}>Assistance</h2>
        <div className="field"><label>Stress marks over words</label><div className="segmented">{(['always', 'tap', 'unknown', 'never'] as const).map((t) => <button key={t} aria-pressed={s.stressMarks === t} onClick={() => set({ stressMarks: t })}>{t === 'unknown' ? 'only unfamiliar' : t === 'tap' ? 'show on tap' : t === 'always' ? 'always show' : 'never show'}</button>)}</div><p className="muted-note">Stress is only ever shown when it is certain — from the source text or a dictionary hit. A guessed form never gets a stress mark.</p></div>
        <div className="field"><label>Ё in the text</label><div className="segmented"><button aria-pressed={s.yoDisplay === 'source'} onClick={() => set({ yoDisplay: 'source' })}>as printed</button><button aria-pressed={s.yoDisplay === 'always'} onClick={() => set({ yoDisplay: 'always' })}>always ё</button><button aria-pressed={s.yoDisplay === 'never'} onClick={() => set({ yoDisplay: 'never' })}>always е</button></div></div>
        <div className="field"><label>Transcription under words</label><div className="segmented">{(['always', 'tap', 'unknown', 'never'] as const).map((t) => <button key={t} aria-pressed={s.translitMode === t} onClick={() => set({ translitMode: t })}>{t === 'unknown' ? 'only unfamiliar' : t === 'tap' ? 'show on tap' : t === 'always' ? 'always show' : 'never show'}</button>)}</div></div>
        <div className="field field--row"><label htmlFor="st-hl">Tint letters not yet learned</label><input id="st-hl" type="checkbox" checked={s.highlightUnknownGraphemes} onChange={(e) => set({ highlightUnknownGraphemes: e.target.checked })} /></div>
        <div className="field field--row"><label htmlFor="st-marks">Vocabulary marks in the text</label><input id="st-marks" type="checkbox" checked={s.showMarks} onChange={(e) => set({ showMarks: e.target.checked })} /></div>
        <div className="field field--row"><label htmlFor="st-eng">English parallel pane at the end of each chapter</label><input id="st-eng" type="checkbox" checked={s.englishParallel} onChange={(e) => set({ englishParallel: e.target.checked })} /></div>
        <div className="field"><label>Grammar explanations</label><div className="segmented"><button aria-pressed={s.explainLanguage === 'en'} onClick={() => set({ explainLanguage: 'en' })}>English</button><button aria-pressed={s.explainLanguage === 'ru-simple'} onClick={() => set({ explainLanguage: 'ru-simple' })}>also in simple Russian</button></div></div>

        <h2 className="label" style={{ marginTop: '1.5rem' }}>Vocabulary</h2>
        <div className="field field--row"><label htmlFor="st-auto">Automatically “known” after N unaided encounters (0 = never)</label><input id="st-auto" type="number" min={0} max={30} value={s.autoKnownAfter} onChange={(e) => set({ autoKnownAfter: Number(e.target.value) })} style={{ width: '5rem' }} /></div>
        <div className="field field--row"><label htmlFor="st-look">A tap counts as a lookup (moves known words back to “recognizing”)</label><input id="st-look" type="checkbox" checked={s.lookupMarksRecognized} onChange={(e) => set({ lookupMarksRecognized: e.target.checked })} /></div>

        <h2 className="label" style={{ marginTop: '1.5rem' }}>Audio</h2>
        <p className="card__text">{audioAvailable() ? `Russian voice available: ${russianVoice()?.name}. Synthesized speech is a convenience, not a pronunciation authority.` : 'No Russian voice is installed in this browser. On Windows, add the Russian language pack; on Android/iOS, install the Russian text-to-speech voice.'}</p>
        <div className="field field--row"><label htmlFor="st-rate">Speech rate</label><input id="st-rate" type="range" min={0.5} max={1.3} step={0.05} value={s.speechRate} onChange={(e) => set({ speechRate: Number(e.target.value) })} /></div>

        <h2 className="label" style={{ marginTop: '1.5rem' }}>Language model (optional)</h2>
        <p className="card__text">Add a Claude API key to get natural translations and phrased explanations. The model receives the deterministic analysis and may only explain it; it never decides morphology, aspect or stress. The key stays in this browser and is used only for a direct request from your browser to Anthropic.</p>
        <div className="field"><label htmlFor="st-key">API key</label><input id="st-key" type="password" value={s.claudeKey} onChange={(e) => set({ claudeKey: e.target.value })} autoComplete="off" placeholder="sk-ant-…" /></div>
        <div className="field"><label htmlFor="st-model">Model</label><input id="st-model" type="text" value={s.claudeModel} onChange={(e) => set({ claudeModel: e.target.value })} /></div>

        <h2 className="label" style={{ marginTop: '1.5rem' }}>Your corrections</h2>
        {corrections.length === 0 && <p className="muted-note">None yet. Corrections take precedence over every generated analysis and survive regeneration.</p>}
        <ul className="list">
          {corrections.slice(0, 30).map((c) => (
            <li key={c.id} className="list__row">
              <span>{c.target_type} #{String(c.target_id)} · <span className="ru">{String((c.payload as { lemma?: string }).lemma ?? (c.payload as { natural?: string }).natural ?? '')}</span>{c.note ? ` — ${c.note}` : ''}</span>
              <button className="textlink" style={{ marginLeft: 'auto' }} onClick={() => void revokeCorrection(c.id!).then(load)}>revoke</button>
            </li>
          ))}
        </ul>

        <h2 className="label" style={{ marginTop: '1.5rem' }}>Data</h2>
        {counts && <p className="card__text">{counts.books} book(s) · {counts.tokens.toLocaleString()} tokens · {counts.lexemes.toLocaleString()} lexemes · {counts.analyses.toLocaleString()} stored analyses in {counts.versions} version(s) · {counts.corrections} active corrections. Engine {ENGINE_VERSION}, rules v{ENGINE_RULES_VERSION}.</p>}
        <div className="card__actions">
          <button className="btn btn--small" onClick={() => void exportData()}>Export progress (JSON)</button>
          <label className="btn btn--small">Import progress<input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => void importData(e.target.files?.[0])} /></label>
          <button className="btn btn--small btn--danger" onClick={() => { if (confirm('Reset the first-run questionnaire?')) set({ onboarded: false }); }}>Redo first-run setup</button>
        </div>
        {msg && <p className="muted-note">{msg}</p>}

        <h2 className="label" style={{ marginTop: '1.5rem' }}>Sources &amp; licences</h2>
        <p className="home__about">
          Dictionary: OpenRussian, CC BY-SA 4.0. Frequency list: hermitdave/FrequencyWords, CC BY-SA 4.0. Russian texts: lib.ru and ru.wikisource.org (public domain). English parallels: Project Gutenberg (public domain in the US). Fonts: PT Serif (OFL), EB Garamond (OFL), Noto Sans (OFL).
        </p>
      </main>
    </div>
  );
}
