import { memo, useMemo, type ReactNode } from 'react';
import type { KnownWord, Paragraph, Sentence, Token } from '../database/types';
import type { ChapterAnalysis } from '../database/analysis';
import { decodability } from '../alphabet/decodability';
import { COMBINING_ACUTE } from '../tokenizer/cyrillic';
import { pronounce } from '../pronunciation';
import type { Settings } from '../database/settings';
import { chosen } from '../morphology/sentence';

export interface Selection {
  tokenId?: number;
  sentenceId?: number;
  /** token ids of a highlighted construction */
  constructionTokens?: number[];
}

interface Props {
  paragraphs: Paragraph[];
  sentencesByPara: Map<number, Sentence[]>;
  analysis: ChapterAnalysis;
  settings: Settings;
  known: Set<string>;
  statuses: Map<string, KnownWord>;
  selection: Selection;
  onTapWord: (token: Token, sentence: Sentence) => void;
  onTapSentence: (sentence: Sentence) => void;
  registerPara: (el: HTMLElement | null, p: Paragraph) => void;
}

/** Insert a combining acute after the stressed letter of `text` (index into the same string). */
function withStressMark(text: string, stressIndex: number): string {
  if (stressIndex < 0 || stressIndex >= text.length) return text;
  return text.slice(0, stressIndex + 1) + COMBINING_ACUTE + text.slice(stressIndex + 1);
}

/** ё folded to/from е per the yoDisplay setting; 'always' relies on an accented reference
 * (e.g. the dictionary morpheme text) that still carries ё, spliced onto the source spelling. */
function applyYoDisplay(text: string, mode: Settings['yoDisplay'], accentedReference?: string): string {
  if (mode === 'never') return text.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  if (mode === 'always' && accentedReference && accentedReference.length === text.length) {
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ref = accentedReference[i]!;
      const ch = text[i]!;
      out += (ref === 'ё' && ch.toLowerCase() === 'е') ? (ch === 'Е' ? 'Ё' : 'ё') : ch;
    }
    return out;
  }
  return text;
}

const translitCache = new Map<string, string>();
function translitOf(word: string, stressIndex: number): string {
  const k = stressIndex + ':' + word;
  const hit = translitCache.get(k);
  if (hit) return hit;
  const v = pronounce(word, stressIndex).translit;
  translitCache.set(k, v);
  return v;
}

function WordSpan({ t, cls, display, showTranslit, translitText, highlightUnknown, known, onClick }: { t: Token; cls: string; display: string; showTranslit: boolean; translitText: string; highlightUnknown: boolean; known: Set<string>; onClick: () => void }) {
  let inner: ReactNode = display;
  if (highlightUnknown && known.size > 0) {
    const d = decodability(t.surface_normalized, known);
    if (d.unknown.length) {
      const unknown = new Set(d.unknown.map((s) => s.toLowerCase()));
      inner = Array.from(display).map((ch, i) => (unknown.has(ch.toLowerCase()) ? <span key={i} className="g-unknown">{ch}</span> : ch));
    }
  }
  const body = showTranslit ? (
    <ruby className="rb">{inner}<rt>{translitText}</rt></ruby>
  ) : inner;
  return (
    <span className={cls} data-token={t.id} role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onClick(); } }}>
      {body}
    </span>
  );
}

