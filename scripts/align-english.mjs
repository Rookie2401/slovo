/**
 * Build public/corpus/<slug>.en.json (chapter-level English parallel) for
 * every manifest work that has a `gutenberg` entry, from the cached
 * data/en/pg<id>.txt against the already-built public/corpus/<slug>.json.
 * Alignment is never fabricated: chapters line up 1:1 when the Russian and
 * English chapter counts agree (per part, when both sides carry part
 * information), confidence 1. Where they don't, whatever prefix matches is
 * aligned at 1 and the remainder is aligned position-wise at confidence 0.5
 * with a note, or left with no English (confidence 0, noted) when there is
 * nothing left to pair with. A human-readable + machine-parseable report is
 * printed and saved to data/build/alignment-report.txt.
 *
 * The actual splitting/aligning logic lives in scripts/corpus-lib.mjs
 * (stripGutenbergHeaderFooter, splitEnglishChapters, alignWork) so it can be
 * unit-tested without running this whole pipeline — see test/corpus-align-english.test.ts.
 *
 *   node scripts/align-english.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { alignWork, splitEnglishChapters, stripGutenbergHeaderFooter } from './corpus-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'data/corpus-manifest.json'), 'utf8'));
const enDir = resolve(root, 'data/en');
const corpusDir = resolve(root, 'public/corpus');
const buildDir = resolve(root, 'data/build');
mkdirSync(buildDir, { recursive: true });

const reportLines = [];
let totalWorks = 0;
let totalChaptersFull = 0;
let totalChaptersPartial = 0;
let totalChaptersNone = 0;

for (const work of manifest.works) {
  if (!work.gutenberg) continue;
  const corpusPath = resolve(corpusDir, `${work.slug}.json`);
  const enPath = resolve(enDir, `pg${work.gutenberg.id}.txt`);
  if (!existsSync(corpusPath)) {
    reportLines.push(`${work.slug}: SKIPPED — public/corpus/${work.slug}.json not built yet`);
    continue;
  }
  if (!existsSync(enPath)) {
    reportLines.push(`${work.slug}: SKIPPED — data/en/pg${work.gutenberg.id}.txt not fetched`);
    continue;
  }
  const ru = JSON.parse(readFileSync(corpusPath, 'utf8'));
  const raw = readFileSync(enPath, 'utf8');
  const body = stripGutenbergHeaderFooter(raw);
  const enChapters = splitEnglishChapters(body);
  if (enChapters.length === 0) {
    reportLines.push(`${work.slug}: SKIPPED — could not find any CHAPTER/roman-numeral headings in pg${work.gutenberg.id}.txt`);
    continue;
  }
  const { chapters: aligned, notes } = alignWork(ru.chapters, enChapters);
  const doc = {
    slug: work.slug,
    translator: work.gutenberg.translator,
    source: `Project Gutenberg #${work.gutenberg.id} — ${work.gutenberg.title}, tr. ${work.gutenberg.translator} (public domain in the United States)`,
    chapters: aligned,
  };
  writeFileSync(resolve(corpusDir, `${work.slug}.en.json`), JSON.stringify(doc), 'utf8');

  const full = aligned.filter((c) => c.alignment_confidence === 1).length;
  const partial = aligned.filter((c) => c.alignment_confidence > 0 && c.alignment_confidence < 1).length;
  const none = aligned.filter((c) => c.alignment_confidence === 0).length;
  totalWorks++;
  totalChaptersFull += full;
  totalChaptersPartial += partial;
  totalChaptersNone += none;

  const summary = `${work.slug}: RU ${ru.chapters.length} ch. / EN ${enChapters.length} ch. -> ${full} at 1.0, ${partial} at 0.5, ${none} at 0.0`;
  reportLines.push(summary);
  for (const n of notes) reportLines.push(`    ${n}`);
  console.log(summary);
}

const header = [
  `Слово — English alignment report (${new Date().toISOString()})`,
  `${totalWorks} works with an English parallel; ${totalChaptersFull} chapters aligned at confidence 1.0, ${totalChaptersPartial} at 0.5, ${totalChaptersNone} with no English match.`,
  '',
];
writeFileSync(resolve(buildDir, 'alignment-report.txt'), [...header, ...reportLines].join('\n') + '\n', 'utf8');
console.log(`\n${header[1]}`);
console.log(`Report saved to ${resolve(buildDir, 'alignment-report.txt')}`);
