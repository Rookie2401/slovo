#!/usr/bin/env node
/**
 * Coverage = tokens whose key has >= 1 dictionary reading / all word tokens,
 * per work and overall (PLAN.md §B). `computeCoverage` is the reusable core,
 * called by build-dictionary.mjs right after the form index is built; this
 * file is also runnable standalone (`node scripts/coverage.mjs`) to
 * recompute coverage against the shards already written under public/dict/
 * without rebuilding the whole dictionary (e.g. once package A's corpus
 * shows up after a dictionary build that ran in --all-forms/no-corpus mode).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { extractWordSurfaces, looseKey } from './dict-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * @param {{ corpusDir: string, hasKey: (key: string) => boolean }} opts
 * @returns {{ overall: number, byWork: Record<string, number>, totalTokens: number, coveredTokens: number, unknownTop300: [string, number][] }}
 */
export function computeCoverage({ corpusDir, hasKey }) {
  const byWork = {};
  let totalTokens = 0;
  let coveredTokens = 0;
  const unknownCounts = new Map();

  const files = existsSync(corpusDir)
    ? readdirSync(corpusDir).filter((f) => f.endsWith('.json') && f !== 'index.json' && !f.endsWith('.en.json') && !f.endsWith('.cast.json'))
    : [];

  for (const f of files) {
    const book = JSON.parse(readFileSync(path.join(corpusDir, f), 'utf8'));
    const slug = book.slug ?? f.replace(/\.json$/, '');
    let workTotal = 0;
    let workCovered = 0;
    for (const ch of book.chapters ?? []) {
      for (const para of ch.paragraphs ?? []) {
        for (const surf of extractWordSurfaces(para.text ?? '')) {
          const key = looseKey(surf);
          workTotal++;
          totalTokens++;
          if (hasKey(key)) {
            workCovered++;
            coveredTokens++;
          } else {
            unknownCounts.set(key, (unknownCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }
    byWork[slug] = workTotal > 0 ? workCovered / workTotal : 0;
  }

  const unknownTop300 = Array.from(unknownCounts.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 300);

  return {
    overall: totalTokens > 0 ? coveredTokens / totalTokens : 0,
    byWork,
    totalTokens,
    coveredTokens,
    unknownTop300,
  };
}

// --------------------------------------------------------------- standalone CLI

async function main() {
  const CORPUS_DIR = path.join(ROOT, 'public', 'corpus');
  const DICT_DIR = path.join(ROOT, 'public', 'dict');
  const manifestPath = path.join(DICT_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error('public/dict/manifest.json not found — run `node scripts/build-dictionary.mjs` first.');
    process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const formCache = new Map();
  function hasKey(key) {
    for (const [name, file] of Object.entries(manifest.form_shards)) {
      // cheap prefix filter: only load shards whose name is a prefix of the key
      if (!key.startsWith(name) && name !== '_') continue;
      let shard = formCache.get(name);
      if (!shard) {
        shard = JSON.parse(readFileSync(path.join(DICT_DIR, 'forms', file), 'utf8'));
        formCache.set(name, shard);
      }
      if (shard[key]) return true;
    }
    return false;
  }

  const result = computeCoverage({ corpusDir: CORPUS_DIR, hasKey });
  console.log(`Overall coverage: ${(result.overall * 100).toFixed(2)}% of ${result.totalTokens} word tokens.`);
  for (const [slug, cov] of Object.entries(result.byWork)) console.log(`  ${slug}: ${(cov * 100).toFixed(2)}%`);

  mkdirSync(path.join(ROOT, 'data', 'build'), { recursive: true });
  writeFileSync(path.join(ROOT, 'data', 'build', 'unknown-forms.txt'), result.unknownTop300.map(([k, c]) => `${k}\t${c}`).join('\n') + '\n', 'utf8');

  mkdirSync(path.join(ROOT, 'src', 'data'), { recursive: true });
  writeFileSync(
    path.join(ROOT, 'src', 'data', 'coverage.json'),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        mode: 'standalone-recompute',
        lexeme_count: manifest.lexeme_count,
        form_count: manifest.form_count,
        coverage: { overall: result.overall, by_work: result.byWork },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
