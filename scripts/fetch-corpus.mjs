/**
 * Download the raw sources listed in data/corpus-manifest.json into data/ru/
 * (Russian, cached windows-1251 lib.ru HTML / Wikisource API JSON) and
 * data/en/ (English Gutenberg .txt), so scripts/build-corpus.mjs can run
 * fully offline afterwards. Resumable: any cache file that already exists
 * is left alone, so re-running only fetches what's missing. Polite to the
 * two small sites we lean on hardest: sequential requests, ~500ms apart.
 *
 *   node scripts/fetch-corpus.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { LIBRU_ORIGIN, WIKISOURCE_API, GUTENBERG_BASE, sleep, decodeWin1251 } from './corpus-lib.mjs';

/**
 * Node's fetch (undici) intermittently aborts mid-download for the larger
 * az.lib.ru pages in this environment ("terminated", no HTTP error) while
 * curl fetches the same URL reliably — used for the two large-payload
 * sources (lib.ru HTML, Gutenberg .txt). The small Wikisource API JSON
 * responses fetch fine with plain `fetch` and stay on it.
 */
function curlFetchToFile(url, destPath) {
  execFileSync('curl', ['-sSL', '--fail', '--max-time', '120', '-A', 'slovo-v0-corpus-fetch/0.1 (offline reading app; contact: local dev)', '-o', destPath, url], { stdio: 'inherit' });
}

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, 'data/corpus-manifest.json');
const ruDir = resolve(root, 'data/ru');
const enDir = resolve(root, 'data/en');
mkdirSync(ruDir, { recursive: true });
mkdirSync(enDir, { recursive: true });

const DELAY_MS = 500;

/**
 * A handful of manifest entries turned out to need a small correction once
 * the actual sources were checked (documented per-slug below). Corrections
 * live here rather than in data/corpus-manifest.json, which this package
 * does not own — see the final report's TODO(integration) notes.
 */
const WIKISOURCE_TITLE_OVERRIDES = {
  // "Четвёртая русская книга для чтения (Толстой)" does not exist as a single
  // page; Wikisource splits it into two: verified via action=query&list=search.
  'tolstoy-fourth-reader': ['Четвёртая русская книга для чтения I (Лев Толстой)', 'Четвёртая русская книга для чтения II (Лев Толстой)'],
};

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

let fetchCount = 0;

async function politeFetch(url, kind) {
  if (fetchCount > 0) await sleep(DELAY_MS);
  fetchCount++;
  const res = await fetch(url, { headers: { 'User-Agent': 'slovo-v0-corpus-fetch/0.1 (offline reading app; contact: local dev)' } });
  if (!res.ok) throw new Error(`${kind} ${url} -> HTTP ${res.status}`);
  return res;
}

async function fetchLibru(slug, paths) {
  const files = [];
  for (let i = 0; i < paths.length; i++) {
    const cachePath = resolve(ruDir, `${slug}.${i}.libru.html`);
    files.push(cachePath);
    if (existsSync(cachePath)) {
      console.log(`  [cache] ${slug}.${i}.libru.html`);
      continue;
    }
    const url = `${LIBRU_ORIGIN}/${paths[i]}`;
    console.log(`  fetching ${url}`);
    if (fetchCount > 0) await sleep(DELAY_MS);
    fetchCount++;
    curlFetchToFile(url, cachePath); // raw windows-1251 bytes, decoded at build time
  }
  return files;
}

async function fetchWikisource(slug, titles) {
  const files = [];
  for (let i = 0; i < titles.length; i++) {
    const cachePath = resolve(ruDir, `${slug}.${i}.wikisource.json`);
    files.push(cachePath);
    if (existsSync(cachePath)) {
      console.log(`  [cache] ${slug}.${i}.wikisource.json`);
      continue;
    }
    const url = `${WIKISOURCE_API}?action=parse&page=${encodeURIComponent(titles[i])}&prop=text&format=json&redirects=1`;
    console.log(`  fetching wikisource: ${titles[i]}`);
    const res = await politeFetch(url, 'wikisource');
    const json = await res.json();
    if (json.error) throw new Error(`wikisource ${titles[i]} -> ${json.error.code}: ${json.error.info}`);
    writeFileSync(cachePath, JSON.stringify(json), 'utf8');
  }
  return files;
}

