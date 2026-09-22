/**
 * Conjunctions: coordinating (и, а, но, или) and subordinating (что, чтобы,
 * если, когда, потому что, так как, хотя, как, чем, пока). что and как also
 * have pronoun/adverb readings handled by pronouns.ts / particles.ts —
 * syntax/context.ts picks between them from position.
 */
import type { Candidate } from '../../morphology/candidate';
import type { Morpheme } from '../../database/types';
import { looseKey } from '../../tokenizer/cyrillic';

const INDEX = new Map<string, Candidate[]>();
function whole(form: string): Morpheme[] {
  return [{ text: form, role: 'stem', gloss: 'whole word (closed class)', start: 0, end: form.length }];
}
function add(form: string, lemma: string, gloss: string, notes: string[] = []) {
  const key = looseKey(form);
  const list = INDEX.get(key) ?? [];
  list.push({ key: `conjunction:${lemma}`, lemma, pos: 'conjunction', gloss, features: {}, morphemes: whole(form), notes, source: 'rule', confidence: 1 });
  INDEX.set(key, list);
}

add('и', 'и', 'and', ['coordinating: joins words or clauses']);
add('а', 'а', 'and/but (mild contrast)', ['coordinating: introduces a contrast or a new point, weaker than но']);
add('но', 'но', 'but', ['coordinating: contrast']);
add('или', 'или', 'or', ['coordinating']);
add('да', 'да', 'and/but (folk/literary)', ['coordinating, like и or но depending on context']);
add('что', 'что', 'that (conjunction)', ['subordinating: introduces a reported clause (он сказал, что…)']);
add('чтобы', 'чтобы', 'so that / in order to', ['subordinating: purpose or a wish-clause; the verb after it is in the past-tense form used as a subjunctive']);
add('чтоб', 'чтобы', 'so that / in order to', ['subordinating: colloquial short form of чтобы']);
add('если', 'если', 'if', ['subordinating: condition']);
add('когда', 'когда', 'when', ['subordinating: time']);
add('пока', 'пока', 'while / until', ['subordinating: time']);
add('потому', 'потому что', 'because', ['first half of потому что — reason']);
add('так', 'так как', 'since / as', ['can start так как "since, as" (reason) — see the following как']);
add('хотя', 'хотя', 'although', ['subordinating: concession']);
add('как', 'как', 'as / how / when', ['subordinating or comparative: "as", "how", or (with a past-tense verb) "when suddenly"']);
add('чем', 'чем', 'than', ['comparative conjunction: used after a comparative (быстрее, чем…)']);
add('будто', 'будто', 'as if', ['subordinating: unreal comparison']);
add('либо', 'либо', 'or (either…or)', ['coordinating, often doubled: либо…либо']);
add('ни', 'ни', 'neither/nor (doubled)', ['coordinating when doubled: ни…ни — see also the negation particle ни']);

// archaic/dialect aliases (19th-century and folk-tale texts)
add('али', 'или', 'or', ['coordinating: dialect/folk variant of или']);
add('ежели', 'если', 'if', ['subordinating: archaic/folk variant of если']);
add('коли', 'если', 'if / since', ['subordinating: archaic/folk variant of если']);
add('дабы', 'чтобы', 'so that / in order to', ['subordinating: archaic/bookish variant of чтобы']);
add('ибо', 'ибо', 'for, because', ['subordinating: literary/archaic — gives a reason, like потому что']);

export function conjunctionCandidates(key: string): Candidate[] {
  return INDEX.get(key) ?? [];
}
