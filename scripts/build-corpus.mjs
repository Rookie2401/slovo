/**
 * Build public/corpus/<slug>.json + index.json from the cached raw sources
 * in data/ru/ (see scripts/fetch-corpus.mjs). Then runs align-english.mjs
 * (English chapter parallels) and copies data/cast/*.json to
 * public/corpus/<slug>.cast.json for the works that have a cast list.
 *
 *   node scripts/build-corpus.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { LIBRU_ORIGIN, decodeWin1251, parseLibruWork, parseWikisourceReader, wordCount } from './corpus-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, 'data/corpus-manifest.json');
const ruDir = resolve(root, 'data/ru');
const castDir = resolve(root, 'data/cast');
const outDir = resolve(root, 'public/corpus');
mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const SOURCE_LICENSE = 'public domain';

function buildLibruWork(work) {
  const allChapters = [];
  const warnings = [];
  for (let i = 0; i < work.libru.length; i++) {
    const cachePath = resolve(ruDir, `${work.slug}.${i}.libru.html`);
    if (!existsSync(cachePath)) {
      warnings.push(`missing cache file ${cachePath} — run corpus:fetch first`);
      continue;
    }
    const html = decodeWin1251(readFileSync(cachePath));
    const { chapters, warnings: w } = parseLibruWork(html, { fallbackTitle: work.title });
    for (const w2 of w) warnings.push(`file ${i}: ${w2}`);
    const fileUrl = `${LIBRU_ORIGIN}/${work.libru[i]}`;
    for (const ch of chapters) {
      ch.source_ref = `${fileUrl}#${encodeURIComponent(ch.part ? `${ch.part} ${ch.title}` : ch.title)}`;
      allChapters.push(ch);
    }
  }
  return {
    source: { name: 'lib.ru/klassika', url: `${LIBRU_ORIGIN}/${work.libru[0]}`, license: SOURCE_LICENSE },
    chapters: allChapters,
    warnings,
  };
}

function buildWikisourceWork(work, titlesUsed) {
  const allChapters = [];
  const warnings = [];
  for (let i = 0; i < titlesUsed.length; i++) {
    const cachePath = resolve(ruDir, `${work.slug}.${i}.wikisource.json`);
    if (!existsSync(cachePath)) {
      warnings.push(`missing cache file ${cachePath} — run corpus:fetch first`);
      continue;
    }
    const json = JSON.parse(readFileSync(cachePath, 'utf8'));
    const html = json.parse.text['*'];
    const pageTitle = json.parse.title ?? titlesUsed[i];
    const { chapters, warnings: w } = parseWikisourceReader(html);
    for (const w2 of w) warnings.push(`page ${i} (${pageTitle}): ${w2}`);
    for (const ch of chapters) {
      ch.source_ref = `https://ru.wikisource.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}#${encodeURIComponent(ch.title)}`;
      allChapters.push(ch);
    }
  }
  return {
    source: { name: 'Wikisource', url: `https://ru.wikisource.org/wiki/${encodeURIComponent(titlesUsed[0].replace(/ /g, '_'))}`, license: SOURCE_LICENSE },
    chapters: allChapters,
    warnings,
  };
}

const WIKISOURCE_TITLE_OVERRIDES = {
  'tolstoy-fourth-reader': ['Четвёртая русская книга для чтения I (Лев Толстой)', 'Четвёртая русская книга для чтения II (Лев Толстой)'],
};

const indexItems = [];
const allWarnings = [];

for (const work of manifest.works) {
  let built;
  if (work.libru) {
    built = buildLibruWork(work);
  } else if (work.wikisource) {
    const titles = WIKISOURCE_TITLE_OVERRIDES[work.slug] ?? work.wikisource;
    built = buildWikisourceWork(work, titles);
  } else {
    allWarnings.push(`${work.slug}: no source in manifest, skipped`);
    continue;
  }
  for (const w of built.warnings) allWarnings.push(`${work.slug}: ${w}`);
  if (built.chapters.length === 0) {
    allWarnings.push(`${work.slug}: 0 chapters parsed — NOT written`);
    continue;
  }
  const words = wordCount(built.chapters);
  const doc = {
    slug: work.slug,
    title: work.title,
    author: work.author,
    year: work.year,
    level: work.level,
    source: built.source,
    chapters: built.chapters,
    word_count: words,
  };
  const outPath = resolve(outDir, `${work.slug}.json`);
  const json = JSON.stringify(doc);
  writeFileSync(outPath, json, 'utf8');
  const bytes = Buffer.byteLength(json, 'utf8');
  indexItems.push({
    slug: work.slug,
    title: work.title,
    author: work.author,
    year: work.year,
    level: work.level,
    chapter_count: built.chapters.length,
    word_count: words,
    bytes,
    has_english: Boolean(work.gutenberg),
  });
  console.log(`${work.slug}: ${built.chapters.length} chapters, ${words} words, ${(bytes / 1024).toFixed(0)} KB`);
}

// reading order within a level = the manifest's order (the ladder is curated, not alphabetical)
const manifestOrder = new Map(manifest.works.map((w, i) => [w.slug, i]));
for (const it of indexItems) it.order = manifestOrder.get(it.slug) ?? Number.MAX_SAFE_INTEGER;
indexItems.sort((a, b) => a.level - b.level || a.order - b.order);
writeFileSync(resolve(outDir, 'index.json'), JSON.stringify({ works: indexItems }, null, 1), 'utf8');

console.log(`\nWrote ${indexItems.length}/${manifest.works.length} works to ${outDir}`);
if (allWarnings.length) {
  console.log('Warnings:');
  for (const w of allWarnings) console.log(`  - ${w}`);
}

// ---- English parallels + cast copy ----
console.log('\nRunning align-english.mjs…');
execFileSync(process.execPath, [resolve(root, 'scripts/align-english.mjs')], { stdio: 'inherit' });

// align-english.mjs can legitimately fail to find chapter headings in a
// particular translation's .txt (an unfamiliar template — see its own
// warnings) even though the manifest lists a `gutenberg` entry; index.json's
// `has_english` must reflect the .en.json actually on disk, not just intent.
console.log('\nReconciling has_english against the .en.json files actually written…');
const indexPath = resolve(outDir, 'index.json');
const indexDoc = JSON.parse(readFileSync(indexPath, 'utf8'));
let reconciled = 0;
for (const item of indexDoc.works) {
  const actual = existsSync(resolve(outDir, `${item.slug}.en.json`));
  if (item.has_english !== actual) {
    console.log(`  ${item.slug}: has_english ${item.has_english} -> ${actual}`);
    item.has_english = actual;
    reconciled++;
  }
}
if (reconciled > 0) writeFileSync(indexPath, JSON.stringify(indexDoc, null, 1), 'utf8');
console.log(reconciled > 0 ? `Corrected ${reconciled} flag(s).` : 'All has_english flags already matched.');

console.log('\nCopying cast lists…');
mkdirSync(castDir, { recursive: true });
let castCopied = 0;
if (existsSync(castDir)) {
  for (const work of manifest.works) {
    const castPath = resolve(castDir, `${work.slug}.json`);
    if (existsSync(castPath)) {
      copyFileSync(castPath, resolve(outDir, `${work.slug}.cast.json`));
      castCopied++;
    }
  }
}
console.log(`Copied ${castCopied} cast list(s) to ${outDir}`);
