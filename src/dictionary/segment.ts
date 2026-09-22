import type { CoreLexeme } from './types';

/**
 * Per-form morpheme segmentation shared by the runtime dictionary
 * (`candidatesFor`) and the analysis engine (`morphology/dictionary.ts`), so
 * the chips a learner sees are exactly what the engine computed.
 *
 * Not the paradigm's longest common prefix (that breaks under consonant
 * mutation / stress-shift spellings — спуститься's paradigm LCP is "спу",
 * from спущусь, although every other form shares "спусти"). Instead:
 *   base      = surface (lower case, unaccented) minus -ся/-сь
 *   lemmaBase = the lemma minus -ся/-сь, then minus the infinitive ending
 *               (-ть/-ти/-чь) for verbs or the 2-letter nominative ending
 *               (-ый/-ий/-ой) for adjectives and adjective-declined pronouns;
 *               nouns keep the lemma as is
 *   stem      = longest common prefix(base, lemmaBase), floored at 2 letters —
 *               shorter is called suppletive (человек/люди) and left unsegmented
 *   ending    = the rest of base
 * A stem more than one letter short of lemmaBase (the lemma's own final letter
 * is usually just its citation-form ending) is a real stem alternation and gets
 * a note; a form with nothing after the stem gets the note "ending: —".
 */
export interface Segmentation {
  base: string;
  stem: string;
  ending: string;
  postfix: string;
  suppletive: boolean;
  notes: string[];
}

const VERB_INFINITIVE_ENDINGS = ['ть', 'ти', 'чь'];
const ADJECTIVE_NOM_ENDINGS = ['ый', 'ий', 'ой'];

export function stripReflexivePostfix(s: string): { base: string; postfix: string } {
  if (s.endsWith('ся')) return { base: s.slice(0, -2), postfix: 'ся' };
  if (s.endsWith('сь')) return { base: s.slice(0, -2), postfix: 'сь' };
  return { base: s, postfix: '' };
}

export function lemmaBaseFor(lex: Pick<CoreLexeme, 'lemma' | 'pos' | 'reflexive'>): string {
  let base = lex.lemma.toLowerCase();
  if (lex.reflexive) base = stripReflexivePostfix(base).base;
  if (lex.pos === 'verb') {
    for (const ending of VERB_INFINITIVE_ENDINGS) if (base.endsWith(ending)) return base.slice(0, -ending.length);
  } else if (lex.pos === 'adjective' || lex.pos === 'pronoun') {
    for (const ending of ADJECTIVE_NOM_ENDINGS) if (base.endsWith(ending)) return base.slice(0, -ending.length);
  }
  return base;
}

function commonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/** `surface` may carry case and combining stress marks; they are normalised away here. */
export function segmentForm(surface: string, lex: Pick<CoreLexeme, 'lemma' | 'pos' | 'reflexive'>): Segmentation {
  const plain = surface.normalize('NFC').replace(/[̀́]/g, '').toLowerCase();
  const { base, postfix } = lex.reflexive ? stripReflexivePostfix(plain) : { base: plain, postfix: '' };
  const lemmaBase = lemmaBaseFor(lex);
  const rawStem = commonPrefix(base, lemmaBase);
  const suppletive = rawStem.length < 2;
  const stem = suppletive ? '' : rawStem;
  const ending = stem ? base.slice(stem.length) : '';
  const notes: string[] = [];
  if (suppletive) {
    notes.push('suppletive form — stem not segmentable from this lexeme');
  } else {
    if (!ending) notes.push('ending: —');
    // a shortfall of exactly one letter is the lemma's own citation-form ending, not a mutation
    if (stem.length < lemmaBase.length - 1) notes.push(`stem alternation: ${lemmaBase} → ${base.slice(0, stem.length + 1)}`);
  }
  return { base, stem, ending, postfix, suppletive, notes };
}
