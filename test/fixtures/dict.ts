/**
 * In-memory dictionary fixture for package D's own tests. Never fetches —
 * builds a small `AnalysisContext` (readings/lexeme/character) straight from
 * hand-written `DictLexeme`s, generating `FormReading`s from each lexeme's
 * paradigm with the SAME feature-code convention `src/morphology/dictionary.ts`
 * decodes (see the table in `src/dictionary/types.ts`). Covers ~40 words:
 * every content word of the Crime and Punishment opening sentence, plus a
 * few extra nouns/verbs/adjectives used only by the rule-guesser and
 * context-rule tests (numeral government, animacy, motion verbs…).
 */
import type { Case, Gender } from '../../src/database/types';
import type { AnalysisContext } from '../../src/morphology/dictionary';
import type { DictLexeme, FormReading, Paradigm } from '../../src/dictionary/types';

function plain(s: string): string {
  return s.replace(/'/g, '');
}
function accentIndexOf(s: string): number {
  const idx = s.indexOf("'");
  return idx <= 0 ? -1 : idx - 1;
}
function looseKeyLocal(s: string): string {
  return plain(s).toLowerCase().replace(/ё/g, 'е');
}

const LEXEMES: DictLexeme[] = [
  // ---- Crime and Punishment opening paragraph -----------------------------------
  {
    id: 'noun:начало', lemma: 'начало', acc: 'начало', pos: 'noun', gloss: 'the beginning', senses: ['the beginning, start'], gender: 'n', animacy: 'inan', rank: 900,
    paradigm: { kind: 'noun', sg: { nom: 'начало', gen: 'начала', dat: 'началу', acc: 'начало', inst: 'началом', prep: 'начале' }, pl: { nom: 'начала', gen: 'начал', dat: 'началам' } },
  },
  {
    id: 'noun:июль', lemma: 'июль', acc: 'июль', pos: 'noun', gloss: 'July', senses: ['the month of July'], gender: 'm', animacy: 'inan', rank: 3000,
    paradigm: { kind: 'noun', sg: { nom: 'июль', gen: 'июля', dat: 'июлю', acc: 'июль', inst: 'июлем', prep: 'июле' }, sg_only: true },
  },
  {
    id: 'noun:время', lemma: 'время', acc: 'время', pos: 'noun', gloss: 'time', senses: ['time; a period of time'], gender: 'n', animacy: 'inan', rank: 200,
    paradigm: { kind: 'noun', sg: { nom: 'время', gen: 'времени', dat: 'времени', acc: 'время', inst: 'временем', prep: 'времени' } },
  },
  {
    id: 'adjective:жаркий', lemma: 'жаркий', acc: 'жаркий', pos: 'adjective', gloss: 'hot', senses: ['hot (weather)'], rank: 2500,
    paradigm: { kind: 'adjective', m: { nom: 'жаркий', gen: 'жаркого', dat: 'жаркому', inst: 'жарким', prep: 'жарком' }, f: { nom: 'жаркая', gen: 'жаркой', dat: 'жаркой', acc: 'жаркую', inst: 'жаркой', prep: 'жаркой' }, n: { nom: 'жаркое', gen: 'жаркого', dat: 'жаркому', acc: 'жаркое', inst: 'жарким', prep: 'жарком' }, pl: { nom: 'жаркие', gen: 'жарких', dat: 'жарким', inst: 'жаркими', prep: 'жарких' } },
  },
  {
    id: 'adjective:молодой', lemma: 'молодой', acc: 'молодой', pos: 'adjective', gloss: 'young', senses: ['young'], rank: 400,
    paradigm: { kind: 'adjective', m: { nom: 'молодой', gen: 'молодого', dat: 'молодому', inst: 'молодым', prep: 'молодом' }, f: { nom: 'молодая', gen: 'молодой', dat: 'молодой', acc: 'молодую', inst: 'молодой', prep: 'молодой' }, n: { nom: 'молодое', gen: 'молодого', dat: 'молодому', acc: 'молодое', inst: 'молодым', prep: 'молодом' }, pl: { nom: 'молодые', gen: 'молодых', dat: 'молодым', inst: 'молодыми', prep: 'молодых' } },
  },
  {
    id: 'noun:человек', lemma: 'человек', acc: 'человек', pos: 'noun', gloss: 'person, man', senses: ['a person; a man'], gender: 'm', animacy: 'anim', rank: 50,
    paradigm: { kind: 'noun', sg: { nom: 'человек', gen: 'человека', dat: 'человеку', acc: 'человека', inst: 'человеком', prep: 'человеке' }, pl: { nom: 'люди', gen: 'людей', dat: 'людям', acc: 'людей', inst: 'людьми', prep: 'людях' } },
  },
  {
    id: 'verb:выходить', lemma: 'выходить', acc: 'выходить', pos: 'verb', gloss: 'to go out, exit', senses: ['to go/come out'], aspect: 'imperfective', partner: 'verb:выйти', rank: 1200, extra: { motion: 'multi' },
    paradigm: { kind: 'verb', infinitive: 'выходить', past: { m: 'выходил', f: 'выходила', n: 'выходило', pl: 'выходили' }, presfut: { sg1: 'выхожу', sg2: 'выходишь', sg3: 'выходит', pl1: 'выходим', pl2: 'выходите', pl3: 'выходят' } },
  },
  {
    id: 'verb:выйти', lemma: 'выйти', acc: 'выйти', pos: 'verb', gloss: 'to go out, exit', senses: ['to go/come out (once, completed)'], aspect: 'perfective', partner: 'verb:выходить', rank: 800, extra: { motion: 'uni' },
    paradigm: { kind: 'verb', infinitive: 'выйти', past: { m: 'вышел', f: 'вышла', n: 'вышло', pl: 'вышли' }, presfut: { sg1: 'выйду', sg2: 'выйдешь', sg3: 'выйдет', pl1: 'выйдем', pl2: 'выйдете', pl3: 'выйдут' } },
  },
  {
    id: 'noun:каморка', lemma: 'каморка', acc: 'каморка', pos: 'noun', gloss: 'a tiny room, cubbyhole', senses: ['a cramped little room'], gender: 'f', animacy: 'inan', rank: 4000,
    paradigm: { kind: 'noun', sg: { nom: 'каморка', gen: 'каморки', dat: 'каморке', acc: 'каморку', inst: 'каморкой', prep: 'каморке' } },
  },
  {
    id: 'verb:нанимать', lemma: 'нанимать', acc: 'нанимать', pos: 'verb', gloss: 'to rent, hire', senses: ['to rent (lodgings); to hire'], aspect: 'imperfective', partner: 'verb:нанять', rank: 1800,
    paradigm: { kind: 'verb', infinitive: 'нанимать', past: { m: 'нанимал', f: 'нанимала', n: 'нанимало', pl: 'нанимали' }, presfut: { sg1: 'нанимаю', sg2: 'нанимаешь', sg3: 'нанимает', pl1: 'нанимаем', pl2: 'нанимаете', pl3: 'нанимают' } },
  },
  {
    id: 'verb:нанять', lemma: 'нанять', acc: 'нанять', pos: 'verb', gloss: 'to rent, hire', senses: ['to rent (lodgings, once); to hire'], aspect: 'perfective', partner: 'verb:нанимать', rank: 2200,
    paradigm: { kind: 'verb', infinitive: 'нанять', past: { m: 'нанял', f: 'наняла', n: 'наняло', pl: 'наняли' } },
  },
  {
    id: 'noun:жилец', lemma: 'жилец', acc: 'жилец', pos: 'noun', gloss: 'lodger, tenant', senses: ['a lodger, tenant'], gender: 'm', animacy: 'anim', rank: 5000,
    paradigm: { kind: 'noun', sg: { nom: 'жилец', gen: 'жильца', dat: 'жильцу', acc: 'жильца', inst: 'жильцом', prep: 'жильце' }, pl: { nom: 'жильцы', gen: 'жильцов', dat: 'жильцам', acc: 'жильцов' } },
  },
  {
    id: 'noun:переулок', lemma: 'переулок', acc: 'переулок', pos: 'noun', gloss: 'lane, side street', senses: ['a lane, side street'], gender: 'm', animacy: 'inan', rank: 3500,
    paradigm: { kind: 'noun', sg: { nom: 'переулок', gen: 'переулка', dat: 'переулку', acc: 'переулок', inst: 'переулком', prep: 'переулке' } },
  },
  {
    id: 'noun:улица', lemma: 'улица', acc: 'улица', pos: 'noun', gloss: 'street', senses: ['a street'], gender: 'f', animacy: 'inan', rank: 300,
    paradigm: { kind: 'noun', sg: { nom: 'улица', gen: 'улицы', dat: 'улице', acc: 'улицу', inst: 'улицей', prep: 'улице' } },
  },
  {
    id: 'adjective:медленный', lemma: 'медленный', acc: 'медленный', pos: 'adjective', gloss: 'slow', senses: ['slow'], rank: 2000,
    paradigm: { kind: 'adjective', m: { nom: 'медленный', gen: 'медленного' }, f: { nom: 'медленная' }, n: { nom: 'медленное' }, pl: { nom: 'медленные' } },
  },
  {
    id: 'noun:нерешимость', lemma: 'нерешимость', acc: 'нерешимость', pos: 'noun', gloss: 'indecision, irresolution', senses: ['indecision'], gender: 'f', animacy: 'inan', rank: 9000,
    paradigm: { kind: 'noun', sg: { nom: 'нерешимость', gen: 'нерешимости', dat: 'нерешимости', acc: 'нерешимость', inst: 'нерешимостью', prep: 'нерешимости' }, sg_only: true },
  },
  {
    id: 'verb:отправляться', lemma: 'отправляться', acc: 'отправляться', pos: 'verb', gloss: 'to set off, set out', senses: ['to set off, head off'], aspect: 'imperfective', partner: 'verb:отправиться', reflexive: true, rank: 2800,
    paradigm: { kind: 'verb', infinitive: 'отправляться', past: { m: 'отправлялся', f: 'отправлялась', n: 'отправлялось', pl: 'отправлялись' } },
  },
  {
    id: 'verb:отправиться', lemma: 'отправиться', acc: 'отправиться', pos: 'verb', gloss: 'to set off, set out', senses: ['to set off, head off (once)'], aspect: 'perfective', partner: 'verb:отправляться', reflexive: true, rank: 2400,
    paradigm: { kind: 'verb', infinitive: 'отправиться', past: { m: 'отправился', f: 'отправилась', n: 'отправилось', pl: 'отправились' }, presfut: { sg1: 'отправлюсь', sg2: 'отправишься', sg3: 'отправится', pl1: 'отправимся', pl2: 'отправитесь', pl3: 'отправятся' } },
  },
  {
    id: 'noun:мост', lemma: 'мост', acc: 'мост', pos: 'noun', gloss: 'bridge', senses: ['a bridge'], gender: 'm', animacy: 'inan', rank: 1500,
    paradigm: { kind: 'noun', sg: { nom: 'мост', gen: 'моста', dat: 'мосту', acc: 'мост', inst: 'мостом', prep: 'мосте' } },
  },
  {
    id: 'noun:вечер', lemma: 'вечер', acc: 'вечер', pos: 'noun', gloss: 'evening', senses: ['the evening'], gender: 'm', animacy: 'inan', rank: 700,
    paradigm: { kind: 'noun', sg: { nom: 'вечер', gen: 'вечера', dat: 'вечеру', acc: 'вечер', inst: 'вечером', prep: 'вечере' } },
  },

  // ---- extra words for the rule-guesser and context-rule tests -----------------
  {
    id: 'verb:говорить', lemma: 'говорить', acc: 'говорить', pos: 'verb', gloss: 'to speak, say', senses: ['to speak, talk, say'], aspect: 'imperfective', partner: 'verb:сказать', rank: 60,
    paradigm: { kind: 'verb', infinitive: 'говорить', past: { m: 'говорил', f: 'говорила', n: 'говорило', pl: 'говорили' }, presfut: { sg1: 'говорю', sg2: 'говоришь', sg3: 'говорит', pl1: 'говорим', pl2: 'говорите', pl3: 'говорят' } },
  },
  {
    id: 'verb:сказать', lemma: 'сказать', acc: 'сказать', pos: 'verb', gloss: 'to say', senses: ['to say (once)'], aspect: 'perfective', partner: 'verb:говорить', rank: 65,
    paradigm: { kind: 'verb', infinitive: 'сказать', past: { m: 'сказал', f: 'сказала', n: 'сказало', pl: 'сказали' } },
  },
  {
    id: 'verb:делать', lemma: 'делать', acc: 'делать', pos: 'verb', gloss: 'to do, make', senses: ['to do, make'], aspect: 'imperfective', partner: 'verb:сделать', rank: 70,
    paradigm: { kind: 'verb', infinitive: 'делать', past: { m: 'делал', f: 'делала', n: 'делало', pl: 'делали' }, presfut: { sg1: 'делаю', sg2: 'делаешь', sg3: 'делает', pl1: 'делаем', pl2: 'делаете', pl3: 'делают' } },
  },
  {
    id: 'verb:сделать', lemma: 'сделать', acc: 'сделать', pos: 'verb', gloss: 'to do, make', senses: ['to do, make (once, completed)'], aspect: 'perfective', partner: 'verb:делать', rank: 75,
    paradigm: { kind: 'verb', infinitive: 'сделать', past: { m: 'сделал', f: 'сделала', n: 'сделало', pl: 'сделали' } },
  },
  {
    id: 'verb:читать', lemma: 'читать', acc: 'читать', pos: 'verb', gloss: 'to read', senses: ['to read'], aspect: 'imperfective', partner: 'verb:прочитать', rank: 500,
    paradigm: { kind: 'verb', infinitive: 'читать', past: { m: 'читал', f: 'читала', n: 'читало', pl: 'читали' }, presfut: { sg1: 'читаю', sg2: 'читаешь', sg3: 'читает', pl1: 'читаем', pl2: 'читаете', pl3: 'читают' } },
  },
  {
    id: 'adjective:быстрый', lemma: 'быстрый', acc: 'быстрый', pos: 'adjective', gloss: 'fast, quick', senses: ['fast, quick'], rank: 700,
    paradigm: { kind: 'adjective', m: { nom: 'быстрый', gen: 'быстрого' }, f: { nom: 'быстрая' }, n: { nom: 'быстрое' }, pl: { nom: 'быстрые' } },
  },
  {
    id: 'noun:стол', lemma: 'стол', acc: 'стол', pos: 'noun', gloss: 'table', senses: ['a table'], gender: 'm', animacy: 'inan', rank: 900,
    paradigm: { kind: 'noun', sg: { nom: 'стол', gen: 'стола', dat: 'столу', acc: 'стол', inst: 'столом', prep: 'столе' } },
  },
  {
    id: 'noun:коробка', lemma: 'коробка', acc: 'коробка', pos: 'noun', gloss: 'box', senses: ['a box'], gender: 'f', animacy: 'inan', rank: 3200,
    paradigm: { kind: 'noun', sg: { nom: 'коробка', gen: 'коробки', dat: 'коробке', acc: 'коробку', inst: 'коробкой', prep: 'коробке' } },
  },
  {
    id: 'verb:писать', lemma: 'писать', acc: 'писать', pos: 'verb', gloss: 'to write', senses: ['to write'], aspect: 'imperfective', partner: 'verb:написать', rank: 220,
    paradigm: { kind: 'verb', infinitive: 'писать', past: { m: 'писал', f: 'писала', n: 'писало', pl: 'писали' }, presfut: { sg1: 'пишу', sg2: 'пишешь', sg3: 'пишет', pl1: 'пишем', pl2: 'пишете', pl3: 'пишут' } },
  },
  {
    id: 'noun:книга', lemma: 'книга', acc: 'книга', pos: 'noun', gloss: 'book', senses: ['a book'], gender: 'f', animacy: 'inan', rank: 150,
    paradigm: { kind: 'noun', sg: { nom: 'книга', gen: 'книги', dat: 'книге', acc: 'книгу', inst: 'книгой', prep: 'книге' }, pl: { nom: 'книги', gen: 'книг', dat: 'книгам' } },
  },
  {
    id: 'noun:друг', lemma: 'друг', acc: 'друг', pos: 'noun', gloss: 'friend', senses: ['a (close) friend'], gender: 'm', animacy: 'anim', rank: 250,
    paradigm: { kind: 'noun', sg: { nom: 'друг', gen: 'друга', dat: 'другу', acc: 'друга', inst: 'другом', prep: 'друге' }, pl: { nom: 'друзья', gen: 'друзей', dat: 'друзьям' } },
  },
  {
    id: 'verb:видеть', lemma: 'видеть', acc: 'видеть', pos: 'verb', gloss: 'to see', senses: ['to see'], aspect: 'imperfective', partner: 'verb:увидеть', rank: 90,
    paradigm: { kind: 'verb', infinitive: 'видеть', past: { m: 'видел', f: 'видела', n: 'видело', pl: 'видели' }, presfut: { sg1: 'вижу', sg2: 'видишь', sg3: 'видит', pl1: 'видим', pl2: 'видите', pl3: 'видят' } },
  },
  {
    id: 'verb:думать', lemma: 'думать', acc: 'думать', pos: 'verb', gloss: 'to think', senses: ['to think'], aspect: 'imperfective', partner: 'verb:подумать', rank: 130,
    paradigm: { kind: 'verb', infinitive: 'думать', past: { m: 'думал', f: 'думала', n: 'думало', pl: 'думали' }, presfut: { sg1: 'думаю', sg2: 'думаешь', sg3: 'думает', pl1: 'думаем', pl2: 'думаете', pl3: 'думают' } },
  },
  {
    id: 'verb:знать', lemma: 'знать', acc: 'знать', pos: 'verb', gloss: 'to know', senses: ['to know'], aspect: 'imperfective', rank: 45,
    paradigm: { kind: 'verb', infinitive: 'знать', past: { m: 'знал', f: 'знала', n: 'знало', pl: 'знали' }, presfut: { sg1: 'знаю', sg2: 'знаешь', sg3: 'знает', pl1: 'знаем', pl2: 'знаете', pl3: 'знают' } },
  },
  {
    id: 'verb:слышать', lemma: 'слышать', acc: 'слышать', pos: 'verb', gloss: 'to hear', senses: ['to hear'], aspect: 'imperfective', partner: 'verb:услышать', rank: 260,
    paradigm: { kind: 'verb', infinitive: 'слышать', past: { m: 'слышал', f: 'слышала', n: 'слышало', pl: 'слышали' }, presfut: { sg1: 'слышу', sg2: 'слышишь', sg3: 'слышит', pl1: 'слышим', pl2: 'слышите', pl3: 'слышат' } },
  },
  {
    id: 'verb:хотеть', lemma: 'хотеть', acc: 'хотеть', pos: 'verb', gloss: 'to want', senses: ['to want, wish'], aspect: 'imperfective', rank: 30,
    paradigm: { kind: 'verb', infinitive: 'хотеть', past: { m: 'хотел', f: 'хотела', n: 'хотело', pl: 'хотели' }, presfut: { sg1: 'хочу', sg2: 'хочешь', sg3: 'хочет', pl1: 'хотим', pl2: 'хотите', pl3: 'хотят' } },
  },
  {
    id: 'adverb:дома', lemma: 'дома', acc: 'дома', pos: 'adverb', gloss: 'at home', senses: ['at home'], rank: 10,
  },
  {
    id: 'noun:хозяйка', lemma: 'хозяйка', acc: 'хозяйка', pos: 'noun', gloss: 'landlady, mistress of the house', senses: ['the landlady, mistress of the house'], gender: 'f', animacy: 'anim', rank: 600,
    paradigm: { kind: 'noun', sg: { nom: 'хозяйка', gen: 'хозяйки', dat: 'хозяйке', acc: 'хозяйку', inst: 'хозяйкой', prep: 'хозяйке' } },
  },
  {
    id: 'noun:кухня', lemma: 'кухня', acc: 'кухня', pos: 'noun', gloss: 'kitchen', senses: ['a kitchen'], gender: 'f', animacy: 'inan', rank: 1100,
    paradigm: { kind: 'noun', sg: { nom: 'кухня', gen: 'кухни', dat: 'кухне', acc: 'кухню', inst: 'кухней', prep: 'кухне' } },
  },
  {
    id: 'noun:ощущение', lemma: 'ощущение', acc: 'ощущение', pos: 'noun', gloss: 'feeling, sensation', senses: ['a feeling, sensation'], gender: 'n', animacy: 'inan', rank: 1600,
    paradigm: { kind: 'noun', sg: { nom: 'ощущение', gen: 'ощущения', dat: 'ощущению', acc: 'ощущение', inst: 'ощущением', prep: 'ощущении' } },
  },
  {
    id: 'noun:нога', lemma: 'нога', acc: 'нога', pos: 'noun', gloss: 'leg, foot', senses: ['a leg, foot'], gender: 'f', animacy: 'inan', rank: 350,
    paradigm: { kind: 'noun', sg: { nom: 'нога', gen: 'ноги', dat: 'ноге', acc: 'ногу', inst: 'ногой', prep: 'ноге' } },
  },
  {
    id: 'noun:встреча', lemma: 'встреча', acc: 'встреча', pos: 'noun', gloss: 'meeting, encounter', senses: ['a meeting, encounter'], gender: 'f', animacy: 'inan', rank: 800,
    paradigm: { kind: 'noun', sg: { nom: 'встреча', gen: 'встречи', dat: 'встрече', acc: 'встречу', inst: 'встречей', prep: 'встрече' }, pl: { nom: 'встречи', gen: 'встреч' } },
  },
  {
    id: 'noun:дом', lemma: 'дом', acc: 'дом', pos: 'noun', gloss: 'house, home', senses: ['a house, home'], gender: 'm', animacy: 'inan', rank: 100,
    paradigm: { kind: 'noun', sg: { nom: 'дом', gen: 'дома', dat: 'дому', acc: 'дом', inst: 'домом', prep: 'доме' } },
  },
  {
    id: 'verb:идти', lemma: 'идти', acc: 'идти', pos: 'verb', gloss: 'to go, walk (on foot, one direction)', senses: ['to be going, walking (one direction, in progress)'], aspect: 'imperfective', partner: 'verb:пойти', rank: 40, extra: { motion: 'uni' },
    paradigm: { kind: 'verb', infinitive: 'идти', past: { m: 'шёл', f: 'шла', n: 'шло', pl: 'шли' }, presfut: { sg1: 'иду', sg2: 'идёшь', sg3: 'идёт', pl1: 'идём', pl2: 'идёте', pl3: 'идут' } },
  },
  {
    id: 'verb:ходить', lemma: 'ходить', acc: 'ходить', pos: 'verb', gloss: 'to go, walk (on foot, habitually / round trip)', senses: ['to walk, go (habitually, or there and back)'], aspect: 'imperfective', partner: 'verb:идти', rank: 300, extra: { motion: 'multi' },
    paradigm: { kind: 'verb', infinitive: 'ходить', past: { m: 'ходил', f: 'ходила', n: 'ходило', pl: 'ходили' }, presfut: { sg1: 'хожу', sg2: 'ходишь', sg3: 'ходит', pl1: 'ходим', pl2: 'ходите', pl3: 'ходят' } },
  },
  {
    id: 'noun:город', lemma: 'город', acc: 'город', pos: 'noun', gloss: 'city, town', senses: ['a city, town'], gender: 'm', animacy: 'inan', rank: 120,
    paradigm: { kind: 'noun', sg: { nom: 'город', gen: 'города', dat: 'городу', acc: 'город', inst: 'городом', prep: 'городе' } },
  },
];

function pushReading(map: Map<string, FormReading[]>, form: string, reading: FormReading) {
  const key = looseKeyLocal(form);
  const list = map.get(key) ?? [];
  list.push(reading);
  map.set(key, list);
}

function fromParadigm(map: Map<string, FormReading[]>, lex: DictLexeme, p: Paradigm) {
  if (p.kind === 'noun') {
    if (p.sg) for (const [c, form] of Object.entries(p.sg)) if (form) pushReading(map, form, [lex.id, `n:sg:${c}`, accentIndexOf(form)]);
    if (p.pl) for (const [c, form] of Object.entries(p.pl)) if (form) pushReading(map, form, [lex.id, `n:pl:${c}`, accentIndexOf(form)]);
  } else if (p.kind === 'adjective') {
    for (const g of ['m', 'f', 'n'] as const) {
      const col = p[g];
      if (col) for (const [c, form] of Object.entries(col)) if (form) pushReading(map, form, [lex.id, `a:${g}:sg:${c}`, accentIndexOf(form)]);
    }
    if (p.pl) for (const [c, form] of Object.entries(p.pl)) if (form) pushReading(map, form, [lex.id, `a:pl:${c}`, accentIndexOf(form)]);
    if (p.short) for (const [g, form] of Object.entries(p.short)) if (form) pushReading(map, form, [lex.id, g === 'pl' ? 'a:short:pl' : `a:short:${g}`, accentIndexOf(form)]);
    if (p.comparative) pushReading(map, p.comparative, [lex.id, 'a:comp', accentIndexOf(p.comparative)]);
    if (p.superlative) pushReading(map, p.superlative, [lex.id, 'a:sup:m:sg:nom', accentIndexOf(p.superlative)]);
  } else if (p.kind === 'verb') {
    pushReading(map, p.infinitive, [lex.id, 'v:inf', accentIndexOf(p.infinitive)]);
    if (p.imperative) for (const [n, form] of Object.entries(p.imperative)) if (form) pushReading(map, form, [lex.id, `v:imp:${n}`, accentIndexOf(form)]);
    if (p.past) for (const [g, form] of Object.entries(p.past)) if (form) pushReading(map, form, [lex.id, g === 'pl' ? 'v:past:pl' : `v:past:${g}`, accentIndexOf(form)]);
    if (p.presfut) for (const [tag, form] of Object.entries(p.presfut)) if (form) pushReading(map, form, [lex.id, `v:pf:${tag}`, accentIndexOf(form)]);
  }
}

const LEXEME_MAP = new Map<string, DictLexeme>(LEXEMES.map((l) => [l.id, l]));
const READINGS = new Map<string, FormReading[]>();
for (const lex of LEXEMES) {
  if (lex.paradigm) fromParadigm(READINGS, lex, lex.paradigm);
  // indeclinable lexemes (adverbs etc.) carry no Paradigm — matches package B's real
  // "citation-form fallback" for dump rows with an empty paradigm (see coordinator's notes).
  else pushReading(READINGS, lex.lemma, [lex.id, 'x', accentIndexOf(lex.acc)]);
}

/** Small names index fixture: Раскольников's household in the opening chapter. */
const CHARACTERS: Record<string, { canonical: string; kind: string }> = {
  раскольников: { canonical: 'Родион Романович Раскольников', kind: 'surname' },
  родион: { canonical: 'Родион Романович Раскольников', kind: 'given' },
  родя: { canonical: 'Родион Романович Раскольников', kind: 'diminutive' },
  роденька: { canonical: 'Родион Романович Раскольников', kind: 'diminutive' },
  разумихин: { canonical: 'Дмитрий Прокофьич Разумихин', kind: 'surname' },
};

export function fixtureContext(): AnalysisContext {
  return {
    readings(key: string): FormReading[] {
      return READINGS.get(key) ?? [];
    },
    lexeme(id: string): DictLexeme | undefined {
      return LEXEME_MAP.get(id);
    },
    character(form: string) {
      return CHARACTERS[looseKeyLocal(form)];
    },
  };
}

export { LEXEMES };
export type { Case, Gender };
