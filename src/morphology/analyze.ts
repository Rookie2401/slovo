/**
 * Word-level analysis: dictionary first, then the closed-class tables
 * (pronouns/numerals/prepositions/conjunctions/particles/predicatives),
 * then rule generation, in the order PLAN.md §D and ARCHITECTURE.md specify
 * ("deterministic before statistical before generative"). The names index
 * (`ctx.character`) always adds a `proper` candidate alongside whatever else
 * was found, so context (syntax/context.ts) can prefer it when the word is
 * capitalised and not sentence-initial.
 */
import type { Candidate } from './candidate';
import { closedClassCandidates } from '../lexicon/closed-class';
import type { AnalysisContext } from './dictionary';
import { dictionaryCandidates } from './dictionary';
import { ruleGuesses } from './guess';

export type { AnalysisContext };

/** Bump when a rule in guess.ts, a closed-class table, or the dictionary bridge changes behaviour. */
export const ENGINE_RULES_VERSION = 6;

function namesRegisterNote(kind: string): string {
  switch (kind) {
    case 'diminutive':
      return 'diminutive form of the name — intimate/affectionate register';
    case 'patronymic':
      return "patronymic (father's name + -ович/-евич/-овна/-евна) — formal, respectful address";
    case 'surname':
      return 'surname';
    case 'nickname':
      return 'nickname — familiar register';
    case 'title':
      return 'title';
    default:
      return 'proper name';
  }
}

export function analyzeWord(surface: string, key: string, ctx: AnalysisContext): Candidate[] {
  // Closed-class readings are listed first (and so win ties at equal confidence): package B's
  // dump indexes some function words with a bare citation-form reading that is wrong or
  // useless for them (как as an uninflected "adjective", ещё with no real paradigm) — the
  // hand-written table is authoritative for the ~150 words it covers.
  let cands: Candidate[] = [...closedClassCandidates(key, surface), ...dictionaryCandidates(key, surface, ctx)];
  if (cands.length === 0) cands = ruleGuesses(surface, ctx);

  const hit = ctx.character?.(surface);
  if (hit) {
    cands = [
      ...cands,
      {
        key: `proper:${hit.canonical}`,
        lemma: hit.canonical,
        pos: 'proper',
        gloss: hit.canonical,
        features: {},
        morphemes: [{ text: surface, role: 'stem', gloss: 'name', start: 0, end: surface.length }],
        notes: [namesRegisterNote(hit.kind)],
        source: 'dictionary',
        confidence: 0.95,
      },
    ];
  }

  // stable ranking: highest confidence first, ties keep source order (dictionary > closed-class > rule)
  return cands
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.confidence - a.c.confidence || a.i - b.i)
    .map((x) => x.c);
}

export function isKnownWord(key: string, ctx: AnalysisContext): boolean {
  return ctx.readings(key).length > 0 || closedClassCandidates(key, key).length > 0;
}
