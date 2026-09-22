import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../database/db';
import type { AlphabetProgress, AlphabetSkill } from '../database/types';
import { CONSONANTS, PRE_REFORM, SIGNS, symbolInfo, VOWELS, type SymbolInfo } from '../alphabet/inventory';
import { STAGES, STAGE_BY_ID, stageOf } from '../alphabet/curriculum';
import { allProgress, dueSymbols, knownSymbols, markIntroduced, masteryPercent, recordAnswer, SKILL_LABEL, SKILLS } from '../alphabet/mastery';
import { CONTRAST_PAIRS, contrast, cursive as cursiveDrill, knownInfos, sentence as sentenceDrill, soundToSymbol, syllable, symbolToSound, visual, word as wordDrill, type DrillItem } from '../alphabet/drills';
import { corpusDecodability, exampleSentences, exampleWords, type ExampleSentence, type ExampleWord } from '../curriculum/corpus';
import { decodability } from '../alphabet/decodability';
import { bookFrequencies, type BookFrequencies } from '../curriculum/frequency';
import { audioAvailable, speak } from '../audio/speech';
import { BackLink, I, IconBtn, Topbar } from './components';
import { pronounce } from '../pronunciation';
import { useSettings } from '../database/settings';

function glyphClass(p: AlphabetProgress | undefined, due: Set<string>, sym: string): string {
  if (!p || !p.introduced) return 'glyph glyph--unknown';
  if (p.mastered) return 'glyph glyph--mastered';
  if (due.has(sym)) return 'glyph glyph--due';
  return 'glyph glyph--known';
}

function Glyph({ s, progress, due }: { s: SymbolInfo; progress: Map<string, AlphabetProgress>; due: Set<string> }) {
  const p = progress.get(s.symbol);
  return (
    <Link className={glyphClass(p, due, s.symbol)} to={`/alphabet/letter/${encodeURIComponent(s.symbol)}`} title={s.name}>
      <span>
        {s.symbol}
        {s.symbol !== s.lower && <>{s.lower}</>}
      </span>
      <small>{s.ipa[0] || s.name}</small>
    </Link>
  );
}

async function firstBookId(): Promise<number | null> {
  const b = await db.books.orderBy('created_at').first();
  return b?.id ?? null;
}

