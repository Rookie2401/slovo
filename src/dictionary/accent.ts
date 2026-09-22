/**
 * Accent helpers. The dictionary dump marks stress with an apostrophe AFTER
 * the stressed vowel ("челове'к"); the reader displays stress as a combining
 * acute (U+0301) over the vowel instead. Kept in lockstep with the plain-JS
 * mirror in scripts/dict-lib.mjs (test/dictionary-lib.test.ts asserts equality).
 */
import { COMBINING_ACUTE } from '../tokenizer/cyrillic';
import type { AccentHelpers } from './types';

/** "челове'к" -> { plain: "человек", stress: 6 } (index of the stressed vowel in plain); stress -1 when no mark. */
export const splitAccent: AccentHelpers['splitAccent'] = (acc) => {
  const i = acc.indexOf("'");
  if (i < 0) return { plain: acc, stress: -1 };
  const plain = acc.slice(0, i) + acc.slice(i + 1);
  return { plain, stress: i - 1 };
};

/** Put the combining acute over the stressed vowel for display: ("человек", 6) -> "челове́к". */
export const withAcute: AccentHelpers['withAcute'] = (plain, stress) => {
  if (stress < 0 || stress >= plain.length) return plain;
  return plain.slice(0, stress + 1) + COMBINING_ACUTE + plain.slice(stress + 1);
};
