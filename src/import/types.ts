import type { EmphasisRange, ParagraphKind } from '../database/types';

export interface ImportedParagraph {
  kind: ParagraphKind;
  text: string;
  emphasis?: EmphasisRange[];
}

export interface ImportedChapter {
  title: string;
  title_original?: string;
  paragraphs: ImportedParagraph[];
  source_ref?: string;
}

export interface ImportedBook {
  title: string;
  author?: string;
  language?: string;
  license?: string;
  source_format: 'epub' | 'html' | 'txt' | 'json' | 'sample';
  source_name?: string;
  chapters: ImportedChapter[];
  /** non-fatal observations the importer wants the user to see */
  warnings: string[];
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
