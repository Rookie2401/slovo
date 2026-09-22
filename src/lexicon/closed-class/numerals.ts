/**
 * Numerals: cardinals один–тысяча (the small hand-declined set plus a
 * regular pattern for the round tens/hundreds), ordinals (первый… declined
 * like a hard adjective), and collectives (двое, трое…). Government of the
 * counted noun's case is a syntax-level construction (see
 * constructions/numeral.ts); this table only supplies the numeral's own
 * reading.
 */
import type { Candidate } from '../../morphology/candidate';
import type { Morpheme } from '../../database/types';
import type { Case, Gender, MorphFeatures } from '../../database/types';
import { hardAdjective, caseTableEntries } from '../../morphology/paradigms';
import { looseKey } from '../../tokenizer/cyrillic';

const INDEX = new Map<string, Candidate[]>();
function whole(form: string): Morpheme[] {
  return [{ text: form, role: 'stem', gloss: 'whole word (closed class)', start: 0, end: form.length }];
}
function add(form: string, c: Omit<Candidate, 'morphemes' | 'source' | 'confidence' | 'notes'> & { notes?: string[] }) {
  const key = looseKey(form);
  const list = INDEX.get(key) ?? [];
  list.push({ ...c, morphemes: whole(form), source: 'rule', confidence: 1, notes: c.notes ?? [] });
  INDEX.set(key, list);
}

