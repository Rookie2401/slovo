import type { ImportedBook, ImportedChapter, ImportedParagraph } from './types';
import { ImportRefused } from './types';
import { hasDevanagari, isDevanagariDigit } from '../tokenizer/devanagari';

const CHAPTER_WORD = /^\s*(अध्याय|परिच्छेद|भाग|खंड|खण्ड|प्रकरण|सर्ग|chapter|part|book)(?=\s|$|[:\-–—.])\s*[:\-–—]?\s*([०-९\d]+|[ivxlc]+|[क-ह])?\s*[:\-–—.]?\s*(.*)$/i;
const ROMAN = /^[IVXLC]+$/;

function isNumeric(s: string): boolean {
  return /^[\d०-९]+$/.test(s) || ROMAN.test(s.toUpperCase());
}

/** Is this line a chapter heading? (short, standalone, chapter-word or numeral) */
export function headingKind(line: string, prevBlank: boolean, nextBlank: boolean): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (CHAPTER_WORD.test(t)) return true;
  if (!prevBlank || !nextBlank) return false;
  if (isNumeric(t)) return true;
  // "१" or "1." or "१." or "1 — title" forms
  const m = /^([\d०-९]{1,3}|[IVXLC]{1,6})\s*[.:\-–—]?\s*(.{0,60})$/.exec(t);
  if (m && (m[2] === '' || !/[।?!]$/.test(m[2]!))) {
    const first = t[0]!;
    if (isDevanagariDigit(first) || /\d/.test(first) || ROMAN.test(m[1]!)) return true;
  }
  return false;
}

/**
 * Plain text: blank lines separate paragraphs, single newlines inside a
 * paragraph join with a space. Chapter headings are detected as standalone
 * short lines that name a chapter or are just a numeral.
 */
export function importText(raw: string, opts: { title?: string; sourceName?: string } = {}): ImportedBook {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const chapters: ImportedChapter[] = [];
  let curTitle: string | null = null;
  let paras: ImportedParagraph[] = [];
  let buf: string[] = [];
  const flushPara = () => {
    if (buf.length === 0) return;
    const t = buf.join(' ').replace(/[ \t ]+/g, ' ').trim();
    if (t) paras.push({ kind: 'text', text: t });
    buf = [];
  };
  const flushChapter = () => {
    flushPara();
    if (paras.length === 0 && curTitle == null) return;
    chapters.push({ title: curTitle ?? (opts.title || 'Text'), title_original: curTitle ?? undefined, paragraphs: paras });
    paras = [];
    curTitle = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const prevBlank = i === 0 || lines[i - 1]!.trim() === '';
    const nextBlank = i === lines.length - 1 || lines[i + 1]!.trim() === '';
    if (line.trim() === '') {
      flushPara();
      continue;
    }
    if (headingKind(line, prevBlank, nextBlank)) {
      flushChapter();
      curTitle = line.trim();
      continue;
    }
    buf.push(line);
  }
  flushChapter();
  const title = opts.title || chapters[0]?.title || opts.sourceName || 'Untitled';
  const words = chapters.reduce((n, c) => n + c.paragraphs.reduce((k, p) => k + p.text.split(' ').filter(hasDevanagari).length, 0), 0);
  if (words === 0) throw new ImportRefused('No Hindi text was found in this file.', 'empty');
  const warnings: string[] = [];
  if (chapters.length === 1) warnings.push('No chapter headings were detected; the text was imported as a single chapter. Standalone lines such as “अध्याय १” or “1” split chapters.');
  return { title, source_format: 'txt', source_name: opts.sourceName, chapters, warnings };
}