async function fetchGutenberg(id) {
  const cachePath = resolve(enDir, `pg${id}.txt`);
  if (existsSync(cachePath)) {
    console.log(`  [cache] pg${id}.txt`);
    return cachePath;
  }
  const url = `${GUTENBERG_BASE}/${id}/pg${id}.txt`;
  console.log(`  fetching ${url}`);
  if (fetchCount > 0) await sleep(DELAY_MS);
  fetchCount++;
  curlFetchToFile(url, cachePath);
  return cachePath;
}

/** cp.html was already downloaded by hand this session; reuse it instead of refetching Crime and Punishment. */
const PRESEEDED = {
  'dostoevsky-prestuplenie-i-nakazanie': [resolve('C:/Users/CJWal/AppData/Local/Temp/claude/C--Users-CJWal-OneDrive-Desktop/97f1d0ad-4b31-42df-bacb-dde018ce81f0/scratchpad/cp.html')],
};

const report = { works: [], warnings: [] };

for (const work of manifest.works) {
  console.log(`\n${work.slug} — ${work.title}`);
  const entry = { slug: work.slug, ru: [], en: null };
  try {
    if (work.libru) {
      const seeded = PRESEEDED[work.slug];
      if (seeded) {
        for (let i = 0; i < work.libru.length; i++) {
          const cachePath = resolve(ruDir, `${work.slug}.${i}.libru.html`);
          if (!existsSync(cachePath) && seeded[i]) {
            copyFileSync(seeded[i], cachePath);
            console.log(`  [preseeded] ${work.slug}.${i}.libru.html (from cached scratchpad download)`);
          } else if (!existsSync(cachePath)) {
            const [file] = await fetchLibru(work.slug, [work.libru[i]]);
            void file;
          } else {
            console.log(`  [cache] ${work.slug}.${i}.libru.html`);
          }
        }
        entry.ru = work.libru.map((_, i) => `${work.slug}.${i}.libru.html`);
      } else {
        await fetchLibru(work.slug, work.libru);
        entry.ru = work.libru.map((_, i) => `${work.slug}.${i}.libru.html`);
      }
    } else if (work.wikisource) {
      const titles = WIKISOURCE_TITLE_OVERRIDES[work.slug] ?? work.wikisource;
      if (WIKISOURCE_TITLE_OVERRIDES[work.slug]) report.warnings.push(`${work.slug}: manifest wikisource title did not resolve — used override ${JSON.stringify(titles)} (see TODO(integration) in fetch-corpus.mjs)`);
      await fetchWikisource(work.slug, titles);
      entry.ru = titles.map((_, i) => `${work.slug}.${i}.wikisource.json`);
    } else {
      report.warnings.push(`${work.slug}: no libru or wikisource source in manifest`);
    }
    if (work.gutenberg) {
      const cachePath = await fetchGutenberg(work.gutenberg.id);
      entry.en = `pg${work.gutenberg.id}.txt`;
      // sanity check: does the cached text look like the right book?
      const head = readFileSync(cachePath, 'utf8').slice(0, 3000);
      const titleWord = work.gutenberg.title.split(/\s+/)[0];
      if (!head.toLowerCase().includes(titleWord.toLowerCase())) {
        report.warnings.push(`${work.slug}: pg${work.gutenberg.id}.txt does not obviously mention "${work.gutenberg.title}" near the top — verify the id manually`);
      }
    }
    report.works.push(entry);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    report.warnings.push(`${work.slug}: ${err.message}`);
  }
}

console.log('\n--- fetch-corpus summary ---');
console.log(`${report.works.length}/${manifest.works.length} works processed without a fatal error`);
if (report.warnings.length) {
  console.log('Warnings:');
  for (const w of report.warnings) console.log(`  - ${w}`);
} else {
  console.log('No warnings.');
}

// smoke-decode one cached libru file so an encoding regression fails loudly here, not in build-corpus
const sample = manifest.works.find((w) => w.libru)?.slug;
if (sample) {
  const p = resolve(ruDir, `${sample}.0.libru.html`);
  if (existsSync(p)) {
    const text = decodeWin1251(readFileSync(p));
    if (!/[а-яё]/i.test(text)) console.warn(`WARNING: ${sample}.0.libru.html does not decode to readable Cyrillic — check the windows-1251 assumption`);
  }
}
