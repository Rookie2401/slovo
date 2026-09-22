import { describe, expect, it } from 'vitest';
import { analyzeSentence } from '../src/syntax';
import { chosen } from '../src/morphology/sentence';
import { tokenize } from '../src/tokenizer/cyrillic';
import { fixtureContext } from './fixtures/dict';

const ctx = fixtureContext();
function run(s: string) {
  return analyzeSentence(
    tokenize(s).map((t) => ({ text: t.text, kind: t.kind })),
    ctx,
  );
}
const byText = (a: ReturnType<typeof run>, text: string) => a.tokens.find((t) => t.text === text)!;

describe('context: preposition governs the noun phrase case', () => {
  it('positive: в + a time noun takes the accusative (в жаркое время)', () => {
    const a = run('Он пришёл в жаркое время.');
    const vremya = byText(a, 'время');
    expect(chosen(vremya)!.features.case).toBe('acc');
    expect(vremya.notes.join(' ')).toMatch(/point in time|governed/);
  });
  it('negative: в + an ordinary noun with no adjacent motion verb defaults to prepositional (в переулке)', () => {
    const a = run('Дом стоял в переулке.');
    expect(chosen(byText(a, 'переулке'))!.features.case).toBe('prep');
  });
  it('positive: под + a time noun takes the accusative too (под вечер), not под\'s default instrumental — and the noun is never nominative', () => {
    const a = run('Он пришёл под вечер.');
    expect(chosen(byText(a, 'под'))!.features.case).toBe('acc');
    const vecher = chosen(byText(a, 'вечер'))!;
    expect(vecher.features.case).toBe('acc');
    expect(vecher.features.case).not.toBe('nom');
  });
  it('positive (general "drop nominative after a preposition"): через + a nom/acc-syncretic noun is read as accusative, never nominative', () => {
    const a = run('Он прошёл через переулок.');
    const perelok = chosen(byText(a, 'переулок'))!;
    expect(perelok.features.case).toBe('acc');
    expect(perelok.features.case).not.toBe('nom');
  });
  it('к always governs the dative', () => {
    const a = run('Он шёл к мосту.');
    expect(chosen(byText(a, 'мосту'))!.features.case).toBe('dat');
    expect(chosen(byText(a, 'к'))!.features.case).toBe('dat');
  });
  it('из always governs the genitive', () => {
    const a = run('Он вышел из дома.');
    expect(chosen(byText(a, 'дома'))!.features.case).toBe('gen');
  });
});

describe('context: adjective/possessive-pronoun agreement with the head noun', () => {
  it('positive: своей resolves to genitive feminine because it agrees with the following genitive feminine noun', () => {
    const a = run('Он вышел из своей каморки.');
    const svoey = byText(a, 'своей');
    expect(chosen(svoey)!.features).toMatchObject({ case: 'gen', gender: 'f' });
  });
  it('negative: a possessive pronoun with no head noun after it keeps its default (nominative) reading', () => {
    const a = run('Это моё.');
    const moyo = byText(a, 'моё');
    expect(chosen(moyo)!.features.case).toBe('nom');
  });
  it('positive (backward agreement): молодого дома — дома is a noun/adverb homograph (дом gen sg vs "at home"); the preceding genitive adjective settles it as the noun', () => {
    const a = run('Он вышел из молодого дома.');
    const doma = chosen(byText(a, 'дома'))!;
    expect(doma.pos).toBe('noun');
    expect(doma.features).toMatchObject({ case: 'gen', gender: 'm' });
    expect(byText(a, 'дома').notes.join(' ')).toMatch(/agrees with the preceding adjective|governed by the preposition/);
  });
  it('negative: дома with no preceding adjective defaults to the adverb "at home"', () => {
    const a = run('Он был дома.');
    expect(chosen(byText(a, 'дома'))!.pos).toBe('adverb');
  });
});

describe('context: всё vs все — the surface (not the folded key) decides', () => {
  it('positive: всё (with ё) is neuter singular "everything"', () => {
    const a = run('Он всё сказал.');
    expect(chosen(byText(a, 'всё'))!.features).toMatchObject({ gender: 'n', number: 'sg' });
  });
  it('negative: все (no ё) is plural "everyone", not neuter singular', () => {
    const a = run('Все пришли.');
    expect(chosen(byText(a, 'Все'))!.features.number).toBe('pl');
    expect(chosen(byText(a, 'Все'))!.features.gender).not.toBe('n');
  });
});

