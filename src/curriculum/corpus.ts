import { db } from '../database/db';
import { decodability } from '../alphabet/decodability';
import { lettersOf } from '../tokenizer/cyrillic';
import { bookFrequencies, type BookFrequencies } from './frequency';
import { STAGES } from '../alphabet/curriculum';

/**
 * Corpus-derived teaching material: for a letter the learner is meeting,
 * find high-frequency, mostly-decodable real words from the book, then real
 * sentences containing those words. This is what turns alphabet lessons into
 * reading.
 *
 * TODO(integration): `gloss` on ExampleWord is left undefined — package B's
 * dictionary runtime (`src/dictionary/index.ts`, `lexemeSync`/`candidatesFor`)
 * does not exist in this tree yet. Once it ships, wire it the way the
 * reference implementation's `exampleWords` uses `lookupForm(form)[0]?.gloss`.
 */

export interface ExampleWord {
  form: string;
  count: number;
  /** ratio of letters already known (counting the target letter as known) */
  decodable: number;
  gloss?: string;
  letters: string[];
}

export interface ExampleSentence {
  text: string;
  form: string;
  chapterIndex: number;
  chapterId: number;
  chapterTitle: string;
  sentenceId: number;
}

function containsSymbol(form: string, symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return lettersOf(form).some((u) => u.lower.toUpperCase() === upper);
}

export async function exampleWords(bookId: number, symbol: string, known: Set<string>, limit = 8): Promise<ExampleWord[]> {
  const f = await bookFrequencies(bookId);
  const knownPlus = new Set(known);
  knownPlus.add(symbol.toUpperCase());
  const out: ExampleWord[] = [];
  for (const [form, count] of Object.entries(f.forms)) {
    if (count < 2) continue;
    if (!containsSymbol(form, symbol)) continue;
    const d = decodability(form, knownPlus);
    out.push({ form, count, decodable: d.ratio, letters: lettersOf(form).map((l) => l.letter) });
  }
  // prefer fully decodable, short, frequent words
  out.sort((a, b) => b.decodable - a.decodable || a.letters.length - b.letters.length || b.count - a.count);
  const fully = out.filter((w) => w.decodable === 1).slice(0, limit);
  if (fully.length >= Math.min(4, limit)) return fully;
  return out.slice(0, limit);
}

export async function exampleSentences(bookId: number, forms: string[], limit = 3): Promise<ExampleSentence[]> {
  const out: ExampleSentence[] = [];
  const chapters = new Map((await db.chapters.where('book_id').equals(bookId).toArray()).map((c) => [c.id!, c]));
  for (const form of forms) {
    const toks = await db.tokens.where('[book_id+key]').equals([bookId, form]).limit(6).toArray();
    const sents = (await db.sentences.bulkGet(Array.from(new Set(toks.map((t) => t.sentence_id))))).filter((s): s is NonNullable<typeof s> => !!s);
    sents.sort((a, b) => a.text.length - b.text.length);
    for (const s of sents.slice(0, 2)) {
      if (s.text.length > 140) continue;
      const ch = chapters.get(s.chapter_id);
      out.push({ text: s.text, form, chapterIndex: ch?.index ?? 0, chapterId: s.chapter_id, chapterTitle: ch?.title ?? '', sentenceId: s.id! });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Order the curriculum stages' letters by corpus frequency within each stage, and report coverage per stage. */
export function stageCoverage(f: BookFrequencies, known: Set<string>): Array<{ stageId: string; symbolsByFrequency: Array<[string, number]>; tokensDecodableAfter: number }> {
  const out: Array<{ stageId: string; symbolsByFrequency: Array<[string, number]>; tokensDecodableAfter: number }> = [];
  const acc = new Set(known);
  for (const st of STAGES) {
    const symbolsByFrequency = st.symbols.map((s) => [s.symbol, f.letters[s.symbol] ?? 0] as [string, number]).sort((a, b) => b[1] - a[1]);
    for (const s of st.symbols) acc.add(s.symbol);
    let decodable = 0;
    for (const [form, count] of Object.entries(f.forms)) if (decodability(form, acc).category === 'fully') decodable += count;
    out.push({ stageId: st.id, symbolsByFrequency, tokensDecodableAfter: f.tokenCount ? decodable / f.tokenCount : 0 });
  }
  return out;
}

/** Share of running text decodable with the current knowledge. */
export function corpusDecodability(f: BookFrequencies, known: Set<string>): { fully: number; nearly: number; tokens: number } {
  let fully = 0;
  let nearly = 0;
  for (const [form, count] of Object.entries(f.forms)) {
    const d = decodability(form, known).category;
    if (d === 'fully') fully += count;
    else if (d === 'nearly') nearly += count;
  }
  return { fully: f.tokenCount ? fully / f.tokenCount : 0, nearly: f.tokenCount ? nearly / f.tokenCount : 0, tokens: f.tokenCount };
}
