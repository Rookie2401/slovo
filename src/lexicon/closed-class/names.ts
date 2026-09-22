/**
 * A small gazetteer of the places and historical figures that dominate the
 * reading ladder's novels (War and Peace, Crime and Punishment…): declined
 * in full so "в Москве", "из Петербурга", "с Наполеоном" resolve at
 * confidence 0.95 instead of falling to the generic capitalised-word
 * fallback in syntax/context.ts. Genders noted for agreement.
 */
import type { Case, Gender, Morpheme } from '../../database/types';
import type { Candidate } from '../../morphology/candidate';
import { looseKey } from '../../tokenizer/cyrillic';

const INDEX = new Map<string, Candidate[]>();
function whole(form: string): Morpheme[] {
  return [{ text: form, role: 'stem', gloss: 'whole word (closed class)', start: 0, end: form.length }];
}
function add(form: string, lemma: string, gloss: string, gender: Gender, animate: boolean, cas: Case) {
  const key = looseKey(form);
  const list = INDEX.get(key) ?? [];
  list.push({
    key: `proper:${lemma}`, lemma, pos: 'proper', gloss, features: { gender, animacy: animate ? 'anim' : 'inan', case: cas },
    morphemes: whole(form), notes: [], source: 'rule', confidence: 0.95,
  });
  INDEX.set(key, list);
}

interface Entry { lemma: string; gloss: string; gender: Gender; animate: boolean; forms: Partial<Record<Case, string>>; }

const GAZETTEER: Entry[] = [
  { lemma: 'Москва', gloss: 'Moscow', gender: 'f', animate: false, forms: { nom: 'Москва', gen: 'Москвы', dat: 'Москве', acc: 'Москву', inst: 'Москвой', prep: 'Москве' } },
  { lemma: 'Петербург', gloss: 'St Petersburg', gender: 'm', animate: false, forms: { nom: 'Петербург', gen: 'Петербурга', dat: 'Петербургу', acc: 'Петербург', inst: 'Петербургом', prep: 'Петербурге' } },
  { lemma: 'Россия', gloss: 'Russia', gender: 'f', animate: false, forms: { nom: 'Россия', gen: 'России', dat: 'России', acc: 'Россию', inst: 'Россией', prep: 'России' } },
  { lemma: 'Европа', gloss: 'Europe', gender: 'f', animate: false, forms: { nom: 'Европа', gen: 'Европы', dat: 'Европе', acc: 'Европу', inst: 'Европой', prep: 'Европе' } },
  { lemma: 'Париж', gloss: 'Paris', gender: 'm', animate: false, forms: { nom: 'Париж', gen: 'Парижа', dat: 'Парижу', acc: 'Париж', inst: 'Парижем', prep: 'Париже' } },
  { lemma: 'Кавказ', gloss: 'the Caucasus', gender: 'm', animate: false, forms: { nom: 'Кавказ', gen: 'Кавказа', dat: 'Кавказу', acc: 'Кавказ', inst: 'Кавказом', prep: 'Кавказе' } },
  { lemma: 'Аустерлиц', gloss: 'Austerlitz', gender: 'm', animate: false, forms: { nom: 'Аустерлиц', gen: 'Аустерлица', dat: 'Аустерлицу', acc: 'Аустерлиц', inst: 'Аустерлицем', prep: 'Аустерлице' } },
  { lemma: 'Бородино', gloss: 'Borodino', gender: 'n', animate: false, forms: { nom: 'Бородино', gen: 'Бородина', dat: 'Бородину', acc: 'Бородино', inst: 'Бородином', prep: 'Бородине' } },
  { lemma: 'Наполеон', gloss: 'Napoleon', gender: 'm', animate: true, forms: { nom: 'Наполеон', gen: 'Наполеона', dat: 'Наполеону', acc: 'Наполеона', inst: 'Наполеоном', prep: 'Наполеоне' } },
  { lemma: 'Бонапарт', gloss: 'Bonaparte', gender: 'm', animate: true, forms: { nom: 'Бонапарт', gen: 'Бонапарта', dat: 'Бонапарту', acc: 'Бонапарта', inst: 'Бонапартом', prep: 'Бонапарте' } },
  // -ов surnames decline like nouns except the instrumental, which is adjective-like (-ым, not -ом)
  { lemma: 'Кутузов', gloss: 'Kutuzov', gender: 'm', animate: true, forms: { nom: 'Кутузов', gen: 'Кутузова', dat: 'Кутузову', acc: 'Кутузова', inst: 'Кутузовым', prep: 'Кутузове' } },
  { lemma: 'Александр', gloss: 'Alexander', gender: 'm', animate: true, forms: { nom: 'Александр', gen: 'Александра', dat: 'Александру', acc: 'Александра', inst: 'Александром', prep: 'Александре' } },
];

for (const e of GAZETTEER) for (const [cas, form] of Object.entries(e.forms) as Array<[Case, string]>) add(form, e.lemma, e.gloss, e.gender, e.animate, cas);

export function gazetteerCandidates(key: string): Candidate[] {
  return INDEX.get(key) ?? [];
}
