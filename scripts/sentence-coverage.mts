/**
 * Sentence-level engine coverage: runs the full deterministic sentence analysis
 * (context rules, names fallback, constructions) over the bundled corpus and
 * counts word tokens whose CHOSEN reading is not a guess. Slower than
 * engine-coverage.mts (no per-word memo) but it is what the reader actually
 * shows. Usage: npx vite-node scripts/sentence-coverage.mts [slug ...]
 * Writes src/data/engine-coverage.json (sentence_level block) and
 * data/build/sentence-unknowns.txt.
 */
import fs from 'node:fs';
import { analyzeSentence } from '../src/syntax/index';
import { ENGINE_RULES_VERSION } from '../src/morphology/analyze';
import type { AnalysisContext } from '../src/morphology/analyze';
import { tokenize, sentenceRanges, sourceStressIndex } from '../src/tokenizer/cyrillic';
import { chosen } from '../src/morphology/sentence';
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
function loadCast(slug: string): Map<string, { canonical: string; kind: string }> {
  const m = new Map<string, { canonical: string; kind: string }>();
  const p = `public/corpus/${slug}.cast.json`;
  if (!fs.existsSync(p)) return m;
  for (const c of JSON.parse(fs.readFileSync(p, 'utf8'))) for (const f of c.forms) if (!m.has(f.form)) m.set(f.form, { canonical: c.canonical, kind: f.kind });
  return m;
}
function makeCtx(cast: Map<string, { canonical: string; kind: string }>): AnalysisContext {
  return {
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
    character: (form: string) => cast.get(form.toLowerCase()),
  };
}

const index = JSON.parse(fs.readFileSync('public/corpus/index.json', 'utf8')) as { works: Array<{ slug: string }> };
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : index.works.map((w) => w.slug);
const unknown = new Map<string, number>();
const byWork: Record<string, { tokens: number; resolved: number; resolved_share: number; guess: number }> = {};
let allTokens = 0, allResolved = 0, allGuess = 0;
for (const slug of slugs) {
  const ctx = makeCtx(loadCast(slug));
  const book = JSON.parse(fs.readFileSync(`public/corpus/${slug}.json`, 'utf8'));
  let tokens = 0, resolved = 0, guess = 0;
  for (const ch of book.chapters) for (const p of ch.paragraphs) {
    if (p.kind === 'note') continue; // editorial apparatus is not the reading text
    const toks = tokenize(p.text);
    for (const [a, b] of sentenceRanges(toks)) {
      const input = toks.slice(a, b).map((t) => ({ text: t.text, kind: t.kind, sourceStress: sourceStressIndex(t.text) }));
      const res = analyzeSentence(input, ctx);
      for (const t of res.tokens) {
        if (t.kind !== 'word') continue;
        tokens++;
        const c = chosen(t);
        if (c && !c.key.startsWith('?')) resolved++;
        else { guess++; const k = t.text.toLowerCase(); unknown.set(k, (unknown.get(k) ?? 0) + 1); }
      }
    }
  }
  byWork[slug] = { tokens, resolved, resolved_share: resolved / tokens, guess };
  allTokens += tokens; allResolved += resolved; allGuess += guess;
  console.log(`${slug.padEnd(42)} ${tokens.toString().padStart(7)} tokens  resolved ${(100 * resolved / tokens).toFixed(2)}%  guesses ${guess}`);
}
console.log(`\nSENTENCE-LEVEL ${allTokens} word tokens: resolved ${allResolved} = ${(100 * allResolved / allTokens).toFixed(2)}%; guesses ${(100 * allGuess / allTokens).toFixed(2)}%`);
fs.mkdirSync('data/build', { recursive: true });
fs.writeFileSync('data/build/sentence-unknowns.txt', [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400).map(([w, n]) => `${n}\t${w}`).join('\n'), 'utf8');
const outPath = 'src/data/engine-coverage.json';
const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
fs.writeFileSync(outPath, JSON.stringify({ ...prev, sentence_level: { generated_at: new Date().toISOString(), rules_version: ENGINE_RULES_VERSION, tokens: allTokens, resolved: allResolved, resolved_share: allResolved / allTokens, guess_share: allGuess / allTokens, by_work: byWork } }, null, 2), 'utf8');
