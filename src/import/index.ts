import { importEpub } from './epub';
import { importHtml } from './html';
import { importJson } from './json';
import { importText } from './text';
import type { ImportedBook } from './types';
import { ImportRefused } from './types';

export { ImportRefused } from './types';
export type { ImportedBook, ImportedChapter, ImportedParagraph } from './types';
export { storeBook, deleteBook, segmentParagraph } from './store';

export type ImportFormat = 'epub' | 'html' | 'txt' | 'json' | 'acsm' | 'pdf' | 'unknown';

export function detectFormat(name: string, head?: Uint8Array): ImportFormat {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (ext === 'epub') return 'epub';
  if (ext === 'acsm') return 'acsm';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return 'html';
  if (ext === 'json') return 'json';
  if (ext === 'txt' || ext === 'md') return 'txt';
  if (head && head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b) return 'epub';
  if (head) {
    const s = new TextDecoder().decode(head.slice(0, 200)).trimStart();
    if (s.startsWith('<')) return 'html';
    if (s.startsWith('{')) return 'json';
    if (s.length) return 'txt';
  }
  return 'unknown';
}

/**
 * Import a File/Blob of any supported format. Refuses DRM containers and
 * authorization files with an explanation instead of attempting a bypass.
 */
export async function importFile(file: File): Promise<ImportedBook> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const format = detectFormat(file.name, buf);
  switch (format) {
    case 'epub':
      return importEpub(buf, file.name);
    case 'html':
      return importHtml(new TextDecoder('utf-8').decode(buf), { sourceName: file.name });
    case 'json':
      return importJson(new TextDecoder('utf-8').decode(buf), { sourceName: file.name });
    case 'txt':
      return importText(new TextDecoder('utf-8').decode(buf), { sourceName: file.name, title: file.name.replace(/\.[^.]+$/, '') });
    case 'acsm':
      throw new ImportRefused('An .acsm file is an Adobe download authorization, not the book itself. Open it in the app it was issued for; if that app can export a DRM-free EPUB you own, import that file here. The reader does not bypass DRM.', 'drm');
    case 'pdf':
      throw new ImportRefused('PDF import is not enabled in this version. If the PDF is accessible (real text, not scanned images), convert it to TXT or HTML with a tool such as pdftotext and import that.', 'unsupported');
    default:
      throw new ImportRefused('Unrecognized file type. Supported: EPUB, HTML/XHTML, TXT, JSON corpus.', 'unsupported');
  }
}

export function importPastedText(text: string, title: string): ImportedBook {
  const t = text.trimStart();
  if (t.startsWith('{')) return importJson(text);
  if (t.startsWith('<')) return importHtml(text, { title });
  return importText(text, { title });
}
