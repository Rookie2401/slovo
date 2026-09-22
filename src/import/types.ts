import type { EmphasisRange, LadderLevel, ParagraphKind } from '../database/types';

export interface ImportedParagraph {
  kind: ParagraphKind;
  text: string;
  emphasis?: EmphasisRange[];
}

export interface ImportedChapter {
  title: string;
  title_original?: string;
  /** part / book / volume heading this chapter belongs to, as printed */
  part?: string;
  paragraphs: ImportedParagraph[];
  source_ref?: string;
}

export interface ImportedBook {
  title: string;
  author?: string;
  language?: string;
  license?: string;
  source_format: 'epub' | 'html' | 'txt' | 'json' | 'library';
  source_name?: string;
  chapters: ImportedChapter[];
  /** non-fatal observations the importer wants the user to see */
  warnings: string[];
  /** set by src/import/library.ts (package A) for bundled reading-ladder works */
  slug?: string;
  level?: LadderLevel;
  year?: number;
  has_english?: boolean;
}

export class ImportRefused extends Error {
  constructor(
    message: string,
    public readonly reason: 'drm' | 'unsupported' | 'empty' | 'malformed',
  ) {
    super(message);
    this.name = 'ImportRefused';
  }
}
