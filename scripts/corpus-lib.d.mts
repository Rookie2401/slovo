/**
 * Ambient types for corpus-lib.mjs (plain JS on purpose — see its header
 * comment — so `node scripts/fetch-corpus.mjs` / `build-corpus.mjs` /
 * `align-english.mjs` run without a TS loader). Picked up automatically by
 * TS module resolution from the sibling .mjs file's basename.
 */
import type { EmphasisRange, ParagraphKind } from '../src/database/types';

export const LIBRU_ORIGIN: string;
export const WIKISOURCE_API: string;
export const GUTENBERG_BASE: string;

export function sleep(ms: number): Promise<void>;
export function decodeWin1251(buf: Uint8Array | Buffer): string;

export function decodeEntities(s: string): string;

export interface RawRange {
  start: number;
  end: number;
  kind: 'em' | 'strong';
}

export function collapseWhitespace<R extends { start: number; end: number }>(text: string, ranges?: R[]): { text: string; ranges: R[] };

export function htmlFragmentToText(fragment: string): { text: string; ranges: RawRange[] };
export function fragmentText(fragment: string): string;

export function extractLibruBody(html: string): string;

export interface CorpusParagraph {
  kind: ParagraphKind;
  text: string;
  emphasis?: EmphasisRange[];
}

export interface CorpusChapter {
  title: string;
  part?: string;
  source_ref?: string;
  paragraphs: CorpusParagraph[];
}

export function parseLibruWork(html: string, opts?: { fallbackTitle?: string }): { chapters: CorpusChapter[]; warnings: string[] };

export function parseWikisourceReader(html: string): { chapters: CorpusChapter[]; warnings: string[] };
export function parseWikisourceTale(html: string, fallbackTitle: string): { chapters: CorpusChapter[]; warnings: string[] };

export function wordCount(chapters: Array<{ paragraphs: Array<{ text: string }> }>): number;
export function slugFile(slug: string, ext: string): string;

// ------------------------------------------------------- English alignment

export function stripGutenbergHeaderFooter(raw: string): string;

export const EN_PART_RE: RegExp;
export const EN_CHAPTER_RE: RegExp;
export const EN_CHAPTER_TITLED_RE: RegExp;
export const EN_DATE_HEADING_RE: RegExp;

export function romanToInt(s: string): number | null;

export interface EnglishChapter {
  part?: string;
  title: string;
  paragraphs: string[];
}

export function splitEnglishChapters(text: string): EnglishChapter[];

export interface PartGroup<T> {
  part: string | undefined;
  items: T[];
}
export function groupByPart<T extends { part?: string }>(chapters: T[]): PartGroup<T>[];

export interface AlignedChapter {
  index: number;
  paragraphs: string[];
  alignment_confidence: number;
  alignment_note?: string;
}

export function alignWork(ruChapters: Array<{ part?: string; [key: string]: unknown }>, enChapters: EnglishChapter[]): { chapters: AlignedChapter[]; notes: string[] };
