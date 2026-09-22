import JSZip from 'jszip';
import { blocksToChapters, extractBlocks, parseHtmlDocument } from './html';
import type { ImportedBook, ImportedChapter } from './types';
import { ImportRefused } from './types';
import { hasDevanagari } from '../tokenizer/devanagari';

const FONT_OBFUSCATION = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']);

function resolvePath(base: string, href: string): string {
  const parts = base.split('/').slice(0, -1);
  for (const seg of decodeURIComponent(href.split('#')[0]!).split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Refuse encrypted content. EPUBs may legitimately obfuscate embedded fonts
 * (IDPF/Adobe font mangling) — that is not DRM and is allowed. Any other
 * encrypted resource, or an Adobe ADEPT rights file, means the book is
 * protected and we stop here: this importer never circumvents access control.
 */
async function checkDrm(zip: JSZip): Promise<void> {
  if (zip.file('META-INF/rights.xml')) {
    throw new ImportRefused('This EPUB carries a DRM rights file (Adobe ADEPT or similar). The reader cannot import protected books; please supply a DRM-free copy from a store or publisher that sells one.', 'drm');
  }
  const enc = zip.file('META-INF/encryption.xml');
  if (!enc) return;
  const xml = await enc.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const methods = Array.from(doc.getElementsByTagNameNS('*', 'EncryptionMethod'));
  const refs = Array.from(doc.getElementsByTagNameNS('*', 'CipherReference'));
  const nonFont = refs.filter((r) => !/\.(ttf|otf|woff2?|ttc)$/i.test(r.getAttribute('URI') ?? ''));
  const nonFontMethods = methods.filter((m) => !FONT_OBFUSCATION.has(m.getAttribute('Algorithm') ?? ''));
  if (nonFont.length > 0 || nonFontMethods.length > 0) {
    throw new ImportRefused('This EPUB encrypts its content (encryption.xml lists protected resources). The reader will not bypass DRM. If you own the book, look for a DRM-free edition or an accessible export from the seller.', 'drm');
  }
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  if (!f) return null;
  return f.async('string');
}

interface Manifest {
  items: Map<string, { href: string; type: string; properties: string }>;
  spine: string[];
  title: string;
  author?: string;
  language?: string;
  rights?: string;
  nav?: string;
  ncx?: string;
  opfDir: string;
}

async function readOpf(zip: JSZip): Promise<Manifest> {
  const container = await readText(zip, 'META-INF/container.xml');
  if (!container) throw new ImportRefused('Not an EPUB: META-INF/container.xml is missing.', 'malformed');
  const cdoc = new DOMParser().parseFromString(container, 'application/xml');
  const rootfile = cdoc.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path');
  if (!rootfile) throw new ImportRefused('Not an EPUB: container.xml names no root file.', 'malformed');
  const opf = await readText(zip, rootfile);
  if (!opf) throw new ImportRefused(`EPUB package file ${rootfile} is missing.`, 'malformed');
  const doc = new DOMParser().parseFromString(opf.replace(/^﻿/, ''), 'application/xml');
  const items = new Map<string, { href: string; type: string; properties: string }>();
  for (const it of Array.from(doc.getElementsByTagNameNS('*', 'item'))) {
    items.set(it.getAttribute('id') ?? '', { href: it.getAttribute('href') ?? '', type: it.getAttribute('media-type') ?? '', properties: it.getAttribute('properties') ?? '' });
  }
  const spine: string[] = [];
  for (const ref of Array.from(doc.getElementsByTagNameNS('*', 'itemref'))) {
    if ((ref.getAttribute('linear') ?? 'yes') === 'no') continue;
    const id = ref.getAttribute('idref');
    if (id) spine.push(id);
  }
  const text = (tag: string) => doc.getElementsByTagNameNS('*', tag)[0]?.textContent?.trim() || undefined;
  const nav = Array.from(items.entries()).find(([, v]) => /\bnav\b/.test(v.properties))?.[1].href;
  const ncx = Array.from(items.values()).find((v) => v.type === 'application/x-dtbncx+xml')?.href;
  return { items, spine, title: text('title') ?? 'Untitled', author: text('creator'), language: text('language'), rights: text('rights'), nav, ncx, opfDir: rootfile };
}

/** href (without fragment) → label from the navigation document or NCX. */
async function readTocLabels(zip: JSZip, m: Manifest): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (m.nav) {
    const html = await readText(zip, resolvePath(m.opfDir, m.nav));
    if (html) {
      const doc = parseHtmlDocument(html);
      const navEl = Array.from(doc.querySelectorAll('nav')).find((n) => /toc/.test(n.getAttribute('epub:type') ?? '') || /toc/.test(n.getAttribute('id') ?? '')) ?? doc.querySelector('nav');
      for (const a of Array.from(navEl?.querySelectorAll('a') ?? [])) {
        const href = a.getAttribute('href');
        const label = a.textContent?.trim();
        if (href && label) {
          const path = resolvePath(resolvePath(m.opfDir, m.nav), href);
          if (!labels.has(path)) labels.set(path, label);
        }
      }
    }
  }
  if (labels.size === 0 && m.ncx) {
    const xml = await readText(zip, resolvePath(m.opfDir, m.ncx));
    if (xml) {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      for (const np of Array.from(doc.getElementsByTagNameNS('*', 'navPoint'))) {
        const label = np.getElementsByTagNameNS('*', 'text')[0]?.textContent?.trim();
        const src = np.getElementsByTagNameNS('*', 'content')[0]?.getAttribute('src');
        if (label && src) {
          const path = resolvePath(resolvePath(m.opfDir, m.ncx), src);
          if (!labels.has(path)) labels.set(path, label);
        }
      }
    }
  }
  return labels;
}

export async function importEpub(data: ArrayBuffer | Uint8Array | Blob, sourceName?: string): Promise<ImportedBook> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new ImportRefused('The file could not be opened as a ZIP/EPUB container.', 'malformed');
  }
  await checkDrm(zip);
  const m = await readOpf(zip);
  const labels = await readTocLabels(zip, m);
  const warnings: string[] = [];
  const chapters: ImportedChapter[] = [];
  let skipped = 0;
  for (const id of m.spine) {
    const item = m.items.get(id);
    if (!item) continue;
    if (!/xhtml|html|xml/.test(item.type)) continue;
    const path = resolvePath(m.opfDir, item.href);
    const html = await readText(zip, path);
    if (html == null) {
      warnings.push(`Spine item ${item.href} is missing from the archive.`);
      continue;
    }
    const doc = parseHtmlDocument(html);
    const body = doc.body ?? doc.documentElement;
    const blocks = extractBlocks(body);
    const label = labels.get(path) ?? doc.querySelector('h1, h2, h3')?.textContent?.trim() ?? doc.querySelector('title')?.textContent?.trim() ?? item.href;
    const parts = blocksToChapters(blocks, label, item.href);
    for (const ch of parts) {
      const words = ch.paragraphs.reduce((n, p) => n + p.text.split(/\s+/).filter((w) => hasDevanagari(w)).length, 0);
      const frontMatter = /cover|copyright|titlepage|title-page|toc|nav|contents|colophon/i.test(item.href) || /cover|copyright/i.test(label);
      if (words < 3 || (frontMatter && words < 60)) {
        skipped++;
        continue;
      }
      chapters.push(ch);
    }
  }
  if (skipped) warnings.push(`${skipped} front-matter or empty section(s) were skipped (cover, copyright, navigation).`);
  if (chapters.length === 0) throw new ImportRefused('The EPUB contains no Hindi text in its reading order.', 'empty');
  if (m.language && !/^hi/i.test(m.language)) warnings.push(`The EPUB declares language "${m.language}", not Hindi. It was imported anyway.`);
  return { title: m.title, author: m.author, language: m.language, license: m.rights, source_format: 'epub', source_name: sourceName, chapters, warnings };
}
