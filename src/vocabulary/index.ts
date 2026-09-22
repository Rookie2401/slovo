import { db } from '../database/db';
import type { KnownWord, LearningStatus, Token, WordEncounter } from '../database/types';
import { chosen, type SentenceAnalysis } from '../morphology/sentence';

/**
 * Vocabulary tracking by lexeme. Encounters are counted when the reader
 * scrolls past a paragraph (`recordRead`) and when a word is tapped
 * (`recordLookup`). Status moves by hand or automatically after enough
 * unaided encounters. Nothing here touches the reading view unless the
 * learner turns indicators on.
 */

export const STATUS_ORDER: LearningStatus[] = ['new', 'seen', 'recognizing', 'known', 'mastered'];
export const STATUS_LABEL: Record<LearningStatus, string> = { new: 'new', seen: 'seen', recognizing: 'recognizing', known: 'known', mastered: 'mastered', ignored: 'ignored' };

const listeners = new Set<() => void>();
export function onVocabChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  for (const l of listeners) l();
}

/** Lexeme keys visible in a sentence analysis, one per word token (chosen reading). */
export function lexemeKeysOf(a: SentenceAnalysis, tokens: Token[]): Array<{ key: string; form: string; token: Token }> {
  const out: Array<{ key: string; form: string; token: Token }> = [];
  a.tokens.forEach((at, i) => {
    const t = tokens[i];
    const c = chosen(at);
    if (!t || t.kind !== 'word' || !c) return;
    if (c.pos === 'punct' as unknown) return;
    out.push({ key: c.key, form: t.key, token: t });
  });
  return out;
}

export async function statusMap(keys: string[]): Promise<Map<string, KnownWord>> {
  if (!keys.length) return new Map();
  const rows = await db.known_words.where('lexeme_key').anyOf(Array.from(new Set(keys))).toArray();
  return new Map(rows.map((r) => [r.lexeme_key, r]));
}

async function bump(key: string, kind: 'read' | 'lookup', form: string, autoKnownAfter: number): Promise<void> {
  const now = Date.now();
  const cur = await db.known_words.where('lexeme_key').equals(key).first();
  if (!cur) {
    await db.known_words.add({ lexeme_key: key, status: kind === 'lookup' ? 'seen' : 'new', encounters: kind === 'read' ? 1 : 0, lookups: kind === 'lookup' ? 1 : 0, first_seen: now, last_seen: now, updated_at: now, form_status: {} });
    return;
  }
  const upd: Partial<KnownWord> = { last_seen: now, updated_at: now };
  if (kind === 'read') upd.encounters = cur.encounters + 1;
  else upd.lookups = cur.lookups + 1;
  if (kind === 'lookup' && cur.status === 'new') upd.status = 'seen';
  if (kind === 'lookup' && (cur.status === 'known' || cur.status === 'mastered')) upd.status = 'recognizing';
  // automatic promotion: read N times without any lookup since → known
  if (kind === 'read' && autoKnownAfter > 0 && cur.status !== 'mastered' && cur.status !== 'ignored' && cur.status !== 'known' && (upd.encounters ?? 0) - cur.lookups * 2 >= autoKnownAfter) upd.status = 'known';
  void form;
  await db.known_words.update(cur.id!, upd);
}

/** Count a read encounter for every word of the given sentences (called once per paragraph scrolled past). */
export async function recordRead(items: Array<{ key: string; form: string; token: Token }>, autoKnownAfter = 6): Promise<void> {
  if (!items.length) return;
  const now = Date.now();
  const enc: WordEncounter[] = items.map((it) => ({ lexeme_key: it.key, form: it.form, token_id: it.token.id!, book_id: it.token.book_id, chapter_id: it.token.chapter_id, sentence_id: it.token.sentence_id, at: now, kind: 'read' }));
  await db.transaction('rw', [db.word_encounters, db.known_words], async () => {
    await db.word_encounters.bulkAdd(enc);
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.key)) continue;
      seen.add(it.key);
      await bump(it.key, 'read', it.form, autoKnownAfter);
    }
  });
  notify();
}

