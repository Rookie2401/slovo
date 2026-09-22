import { z } from 'zod';
import type { ImportedBook } from './types';
import { ImportRefused } from './types';

const Paragraph = z.union([
  z.string(),
  z.object({
    kind: z.enum(['text', 'heading', 'subheading', 'verse', 'quote', 'note', 'letter']).optional(),
    text: z.string(),
    emphasis: z.array(z.object({ start: z.number().int().min(0), end: z.number().int().min(0), kind: z.enum(['em', 'strong']) })).optional(),
  }),
]);

export const CorpusSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  language: z.string().optional(),
  license: z.string().optional(),
  source_format: z.enum(['json', 'library']).optional(),
  chapters: z.array(
    z.object({
      title: z.string(),
      part: z.string().optional(),
      source_ref: z.string().optional(),
      paragraphs: z.array(Paragraph),
    }),
  ),
});

export type CorpusJson = z.infer<typeof CorpusSchema>;

/**
 * JSON corpus: { title, author?, chapters: [{ title, part?, paragraphs: [string | {kind, text, emphasis}] }] }
 */
export function importJson(raw: string | unknown, opts: { sourceName?: string } = {}): ImportedBook {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw.replace(/^﻿/, ''));
    } catch {
      throw new ImportRefused('The file is not valid JSON.', 'malformed');
    }
  }
  const parsed = CorpusSchema.safeParse(data);
  if (!parsed.success) throw new ImportRefused('JSON corpus does not match the expected shape { title, chapters: [{ title, paragraphs: [...] }] }.', 'malformed');
  const c = parsed.data;
  const chapters = c.chapters.map((ch) => ({
    title: ch.title,
    part: ch.part,
    source_ref: ch.source_ref,
    paragraphs: ch.paragraphs.map((p) => (typeof p === 'string' ? { kind: 'text' as const, text: p } : { kind: p.kind ?? 'text', text: p.text, emphasis: p.emphasis })),
  }));
  if (chapters.every((ch) => ch.paragraphs.length === 0)) throw new ImportRefused('The JSON corpus has no paragraphs.', 'empty');
  return { title: c.title, author: c.author, language: c.language, license: c.license, source_format: c.source_format ?? 'json', source_name: opts.sourceName, chapters, warnings: [] };
}
