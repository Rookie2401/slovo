import { db } from '../database/db';
import type { AlphabetProgress, AlphabetSkill } from '../database/types';

/**
 * Per-symbol, per-skill mastery with light spaced repetition. A symbol is
 * "mastered" only when every core skill has a score ≥ MASTER_SCORE and at
 * least one correct answer came after a day's gap. `cursive` (italic
 * reading) and `context` (reading in the book) accrue but are not required
 * for the core "mastered" flag, matching the reference implementation.
 */

export const SKILLS: AlphabetSkill[] = ['visual', 'sound_recall', 'sound_to_symbol', 'symbol_to_sound', 'syllable', 'word', 'context', 'cursive'];
export const CORE_SKILLS: AlphabetSkill[] = ['symbol_to_sound', 'sound_to_symbol', 'syllable', 'word'];
export const SKILL_LABEL: Record<AlphabetSkill, string> = {
  visual: 'visual recognition',
  sound_recall: 'sound recall',
  sound_to_symbol: 'sound → symbol',
  symbol_to_sound: 'symbol → sound',
  syllable: 'syllable decoding',
  word: 'word decoding',
  context: 'reading in context',
  cursive: 'italic / cursive reading',
};
const MASTER_SCORE = 0.85;
const DAY = 86400000;

export function emptyProgress(symbol: string): AlphabetProgress {
  const skills = {} as AlphabetProgress['skills'];
  for (const s of SKILLS) skills[s] = { score: 0, correct: 0, wrong: 0, interval_days: 0, due: 0, last: 0 };
  return { symbol, skills, introduced: false, mastered: false, updated_at: Date.now() };
}

export async function getProgress(symbol: string): Promise<AlphabetProgress> {
  return (await db.alphabet_progress.where('symbol').equals(symbol).first()) ?? emptyProgress(symbol);
}

export async function allProgress(): Promise<Map<string, AlphabetProgress>> {
  const rows = await db.alphabet_progress.toArray();
  return new Map(rows.map((r) => [r.symbol, r]));
}

export async function knownSymbols(): Promise<Set<string>> {
  const rows = await db.alphabet_progress.where('introduced').equals(1).toArray().catch(() => [] as AlphabetProgress[]);
  const all = rows.length ? rows : await db.alphabet_progress.toArray();
  return new Set(all.filter((r) => r.introduced).map((r) => r.symbol));
}

export async function markIntroduced(symbols: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.alphabet_progress, async () => {
    for (const s of symbols) {
      const cur = await getProgress(s);
      if (cur.introduced) continue;
      cur.introduced = true;
      cur.introduced_at = now;
      cur.updated_at = now;
      await db.alphabet_progress.put(cur);
    }
  });
}

export function isMastered(p: AlphabetProgress): boolean {
  return CORE_SKILLS.every((s) => p.skills[s].score >= MASTER_SCORE && p.skills[s].correct >= 3) && CORE_SKILLS.some((s) => p.skills[s].interval_days >= 1);
}

/** Record one drill answer. Scores move like an exponential average; intervals grow on success. */
export async function recordAnswer(symbol: string, skill: AlphabetSkill, correct: boolean): Promise<AlphabetProgress> {
  const p = await getProgress(symbol);
  const s = p.skills[skill];
  const now = Date.now();
  const gapDays = s.last ? (now - s.last) / DAY : 0;
  if (correct) {
    s.correct++;
    s.score = s.score + (1 - s.score) * 0.35;
    s.interval_days = s.interval_days === 0 ? (gapDays >= 1 ? 1 : 0.5) : Math.min(60, s.interval_days * 2.2);
  } else {
    s.wrong++;
    s.score = s.score * 0.5;
    s.interval_days = 0;
  }
  s.last = now;
  s.due = now + s.interval_days * DAY;
  p.introduced = true;
  p.introduced_at ??= now;
  p.mastered = isMastered(p);
  p.updated_at = now;
  await db.alphabet_progress.put(p);
  return p;
}

/** Reading a word in the book counts as a soft `context` exposure for each of its letters. */
export async function recordContext(symbols: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.alphabet_progress, async () => {
    for (const sym of new Set(symbols)) {
      const p = await getProgress(sym);
      if (!p.introduced) continue;
      const s = p.skills.context;
      s.correct++;
      s.score = Math.min(1, s.score + 0.05);
      s.last = now;
      p.mastered = isMastered(p);
      p.updated_at = now;
      await db.alphabet_progress.put(p);
    }
  });
}

/** Symbols that are introduced and due for review (any core skill due). */
export async function dueSymbols(limit = 12): Promise<string[]> {
  const rows = await db.alphabet_progress.toArray();
  const now = Date.now();
  return rows
    .filter((r) => r.introduced && !r.mastered)
    .map((r) => ({ r, due: Math.min(...CORE_SKILLS.map((s) => (r.skills[s].last ? r.skills[s].due : 0))) }))
    .sort((a, b) => a.due - b.due)
    .filter((x) => x.due <= now)
    .slice(0, limit)
    .map((x) => x.r.symbol);
}

export function masteryPercent(p: AlphabetProgress): number {
  const scores = CORE_SKILLS.map((s) => p.skills[s].score);
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
}
