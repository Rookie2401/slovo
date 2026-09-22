import { memo, useMemo, type ReactNode } from 'react';
import type { KnownWord, Paragraph, Sentence, Token } from '../database/types';
import type { ChapterAnalysis } from '../database/analysis';
import { decodability } from '../alphabet/decodability';
import { segmentAksharas, normalize, graphemesOf } from '../tokenizer/devanagari';
import { pronounce, practical } from '../pronunciation/translit';
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

const translitCache = new Map<string, string>();
function translitOf(word: string, style: Settings['translitStyle']): string {
  const k = style + ':' + word;
  const hit = translitCache.get(k);
  if (hit) return hit;
  const p = pronounce(word);
  const v = style === 'practical' ? practical(p.pronunciation) : p.pronunciation;
  translitCache.set(k, v);
  return v;
}

function WordSpan({ t, cls, showTranslit, translitStyle, highlightUnknown, known, onClick }: { t: Token; cls: string; showTranslit: boolean; translitStyle: Settings['translitStyle']; highlightUnknown: boolean; known: Set<string>; onClick: () => void }) {
  let inner: ReactNode = t.surface_original;
  if (highlightUnknown && known.size > 0) {
    const d = decodability(t.surface_normalized, known);
    if (d.unknown.length) {
      const unknown = new Set(d.unknown);
      inner = segmentAksharas(t.surface_original).map((a, i) => {
        const uses = graphemesOf(normalize(a.text));
        const bad = uses.some((u) => unknown.has(u.symbol) || unknown.has(u.symbol.normalize('NFC')));
        return bad ? <span key={i} className="g-unknown">{a.text}</span> : a.text;
      });
    }
  }
  const body = showTranslit ? (
    <ruby className="rb">{inner}<rt>{translitOf(t.surface_normalized, translitStyle)}</rt></ruby>
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
  const showTranslitAll = settings.translit === 'always';
  const showTranslitUnknown = settings.translit === 'unknown';
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
        const unknownScript = settings.highlightUnknownGraphemes || showTranslitUnknown ? decodability(t.surface_normalized, known).unknown.length > 0 : false;
        const showT = showTranslitAll || (showTranslitUnknown && unknownScript);
        sentPieces.push(<WordSpan key={t.id} t={t} cls={cls} showTranslit={showT} translitStyle={settings.translitStyle} highlightUnknown={settings.highlightUnknownGraphemes} known={known} onClick={() => onTapWord(t, s)} />);
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
  const translitOn = settings.translit === 'always' || settings.translit === 'unknown';
  const items = useMemo(() => paragraphs.map((p, i) => ({ p, i, sents: sentencesByPara.get(p.id!) ?? [] })), [paragraphs, sentencesByPara]);
  return (
    <div className={`reader__prose${translitOn ? ' translit-on' : ''}`} lang="hi">
      {items.map(({ p, i, sents }) => (
        <ParagraphView key={p.id} {...props} p={p} sentences={sents} index={i} />
      ))}
    </div>
  );
});