describe('context: что — conjunction after a verb of speech, pronoun otherwise', () => {
  it('positive: он сказал, что… — что is the conjunction "that"', () => {
    const a = run('Он сказал, что она читала книгу.');
    expect(chosen(byText(a, 'что'))!.pos).toBe('conjunction');
  });
  it('negative: sentence-initial Что is the interrogative pronoun', () => {
    const a = run('Что он читал?');
    expect(chosen(byText(a, 'Что'))!.pos).toBe('pronoun');
  });
});

describe('context: negation + genitive object', () => {
  it('positive: не видел книги — the object shifts to the genitive', () => {
    const a = run('Он не видел книги.');
    expect(chosen(byText(a, 'книги'))!.features.case).toBe('gen');
    expect(byText(a, 'книги').notes.join(' ')).toMatch(/negated/);
  });
  it('negative: without не, the object stays accusative', () => {
    const a = run('Он видел книгу.');
    expect(chosen(byText(a, 'книгу'))!.features.case).toBe('acc');
  });
});

describe('context: a preposition\'s displayed case follows its resolved object', () => {
  it('positive: за ногу — за shows accusative (its object\'s resolved case), not its default instrumental', () => {
    const a = run('Он укусил его за ногу.');
    expect(chosen(byText(a, 'за'))!.features.case).toBe('acc');
    expect(chosen(byText(a, 'ногу'))!.features.case).toBe('acc');
  });
});

describe('context: verb government (some verbs take gen/dat/inst, not the default accusative)', () => {
  it('positive: избегнул встречи — избегнуть governs the genitive', () => {
    const a = run('Он избегнул встречи.');
    const vstrechi = chosen(byText(a, 'встречи'))!;
    expect(vstrechi.features.case).toBe('gen');
    expect(byText(a, 'встречи').notes.join(' ')).toMatch(/избегнул/);
  });
  it('positive: помог другу — dative government', () => {
    const a = run('Он помог другу.');
    expect(chosen(byText(a, 'другу'))!.features.case).toBe('dat');
  });
  it('negative: видел книгу — видеть is a plain accusative verb, not in any government table', () => {
    const a = run('Он видел книгу.');
    expect(chosen(byText(a, 'книгу'))!.features.case).toBe('acc');
  });
});

describe('clause: the избегнул sentence — a guessed past-tense verb still serves as the predicate', () => {
  it('positive: Он избегнул встречи. — он is subject, избегнул is predicate, agreement holds despite the verb being a guess', () => {
    const a = run('Он избегнул встречи.');
    expect(a.clause.subject).toBe(byText(a, 'Он').i);
    expect(a.clause.predicate).toBe(byText(a, 'избегнул').i);
    expect(a.clause.agreement!.matches).toBe(true);
    expect(chosen(byText(a, 'избегнул'))!.features.aspect).toBe('perfective');
    expect(chosen(byText(a, 'избегнул'))!.features.gender).toBe('m');
  });
});

describe('context: numeral government', () => {
  it('positive: пять книг — genitive plural', () => {
    const a = run('Он купил пять книг.');
    expect(chosen(byText(a, 'книг'))!.features).toMatchObject({ case: 'gen', number: 'pl' });
  });
  it('positive: две книги — genitive singular (2-4 rule)', () => {
    const a = run('Он купил две книги.');
    expect(chosen(byText(a, 'книги'))!.features).toMatchObject({ case: 'gen', number: 'sg' });
  });
  it('negative: один книга does not trigger genitive government (один agrees like an adjective)', () => {
    const a = run('Он купил одну книгу.');
    expect(chosen(byText(a, 'книгу'))!.features.case).toBe('acc');
  });
});

describe('context: capitalised non-initial word with no reading -> proper', () => {
  it('positive: an unknown capitalised word mid-sentence is read as a name', () => {
    const a = run('Он встретил Пузырькова вчера.');
    const c = chosen(byText(a, 'Пузырькова'))!;
    expect(c.pos).toBe('proper');
    expect(c.confidence).toBe(0.7);
  });
  it('negative: a capitalised sentence-initial word with a real dictionary reading is not overridden', () => {
    const a = run('Дом стоял в переулке.');
    expect(chosen(byText(a, 'Дом'))!.pos).not.toBe('proper');
  });
  it('positive: case is guessed from a governing verb, and the lemma is reconstructed to a plausible nominative (Пузырькова after ждать -> gen, Пузырьков)', () => {
    const a = run('Он ждал Пузырькова.');
    const c = chosen(byText(a, 'Пузырькова'))!;
    expect(c.pos).toBe('proper');
    expect(c.key.startsWith('?')).toBe(false);
    expect(c.features.case).toBe('gen');
    expect(c.lemma).toBe('Пузырьков');
  });
  it('positive: sentence-initial capitalised word with no other reading is still read as a name', () => {
    const a = run('Пузырьков вышел.');
    expect(chosen(byText(a, 'Пузырьков'))!.pos).toBe('proper');
  });
  it('positive: an unresolved -е prepositional name offers both a feminine -а and a masculine bare-stem nominative candidate', () => {
    const a = run('Он был в Пузырькове.');
    const c = byText(a, 'Пузырькове');
    const lemmas = c.candidates.filter((x) => x.pos === 'proper').map((x) => x.lemma);
    expect(lemmas).toContain('Пузырькова');
    expect(lemmas).toContain('Пузырьков');
    expect(chosen(c)!.lemma).toBe('Пузырькова'); // feminine -а tried first (Москве -> Москва)
  });
});

