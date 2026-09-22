import type { EmphasisRange, ParagraphKind } from '../database/types';
import type { ImportedBook, ImportedChapter, ImportedParagraph } from './types';
import { ImportRefused } from './types';
import { hasCyrillic } from '../tokenizer/cyrillic';

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'main', 'body', 'ul', 'ol', 'table', 'tr', 'td', 'th', 'dd', 'dt', 'dl', 'figure', 'figcaption', 'aside', 'nav', 'hr', 'br', 'center']);
const SKIP_TAGS = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'template', 'svg', 'img', 'sup']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export interface Block {
  kind: ParagraphKind;
  text: string;
  emphasis: EmphasisRange[];
  level?: number; // heading level
}

function classKind(el: Element): ParagraphKind | null {
  const cls = (el.getAttribute('class') ?? '').toLowerCase();
  if (!cls) return null;
  if (/(^|\s)(mt\d?|title|chapter-?title|chaptertitle|heading|h\d?|s\d?|ms\d?)(\s|$)/.test(cls)) return 'heading';
  if (/(^|\s)(q\d?|poetry|verse)(\s|$)/.test(cls)) return 'verse';
  if (/(^|\s)(blockquote|quote|epigraph)(\s|$)/.test(cls)) return 'quote';
  if (/(^|\s)(footnote|note|f|x|xt)(\s|$)/.test(cls)) return 'note';
  if (/(^|\s)(letter)(\s|$)/.test(cls)) return 'letter';
  return null;
}

function isFootnote(el: Element): boolean {
  const type = el.getAttribute('epub:type') ?? el.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type') ?? '';
  return /footnote|endnote|noteref|rearnote/.test(type) || (el.tagName.toLowerCase() === 'a' && /noteref|footnote/.test(el.getAttribute('class') ?? ''));
}

function isEmphasis(el: Element): 'em' | 'strong' | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'em' || tag === 'i' || tag === 'cite') return 'em';
  if (tag === 'strong' || tag === 'b') return 'strong';
  const cls = (el.getAttribute('class') ?? '').toLowerCase();
  const style = (el.getAttribute('style') ?? '').toLowerCase();
  if (/(^|\s)(it|italic|i|em|bdit|wj)(\s|$)/.test(cls) || /font-style:\s*italic/.test(style)) return 'em';
  if (/(^|\s)(bold|b|strong)(\s|$)/.test(cls) || /font-weight:\s*(bold|[6-9]00)/.test(style)) return 'strong';
  return null;
}

/** Whitespace handling follows HTML rendering: runs collapse to one space. */
function collapse(s: string): string {
  return s.replace(/[\s ﻿]+/g, ' ');
}

/**
 * Walk a DOM and produce blocks. An element whose descendants are all inline
 * becomes one paragraph. Mixed content (text directly inside a container that
 * also has block children) forms its own paragraphs between the blocks.
 */
export function extractBlocks(root: Element): Block[] {
  const blocks: Block[] = [];
  let cur: { parts: string[]; emphasis: EmphasisRange[]; len: number; kind: ParagraphKind; level?: number } | null = null;

  const flush = () => {
    if (!cur) return;
    let text = cur.parts.join('');
    const lead = text.length - text.trimStart().length;
    text = collapse(text).trim();
    if (text.length > 0) {
      const emphasis = cur.emphasis.map((e) => ({ ...e, start: Math.max(0, e.start - lead), end: Math.max(0, e.end - lead) })).filter((e) => e.end > e.start && e.start < text.length);
      blocks.push({ kind: cur.kind, text, emphasis: emphasis.map((e) => ({ ...e, end: Math.min(e.end, text.length) })), level: cur.level });
    }
    cur = null;
  };

  const ensure = (kind: ParagraphKind, level?: number) => {
    if (!cur) cur = { parts: [], emphasis: [], len: 0, kind, level };
  };

  const appendText = (s: string, emph: ('em' | 'strong')[]) => {
    if (!s) return;
    // collapse as we go so emphasis offsets line up with the final text
    let piece = collapse(s);
    if (cur!.len === 0) piece = piece.trimStart();
    else if (piece.startsWith(' ') && cur!.parts[cur!.parts.length - 1]?.endsWith(' ')) piece = piece.slice(1);
    if (!piece) return;
    const start = cur!.len;
    cur!.parts.push(piece);
    cur!.len += piece.length;
    for (const kind of emph) {
      const last = cur!.emphasis[cur!.emphasis.length - 1];
      if (last && last.kind === kind && last.end === start) last.end = cur!.len;
      else cur!.emphasis.push({ start, end: cur!.len, kind });
    }
  };

  const hasBlockChild = (el: Element): boolean => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (BLOCK_TAGS.has(tag) && tag !== 'br') return true;
    }
    return false;
  };

  const walk = (node: Node, emph: ('em' | 'strong')[], inheritedKind: ParagraphKind, level?: number) => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? '';
      if (text.trim().length === 0 && !cur) return;
      ensure(inheritedKind, level);
      appendText(text, emph);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (isFootnote(el)) return;
    if (tag === 'br') {
      if (cur) appendText(' ', emph);
      return;
    }
    if (tag === 'hr') {
      flush();
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) {
      flush();
      let kind: ParagraphKind = inheritedKind;
      let lvl = level;
      if (HEADING_TAGS.has(tag)) {
        kind = 'heading';
        lvl = Number(tag[1]);
      } else if (tag === 'blockquote') kind = 'quote';
      else if (tag === 'aside') kind = 'note';
      else if (tag === 'p' || tag === 'li' || tag === 'td' || tag === 'th' || tag === 'dd' || tag === 'dt' || tag === 'pre') kind = inheritedKind === 'heading' ? 'text' : inheritedKind;
      const ck = classKind(el);
      if (ck) kind = ck;
      if (!hasBlockChild(el)) {
        ensure(kind, lvl);
        const innerEmph = isEmphasis(el);
        for (const child of Array.from(el.childNodes)) walk(child, innerEmph ? [...emph, innerEmph] : emph, kind, lvl);
        flush();
      } else {
        for (const child of Array.from(el.childNodes)) walk(child, emph, kind === 'heading' ? 'text' : kind, lvl);
        flush();
      }
      return;
    }
    const innerEmph = isEmphasis(el);
    ensure(inheritedKind, level);
    for (const child of Array.from(el.childNodes)) walk(child, innerEmph ? [...emph, innerEmph] : emph, inheritedKind, level);
  };

  walk(root, [], 'text');
  flush();
  return blocks;
}