export async function recordLookup(key: string, form: string, token: Token): Promise<void> {
  await db.transaction('rw', [db.word_encounters, db.known_words], async () => {
    await db.word_encounters.add({ lexeme_key: key, form, token_id: token.id!, book_id: token.book_id, chapter_id: token.chapter_id, sentence_id: token.sentence_id, at: Date.now(), kind: 'lookup' });
    await bump(key, 'lookup', form, 0);
  });
  notify();
}

export async function setStatus(key: string, status: LearningStatus): Promise<void> {
  const now = Date.now();
  const cur = await db.known_words.where('lexeme_key').equals(key).first();
  if (cur) await db.known_words.update(cur.id!, { status, updated_at: now });
  else await db.known_words.add({ lexeme_key: key, status, encounters: 0, lookups: 0, first_seen: now, last_seen: now, updated_at: now, form_status: {} });
  notify();
}

export async function setFormStatus(key: string, form: string, status: LearningStatus | null): Promise<void> {
  const now = Date.now();
  const cur = await db.known_words.where('lexeme_key').equals(key).first();
  const fs = { ...(cur?.form_status ?? {}) };
  if (status) fs[form] = status;
  else delete fs[form];
  if (cur) await db.known_words.update(cur.id!, { form_status: fs, updated_at: now });
  else await db.known_words.add({ lexeme_key: key, status: 'seen', encounters: 0, lookups: 0, first_seen: now, last_seen: now, updated_at: now, form_status: fs });
  notify();
}

export interface LexemeStats {
  key: string;
  encounters: number;
  lookups: number;
  forms: Array<{ form: string; count: number }>;
  status?: KnownWord;
  chapters: number[];
}

export async function lexemeStats(key: string): Promise<LexemeStats> {
  const enc = await db.word_encounters.where('lexeme_key').equals(key).toArray();
  const forms = new Map<string, number>();
  const chapters = new Set<number>();
  let reads = 0;
  let lookups = 0;
  for (const e of enc) {
    if (e.kind === 'read') { reads++; forms.set(e.form, (forms.get(e.form) ?? 0) + 1); } else lookups++;
    chapters.add(e.chapter_id);
  }
  const status = await db.known_words.where('lexeme_key').equals(key).first();
  return { key, encounters: reads, lookups, forms: Array.from(forms, ([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count), status, chapters: Array.from(chapters) };
}

/** Count the occurrences of a lexeme's forms across a whole book from stored analyses (rank 0). */
export async function lexemeBookForms(bookId: number, key: string): Promise<Array<{ form: string; count: number }>> {
  const rows = await db.token_analyses.where('lexeme_key').equals(key).filter((r) => r.book_id === bookId && r.rank === 0 && !r.superseded).toArray();
  if (!rows.length) return [];
  const toks = await db.tokens.bulkGet(rows.map((r) => r.token_id));
  const forms = new Map<string, number>();
  for (const t of toks) if (t) forms.set(t.surface_normalized, (forms.get(t.surface_normalized) ?? 0) + 1);
  return Array.from(forms, ([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count);
}

export async function markUnlookedAsKnown(keys: string[]): Promise<number> {
  const rows = await db.known_words.where('lexeme_key').anyOf(keys).toArray();
  const byKey = new Map(rows.map((r) => [r.lexeme_key, r]));
  let n = 0;
  const now = Date.now();
  await db.transaction('rw', db.known_words, async () => {
    for (const k of new Set(keys)) {
      const r = byKey.get(k);
      if (r && (r.status === 'known' || r.status === 'mastered' || r.status === 'ignored' || r.lookups > 0)) continue;
      if (r) await db.known_words.update(r.id!, { status: 'known', updated_at: now });
      else await db.known_words.add({ lexeme_key: k, status: 'known', encounters: 1, lookups: 0, first_seen: now, last_seen: now, updated_at: now, form_status: {} });
      n++;
    }
  });
  notify();
  return n;
}

export async function allKnownWords(): Promise<KnownWord[]> {
  return db.known_words.orderBy('updated_at').reverse().toArray();
}