describe('closed-class gazetteer: places and historical figures', () => {
  it('positive: в Москве — Москва, prepositional, confidence 0.95, feminine', () => {
    const a = run('Он жил в Москве.');
    const c = chosen(byText(a, 'Москве'))!;
    expect(c.lemma).toBe('Москва');
    expect(c.pos).toBe('proper');
    expect(c.confidence).toBe(0.95);
    expect(c.features).toMatchObject({ case: 'prep', gender: 'f' });
  });
  it('positive: из Петербурга — Петербург, genitive, masculine', () => {
    const a = run('Он приехал из Петербурга.');
    const c = chosen(byText(a, 'Петербурга'))!;
    expect(c.lemma).toBe('Петербург');
    expect(c.features).toMatchObject({ case: 'gen', gender: 'm' });
  });
  it('positive: с Кутузовым — Кутузов, instrumental (surname declension: -ым, not -ом)', () => {
    const a = run('Он говорил с Кутузовым.');
    const c = chosen(byText(a, 'Кутузовым'))!;
    expect(c.lemma).toBe('Кутузов');
    expect(c.features.case).toBe('inst');
  });
  it('negative: a name not in the gazetteer still falls through to the general capitalisation fallback', () => {
    const a = run('Он жил в Урюпинске.');
    const c = chosen(byText(a, 'Урюпинске'))!;
    expect(c.pos).toBe('proper');
    expect(c.confidence).toBe(0.7); // fallback confidence, not the gazetteer's 0.95
  });
});

describe('context: nominative subject vs accusative object (animacy + word order)', () => {
  it('an inanimate noun before the verb reads as subject; the same lemma after the verb reads as object', () => {
    const a = run('Дом видел человек.');
    // "Дом" (inanimate, nom=acc) before "видел" -> subject by word order
    expect(chosen(byText(a, 'Дом'))!.features.case).toBe('nom');
  });
});

describe('clause: coordinated predicates sharing one subject (и + finite verb)', () => {
  it('positive: человек вышел и отправился — the second predicate inherits человек as subject and its own agreement is checked', () => {
    const a = run('Человек вышел и отправился.');
    const chelovekIdx = byText(a, 'Человек').i;
    expect(a.clauses.length).toBe(2);
    expect(a.clauses[0]!.subject).toBe(chelovekIdx);
    expect(a.clauses[0]!.agreement!.matches).toBe(true);
    // the second clause (отправился) has no nominative noun of its own in its range, but
    // inherits the subject established before the "и" and gets its own agreement check
    expect(a.clauses[1]!.subject).toBe(chelovekIdx);
    expect(a.clauses[1]!.agreement!.target).toBe(chelovekIdx);
    expect(a.clauses[1]!.agreement!.matches).toBe(true);
    expect(a.clauses[1]!.notes.join(' ')).toMatch(/inherited/);
  });
  it('negative: subject inheritance only follows a coordinating "и", not a subordinating breaker (хотя)', () => {
    const a = run('Человек читал, хотя говорил.');
    // "хотя" cuts the clause but is not coordination: the second clause must NOT borrow человек
    expect(a.clauses.length).toBe(2);
    expect(a.clauses[1]!.subject).toBeUndefined();
    expect(a.clauses[1]!.agreement!.target).toBeNull();
  });
});

describe('clause: the main predicate is the finite verb, not a trailing infinitive complement', () => {
  it('positive: человек хотел читать — predicate is хотел (finite), not читать (infinitive); agreement checked against хотел', () => {
    const a = run('Человек хотел читать.');
    const hotelIdx = byText(a, 'хотел').i;
    const chitatIdx = byText(a, 'читать').i;
    expect(a.clause.predicate).toBe(hotelIdx);
    expect(a.clause.predicate).not.toBe(chitatIdx);
    expect(a.clause.subject).toBe(byText(a, 'Человек').i);
    expect(a.clause.agreement!.matches).toBe(true);
  });
});

