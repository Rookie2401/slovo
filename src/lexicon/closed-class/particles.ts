/**
 * Particles, incl. the negation particles не/ни (constructions/negation.ts
 * decides what они attach to), question/emphatic/modal particles, and бы
 * (conditional/subjunctive marker — constructions/phrases.ts builds the бы
 * construction from it).
 */
import type { Candidate } from '../../morphology/candidate';
import type { Morpheme, Pos } from '../../database/types';
import { looseKey } from '../../tokenizer/cyrillic';

const INDEX = new Map<string, Candidate[]>();
function whole(form: string): Morpheme[] {
  return [{ text: form, role: 'stem', gloss: 'whole word (closed class)', start: 0, end: form.length }];
}
function add(form: string, lemma: string, gloss: string, notes: string[] = [], pos: Pos = 'particle') {
  const key = looseKey(form);
  const list = INDEX.get(key) ?? [];
  list.push({ key: `${pos}:${lemma}`, lemma, pos, gloss, features: {}, morphemes: whole(form), notes, source: 'rule', confidence: 1 });
  INDEX.set(key, list);
}

add('не', 'не', 'not', ['negates the word right after it; a negated verb\'s direct object often shifts to the genitive']);
add('ни', 'ни', 'not a single / emphatic negative', ['reinforces a negation (ни…, не…) or doubles for "neither…nor" (ни…ни)']);
add('ли', 'ли', 'whether / question marker', ['turns a statement into a yes/no question: verb + ли']);
add('ль', 'ли', 'whether / question marker', ['colloquial/poetic short form of ли']);
add('бы', 'бы', 'would / conditional-subjunctive marker', ['with a past-tense verb: a conditional or a wish (я бы пошёл — I would go); with чтобы: purpose/wish']);
add('же', 'же', 'emphatic: indeed / after all', ['emphasises the preceding word, or contrasts with what was just said']);
add('ведь', 'ведь', 'after all / you know', ['appeals to something the listener should already accept']);
add('вот', 'вот', 'here (is) / there (is)', ['points something out']);
add('вон', 'вон', 'there (over there)', ['points something out at a distance']);
add('даже', 'даже', 'even', ['emphatic: marks the following word as an extreme/surprising case']);
add('только', 'только', 'only / just', ['restrictive']);
add('уже', 'уже', 'already', ['aspectual particle: marks a state as already reached']);
add('ещё', 'ещё', 'still / yet / more', ['continuative']);
add('разве', 'разве', 'surely not? / really?', ['a question expecting "no", or expressing doubt']);
add('неужели', 'неужели', 'is it really true that…?', ['a question expressing surprise or disbelief']);
add('таки', 'таки', 'after all / all the same', ['emphatic, usually attached with a hyphen: всё-таки']);
add('то', 'то', 'then / topic marker', ['after если/раз: introduces the consequence clause; also fuses onto pronouns as -то (кто-то)']);
add('нибудь', 'нибудь', 'any- (indefinite)', ['suffix particle: fuses onto pronouns/adverbs as -нибудь (кто-нибудь)']);

// archaic/dialect aliases and standalone archaic adverbs (19th-century and folk-tale texts)
add('чорт', 'чёрт', 'devil', ['old (pre-reform-ish) spelling of чёрт'], 'noun');
add('поскорей', 'поскорее', 'quicker, hurry up', ['dialect/colloquial variant of the comparative поскорее'], 'adverb');
add('поскорее', 'поскорее', 'quicker, hurry up', ['по- + the comparative скорее: "a bit quicker, hurry up"'], 'adverb');
add('нынче', 'нынче', 'nowadays / today', ['archaic/dialect adverb of time'], 'adverb');
add('покамест', 'покамест', 'for the time being / while', ['archaic/dialect adverb-conjunction of time'], 'adverb');
add('давеча', 'давеча', 'a while ago, earlier today', ['archaic/dialect adverb of time'], 'adverb');
add('вечор', 'вечор', 'yesterday evening', ['archaic/dialect adverb of time (distinct from вечером)'], 'adverb');
add('отселе', 'отселе', 'from here', ['archaic adverb of place'], 'adverb');
add('проч', 'прочее', 'et cetera, and so on', ['abbreviation "проч." — и прочее, "and the rest"'], 'adverb');

export function particleCandidates(key: string): Candidate[] {
  return INDEX.get(key) ?? [];
}
