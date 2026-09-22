import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../database/db';
import type { Book, Chapter, KnownWord, LearningStatus, Paragraph, ParallelText, Sentence, Token } from '../database/types';
import { ensureChapterAnalysis, invalidateChapter, type ChapterAnalysis } from '../database/analysis';
import { useSettings } from '../database/settings';
import { knownSymbols, recordContext } from '../alphabet/mastery';
import { lettersOf } from '../tokenizer/cyrillic';
import { I, IconBtn, Sheet } from '../ui/components';
import { Prose, type Selection } from './Prose';
import { WordPanel } from './WordPanel';
import { SentencePanel } from './SentencePanel';
import { lexemeKeysOf, onVocabChange, recordLookup, recordRead, setStatus, statusMap, markUnlookedAsKnown } from '../vocabulary';
import type { FoundConstruction } from '../morphology/sentence';

interface Loaded {
  book: Book;
  chapter: Chapter;
  chapters: Chapter[];
  paragraphs: Paragraph[];
  sentencesByPara: Map<number, Sentence[]>;
  sentenceById: Map<number, Sentence>;
  analysis: ChapterAnalysis;
  parallel?: ParallelText;
}

/** Serialised writer for progress rows (avoids racing updates). */
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

export function Reader() {
  const { bookId: bookIdS, chapterIndex: chapterIndexS } = useParams();
  const bookId = Number(bookIdS);
  const chapterIndex = Number(chapterIndexS);
  const nav = useNavigate();
  const [search] = useSearchParams();
  const jumpSentence = Number(search.get('s') ?? 0) || 0;
  const [settings, setSettings] = useSettings();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Map<string, KnownWord>>(new Map());
  const [sel, setSel] = useState<Selection>({});
  const [panel, setPanel] = useState<'word' | 'sentence' | null>(null);
  const [toc, setToc] = useState(false);
  const [typeSheet, setTypeSheet] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [endMsg, setEndMsg] = useState<string | null>(null);
  const [sentenceCorrections, setSentenceCorrections] = useState<Map<number, { natural?: string; literal?: string }>>(new Map());
  const liveChapter = useRef(chapterIndex);
  const readParas = useRef<Set<number>>(new Set());
  const paraEls = useRef<Map<number, HTMLElement>>(new Map());
  const paraById = useRef<Map<number, Paragraph>>(new Map());
  const statusGen = useRef(0);

  // ---- load chapter
  const load = useCallback(async () => {
    liveChapter.current = chapterIndex;
    const book = await db.books.get(bookId);
    const chapter = await db.chapters.where('[book_id+index]').equals([bookId, chapterIndex]).first();
    if (!book || !chapter) throw new Error('This chapter does not exist.');
    const chapterId = chapter.id!;
    const chapters = (await db.chapters.where('book_id').equals(bookId).toArray()).sort((a, b) => a.index - b.index);
    const paragraphs = (await db.paragraphs.where('chapter_id').equals(chapterId).toArray()).sort((a, b) => a.index - b.index);
    const sentences = (await db.sentences.where('chapter_id').equals(chapterId).toArray()).sort((a, b) => a.paragraph_id - b.paragraph_id || a.index - b.index);
    const sentencesByPara = new Map<number, Sentence[]>();
    const sentenceById = new Map<number, Sentence>();
    for (const s of sentences) {
      const l = sentencesByPara.get(s.paragraph_id) ?? [];
      l.push(s);
      sentencesByPara.set(s.paragraph_id, l);
      sentenceById.set(s.id!, s);
    }
    const analysis = await ensureChapterAnalysis(bookId, chapterId);
    const parallel = settings.englishParallel ? await db.parallel_texts.where('[book_id+chapter_id]').equals([bookId, chapterId]).first() : undefined;
    const progress = await db.reading_progress.where('[book_id+chapter_id]').equals([bookId, chapterId]).first();
    readParas.current = new Set(progress?.read_paragraphs ?? []);
    const sc = new Map<number, { natural?: string; literal?: string }>();
    for (const [sid, c] of analysis.sentenceCorrections) sc.set(sid, c.payload as { natural?: string; literal?: string });
    if (liveChapter.current !== chapterIndex) return;
    paraById.current = new Map(paragraphs.map((p) => [p.id!, p]));
    setSentenceCorrections(sc);
    setLoaded({ book, chapter, chapters, paragraphs, sentencesByPara, sentenceById, analysis, parallel });
    setShowEnglish(false);
    setKnown(await knownSymbols());
    // most recent position record for "continue"
    await enqueue(() => db.reading_progress.where('[book_id+chapter_id]').equals([bookId, chapterId]).first().then((row) => (row ? db.reading_progress.update(row.id!, { updated_at: Date.now() }) : db.reading_progress.add({ book_id: bookId, chapter_id: chapterId, paragraph_index: 0, read_paragraphs: [], completed: false, updated_at: Date.now() }))));
    // jump to a sentence (from a lexeme page), else restore position
    if (jumpSentence && sentenceById.has(jumpSentence)) {
      requestAnimationFrame(() => {
        document.querySelector(`[data-sentence="${jumpSentence}"]`)?.scrollIntoView({ block: 'center' });
        setSel({ sentenceId: jumpSentence });
        setPanel('sentence');
      });
    } else if (progress && progress.paragraph_index > 0) {
      requestAnimationFrame(() => {
        const p = paragraphs[progress.paragraph_index];
        const el = p ? paraEls.current.get(p.id!) : null;
        el?.scrollIntoView({ block: 'start' });
      });
    } else window.scrollTo(0, 0);
  }, [bookId, chapterIndex, jumpSentence, settings.englishParallel]);

  useEffect(() => {
    setLoaded(null);
    setErr(null);
    setSel({});
    setPanel(null);
    setEndMsg(null);
    load().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [load]);

  // ---- statuses
  const allKeys = useMemo(() => {
    if (!loaded) return [] as string[];
    const keys: string[] = [];
    for (const [sid, a] of loaded.analysis.sentences) {
      const toks = loaded.analysis.tokensBySentence.get(sid) ?? [];
      for (const k of lexemeKeysOf(a, toks)) keys.push(k.key);
    }
    return Array.from(new Set(keys));
  }, [loaded]);
  const refreshStatuses = useCallback(() => {
    const gen = ++statusGen.current;
    if (!allKeys.length) {
      setStatuses(new Map());
      return;
    }
    statusMap(allKeys).then((m) => gen === statusGen.current && setStatuses(m)).catch(() => {});
  }, [allKeys]);
  useEffect(() => {
    refreshStatuses();
    return onVocabChange(refreshStatuses);
  }, [refreshStatuses]);

  // ---- encounters: a paragraph scrolled past counts as read
  const registerPara = useCallback((el: HTMLElement | null, p: Paragraph) => {
    if (el) paraEls.current.set(p.id!, el);
    else paraEls.current.delete(p.id!);
  }, []);
  useEffect(() => {
    if (!loaded || typeof IntersectionObserver === 'undefined') return;
    const chapterId = loaded.chapter.id!;
    const seen = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = Number((e.target as HTMLElement).dataset.para);
          if (e.isIntersecting) seen.add(id);
          else if (seen.has(id) && e.boundingClientRect.top < 0) {
            // scrolled past
            if (readParas.current.has(id)) continue;
            readParas.current.add(id);
            const p = paraById.current.get(id);
            const sents = p ? loaded.sentencesByPara.get(p.id!) ?? [] : [];
            const items = sents.flatMap((s) => lexemeKeysOf(loaded.analysis.sentences.get(s.id!)!, loaded.analysis.tokensBySentence.get(s.id!) ?? []));
            void recordRead(items, settings.autoKnownAfter).catch(() => {});
            void recordContext(items.flatMap((it) => lettersOf(it.form).map((l) => l.lower))).catch(() => {});
            const idx = p ? loaded.paragraphs.indexOf(p) : 0;
            const read = Array.from(readParas.current);
            void enqueue(() => db.reading_progress.where('[book_id+chapter_id]').equals([bookId, chapterId]).first().then((row) => (row ? db.reading_progress.update(row.id!, { paragraph_index: Math.max(row.paragraph_index, idx), read_paragraphs: Array.from(new Set([...row.read_paragraphs, ...read])), completed: read.length >= loaded.paragraphs.length, updated_at: Date.now() }) : undefined))).catch(() => {});
          }
        }
        const total = loaded.paragraphs.length || 1;
        setProgressPct(Math.min(100, Math.round((readParas.current.size / total) * 100)));
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0 },
    );
    for (const el of paraEls.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [loaded, bookId, settings.autoKnownAfter]);

  // ---- interactions
  const onTapWord = useCallback((t: Token, s: Sentence) => {
    setSel({ tokenId: t.id, sentenceId: s.id });
    setPanel('word');
    const a = loaded?.analysis.sentences.get(s.id!);
    const toks = loaded?.analysis.tokensBySentence.get(s.id!) ?? [];
    const at = a?.tokens[toks.findIndex((x) => x.id === t.id)];
    const c = at?.candidates[at.chosen];
    if (c && settings.lookupMarksRecognized) void recordLookup(c.key, t.key, t).catch(() => {});
  }, [loaded, settings.lookupMarksRecognized]);
  const onTapSentence = useCallback((s: Sentence) => {
    setSel({ sentenceId: s.id });
    setPanel('sentence');
  }, []);
  const closePanel = () => {
    setPanel(null);
    setSel({});
  };
  const highlightConstruction = (c: FoundConstruction | null) => {
    if (!c || !sel.sentenceId) {
      setSel((x) => ({ ...x, constructionTokens: undefined }));
      return;
    }
    const toks = loaded?.analysis.tokensBySentence.get(sel.sentenceId) ?? [];
    setSel((x) => ({ ...x, constructionTokens: c.tokens.map((i) => toks[i]!.id!) }));
  };
  const onStatus = (key: string, status: LearningStatus) => void setStatus(key, status).catch(() => {});
  const reanalyse = async () => {
    if (loaded) invalidateChapter(loaded.chapter.id!);
    await load();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (err) return <div className="page"><p className="card__err">{err}</p><Link to="/">Back to the library</Link></div>;
  if (!loaded) return <div className="page"><p className="faint"><span className="spinner" /> Preparing the chapter…</p></div>;

  const { book, chapter, chapters, paragraphs } = loaded;
  const idx = chapters.findIndex((c) => c.id === chapter.id);
  const prev = chapters[idx - 1];
  const next = chapters[idx + 1];
  const selSentence = sel.sentenceId ? loaded.sentenceById.get(sel.sentenceId) : undefined;
  const selAnalysis = selSentence ? loaded.analysis.sentences.get(selSentence.id!) : undefined;
  const selTokens = selSentence ? loaded.analysis.tokensBySentence.get(selSentence.id!) ?? [] : [];
  const selTokenIdx = sel.tokenId ? selTokens.findIndex((t) => t.id === sel.tokenId) : -1;
  const selToken = selTokenIdx >= 0 ? selTokens[selTokenIdx] : undefined;
  const selAt = selAnalysis && selTokenIdx >= 0 ? selAnalysis.tokens[selTokenIdx] : undefined;
  const selKey = selAt?.candidates[selAt.chosen]?.key;

  const markRest = async () => {
    const n = await markUnlookedAsKnown(allKeys);
    setEndMsg(`${n} word${n === 1 ? '' : 's'} marked as known.`);
  };

  return (
    <div className={`reader${panel ? ' reader--panel' : ''}`}>
      <div className="reader__main">
        <header className="reader__header">
          <div className="reader__header-inner">
            <Link to="/" className="iconbtn" aria-label="Library" title="Library">{I.back}</Link>
            <button className="reader__headbtn" onClick={() => setToc(true)} aria-label="Chapters">
              <span className="reader__crumb">{book.title}</span>
              <span className="reader__chapter ru">{chapter.title}</span>
            </button>
            <IconBtn label="Chapter preparation" to={`/prep/${bookId}/${chapterIndex}`}>{I.sparkle}</IconBtn>
            <IconBtn label={`Stress marks: ${settings.stressMarks}`} active={settings.stressMarks !== 'never'} onClick={() => setSettings({ stressMarks: settings.stressMarks === 'never' ? 'tap' : settings.stressMarks === 'tap' ? 'unknown' : settings.stressMarks === 'unknown' ? 'always' : 'never' })}>{I.translit}</IconBtn>
            <IconBtn label="Type" onClick={() => setTypeSheet(true)}>{I.type}</IconBtn>
          </div>
          <div className="reader__progress"><span style={{ width: `${progressPct}%` }} /></div>
        </header>
        <div className={settings.showMarks ? 'marks' : ''}>
          <div style={{ maxWidth: 'var(--measure)', margin: '0 auto', padding: '2rem 1.35rem 0' }}>
            <div className="reader__title">{book.title}</div>
            <div className="reader__chtitle ru">{chapter.part ? `${chapter.part} — ${chapter.title}` : chapter.title}</div>
          </div>
          <Prose paragraphs={paragraphs} sentencesByPara={loaded.sentencesByPara} analysis={loaded.analysis} settings={settings} known={known} statuses={statuses} selection={sel} onTapWord={onTapWord} onTapSentence={onTapSentence} registerPara={registerPara} />
          {settings.englishParallel && loaded.parallel && (
            <div className="reader__english">
              <button className="reveal" onClick={() => setShowEnglish(!showEnglish)} aria-expanded={showEnglish}>
                <span className="label">English parallel {loaded.parallel.alignment_confidence < 1 && <small className="faint">(alignment uncertain)</small>}</span>
                <span style={{ marginLeft: 'auto' }}>{I.chevron}</span>
              </button>
              {showEnglish && (
                <div className="reader__english-body">
                  {loaded.parallel.translator && <p className="muted-note">Translation: {loaded.parallel.translator}</p>}
                  {loaded.parallel.paragraphs.map((t, i) => <p key={i}>{t}</p>)}
                  {loaded.parallel.alignment_note && <p className="muted-note">{loaded.parallel.alignment_note}</p>}
                </div>
              )}
            </div>
          )}
          <div className="reader__end">
            {next ? <Link to={`/read/${bookId}/${next.index}`}>Next: <span className="ru">{next.title}</span></Link> : 'End of the book.'}
            <div style={{ marginTop: '0.8rem' }}>
              <button className="btn btn--small" onClick={() => void markRest()}>Mark the rest of this chapter as known</button>
              {endMsg && <span className="muted-note"> {endMsg}</span>}
            </div>
          </div>
        </div>
        <nav className="reader__nav" aria-label="Chapter navigation">
          <div className="reader__nav-inner">
            <button className="reader__nav-btn" disabled={!prev} onClick={() => prev && nav(`/read/${bookId}/${prev.index}`)}><span className="reader__nav-dir">Previous</span><span className="reader__nav-cite ru">{prev?.title ?? '—'}</span></button>
            <button className="reader__nav-btn reader__nav-btn--next" disabled={!next} onClick={() => next && nav(`/read/${bookId}/${next.index}`)}><span className="reader__nav-dir">Next</span><span className="reader__nav-cite ru">{next?.title ?? '—'}</span></button>
          </div>
        </nav>
      </div>

      {panel === 'word' && selToken && selAt && selAnalysis && selSentence && (
        <WordPanel key={selToken.id} token={selToken} sentence={selSentence} analysis={selAnalysis} at={selAt} bookId={bookId} chapterId={chapter.id!} status={selKey ? statuses.get(selKey) : undefined} settings={settings} known={known} onClose={closePanel} onOpenSentence={() => setPanel('sentence')} onHighlightConstruction={highlightConstruction} onStatus={onStatus} onCorrected={() => void reanalyse()} />
      )}
      {panel === 'sentence' && selSentence && selAnalysis && (
        <SentencePanel key={selSentence.id} sentence={selSentence} tokens={selTokens} analysis={selAnalysis} bookId={bookId} chapterId={chapter.id!} statuses={statuses} settings={settings} selectedToken={sel.tokenId} correction={sentenceCorrections.get(selSentence.id!)} onClose={closePanel} onTapWord={(t) => onTapWord(t, selSentence)} onHighlightConstruction={highlightConstruction} onCorrected={() => void reanalyse()} />
      )}

      {toc && (
        <Sheet title="Chapters" onClose={() => setToc(false)}>
          <ul className="toc">
            {chapters.map((c) => (
              <li key={c.id}><button className={c.id === chapter.id ? 'on' : ''} onClick={() => { setToc(false); nav(`/read/${bookId}/${c.index}`); }}><span className="n">{c.index + 1}</span>{c.title}</button></li>
            ))}
          </ul>
        </Sheet>
      )}
      {typeSheet && (
        <Sheet title="Type & assistance" onClose={() => setTypeSheet(false)}>
          <div className="sheet__row"><label htmlFor="ts-size">Size</label><input id="ts-size" type="range" min={16} max={40} value={settings.fontSize} onChange={(e) => setSettings({ fontSize: Number(e.target.value) })} /></div>
          <div className="sheet__row"><label htmlFor="ts-lh">Leading</label><input id="ts-lh" type="range" min={1.5} max={2.6} step={0.05} value={settings.lineHeight} onChange={(e) => setSettings({ lineHeight: Number(e.target.value) })} /></div>
          <div className="sheet__row"><label>Face</label><div className="segmented">{(['ptserif', 'system'] as const).map((f) => <button key={f} aria-pressed={settings.russianFont === f} onClick={() => setSettings({ russianFont: f })}>{f === 'ptserif' ? 'PT Serif' : 'System'}</button>)}</div></div>
          <div className="sheet__row"><label>Theme</label><div className="segmented">{(['auto', 'light', 'dark'] as const).map((t) => <button key={t} aria-pressed={settings.theme === t} onClick={() => setSettings({ theme: t })}>{t}</button>)}</div></div>
          <div className="sheet__row"><label>Stress</label><div className="segmented">{(['always', 'tap', 'unknown', 'never'] as const).map((t) => <button key={t} aria-pressed={settings.stressMarks === t} onClick={() => setSettings({ stressMarks: t })}>{t === 'unknown' ? 'unfamiliar only' : t === 'tap' ? 'on tap' : t}</button>)}</div></div>
          <div className="sheet__row"><label>Transcription</label><div className="segmented">{(['always', 'tap', 'unknown', 'never'] as const).map((t) => <button key={t} aria-pressed={settings.translitMode === t} onClick={() => setSettings({ translitMode: t })}>{t === 'unknown' ? 'unfamiliar only' : t === 'tap' ? 'on tap' : t}</button>)}</div></div>
          <div className="sheet__row"><label htmlFor="ts-marks">Word marks</label><input id="ts-marks" type="checkbox" checked={settings.showMarks} onChange={(e) => setSettings({ showMarks: e.target.checked })} /><span className="muted-note">dotted underline for words not yet known</span></div>
          <div className="sheet__row"><label htmlFor="ts-hl">Unknown letters</label><input id="ts-hl" type="checkbox" checked={settings.highlightUnknownGraphemes} onChange={(e) => setSettings({ highlightUnknownGraphemes: e.target.checked })} /><span className="muted-note">tint letters you have not learned yet</span></div>
          <div className="sheet__row"><label htmlFor="ts-eng">English pane</label><input id="ts-eng" type="checkbox" checked={settings.englishParallel} onChange={(e) => setSettings({ englishParallel: e.target.checked })} /><span className="muted-note">collapsed panel at the end of the chapter</span></div>
          <div className="sheet__actions"><button className="btn" onClick={() => setTypeSheet(false)}>Done</button></div>
        </Sheet>
      )}
    </div>
  );
}
