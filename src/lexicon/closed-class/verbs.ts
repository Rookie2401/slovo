/**
 * быть ("to be"): the dump indexes only есть for its presfut, so its future
 * (буду…), past (был…) and imperative (будь…) are hand-tabled here — high
 * frequency, irregular/suppletive-feeling paradigm, and буду + infinitive is
 * the analytic imperfective future (see constructions/aspect.ts).
 */
import type { MorphFeatures, Morpheme, Person } from '../../database/types';
import type { Candidate } from '../../morphology/candidate';
import { looseKey } from '../../tokenizer/cyrillic';

const INDEX = new Map<string, Candidate[]>();
function whole(form: string): Morpheme[] {
  return [{ text: form, role: 'stem', gloss: 'whole word (closed class)', start: 0, end: form.length }];
}
function add(form: string, features: MorphFeatures, notes: string[] = []) {
  const key = looseKey(form);
  const list = INDEX.get(key) ?? [];
  list.push({
    key: 'verb:быть', lemma: 'быть', pos: 'verb', gloss: 'to be', features: { ...features, aspect: 'imperfective' },
    morphemes: whole(form), notes, source: 'rule', confidence: 1,
  });
  INDEX.set(key, list);
}

const FUTURE: Array<[string, Person, 'sg' | 'pl']> = [
  ['буду', 1, 'sg'], ['будешь', 2, 'sg'], ['будет', 3, 'sg'],
  ['будем', 1, 'pl'], ['будете', 2, 'pl'], ['будут', 3, 'pl'],
];
for (const [form, person, number] of FUTURE) add(form, { verb_form: 'present-future', tense: 'future', mood: 'indicative', person, number });

const PAST: Array<[string, MorphFeatures]> = [
  ['был', { gender: 'm', number: 'sg' }], ['была', { gender: 'f', number: 'sg' }],
  ['было', { gender: 'n', number: 'sg' }], ['были', { number: 'pl' }],
];
for (const [form, feat] of PAST) add(form, { verb_form: 'past', tense: 'past', mood: 'indicative', ...feat });

// есть: modern usage is invariant ("there is/are", any person); суть is its archaic plural
// (formal/bookish, "there are"/"X are Y").
add('есть', { verb_form: 'present-future', tense: 'present', mood: 'indicative' }, ['invariant present of быть: "is/are, there is/are" — used for any person or number']);
add('суть', { verb_form: 'present-future', tense: 'present', mood: 'indicative', number: 'pl' }, ['archaic/bookish present plural of быть: "are"']);

add('будь', { verb_form: 'imperative', mood: 'imperative', number: 'sg' });
add('будьте', { verb_form: 'imperative', mood: 'imperative', number: 'pl' });

export function beCandidates(key: string): Candidate[] {
  return INDEX.get(key) ?? [];
}
