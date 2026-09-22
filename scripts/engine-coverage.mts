/**
 * Engine-level coverage over the bundled corpus: for every word token, does the
 * deterministic engine (dictionary + closed-class tables + rule generation)
 * produce a non-guess reading? Reports exact figures per work and overall and
 * writes src/data/engine-coverage.json. Usage:
 *   npx vite-node scripts/engine-coverage.mts [slug ...]   (default: every work)
 */
import fs from 'node:fs';
import { analyzeWord, ENGINE_RULES_VERSION } from '../src/morphology/analyze';
import type { AnalysisContext } from '../src/morphology/analyze';
import { tokenize, looseKey } from '../src/tokenizer/cyrillic';
import type { DictManifest, FormShard, LexShard, FormReading, DictLexeme } from '../src/dictionary/types';

const root = 'public/dict';
const man: DictManifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, 'utf8'));
const formCache = new Map<string, FormShard>();
const lexCache = new Map<string, LexShard>();
function shardFor(map: Record<string, string>, key: string): string {
  let best = '';
  for (const s of Object.keys(map)) if (key.startsWith(s) && s.length > best.length) best = s;
  return best;
}
const ctx: AnalysisContext = {
  readings(key: string): FormReading[] {
    const s = shardFor(man.form_shards, key);
    if (!s) return [];
    if (!formCache.has(s)) formCache.set(s, JSON.parse(fs.readFileSync(`${root}/forms/${man.form_shards[s]}`, 'utf8')));
    return formCache.get(s)![key] ?? [];
  },
  lexeme(id: string): DictLexeme | undefined {
    const k = (id.split(':')[1] ?? '').replace(/ё/g, 'е').replace(/#\d+$/, '');
    const s = shardFor(man.lex_shards, k);
    if (!s) return undefined;
    if (!lexCache.has(s)) lexCache.set(s, JSON.parse(fs.readFileSync(`${root}/lex/${man.lex_shards[s]}`, 'utf8')));
    return lexCache.get(s)![id];
  },
};

const index = JSON.parse(fs.readFileSync('public/corpus/index.json', 'utf8')) as { works: Array<{ slug: string }> };
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : index.works.map((w) => w.slug);

// memo per (surface-lowercase) since analyzeWord is pure given the context
type Verdict = 'dictionary' | 'closed' | 'rule' | 'guess' | 'none';
const memo = new Map<string, Verdict>();
function verdict(surface: string): Verdict {
  const k = surface.toLowerCase();
  const hit = memo.get(k);
  if (hit) return hit;
  const cands = analyzeWord(surface, looseKey(surface), ctx);
  let v: Verdict = 'none';
  if (cands.length) {
    const top = cands[0]!;
    v = top.key.startsWith('?') ? 'guess' : top.source === 'dictionary' ? 'dictionary' : top.confidence >= 0.8 ? 'closed' : 'rule';
    // any non-guess candidate counts as resolved even if not top
    if (v === 'guess' && cands.some((c) => !c.key.startsWith('?'))) v = 'rule';
  }
  memo.set(k, v);
  return v;
}

const totals: Record<Verdict, number> = { dictionary: 0, closed: 0, rule: 0, guess: 0, none: 0 };
const byWork: Record<string, { tokens: number; resolved: number; resolved_share: number; guess: number; none: number }> = {};
const unknownCounts = new Map<string, number>();
for (const slug of slugs) {
  const book = JSON.parse(fs.readFileSync(`public/corpus/${slug}.json`, 'utf8'));
  const counts: Record<Verdict, number> = { dictionary: 0, closed: 0, rule: 0, guess: 0, none: 0 };
  for (const ch of book.chapters) for (const p of ch.paragraphs) for (const t of tokenize(p.text)) {
    if (t.kind !== 'word') continue;
    const v = verdict(t.text);
    counts[v]++;
    if (v === 'guess' || v === 'none') unknownCounts.set(t.text.toLowerCase(), (unknownCounts.get(t.text.toLowerCase()) ?? 0) + 1);
  }
  const tokens = Object.values(counts).reduce((a, b) => a + b, 0);
  const resolved = counts.dictionary + counts.closed + counts.rule;
  byWork[slug] = { tokens, resolved, resolved_share: resolved / tokens, guess: counts.guess, none: counts.none };
  for (const k of Object.keys(counts) as Verdict[]) totals[k] += counts[k];
  console.log(`${slug.padEnd(42)} ${tokens.toString().padStart(7)} tokens  resolved ${(100 * resolved / tokens).toFixed(2)}%  (dict ${counts.dictionary}, closed ${counts.closed}, rule ${counts.rule}, guess ${counts.guess}, none ${counts.none})`);
}
const all = Object.values(totals).reduce((a, b) => a + b, 0);
const resolvedAll = totals.dictionary + totals.closed + totals.rule;
console.log(`\nOVERALL ${all} word tokens: resolved ${resolvedAll} = ${(100 * resolvedAll / all).toFixed(2)}% (dictionary ${(100 * totals.dictionary / all).toFixed(2)}%, closed-class ${(100 * totals.closed / all).toFixed(2)}%, rule ${(100 * totals.rule / all).toFixed(2)}%); guesses ${(100 * totals.guess / all).toFixed(2)}%, unresolved ${(100 * totals.none / all).toFixed(2)}%`);
const top = [...unknownCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400);
fs.mkdirSync('data/build', { recursive: true });
fs.writeFileSync('data/build/engine-unknowns.txt', top.map(([w, n]) => `${n}\t${w}`).join('\n'), 'utf8');
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/engine-coverage.json', JSON.stringify({ generated_at: new Date().toISOString(), rules_version: ENGINE_RULES_VERSION, tokens: all, resolved: resolvedAll, resolved_share: resolvedAll / all, shares: { dictionary: totals.dictionary / all, closed: totals.closed / all, rule: totals.rule / all, guess: totals.guess / all, none: totals.none / all }, by_work: byWork }, null, 2), 'utf8');
console.log('top unknowns → data/build/engine-unknowns.txt; figures → src/data/engine-coverage.json');
