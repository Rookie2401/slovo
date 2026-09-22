import { describe, expect, it } from 'vitest';
import { alignWork, romanToInt, splitEnglishChapters, stripGutenbergHeaderFooter } from '../scripts/corpus-lib.mjs';

describe('romanToInt', () => {
  it('parses roman numerals with subtractive notation', () => {
    expect(romanToInt('I')).toBe(1);
    expect(romanToInt('IV')).toBe(4);
    expect(romanToInt('IX')).toBe(9);
    expect(romanToInt('XIV')).toBe(14);
    expect(romanToInt('XL')).toBe(40);
    expect(romanToInt('XXVIII.')).toBe(28);
  });

  it('returns null for a non-roman string', () => {
    expect(romanToInt('April 8th')).toBeNull();
    expect(romanToInt('Chapter')).toBeNull();
  });
});

describe('stripGutenbergHeaderFooter', () => {
  it('keeps only the text between the START and END markers', () => {
    const raw = `preamble\n*** START OF THE PROJECT GUTENBERG EBOOK FOO ***\nBODY TEXT\n*** END OF THE PROJECT GUTENBERG EBOOK FOO ***\nlicense`;
    expect(stripGutenbergHeaderFooter(raw).trim()).toBe('BODY TEXT');
  });
});

describe('splitEnglishChapters', () => {
  it('splits on bare roman-numeral chapter headings with no PART structure', () => {
    const text = `
Some preface text that should be dropped.

I

First chapter first paragraph.

Second paragraph of chapter one.

II

Second chapter text.
`;
    const chapters = splitEnglishChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe('I');
    expect(chapters[0]!.part).toBeUndefined();
    expect(chapters[0]!.paragraphs).toEqual(['First chapter first paragraph.', 'Second paragraph of chapter one.']);
    expect(chapters[1]!.title).toBe('II');
  });

  it('splits on PART + CHAPTER headings, tagging each chapter with its part', () => {
    const text = `
PART I

CHAPTER I

Text of part one chapter one.

CHAPTER II

Text of part one chapter two.

PART II

CHAPTER I

Text of part two chapter one.
`;
    const chapters = splitEnglishChapters(text);
    expect(chapters).toHaveLength(3);
    expect(chapters[0]!.part).toBe('PART I');
    expect(chapters[2]!.part).toBe('PART II');
    expect(chapters[2]!.title).toBe('CHAPTER I');
  });

  it('recognizes "BOOK ONE: 1805" style part headings (War and Peace)', () => {
    const text = `
BOOK ONE: 1805

I

Text.

II

More text.
`;
    const chapters = splitEnglishChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.part).toBe('BOOK ONE: 1805');
  });

  it('splits an epistolary novel on its letter-date headings', () => {
    const text = `
April 8th

MY DEAR FRIEND, first letter.

April 9th

Second letter, replying.
`;
    const chapters = splitEnglishChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe('April 8th');
    expect(chapters[1]!.title).toBe('April 9th');
  });

  it('keeps only the first work when Gutenberg bundles several (chapter numbering restarts, no PART headings)', () => {
    const text = `
I

First work, chapter one.

II

First work, chapter two.

I

Second bundled work, chapter one — must be dropped.

II

Second bundled work, chapter two — must be dropped.
`;
    const chapters = splitEnglishChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters.map((c) => c.paragraphs[0])).toEqual(['First work, chapter one.', 'First work, chapter two.']);
  });
});

describe('alignWork', () => {
  it('aligns 1:1 at confidence 1 when chapter counts match exactly', () => {
    const ru = [{ title: 'I' }, { title: 'II' }, { title: 'III' }];
    const en = [
      { title: 'I', paragraphs: ['a'] },
      { title: 'II', paragraphs: ['b'] },
      { title: 'III', paragraphs: ['c'] },
    ];
    const { chapters, notes } = alignWork(ru, en);
    expect(notes).toEqual([]);
    expect(chapters.every((c) => c.alignment_confidence === 1)).toBe(true);
    expect(chapters[1]!.paragraphs).toEqual(['b']);
  });

  it('aligns per part when both sides have the same number of parts, even if counts differ inside one part', () => {
    const ru = [
      { title: 'I', part: 'Часть первая' },
      { title: 'II', part: 'Часть первая' },
      { title: 'I', part: 'Часть вторая' },
    ];
    const en = [
      { part: 'PART I', title: 'I', paragraphs: ['p1'] },
      { part: 'PART I', title: 'II', paragraphs: ['p2'] },
      { part: 'PART I', title: 'III', paragraphs: ['p3'] }, // extra chapter in part 1 on the English side
      { part: 'PART II', title: 'I', paragraphs: ['p4'] },
    ];
    const { chapters, notes } = alignWork(ru, en);
    expect(notes.length).toBeGreaterThan(0);
    expect(chapters[0]!.alignment_confidence).toBe(1);
    expect(chapters[1]!.alignment_confidence).toBe(1);
    // part 1 had a 2-vs-3 mismatch but part 2 (1-vs-1) still aligns cleanly
    expect(chapters[2]!.alignment_confidence).toBe(1);
    expect(chapters[2]!.paragraphs).toEqual(['p4']);
  });

  it('never fabricates a match: leftover Russian chapters get confidence 0 with a note', () => {
    const ru = [{ title: 'I' }, { title: 'II' }, { title: 'III' }];
    const en = [{ title: 'I', paragraphs: ['a'] }];
    const { chapters, notes } = alignWork(ru, en);
    expect(chapters[0]!.alignment_confidence).toBe(1);
    expect(chapters[1]!.alignment_confidence).toBe(0);
    expect(chapters[1]!.alignment_note).toBeTruthy();
    expect(chapters[1]!.paragraphs).toEqual([]);
    expect(notes.length).toBeGreaterThan(0);
  });
});
