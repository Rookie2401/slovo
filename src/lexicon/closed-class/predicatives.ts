/**
 * Predicatives (category of state / modal words used without a subject in
 * -ish they form impersonal constructions: мне холодно, ему нужно). See
 * constructions/impersonal.ts for the dative-experiencer construction built
 * from these.
 */
import type { Candidate } from '../../morphology/candidate';
import type { Morpheme } from '../../database/types';
import { looseKey } from '../../tokenizer/cyrillic';

const INDEX = new Map<string, Candidate[]>();
function whole(form: string): Morpheme[] {
  return [{ text: form, role: 'stem', gloss: 'whole word (closed class)', start: 0, end: form.length }];
}
function add(form: string, gloss: string, notes: string[] = []) {
  const key = looseKey(form);
  const list = INDEX.get(key) ?? [];
  list.push({ key: `predicative:${form}`, lemma: form, pos: 'predicative', gloss, features: {}, morphemes: whole(form), notes, source: 'rule', confidence: 1 });
  INDEX.set(key, list);
}

add('надо', 'it is necessary / need to', ['impersonal predicative: dative experiencer + надо + infinitive (мне надо идти)']);
add('нужно', 'it is necessary / need to', ['impersonal predicative: dative experiencer + нужно + infinitive']);
add('нельзя', "one must not / it's not allowed / impossible", ['impersonal predicative: dative experiencer + нельзя + infinitive']);
add('можно', 'one may / it is possible', ['impersonal predicative: dative experiencer + можно + infinitive']);
add('жаль', 'it is a pity / (I) feel sorry for', ['impersonal predicative: dative experiencer + жаль (+ genitive of what is pitied)']);
add('пора', 'it is time (to)', ['impersonal predicative: dative experiencer + пора + infinitive']);
add('холодно', 'cold (as a state)', ['impersonal predicative: dative experiencer + холодно (мне холодно — I am cold)']);
add('жарко', 'hot (as a state)', ['impersonal predicative: dative experiencer + жарко (ему жарко — he is hot)']);
add('скучно', 'boring / bored (as a state)', ['impersonal predicative: dative experiencer + скучно']);
add('весело', 'fun / cheerful (as a state)', ['impersonal predicative: dative experiencer + весело']);
add('видно', 'visible / apparently', ['impersonal predicative: (ничего не видно — nothing can be seen)']);
add('слышно', 'audible', ['impersonal predicative: (ничего не слышно — nothing can be heard)']);
add('можно', 'one may / it is possible', ['impersonal predicative']);
add('стыдно', 'ashamed (as a state)', ['impersonal predicative: dative experiencer + стыдно']);

export function predicativeCandidates(key: string): Candidate[] {
  return INDEX.get(key) ?? [];
}