describe('context: чем — comparative conjunction after a comparative, instrumental что otherwise', () => {
  it('positive: быстрее, чем она — чем is the conjunction, not the instrumental pronoun', () => {
    const a = run('Он читал быстрее, чем она.');
    expect(chosen(byText(a, 'чем'))!.pos).toBe('conjunction');
  });
  it('negative: чем with no preceding comparative stays the instrumental pronoun', () => {
    const a = run('Чем он занят?');
    expect(chosen(byText(a, 'Чем'))!.pos).toBe('pronoun');
  });
  it('positive: the analytic comparative более … чем also resolves чем as the conjunction', () => {
    const a = run('Он читал более быстро, чем она.');
    expect(chosen(byText(a, 'чем'))!.pos).toBe('conjunction');
  });
});

describe('the Crime and Punishment opening sentence: end-to-end', () => {
  const s = 'В начале июля, в чрезвычайно жаркое время, под вечер, один молодой человек вышел из своей каморки, которую нанимал от жильцов в С -- м переулке, на улицу и медленно, как бы в нерешимости, отправился к К -- ну мосту.';
  const a = run(s);
  const c = (text: string) => chosen(byText(a, text))!;

  it('в начале: prepositional singular of начало, governed by в', () => {
    expect(c('начале').features).toMatchObject({ case: 'prep', number: 'sg' });
    expect(c('начале').lemma).toBe('начало');
  });
  it('июля: genitive singular', () => {
    expect(c('июля').features).toMatchObject({ case: 'gen', number: 'sg' });
  });
  it('под вечер: под + accusative (time), вечер is never nominative', () => {
    expect(c('под').features.case).toBe('acc');
    expect(c('вечер').features.case).toBe('acc');
  });
  it('жаркое время: agreement, neuter singular accusative (в + time noun)', () => {
    expect(c('жаркое').features).toMatchObject({ gender: 'n', number: 'sg', case: 'acc' });
    expect(c('время').features).toMatchObject({ gender: 'n', number: 'sg', case: 'acc' });
  });
  it('один молодой человек: nominative subject', () => {
    expect(c('человек').features.case).toBe('nom');
    const clause = a.clauses.find((cl) => cl.subject === byText(a, 'человек').i);
    expect(clause).toBeDefined();
  });
  it('вышел: past masculine, perfective, agrees with человек', () => {
    expect(c('вышел').features).toMatchObject({ verb_form: 'past', gender: 'm', aspect: 'perfective' });
    const clause = a.clauses.find((cl) => cl.subject === byText(a, 'человек').i)!;
    expect(clause.agreement!.matches).toBe(true);
    expect(clause.agreement!.expected.gender).toBe('m');
  });
  it('из своей каморки: genitive throughout', () => {
    expect(c('из').features.case).toBe('gen');
    expect(c('своей').features).toMatchObject({ case: 'gen', gender: 'f' });
    expect(c('каморки').features).toMatchObject({ case: 'gen', number: 'sg' });
  });
  it('которую: relative pronoun, accusative feminine singular', () => {
    expect(c('которую').pos).toBe('pronoun');
    expect(c('которую').features).toMatchObject({ case: 'acc', gender: 'f', number: 'sg' });
    expect(c('которую').features.pronoun_type).toBe('relative');
  });
  it('the relative clause которую нанимал от жильцов… is split off from the main clause', () => {
    const kotoruyu = byText(a, 'которую').i;
    const inRelative = a.clauses.find((cl) => cl.range && kotoruyu >= cl.range[0] && kotoruyu < cl.range[1]);
    const inMain = a.clauses.find((cl) => cl.subject === byText(a, 'человек').i);
    expect(inRelative).toBeDefined();
    expect(inRelative).not.toBe(inMain);
  });
  it('отправился: coordinated with вышел via и — inherits человек as subject, own agreement checked', () => {
    const chelovekIdx = byText(a, 'человек').i;
    const otpravilsyaClause = a.clauses.find((cl) => cl.predicate === byText(a, 'отправился').i)!;
    expect(otpravilsyaClause).toBeDefined();
    expect(otpravilsyaClause.subject).toBe(chelovekIdx);
    expect(otpravilsyaClause.agreement!.matches).toBe(true);
  });
  it('к мосту: dative, governed by к', () => {
    expect(c('к').features.case).toBe('dat');
    expect(c('мосту').features.case).toBe('dat');
  });
  it('отправился: reflexive, perfective, past', () => {
    expect(c('отправился').features).toMatchObject({ reflexive: true, aspect: 'perfective', verb_form: 'past' });
  });
});

export {};