// ---- один: declines like an adjective/pronoun, agrees with the counted noun
const odinForms: Array<[string, Gender | 'pl', Case]> = [
  ['один', 'm', 'nom'], ['одного', 'm', 'gen'], ['одному', 'm', 'dat'], ['одним', 'm', 'inst'], ['одном', 'm', 'prep'],
  ['одна', 'f', 'nom'], ['одной', 'f', 'gen'], ['одной', 'f', 'dat'], ['одну', 'f', 'acc'], ['одной', 'f', 'inst'], ['одной', 'f', 'prep'],
  ['одно', 'n', 'nom'], ['одного', 'n', 'gen'], ['одному', 'n', 'dat'], ['одно', 'n', 'acc'], ['одним', 'n', 'inst'], ['одном', 'n', 'prep'],
  ['одни', 'pl', 'nom'], ['одних', 'pl', 'gen'], ['одним', 'pl', 'dat'], ['одни', 'pl', 'acc'], ['одними', 'pl', 'inst'], ['одних', 'pl', 'prep'],
];
for (const [form, g, c] of odinForms) {
  const features: MorphFeatures = { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg' };
  add(form, { key: 'numeral:один', lemma: 'один', pos: 'numeral', gloss: 'one', features, notes: ['agrees with the counted noun like an adjective; takes a singular noun'] });
}
add('одного', { key: 'numeral:один', lemma: 'один', pos: 'numeral', gloss: 'one', features: { case: 'acc', gender: 'm', number: 'sg' }, notes: ['animate accusative (= genitive)'] });

// ---- два/три/четыре: gender distinction only for два (два/две), govern gen sg (2-4)
add('два', { key: 'numeral:два', lemma: 'два', pos: 'numeral', gloss: 'two', features: { case: 'nom', gender: 'm' }, notes: ['governs the genitive singular of the counted noun (два стола́)'] });
add('две', { key: 'numeral:два', lemma: 'два', pos: 'numeral', gloss: 'two', features: { case: 'nom', gender: 'f' }, notes: ['feminine form of два; governs the genitive singular (две сестры́)'] });
add('двух', { key: 'numeral:два', lemma: 'два', pos: 'numeral', gloss: 'two', features: { case: 'gen' }, notes: ['oblique form of два/две'] });
add('трёх', { key: 'numeral:три', lemma: 'три', pos: 'numeral', gloss: 'three', features: { case: 'gen' } });
add('трех', { key: 'numeral:три', lemma: 'три', pos: 'numeral', gloss: 'three', features: { case: 'gen' } });
add('трём', { key: 'numeral:три', lemma: 'три', pos: 'numeral', gloss: 'three', features: { case: 'dat' } });
add('три', { key: 'numeral:три', lemma: 'три', pos: 'numeral', gloss: 'three', features: { case: 'nom' }, notes: ['governs the genitive singular of the counted noun (три дня)'] });
add('четыре', { key: 'numeral:четыре', lemma: 'четыре', pos: 'numeral', gloss: 'four', features: { case: 'nom' }, notes: ['governs the genitive singular of the counted noun (четыре часа́)'] });
add('четырёх', { key: 'numeral:четыре', lemma: 'четыре', pos: 'numeral', gloss: 'four', features: { case: 'gen' } });

// ---- пять–десять, and the -дцать/-десят family: indeclinable-ish nom/acc form
// used undeclined here; govern gen pl of the counted noun.
const FIVE_TO_TWENTY: Array<[string, string]> = [
  ['пять', 'five'], ['шесть', 'six'], ['семь', 'seven'], ['восемь', 'eight'], ['девять', 'nine'], ['десять', 'ten'],
  ['одиннадцать', 'eleven'], ['двенадцать', 'twelve'], ['тринадцать', 'thirteen'], ['четырнадцать', 'fourteen'], ['пятнадцать', 'fifteen'],
  ['шестнадцать', 'sixteen'], ['семнадцать', 'seventeen'], ['восемнадцать', 'eighteen'], ['девятнадцать', 'nineteen'], ['двадцать', 'twenty'],
  ['тридцать', 'thirty'], ['сорок', 'forty'], ['пятьдесят', 'fifty'], ['шестьдесят', 'sixty'], ['семьдесят', 'seventy'],
  ['восемьдесят', 'eighty'], ['девяносто', 'ninety'], ['сто', 'hundred'], ['тысяча', 'thousand'],
];
for (const [form, gloss] of FIVE_TO_TWENTY) {
  add(form, { key: `numeral:${form}`, lemma: form, pos: 'numeral', gloss, features: { case: 'nom' }, notes: ['governs the genitive plural of the counted noun (пять книг)'] });
}

// ---- ordinals: declined like a hard adjective, stem = cardinal minus its own ending
const ORDINALS: Array<[string, string, string]> = [
  ['перв', 'первый', 'first'], ['втор', 'второй', 'second'], ['трет', 'третий', 'third'], ['четвёрт', 'четвёртый', 'fourth'],
  ['пят', 'пятый', 'fifth'], ['шест', 'шестой', 'sixth'], ['седьм', 'седьмой', 'seventh'], ['восьм', 'восьмой', 'eighth'],
  ['девят', 'девятый', 'ninth'], ['десят', 'десятый', 'tenth'],
];
for (const [stem, lemma, gloss] of ORDINALS) {
  const stressedNom = /ой$/.test(lemma);
  const table = hardAdjective(stem, { stressedNom });
  for (const [g, c, form] of caseTableEntries(table)) {
    const features: MorphFeatures = { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg' };
    add(form, { key: `numeral:${lemma}`, lemma, pos: 'numeral', gloss: `${gloss} (ordinal)`, features });
  }
}

// ---- collectives: двое, трое, четверо… (used with masculine/common nouns, children, plurale tantum)
const COLLECTIVE: Array<[string, string, string]> = [['двое', 'два', 'two (collective)'], ['трое', 'три', 'three (collective)'], ['четверо', 'четыре', 'four (collective)'], ['пятеро', 'пять', 'five (collective)']];
for (const [form, lemma, gloss] of COLLECTIVE) {
  add(form, { key: `numeral:${lemma}`, lemma: form, pos: 'numeral', gloss, features: { case: 'nom' }, notes: ['collective numeral: used with male/mixed groups, children, and plurale-tantum nouns (двое суток)'] });
}

export function numeralCandidates(key: string): Candidate[] {
  return INDEX.get(key) ?? [];
}