export function AlphabetHome() {
  const [progress, setProgress] = useState<Map<string, AlphabetProgress>>(new Map());
  const [due, setDue] = useState<Set<string>>(new Set());
  const [freq, setFreq] = useState<BookFrequencies | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [chart, setChart] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await allProgress();
      const d = new Set(await dueSymbols(40));
      const k = await knownSymbols();
      const b = await firstBookId();
      const f = b ? await bookFrequencies(b) : null;
      if (!alive) return;
      setProgress(p);
      setDue(d);
      setKnown(k);
      setFreq(f);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const cov = freq ? corpusDecodability(freq, known) : null;
  const currentIdx = STAGES.findIndex((s) => !s.symbols.every((x) => known.has(x.symbol)));
  return (
    <div className="shell route-fade">
      <Topbar title="Алфавит" left={<BackLink />} right={<IconBtn label={chart ? 'Stages' : 'Full chart'} active={chart} onClick={() => setChart(!chart)}>{I.alphabet}</IconBtn>} />
      <main className="page">
        <div className="stat-row">
          <div className="stat"><b>{Array.from(progress.values()).filter((p) => p.introduced).length}</b><span>letters met</span></div>
          <div className="stat"><b>{Array.from(progress.values()).filter((p) => p.mastered).length}</b><span>mastered</span></div>
          <div className="stat"><b>{due.size}</b><span>due for review</span></div>
          {cov && <div className="stat"><b>{Math.round(cov.fully * 100)}%</b><span>of the book decodable</span></div>}
        </div>
        <div className="card__actions">
          {due.size > 0 && <Link className="btn btn--primary btn--small" to="/alphabet/drill/review">Review what is due</Link>}
          <Link className="btn btn--small" to="/alphabet/drill/contrast">Contrast drill</Link>
          <Link className="btn btn--small" to="/alphabet/drill/syllable">Syllables</Link>
          <Link className="btn btn--small" to="/alphabet/drill/word">Words from the book</Link>
          <Link className="btn btn--small" to="/alphabet/drill/sentence">Read a sentence</Link>
        </div>
        {!chart && (
          <div className="stage-list" style={{ marginTop: '1.2rem' }}>
            {STAGES.map((st, i) => {
              const pct = Math.round(st.symbols.reduce((n, x) => n + (progress.get(x.symbol) ? masteryPercent(progress.get(x.symbol)!) : 0), 0) / st.symbols.length);
              return (
                <Link key={st.id} className={`stage${i === currentIdx ? ' stage--current' : ''}`} to={`/alphabet/stage/${st.id}`}>
                  <span className="stage__num">Stage {i + 1}</span>
                  <span className="stage__body">
                    <span className="stage__title">{st.title}</span>
                    <br />
                    <span className="stage__sub">{st.subtitle}</span>
                  </span>
                  <span className="stage__bar" title={`${pct}% mastered`}>
                    <span style={{ width: `${pct}%` }} />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        {chart && (
          <div style={{ marginTop: '1rem' }}>
            <div className="row-label">Vowels</div>
            <div className="grid-chart grid-chart--auto">{VOWELS.map((s) => <Glyph key={s.symbol} s={s} progress={progress} due={due} />)}</div>
            <div className="row-label">Consonants</div>
            <div className="grid-chart grid-chart--auto">{CONSONANTS.map((s) => <Glyph key={s.symbol} s={s} progress={progress} due={due} />)}</div>
            <div className="row-label">Signs</div>
            <div className="grid-chart grid-chart--auto">{SIGNS.map((s) => <Glyph key={s.symbol} s={s} progress={progress} due={due} />)}</div>
            <div className="row-label">Pre-reform (recognition only)</div>
            <div className="grid-chart grid-chart--auto">{PRE_REFORM.map((s) => <Glyph key={s.symbol} s={s} progress={progress} due={due} />)}</div>
          </div>
        )}
      </main>
    </div>
  );
}

export function StageScreen() {
  const { stageId } = useParams();
  const st = STAGE_BY_ID.get(stageId ?? '');
  const [progress, setProgress] = useState<Map<string, AlphabetProgress>>(new Map());
  const [due, setDue] = useState<Set<string>>(new Set());
  const [freq, setFreq] = useState<BookFrequencies | null>(null);
  const [examples, setExamples] = useState<ExampleWord[]>([]);
  const [sents, setSents] = useState<ExampleSentence[]>([]);
  const [bookId, setBookId] = useState<number | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!st) return;
      const p = await allProgress();
      const d = new Set(await dueSymbols(40));
      const b = await firstBookId();
      const known = await knownSymbols();
      if (!alive) return;
      setProgress(p);
      setDue(d);
      setBookId(b);
      if (b) {
        const f = await bookFrequencies(b);
        const plus = new Set(known);
        for (const s of st.symbols) plus.add(s.symbol);
        const words: ExampleWord[] = [];
        for (const s of st.symbols.slice(0, 6)) words.push(...(await exampleWords(b, s.symbol, plus, 3)));
        const uniq = Array.from(new Map(words.map((w) => [w.form, w])).values())
          .sort((a, c) => c.decodable - a.decodable || c.count - a.count)
          .slice(0, 10);
        const ss = await exampleSentences(b, uniq.filter((w) => w.decodable === 1).map((w) => w.form), 3);
        if (!alive) return;
        setFreq(f);
        setExamples(uniq);
        setSents(ss);
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [st]);
  if (!st) return <div className="page"><p>Unknown stage.</p><Link to="/alphabet">Back</Link></div>;
  const idx = STAGES.indexOf(st);
  const begin = async () => {
    await markIntroduced(st.symbols.map((s) => s.symbol));
    nav(`/alphabet/drill/stage:${st.id}`);
  };
  return (
    <div className="shell route-fade">
      <Topbar title={`Stage ${idx + 1}`} left={<BackLink to="/alphabet" />} />
      <main className="page">
        <h1 style={{ fontSize: '1.6rem' }}>{st.title}</h1>
        <p className="home__subtitle" style={{ textAlign: 'left' }}>{st.subtitle}</p>
        <p className="card__text" style={{ marginTop: '0.8rem' }}>{st.intro}</p>
        <div className={`grid-chart ${st.symbols.length >= 10 ? 'grid-chart--auto' : 'grid-chart--5'}`} style={{ marginTop: '1rem' }}>
          {st.symbols.map((s) => <Glyph key={s.symbol} s={s} progress={progress} due={due} />)}
        </div>
        {freq && (
          <p className="muted-note" style={{ marginTop: '0.5rem' }}>
            In the book: {st.symbols.map((s) => `${s.symbol} ×${(freq.letters[s.symbol] ?? 0).toLocaleString()}`).join(' · ')}
          </p>
        )}
        {st.rules && (
          <div className="card__section">
            <span className="label">Rules</span>
            {st.rules.map((r, i) => (
              <div key={i} style={{ marginBottom: '0.9rem' }}>
                <p className="card__line"><b>{r.title}</b></p>
                <p className="card__text">{r.text}</p>
                {r.examples.map((ex, j) => (
                  <div key={j} className="example">
                    <span>{ex.word}</span>
                    <span className="g">{ex.translit} {ex.ipa}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {st.id === 'cursive' && (
          <div className="card__section">
            <span className="label">Printed vs. italic</span>
            <div className="grid-chart grid-chart--auto">
              {st.symbols.map((s) => (
                <div key={s.symbol} className="combo">
                  <span>{s.symbol}</span>
                  <span className="cursive" style={{ fontStyle: 'italic' }}>{s.lower}</span>
                  <small>{s.cursiveNote}</small>
                </div>
              ))}
            </div>
          </div>
        )}
        {examples.length > 0 && (
          <div className="card__section">
            <span className="label">Real words from the book</span>
            <div className="examples">
              {examples.map((w) => (
                <div key={w.form} className="example">
                  <span>{w.form}</span>
                  <span className="g">{pronounce(w.form).translit}{w.gloss ? ` · ${w.gloss}` : ''}</span>
                  <span className="meta">
                    ×{w.count} ·{' '}
                    <span className={`decode decode--${w.decodable === 1 ? 'fully' : w.decodable >= 0.6 ? 'nearly' : 'not-yet'}`}>{w.decodable === 1 ? 'decodable' : Math.round(w.decodable * 100) + '%'}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {sents.length > 0 && (
          <div className="card__section">
            <span className="label">…and in sentences</span>
            {sents.map((s, i) => (
              <div key={i} style={{ marginBottom: '0.7rem' }}>
                <div className="excerpt" lang="ru">{s.text}</div>
                <div className="excerpt-cite">
                  {s.chapterTitle}
                  {bookId ? <> · <Link to={`/read/${bookId}/${s.chapterId}?s=${s.sentenceId}`}>read there</Link></> : null}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="card__actions" style={{ marginTop: '1.4rem' }}>
          <button className="btn btn--primary" onClick={() => void begin()}>Learn these {st.symbols.length} letters</button>
          <Link className="btn" to={`/alphabet/drill/stage:${st.id}`}>Drill only</Link>
          {idx + 1 < STAGES.length && <Link className="btn btn--quiet" to={`/alphabet/stage/${STAGES[idx + 1]!.id}`}>Next stage</Link>}
        </div>
        <p className="muted-note">Reading comes first: you can open the book at any time. The stages only decide where stress marks and transliteration still help.</p>
      </main>
    </div>
  );
}

export function LetterScreen() {
  const { symbol } = useParams();
  const sym = decodeURIComponent(symbol ?? '').normalize('NFC');
  const info = symbolInfo(sym);
  const [progress, setProgress] = useState<AlphabetProgress | null>(null);
  const [examples, setExamples] = useState<ExampleWord[]>([]);
  const [sents, setSents] = useState<ExampleSentence[]>([]);
  const [bookId, setBookId] = useState<number | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    (async () => {
      const k = await knownSymbols();
      const p = (await allProgress()).get(info?.symbol ?? sym) ?? null;
      const b = await firstBookId();
      if (!alive) return;
      setKnown(k);
      setProgress(p);
      setBookId(b);
      if (b && info) {
        const ex = await exampleWords(b, info.symbol, k, 10);
        const ss = await exampleSentences(b, ex.slice(0, 4).map((w) => w.form), 3);
        if (!alive) return;
        setExamples(ex);
        setSents(ss);
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [sym, info]);
  if (!info) return <div className="page"><p>Unknown letter “{sym}”.</p><Link to="/alphabet">Back</Link></div>;
  const stage = stageOf(info.symbol);
  const confusables = (info.confusable ?? []).map((c) => symbolInfo(c)).filter((x): x is SymbolInfo => !!x);
  const partner = info.voicedPartner ? symbolInfo(info.voicedPartner) : undefined;
  return (
    <div className="shell route-fade">
      <Topbar title={stage ? stage.title : 'Letter'} left={<BackLink to={stage ? `/alphabet/stage/${stage.id}` : '/alphabet'} />} right={audioAvailable() ? <IconBtn label="Play" onClick={() => speak(info.symbol)}>{I.sound}</IconBtn> : undefined} />
      <main className="page">
        <div className="letter__hero">
          <div className="letter__glyph">
            {info.symbol}
            {info.symbol !== info.lower && <>{' '}{info.lower}</>}
          </div>
          <div className="letter__meta">
            <div className="letter__name">{info.name}</div>
            <div className="letter__sound">{info.ipa.filter(Boolean).map((x) => `/${x}/`).join(' · ') || '(no sound)'}</div>
            <p className="card__text">{info.articulation}</p>
            <div className="letter__feat">
              {info.kind === 'vowel' && <span className="chip">vowel</span>}
              {info.hardness && <span className="chip">{info.hardness.replace('-', ' ')}</span>}
              {info.voiced !== undefined && <span className="chip">{info.voiced ? 'voiced' : 'voiceless'}</span>}
              {partner && <Link className="chip chip--btn" to={`/alphabet/letter/${encodeURIComponent(partner.symbol)}`}>partner {partner.symbol}</Link>}
              {info.preReform && info.pair && <Link className="chip chip--btn" to={`/alphabet/letter/${encodeURIComponent(info.pair)}`}>modern form {info.pair}</Link>}
              {progress && <span className="chip">{progress.mastered ? 'mastered' : progress.introduced ? `${masteryPercent(progress)}% mastered` : 'not yet introduced'}</span>}
            </div>
          </div>
        </div>
        {info.notes && <div className="note">{info.notes}</div>}
        {info.latinConfusable && (
          <div className="card__section">
            <span className="label">Mind the Latin look-alike</span>
            <p className="card__text">{info.latinConfusable}</p>
          </div>
        )}
        <div className="card__section">
          <span className="label">Cursive / italic</span>
          <p className="card__text">
            <span className="cursive" style={{ fontStyle: 'italic', marginRight: '0.5rem' }}>{info.cursive}</span>
            {info.cursiveNote}
          </p>
        </div>
        {confusables.length > 0 && (
          <div className="card__section">
            <span className="label">Easily confused with</span>
            <div className="grid-chart grid-chart--auto">
              {confusables.map((c) => (
                <Link key={c.symbol} className="glyph" to={`/alphabet/letter/${encodeURIComponent(c.symbol)}`}>
                  <span>{c.symbol}</span>
                  <small>{c.ipa[0]}</small>
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="card__section">
          <span className="label">Skills</span>
          <div className="chips">
            {SKILLS.map((sk) => <span key={sk} className="chip">{SKILL_LABEL[sk]} {progress ? Math.round(progress.skills[sk].score * 100) + '%' : '—'}</span>)}
          </div>
        </div>
        {examples.length > 0 && (
          <div className="card__section">
            <span className="label">In the book</span>
            <div className="examples">
              {examples.map((w) => (
                <div key={w.form} className="example">
                  <span>{w.form}</span>
                  <span className="g">{pronounce(w.form).translit}{w.gloss ? ` · ${w.gloss}` : ''}</span>
                  <span className="meta">
                    ×{w.count} ·{' '}
                    <span className={`decode decode--${w.decodable === 1 ? 'fully' : w.decodable >= 0.6 ? 'nearly' : 'not-yet'}`}>{w.decodable === 1 ? 'decodable' : 'nearly'}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {sents.length > 0 && (
          <div className="card__section">
            <span className="label">Sentences</span>
            {sents.map((s, i) => (
              <div key={i} style={{ marginBottom: '0.7rem' }}>
                <div className="excerpt" lang="ru">{s.text}</div>
                <div className="excerpt-cite">
                  {s.chapterTitle}
                  {bookId ? <> · <Link to={`/read/${bookId}/${s.chapterId}?s=${s.sentenceId}`}>read there</Link></> : null}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="card__actions" style={{ marginTop: '1.4rem' }}>
          <Link className="btn btn--primary" to={`/alphabet/drill/symbol:${encodeURIComponent(info.symbol)}`}>Drill this letter</Link>
          {!known.has(info.symbol) && <button className="btn" onClick={() => void markIntroduced([info.symbol]).then(() => setKnown(new Set([...known, info.symbol])))}>Mark as met</button>}
        </div>
      </main>
    </div>
  );
}

function shuffleArr<T>(a: T[], rnd: () => number): T[] {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [x[i], x[j]] = [x[j]!, x[i]!];
  }
  return x;
}

/** Drill runner: mode = review | contrast | syllable | word | sentence | stage:<id> | symbol:<s> */
export function DrillScreen() {
  const { mode } = useParams();
  const [items, setItems] = useState<DrillItem[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [settings] = useSettings();
  const rnd = useMemo(() => Math.random, []);
  const build = useCallback(async () => {
    const known = await knownSymbols();
    const infos = knownInfos(known);
    const m = mode ?? 'review';
    const out: DrillItem[] = [];
    const b = await firstBookId();
    const f = b ? await bookFrequencies(b) : null;
    const wordPool = f ? Object.entries(f.forms).filter(([w, c]) => c >= 3 && w.length >= 2 && w.length <= 10).sort((a, c) => c[1] - a[1]).slice(0, 400).map(([w]) => w) : [];
    const known33 = new Set(Array.from(known));
    const decodable = wordPool.filter((w) => decodability(w, known33).category === 'fully');
    const pushSym = (sym: string) => {
      const s2s = symbolToSound(sym, infos, rnd);
      const sn = soundToSymbol(sym, infos, rnd);
      if (s2s) out.push(s2s);
      if (sn) out.push(sn);
      const inf = symbolInfo(sym);
      if (inf && inf.kind === 'consonant') {
        const sy = syllable(sym, known, rnd);
        if (sy) out.push(sy);
      }
    };
    if (m.startsWith('stage:')) {
      const st = STAGE_BY_ID.get(m.slice(6));
      if (st?.id === 'cursive') {
        for (const w of shuffleArr(decodable, rnd).slice(0, 6)) out.push(cursiveDrill(w));
      } else {
        for (const s of st?.symbols ?? []) pushSym(s.symbol);
        for (const [a, c, why] of CONTRAST_PAIRS) if (st?.symbols.some((s) => s.symbol === a || s.symbol === c)) { const it = contrast(a, c, why, rnd); if (it) out.push(it); }
      }
    } else if (m.startsWith('symbol:')) {
      const sym = decodeURIComponent(m.slice(7)).normalize('NFC');
      pushSym(sym);
      const v = visual(sym, rnd);
      if (v) out.push(v);
      for (const [a, c, why] of CONTRAST_PAIRS) if (a === sym || c === sym) { const it = contrast(a, c, why, rnd); if (it) out.push(it); }
      const ws = decodable.filter((w) => w.toUpperCase().includes(sym)).slice(0, 3);
      for (const w of ws) { const it = wordDrill(w, decodable.filter((x) => x !== w).slice(0, 12), rnd); if (it) out.push(it); }
    } else if (m === 'review') {
      for (const sym of await dueSymbols(10)) pushSym(sym);
      if (!out.length) for (const s of Array.from(known).slice(-6)) pushSym(s);
    } else if (m === 'contrast') {
      for (const [a, c, why] of CONTRAST_PAIRS) if (known.has(a) && known.has(c)) { const it = contrast(a, c, why, rnd); if (it) out.push(it); }
    } else if (m === 'syllable') {
      for (const s of infos.filter((x) => x.kind === 'consonant')) { const it = syllable(s.symbol, known, rnd); if (it) out.push(it); }
    } else if (m === 'word') {
      for (const w of shuffleArr(decodable, rnd).slice(0, 10)) { const it = wordDrill(w, shuffleArr(decodable.filter((x) => x !== w), rnd).slice(0, 12), rnd); if (it) out.push(it); }
    } else if (m === 'sentence') {
      if (b) {
        const ss = await exampleSentences(b, shuffleArr(decodable, rnd).slice(0, 8), 6);
        for (const s of ss) out.push(sentenceDrill(s.text, []));
      }
    }
    setItems(shuffleArr(out, rnd).slice(0, m === 'sentence' ? 6 : 16));
    setI(0);
    setPicked(null);
    setResults([]);
  }, [mode, rnd]);
  useEffect(() => {
    void build();
  }, [build]);
  const cur = items?.[i];
  const answer = async (opt: string) => {
    if (!cur || picked) return;
    setPicked(opt);
    const ok = opt === cur.answer;
    setResults((r) => [...r, ok]);
    for (const s of cur.symbols) await recordAnswer(s, cur.skill as AlphabetSkill, ok).catch(() => {});
    if (cur.speak && audioAvailable()) speak(cur.speak, settings.speechRate);
  };
  const next = () => {
    setPicked(null);
    setI(i + 1);
  };
  if (!items) return <div className="page"><p className="faint"><span className="spinner" /> Preparing…</p></div>;
  if (!items.length) return <div className="page"><p className="card__text">Nothing to drill yet. Word and sentence drills need a few letters you have met plus a book in the library; letter drills need at least one introduced stage.</p><Link to="/alphabet">Back</Link></div>;
  if (!cur) {
    const ok = results.filter(Boolean).length;
    return (
      <div className="shell route-fade">
        <Topbar title="Drill" left={<BackLink to="/alphabet" />} />
        <main className="page drill">
          <p className="label label--accent">Done</p>
          <p style={{ fontSize: '1.4rem', margin: '1rem 0' }}>{ok} of {results.length} right.</p>
          <p className="card__text">Mastery is tracked per letter and per skill; nothing is “mastered” from one right answer. The best practice is reading — go back to the book.</p>
          <div className="card__actions" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={() => void build()}>Again</button>
            <Link className="btn btn--primary" to="/">Back to reading</Link>
          </div>
        </main>
      </div>
    );
  }
  const isSym = cur.mode === 'sound_to_symbol' || cur.mode === 'contrast' || cur.mode === 'visual';
  return (
    <div className="shell route-fade">
      <Topbar title={cur.mode.replace(/_/g, ' ')} left={<BackLink to="/alphabet" />} />
      <main className="page drill">
        <div className="drill__progress">{items.map((_, k) => <span key={k} className={k < results.length ? (results[k] ? 'ok' : 'no') : k === i ? 'cur' : ''} />)}</div>
        <div className={`drill__prompt${cur.mode === 'sound_to_symbol' || cur.mode === 'contrast' ? ' drill__prompt--text' : cur.mode === 'sentence' ? ' drill__prompt--sentence' : cur.mode === 'cursive' ? ' cursive' : ''}`} style={cur.mode === 'cursive' ? { fontStyle: 'italic' } : undefined} lang={cur.mode === 'sound_to_symbol' ? 'en' : 'ru'}>
          {cur.prompt}
        </div>
        {cur.promptSub && <div className="drill__sub">{cur.promptSub}</div>}
        {(cur.mode === 'sentence' || cur.mode === 'cursive') && <div className="drill__sub">Read it aloud, then say how it went.</div>}
        <div className={`drill__options${cur.mode === 'word' || cur.mode === 'sentence' || cur.mode === 'cursive' ? ' drill__options--wide' : ''}`}>
          {cur.options.map((o) => {
            const cls = picked ? (o === cur.answer ? 'opt--right' : o === picked ? 'opt--wrong' : '') : '';
            return (
              <button key={o} className={`opt ${cls}`} disabled={!!picked} onClick={() => void answer(o)} lang={isSym ? 'ru' : 'en'}>
                {o}
              </button>
            );
          })}
        </div>
        {picked && (
          <div className="drill__explain">
            <p className={`card__text ${picked === cur.answer ? '' : 'card__err'}`}>{picked === cur.answer ? 'Right.' : cur.selfGraded ? 'Noted — that one will come back.' : 'Not this one.'} {cur.explain}</p>
            <div className="card__actions" style={{ justifyContent: 'center' }}>
              {cur.speak && audioAvailable() && <button className="btn btn--small" onClick={() => speak(cur.speak!, settings.speechRate)}>{I.sound} Play</button>}
              <button className="btn btn--primary" onClick={next} autoFocus>Next</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Cursive / italic reading practice. Unlike the Devanagari reference (which
 * has learners trace joined strokes by hand), Russian cursive's job here is
 * READING italic PT Serif in the novels — so this screen compares the
 * printed and italic forms side by side and drills recognition of real
 * words set in italics, rather than handwriting production.
 */
export function HandwritingScreen() {
  const { symbol } = useParams();
  const sym = decodeURIComponent(symbol ?? '').normalize('NFC');
  const info = symbolInfo(sym);
  const [examples, setExamples] = useState<ExampleWord[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!info) return;
      const k = await knownSymbols();
      const b = await firstBookId();
      if (b) {
        const ex = await exampleWords(b, info.symbol, k, 6);
        if (alive) setExamples(ex);
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [info]);
  if (!info) return <div className="page"><p>Unknown letter.</p></div>;
  return (
    <div className="shell route-fade">
      <Topbar title="Cursive reading" left={<BackLink to={`/alphabet/letter/${encodeURIComponent(info.symbol)}`} />} />
      <main className="page">
        <div className="letter__hero">
          <div className="letter__glyph">{info.symbol}{info.lower}</div>
          <div className="letter__glyph cursive" style={{ fontStyle: 'italic' }}>{info.symbol}{info.lower}</div>
        </div>
        <p className="card__text">{info.cursiveNote}</p>
        {examples.length > 0 && (
          <div className="card__section">
            <span className="label">Practice reading it in italics</span>
            {examples.map((w) => (
              <p key={w.form} className="cursive" style={{ fontStyle: 'italic', fontSize: '1.3rem', marginBottom: '0.4rem' }}>
                {w.form}
              </p>
            ))}
          </div>
        )}
        <div className="card__actions" style={{ marginTop: '1.4rem' }}>
          <Link className="btn btn--primary" to="/alphabet/drill/stage:cursive">Drill italic words</Link>
        </div>
        <p className="muted-note">The glyph is the same letter — the italic look is PT Serif’s own italic face (CSS font-style: italic on the `.cursive` class), not a different character.</p>
      </main>
    </div>
  );
}
