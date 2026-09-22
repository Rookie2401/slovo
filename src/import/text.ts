import type { ImportedBook, ImportedChapter, ImportedParagraph } from './types';
import { ImportRefused } from './types';
import { hasCyrillic } from '../tokenizer/cyrillic';

const CHAPTER_WORD = /^\s*(глава|часть|книга|том|письмо|раздел|отдел|chapter|part|book)(?=\s|$|[:\-–—.])\s*[:\-–—]?\s*(\d+|[ivxlc]+|[а-я]+)?\s*[:\-–—.]?\s*(.*)$/i;
const ROMAN = /^[IVXLC]+$/;

function isNumeric(s: string): boolean {
  return /^\d+$/.test(s) || ROMAN.test(s.toUpperCase());
}

/** Is this line a chapter heading? (short, standalone, chapter-word or numeral) */
export function headingKind(line: string, prevBlank: boolean, nextBlank: boolean): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (CHAPTER_WORD.test(t)) return true;
  if (!prevBlank || !nextBlank) return false;
  if (isNumeric(t)) return true;
  // "1." or "I." or "1 — title" forms
  const m = /^(\d{1,3}|[IVXLC]{1,6})\s*[.:\-–—]?\s*(.{0,60})$/.exec(t);
  if (m && (m[2] === '' || !/[.?!]$/.test(m[2]!))) {
    if (/^\d/.test(t) || ROMAN.test(m[1]!)) return true;
  }
  return false;
}

/**
 * Plain text: blank lines separate paragraphs, single newlines inside a
 * paragraph join with a space. Chapter headings are detected as standalone
 * short lines that name a chapter or are just a numeral (Глава I, Часть
 * вторая, or a bare Roman/Arabic numeral).
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
    const t = buf.join(' ').replace(/[ \t ]+/g, ' ').trim();
    if (t) paras.push({ kind: 'text', text: t });
    buf = [];
  };
  const flushChapter = () => {
    flushPara();
    if (paras.length === 0 && curTitle == null) return;
    chapters.push({ title: curTitle ?? (opts.title || 'Текст'), title_original: curTitle ?? undefined, paragraphs: paras });
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
  const words = chapters.reduce((n, c) => n + c.paragraphs.reduce((k, p) => k + p.text.split(' ').filter(hasCyrillic).length, 0), 0);
  if (words === 0) throw new ImportRefused('No Russian text was found in this file.', 'empty');
  const warnings: string[] = [];
  if (chapters.length === 1) warnings.push('No chapter headings were detected; the text was imported as a single chapter. Standalone lines such as “Глава I” or “1” split chapters.');
  return { title, source_format: 'txt', source_name: opts.sourceName, chapters, warnings };
}