function ParagraphView({ p, sentences, analysis, settings, known, statuses, selection, onTapWord, onTapSentence, registerPara, index }: Props & { p: Paragraph; sentences: Sentence[]; index: number }) {
  const pieces: ReactNode[] = [];
  const text = p.text;
  let cursor = 0;
  const emph = p.emphasis ?? [];
  const wrapEm = (s: string, from: number): ReactNode => {
    // plain text between tokens; apply emphasis ranges
    if (!emph.length) return s;
    const out: ReactNode[] = [];
    let i = 0;
    while (i < s.length) {
      const abs = from + i;
      const e = emph.find((r) => r.start <= abs && abs < r.end);
      if (e) {
        const end = Math.min(e.end - from, s.length);
        out.push(<em key={abs}>{s.slice(i, end)}</em>);
        i = end;
      } else {
        const next = emph.filter((r) => r.start > abs).reduce((m, r) => Math.min(m, r.start - from), s.length);
        out.push(s.slice(i, next));
        i = next;
      }
    }
    return out;
  };
  const constructionSet = new Set(selection.constructionTokens ?? []);
  const showTranslitAll = settings.translitMode === 'always';
  const showTranslitUnknown = settings.translitMode === 'unknown';
  const showStressAll = settings.stressMarks === 'always';
  const showStressUnknown = settings.stressMarks === 'unknown';
  for (const s of sentences) {
    const a = analysis.sentences.get(s.id!);
    const toks = analysis.tokensBySentence.get(s.id!) ?? [];
    const sentOn = selection.sentenceId === s.id;
    const sentPieces: ReactNode[] = [];
    let sc = cursor;
    toks.forEach((t, ti) => {
      if (t.start > sc) sentPieces.push(<span key={`g${t.id}`}>{wrapEm(text.slice(sc, t.start), sc)}</span>);
      if (t.kind === 'word') {
        const at = a?.tokens[ti];
        const c = at ? chosen(at) : undefined;
        const st = c ? statuses.get(c.key)?.status : undefined;
        const isEm = emph.some((r) => r.start <= t.start && t.end <= r.end);
        let cls = 'w';
        if (settings.showMarks && st && st !== 'known' && st !== 'mastered' && st !== 'ignored') cls += ` st-${st}`;
        if (selection.tokenId === t.id) cls += ' sel';
        else if (constructionSet.has(t.id!)) cls += ' sel-cons';
        if (isEm) cls += ' em';
        const unknownScript = settings.highlightUnknownGraphemes || showTranslitUnknown || showStressUnknown ? decodability(t.surface_normalized, known).unknown.length > 0 : false;
        const stressIdx = c && c.features.stress != null && c.features.stress >= 0 ? c.features.stress : (t.source_stress ?? -1);
        let display = applyYoDisplay(t.surface_original, settings.yoDisplay, c?.morphemes.map((m) => m.text).join(''));
        if ((showStressAll || (showStressUnknown && unknownScript)) && stressIdx >= 0) display = withStressMark(display, stressIdx);
        const showT = showTranslitAll || (showTranslitUnknown && unknownScript);
        const translitText = showT ? translitOf(t.surface_normalized, stressIdx) : '';
        sentPieces.push(<WordSpan key={t.id} t={t} cls={cls} display={display} showTranslit={showT} translitText={translitText} highlightUnknown={settings.highlightUnknownGraphemes} known={known} onClick={() => onTapWord(t, s)} />);
      } else {
        sentPieces.push(<span key={t.id} className={t.kind === 'punct' ? 'punct' : undefined} onClick={() => onTapSentence(s)}>{wrapEm(t.surface_original, t.start)}</span>);
      }
      sc = t.end;
    });
    if (s.end > sc) sentPieces.push(<span key={`e${s.id}`}>{wrapEm(text.slice(sc, s.end), sc)}</span>);
    pieces.push(<span key={s.id} className={sentOn ? 'sent--on' : undefined} data-sentence={s.id}>{sentPieces}</span>);
    cursor = s.end;
  }
  if (cursor < text.length) pieces.push(<span key="tail">{wrapEm(text.slice(cursor), cursor)}</span>);
  const kindCls = `para--${p.kind}`;
  const indent = p.kind === 'text' && index > 0;
  return (
    <p ref={(el) => registerPara(el, p)} className={`${kindCls}${indent ? ' para--indent' : ''}`} data-para={p.id}>
      {pieces}
    </p>
  );
}

export const Prose = memo(function Prose(props: Props) {
  const { paragraphs, sentencesByPara, settings } = props;
  const translitOn = settings.translitMode === 'always' || settings.translitMode === 'unknown';
  const items = useMemo(() => paragraphs.map((p, i) => ({ p, i, sents: sentencesByPara.get(p.id!) ?? [] })), [paragraphs, sentencesByPara]);
  return (
    <div className={`reader__prose${translitOn ? ' translit-on' : ''}`} lang="ru">
      {items.map(({ p, i, sents }) => (
        <ParagraphView key={p.id} {...props} p={p} sentences={sents} index={i} />
      ))}
    </div>
  );
});
