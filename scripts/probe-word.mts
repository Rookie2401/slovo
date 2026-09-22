/** Coordinator probe: print every candidate the engine produces for one word using the real shards. `npx vite-node scripts/probe-word.mts спустился` */
import fs from 'node:fs';
import { analyzeWord } from '../src/morphology/analyze';
import type { AnalysisContext } from '../src/morphology/analyze';
import { looseKey } from '../src/tokenizer/cyrillic';
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
for (const w of process.argv.slice(2)) {
  console.log('==', w, 'key', looseKey(w));
  for (const c of analyzeWord(w, looseKey(w), ctx)) console.log(JSON.stringify({ key: c.key, lemma: c.lemma, pos: c.pos, conf: c.confidence, src: c.source, features: c.features, morphemes: c.morphemes.map((m) => `${m.role}:${m.text}`), notes: c.notes }));
}
