import { db } from '../database/db';
import { ensureChapterAnalysis } from '../database/analysis';
import { chosen } from '../morphology/sentence';
import { symbolInfo } from '../alphabet/inventory';
import { bookFrequencies } from './frequency';
import { statusMap } from '../vocabulary';
import { lexemeSync } from '../dictionary';

/**
 * Brief chapter preparation and review, built from the chapter itself: new
 * letters, the most frequent new lexemes, the names first introduced here,
 * and the grammatical constructions worth noticing. Kept short on purpose —
 * the chapter is the lesson.
 */
export interface ChapterPrep {
  chapterId: number;
  newLetters: Array<{ symbol: string; count: number; name?: string }>;
  newWords: Array<{ key: string; lemma: string; gloss: string; count: number; pos: string; unknownToDictionary: boolean }>;
  newNames: Array<{ key: string; canonical: string; count: number }>;
  constructions: Array<{ pattern: string; label: string; count: number; example: string }>;
  prepositions: Array<{ form: string; count: number }>;
  tokens: number;
  distinctForms: number;
}

export async function chapterPrep(bookId: number, chapterId: number, known: Set<string>): Promise<ChapterPrep> {
  const f = await bookFrequencies(bookId);
  const ch = await db.chapters.get(chapterId);
  const idx = ch?.index ?? 0;
  const newLetters = Object.entries(f.firstChapter.letters)
    .filter(([sym, first]) => first === idx && !known.has(sym))
    .map(([symbol]) => ({ symbol, count: f.letters[symbol] ?? 0, name: symbolInfo(symbol)?.name }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  const a = await ensureChapterAnalysis(bookId, chapterId);
  const lemmaCounts = new Map<string, { lemma: string; gloss: string; pos: string; count: number }>();
  const nameCounts = new Map<string, { canonical: string; count: number }>();
  const cons = new Map<string, { label: string; count: number; example: string }>();
  const preps = new Map<string, number>();
  for (const s of a.sentences.values()) {
    for (const t of s.tokens) {
      const c = chosen(t);
      if (!c || t.kind !== 'word') continue;
      if (c.pos === 'preposition') preps.set(c.lemma, (preps.get(c.lemma) ?? 0) + 1);
      if (c.pos === 'proper') {
        const cur = nameCounts.get(c.key) ?? { canonical: c.lemma, count: 0 };
        cur.count++;
        nameCounts.set(c.key, cur);
        continue;
      }
      const cur = lemmaCounts.get(c.key) ?? { lemma: c.lemma, gloss: c.gloss, pos: c.pos, count: 0 };
      cur.count++;
      lemmaCounts.set(c.key, cur);
    }
    for (const c of s.constructions) {
      if (c.type === 'prepositional-phrase' || c.type === 'agreement' || c.type === 'possession') continue;
      const cur = cons.get(c.pattern) ?? { label: c.label.split(' — ')[0]!, count: 0, example: c.tokens.map((i) => s.tokens[i]!.text).join(' ') };
      cur.count++;
      cons.set(c.pattern, cur);
    }
  }
  const statuses = await statusMap(Array.from(lemmaCounts.keys()));
  const newWords = Array.from(lemmaCounts, ([key, v]) => ({ key, ...v }))
    .filter((w) => f.firstChapter.lemmas[w.key] === idx && !['known', 'mastered', 'ignored'].includes(statuses.get(w.key)?.status ?? ''))
    .map((w) => ({ ...w, unknownToDictionary: w.key.startsWith('?') || !lexemeSync(w.key) }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 14);
  const newNames = Array.from(nameCounts, ([key, v]) => ({ key, ...v }))
    .filter((n) => f.firstChapter.lemmas[n.key] === idx)
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);
  return {
    chapterId,
    newLetters,
    newWords,
    newNames,
    constructions: Array.from(cons, ([pattern, v]) => ({ pattern, ...v })).sort((x, y) => y.count - x.count).slice(0, 8),
    prepositions: Array.from(preps, ([form, count]) => ({ form, count })).sort((x, y) => y.count - x.count).slice(0, 8),
    tokens: f.chapters.find((c) => c.chapterId === chapterId)?.tokens ?? 0,
    distinctForms: f.chapters.find((c) => c.chapterId === chapterId)?.distinctForms ?? 0,
  };
}
