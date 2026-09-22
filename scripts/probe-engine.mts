/**
 * Coordinator probe: run the deterministic engine over real corpus text with the
 * real dictionary shards (read from disk, no fetch). Usage:
 *   npx vite-node scripts/probe-engine.mts <slug> [chapterIndex] [paragraphIndex]
 */
import fs from 'node:fs';
import { analyzeSentence } from '../src/syntax/index';
import type { AnalysisContext } from '../src/morphology/analyze';
import { tokenize, sentenceRanges, looseKey, sourceStressIndex } from '../src/tokenizer/cyrillic';
import type { DictManifest, FormShard, LexShard, FormReading, DictLexeme } from '../src/dictionary/types';
import { chosen } from '../src/morphology/sentence';

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

const [slug = 'dostoevsky-prestuplenie-i-nakazanie', ch = '0', para = '0'] = process.argv.slice(2);
const book = JSON.parse(fs.readFileSync(`public/corpus/${slug}.json`, 'utf8'));
const text: string = book.chapters[Number(ch)].paragraphs[Number(para)].text;
console.log('TEXT:', text.slice(0, 300), '\n');
const toks = tokenize(text);
for (const [a, b] of sentenceRanges(toks)) {
  const input = toks.slice(a, b).map((t) => ({ text: t.text, kind: t.kind, sourceStress: sourceStressIndex(t.text) }));
  const res = analyzeSentence(input, ctx);
  for (const t of res.tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c) { console.log(`  ${t.text.padEnd(16)} — NO CANDIDATE`); continue; }
    const f = c.features;
    const feat = [f.case, f.number, f.gender, f.person && `p${f.person}`, f.verb_form, f.aspect, f.tense, f.degree, f.pronoun_type].filter(Boolean).join('.');
    const flag = c.key.startsWith('?') ? ' [GUESS]' : c.source !== 'dictionary' ? ` [${c.source}]` : '';
    console.log(`  ${t.text.padEnd(16)} ${c.lemma.padEnd(14)} ${c.pos.padEnd(11)} ${feat.padEnd(28)} ${c.confidence.toFixed(2)} st=${f.stress ?? '-'}${flag}  ${c.gloss.slice(0, 32)}${t.notes.length ? '  ‹' + t.notes[0]!.slice(0, 60) + '›' : ''}`);
  }
  console.log('  constructions:', res.constructions.map((c) => `${c.type}:${c.pattern}`).join(', '));
  const cl = res.clause;
  console.log('  clause:', JSON.stringify({ subject: cl.subject, predicate: cl.predicate, object: cl.object, experiencer: cl.experiencer, agreement: cl.agreement?.matches, aspect: cl.aspect?.aspect, wordOrder: cl.wordOrder }));
  console.log();
}