export function parseHtmlDocument(html: string): Document {
  const parser = new DOMParser();
  const isXhtml = /^\s*<\?xml/.test(html) || /xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/.test(html.slice(0, 2000));
  if (isXhtml) {
    const doc = parser.parseFromString(html.replace(/^﻿/, ''), 'application/xhtml+xml');
    if (!doc.querySelector('parsererror')) return doc;
  }
  return parser.parseFromString(html.replace(/^﻿/, ''), 'text/html');
}

const MIN_CHAPTER_WORDS = 40;

function countWords(paras: ImportedParagraph[]): number {
  let n = 0;
  for (const p of paras) n += p.text.split(/\s+/).filter((w) => hasCyrillic(w)).length;
  return n;
}

/**
 * Turn blocks into chapters. Headings of the highest level present in the
 * document start new chapters when the document has more than one such
 * heading with real text after it; otherwise the whole document is one chapter.
 */
export function blocksToChapters(blocks: Block[], fallbackTitle: string, sourceRef?: string): ImportedChapter[] {
  const headingLevels = blocks.filter((b) => b.kind === 'heading' && b.level).map((b) => b.level!);
  const top = headingLevels.length ? Math.min(...headingLevels) : undefined;
  const chapters: ImportedChapter[] = [];
  let curTitle: string | null = null;
  let curParas: ImportedParagraph[] = [];
  let pendingTitleBlocks: Block[] = [];
  const push = () => {
    if (curParas.length === 0 && !curTitle) return;
    chapters.push({ title: curTitle ?? fallbackTitle, title_original: curTitle ?? undefined, paragraphs: curParas, source_ref: sourceRef });
    curParas = [];
    curTitle = null;
  };
  for (const b of blocks) {
    const isTop = b.kind === 'heading' && b.level === top;
    if (isTop) {
      if (curParas.length > 0) push();
      if (curTitle) {
        // consecutive headings: keep them as sub-headings in the chapter
        curParas.push({ kind: 'heading', text: b.text, emphasis: b.emphasis });
      } else {
        curTitle = b.text;
        pendingTitleBlocks = [b];
      }
      continue;
    }
    curParas.push({ kind: b.kind, text: b.text, emphasis: b.emphasis.length ? b.emphasis : undefined });
  }
  void pendingTitleBlocks;
  push();
  // leading front matter (tiny sections before the first real chapter) is folded into the first real chapter
  const merged: ImportedChapter[] = [];
  const carried: ImportedParagraph[] = [];
  let carriedTitle = '';
  const isFrontMatter = (ch: ImportedChapter) => countWords(ch.paragraphs) < MIN_CHAPTER_WORDS && chapters.length > 1 && (ch.paragraphs.length <= 1 || !ch.title_original || /cover|copyright|title|contents|preface|dedication/i.test(ch.title));
  for (const ch of chapters) {
    if (merged.length === 0 && isFrontMatter(ch)) {
      if (carried.length || carriedTitle) carried.push({ kind: 'heading', text: ch.title });
      else carriedTitle = ch.title;
      carried.push(...ch.paragraphs);
      continue;
    }
    if (carried.length || carriedTitle) {
      merged.push({ ...ch, paragraphs: [{ kind: 'heading', text: carriedTitle }, ...carried, ...ch.paragraphs] });
      carried.length = 0;
      carriedTitle = '';
      continue;
    }
    merged.push(ch);
  }
  if (carried.length || carriedTitle) merged.push({ title: carriedTitle || fallbackTitle, title_original: carriedTitle || undefined, paragraphs: carried, source_ref: sourceRef });
  return merged.filter((c) => c.paragraphs.length > 0 || c.title !== fallbackTitle);
}

export function importHtml(html: string, opts: { title?: string; sourceName?: string } = {}): ImportedBook {
  const doc = parseHtmlDocument(html);
  const body = doc.body ?? doc.documentElement;
  const blocks = extractBlocks(body);
  const docTitle = doc.querySelector('title')?.textContent?.trim();
  const title = opts.title || docTitle || opts.sourceName || 'Untitled';
  const chapters = blocksToChapters(blocks, title, opts.sourceName);
  const words = chapters.reduce((n, c) => n + countWords(c.paragraphs), 0);
  if (words === 0) throw new ImportRefused('No Russian text was found in this HTML document.', 'empty');
  return { title, source_format: 'html', source_name: opts.sourceName, chapters, warnings: [] };
}
