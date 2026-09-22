import { describe, expect, it } from 'vitest';
import { analyzeWord } from '../src/morphology/analyze';
import { looseKey } from '../src/tokenizer/cyrillic';
import { fixtureContext } from './fixtures/dict';

const ctx = fixtureContext();
const analyze = (surface: string) => analyzeWord(surface, looseKey(surface), ctx);

describe('dictionary bridge: candidatesFor-equivalent segmentation', () => {
  it('каморки: genitive singular of каморка, stem/ending segmented', () => {
    const cands = analyze('каморки');
    const c = cands.find((x) => x.lemma === 'каморка')!;
    expect(c).toBeDefined();
    expect(c.source).toBe('dictionary');
    expect(c.confidence).toBe(1);
    expect(c.features).toMatchObject({ case: 'gen', number: 'sg' });
    expect(c.morphemes.map((m) => m.text).join('')).toBe('каморки');
    expect(c.morphemes.find((m) => m.role === 'ending')?.text).toBe('и');
  });

  it('человек / люди: suppletive plural segments as stem \'\' with a note', () => {
    const lyudi = analyze('людей');
    const c = lyudi.find((x) => x.lemma === 'человек')!;
    expect(c).toBeDefined();
    expect(c.features).toMatchObject({ case: 'gen', number: 'pl' });
    expect(c.notes.join(' ')).toMatch(/suppletive/);
  });

  it('-ся postfix is segmented separately from the ending', () => {
    const c = analyze('отправился').find((x) => x.lemma === 'отправиться')!;
    expect(c).toBeDefined();
    expect(c.morphemes.find((m) => m.role === 'postfix')?.text).toBe('ся');
    expect(c.features.reflexive).toBe(true);
    expect(c.features.aspect).toBe('perfective');
  });

  it('negative: an unknown key produces no dictionary candidate', () => {
    const cands = analyze('бельведериться');
    expect(cands.some((c) => c.source === 'dictionary' && !c.key.startsWith('?'))).toBe(false);
  });
});

describe('closed-class: pronouns', () => {
  it('своей: reflexive possessive свой, feminine genitive/dative/prepositional (identical forms)', () => {
    const cands = analyze('своей');
    const c = cands.find((x) => x.lemma === 'свой')!;
    expect(c).toBeDefined();
    expect(c.pos).toBe('pronoun');
    expect(c.features.pronoun_type).toBe('possessive');
    expect(['gen', 'dat', 'prep']).toContain(c.features.case);
    expect(c.features.gender).toBe('f');
  });

  it('которую: relative pronoun который, accusative feminine singular', () => {
    const cands = analyze('которую');
    const c = cands.find((x) => x.lemma === 'который')!;
    expect(c).toBeDefined();
    expect(c.features).toMatchObject({ case: 'acc', gender: 'f', number: 'sg' });
    // pronoun_type is 'relative' (not 'demonstrative'): который stands in for an
    // already-established antecedent, so it must be treated as a standalone pronoun by
    // syntax/context.ts's headNounAfter, not skipped as a modifier (coordinator regression).
    expect(c.features.pronoun_type).toBe('relative');
  });

  it('него: н-form of он used after a preposition, notes explain why', () => {
    const c = analyze('него').find((x) => x.lemma === 'он')!;
    expect(c).toBeDefined();
    expect(c.notes.join(' ')).toMatch(/after a preposition/);
  });

  it('нею: archaic instrumental н-form of она (19th-century texts), alongside ней', () => {
    const c = analyze('нею').find((x) => x.lemma === 'она')!;
    expect(c).toBeDefined();
    expect(c.features).toMatchObject({ case: 'inst', gender: 'f' });
  });

  it('negative: a made-up pronoun-shaped word is not in the closed class', () => {
    const cands = analyze('онтоко');
    expect(cands.every((c) => c.pos !== 'pronoun')).toBe(true);
  });
});

describe('closed-class: prepositions govern a case', () => {
  it('к: always dative', () => {
    const cands = analyze('к');
    expect(cands).toHaveLength(1);
    expect(cands[0]!.features.case).toBe('dat');
  });
  it('в: two senses (prepositional / accusative), most common (location) first', () => {
    const cands = analyze('в');
    expect(cands.map((c) => c.features.case)).toEqual(['prep', 'acc']);
  });
  it('negative: a plain noun is not treated as a preposition', () => {
    const cands = analyze('стол');
    expect(cands.every((c) => c.pos !== 'preposition')).toBe(true);
  });
});

describe('closed-class: numerals govern the counted noun (own reading only here)', () => {
  it('пять: nominative, notes say it governs the genitive plural', () => {
    const c = analyze('пять').find((x) => x.pos === 'numeral')!;
    expect(c).toBeDefined();
    expect(c.notes.join(' ')).toMatch(/genitive plural/);
  });
  it('два / две: gender-marked, governs genitive singular', () => {
    expect(analyze('два').find((x) => x.pos === 'numeral')!.features.gender).toBe('m');
    expect(analyze('две').find((x) => x.pos === 'numeral')!.features.gender).toBe('f');
  });
  it('negative: два is not read as a numeral outside its table (sanity: ловок is not a numeral)', () => {
    expect(analyze('ловок').every((c) => c.pos !== 'numeral')).toBe(true);
  });
});

describe('rule generation: participles', () => {
  it('positive: говорящий — present active participle of the known verb говорить, confidence 0.85', () => {
    const c = analyze('говорящий')[0]!;
    expect(c.lemma).toBe('говорить');
    expect(c.features.verb_form).toBe('participle-act-pres');
    expect(c.confidence).toBe(0.85);
    expect(c.source).toBe('rule');
    expect(c.key.startsWith('?')).toBe(false);
  });
  it('negative: an unknown-base participle-shaped word is a low-confidence guess', () => {
    const c = analyze('пельментящий')[0]!;
    expect(c.key.startsWith('?')).toBe(true);
    expect(c.confidence).toBeLessThanOrEqual(0.55);
  });
  it('positive: сделанный — passive past participle of the known verb сделать', () => {
    const c = analyze('сделанный')[0]!;
    expect(c.lemma).toBe('сделать');
    expect(c.features.verb_form).toBe('participle-pass-past');
    expect(c.confidence).toBe(0.85);
  });
  it('positive: читаемый — present passive participle of the known verb читать', () => {
    const c = analyze('читаемый')[0]!;
    expect(c.lemma).toBe('читать');
    expect(c.features.verb_form).toBe('participle-pass-pres');
  });
  it('positive: отправляющийся — reflexive present active participle of отправляться, not отправлять', () => {
    const c = analyze('отправляющийся')[0]!;
    expect(c.lemma).toBe('отправляться');
    expect(c.features).toMatchObject({ verb_form: 'participle-act-pres', reflexive: true, gender: 'm', number: 'sg', case: 'nom' });
    expect(c.confidence).toBe(0.85);
    expect(c.morphemes.some((m) => m.role === 'postfix' && m.text === 'ся')).toBe(true);
  });
  it('positive: отправившийся — reflexive past active participle of отправиться, not отправить', () => {
    const c = analyze('отправившийся')[0]!;
    expect(c.lemma).toBe('отправиться');
    expect(c.features).toMatchObject({ verb_form: 'participle-act-past', reflexive: true });
  });
  it('negative: a reflexive-shaped participle with no known reflexive base is a low-confidence guess', () => {
    const c = analyze('пузырящийся')[0]!;
    expect(c.confidence).toBeLessThanOrEqual(0.55);
  });
});

describe('rule generation: gerunds', () => {
  it('positive: сделав — past gerund of the known verb сделать', () => {
    const c = analyze('сделав')[0]!;
    expect(c.lemma).toBe('сделать');
    expect(c.features.verb_form).toBe('gerund-past');
    expect(c.confidence).toBe(0.85);
  });
  it('positive: говоря — present gerund of the known verb говорить', () => {
    const c = analyze('говоря')[0]!;
    expect(c.lemma).toBe('говорить');
    expect(c.features.verb_form).toBe('gerund-pres');
  });
  it('negative: an unknown-base gerund-shaped word falls back to the general guess', () => {
    const cands = analyze('бузамши');
    expect(cands[0]!.confidence).toBeLessThanOrEqual(0.55);
  });
  it('positive: думая/зная/слыша — present gerunds of -ать/-еть/-ать verbs whose stem already carries the thematic vowel', () => {
    expect(analyze('думая')[0]!.lemma).toBe('думать');
    expect(analyze('зная')[0]!.lemma).toBe('знать');
    expect(analyze('слыша')[0]!.lemma).toBe('слышать');
  });
  it('positive: отправляясь — reflexive present gerund of отправляться, not отправлять', () => {
    const c = analyze('отправляясь')[0]!;
    expect(c.lemma).toBe('отправляться');
    expect(c.features).toMatchObject({ verb_form: 'gerund-pres', reflexive: true });
  });
  it('positive: отправившись — reflexive past gerund of отправиться, not отправить', () => {
    const c = analyze('отправившись')[0]!;
    expect(c.lemma).toBe('отправиться');
    expect(c.features).toMatchObject({ verb_form: 'gerund-past', reflexive: true });
    expect(c.confidence).toBe(0.85);
  });
  it('negative: a reflexive-shaped gerund with no known reflexive base is a low-confidence guess', () => {
    const c = analyze('пузырясь')[0]!;
    expect(c.confidence).toBeLessThanOrEqual(0.55);
  });
});

describe('rule generation: comparative / superlative / -о adverb', () => {
  it('positive: быстрее — comparative of the known adjective быстрый', () => {
    const c = analyze('быстрее')[0]!;
    expect(c.lemma).toBe('быстрый');
    expect(c.features.degree).toBe('comparative');
    expect(c.confidence).toBe(0.85);
  });
  it('negative: an unknown-base comparative-shaped word is a guess', () => {
    const c = analyze('пузырее')[0]!;
    expect(c.confidence).toBeLessThanOrEqual(0.55);
  });
  it('positive: быстрейший — superlative of the known adjective быстрый', () => {
    const c = analyze('быстрейший')[0]!;
    expect(c.lemma).toBe('быстрый');
    expect(c.features.degree).toBe('superlative');
  });
  it('positive: медленно — -о adverb of the known adjective медленный', () => {
    const c = analyze('медленно')[0]!;
    expect(c.lemma).toBe('медленный');
    expect(c.pos).toBe('adverb');
    expect(c.confidence).toBe(0.85);
  });
  it('negative: an unknown-base -о adverb-shaped word is a low-confidence guess', () => {
    const c = analyze('пузырно')[0]!;
    expect(c.confidence).toBeLessThan(0.85);
  });
});

describe('rule generation: prefixed verbs', () => {
  it('positive: переписать — prefix пере- + the known verb писать, confidence 0.6', () => {
    const c = analyze('переписать')[0]!;
    expect(c.pos).toBe('verb');
    expect(c.lemma).toBe('переписать');
    expect(c.confidence).toBe(0.6);
    expect(c.morphemes.find((m) => m.role === 'prefix')?.text).toBe('пере');
    expect(c.notes.join(' ')).toMatch(/prefixed verb/);
  });
  it('negative: an unrelated prefix-shaped word with no known base word falls to the general guess', () => {
    const c = analyze('перепузырить')[0]!;
    expect(c.confidence).toBeLessThanOrEqual(0.55);
  });
});

describe('rule generation: diminutives', () => {
  it('positive: коробочка — diminutive of the known noun коробка', () => {
    const c = analyze('коробочка')[0]!;
    expect(c.lemma).toBe('коробка');
    expect(c.gloss).toMatch(/little/);
    expect(c.confidence).toBe(0.75);
  });
  it('positive: столик — diminutive of the known noun стол', () => {
    const c = analyze('столик')[0]!;
    expect(c.lemma).toBe('стол');
    expect(c.confidence).toBe(0.75);
  });
  it('negative: an unknown-base diminutive-shaped word is a guess', () => {
    const c = analyze('пузырочка')[0]!;
    expect(c.confidence).toBeLessThan(0.75);
  });
});

describe('rule generation: -овать/-евать present gerunds (presfut pl3 fallback)', () => {
  it('positive: чувствуя — present gerund of чувствовать, recovered via the presfut 3pl stem чувству-', () => {
    const c = analyze('чувствуя')[0]!;
    expect(c.lemma).toBe('чувствовать');
    expect(c.features.verb_form).toBe('gerund-pres');
    expect(c.confidence).toBe(0.8);
  });
  it('negative: an -овать-shaped gerund with no known base is a low-confidence guess', () => {
    const c = analyze('пузырствуя')[0]!;
    expect(c.confidence).toBeLessThanOrEqual(0.55);
  });
});

describe('rule generation: short passive participles used predicatively (сказано, решено)', () => {
  it('positive: сказано — short neuter passive participle of the known verb сказать', () => {
    const c = analyze('сказано')[0]!;
    expect(c.lemma).toBe('сказать');
    expect(c.features).toMatchObject({ verb_form: 'participle-short', gender: 'n', degree: 'short', voice: 'passive' });
    expect(c.confidence).toBe(0.85);
    expect(c.gloss).toMatch(/it is\/was/);
  });
  it('positive: решено — short neuter passive participle of the known verb решить (-ено ending)', () => {
    const c = analyze('решено')[0]!;
    expect(c.lemma).toBe('решить');
    expect(c.features.verb_form).toBe('participle-short');
  });
  it('negative: an unknown-base short-participle-shaped word falls to a lower-confidence guess', () => {
    const c = analyze('пузырено')[0]!;
    expect(c.confidence).toBeLessThan(0.85);
  });
});

describe('past tense, including reflexive (удалось, вернулся)', () => {
  it('positive: удалось — reflexive past neuter of the known verb удаться, not a generic guess', () => {
    const c = analyze('удалось')[0]!;
    expect(c.lemma).toBe('удаться');
    expect(c.features).toMatchObject({ verb_form: 'past', gender: 'n', reflexive: true });
    expect(c.confidence).toBe(0.85);
  });
  it('negative: an unknown plain-past-shaped word (no reflexive postfix) is a lower-confidence guess', () => {
    const c = analyze('пузырило')[0]!;
    expect(c.confidence).toBeLessThanOrEqual(0.55);
  });
  it('negative: an unknown reflexive-past-shaped word (-лся/-лось) is a lower-confidence guess', () => {
    const c = analyze('пузырился')[0]!;
    expect(c.confidence).toBeLessThanOrEqual(0.55);
    expect(analyze('пузырилось')[0]!.confidence).toBeLessThanOrEqual(0.55);
  });
});

describe('rule generation: adjectives with no dictionary paradigm, declined by rule', () => {
  it('positive: прежнего — genitive singular of the known but paradigm-less adjective прежний', () => {
    const c = analyze('прежнего')[0]!;
    expect(c.lemma).toBe('прежний');
    expect(c.features).toMatchObject({ case: 'gen', gender: 'm' });
    expect(c.confidence).toBe(0.9);
    expect(c.notes.join(' ')).toMatch(/declined by rule/);
  });
  it('positive: прежних — genitive/prepositional plural of прежний', () => {
    const c = analyze('прежних')[0]!;
    expect(c.lemma).toBe('прежний');
    expect(c.features.number).toBe('pl');
  });
  it('negative: an unknown adjective-shaped word is not declined by this rule', () => {
    const c = analyze('пузырчатого')[0]!;
    expect(c.confidence).toBeLessThan(0.9);
  });
});

describe('closed-class numerals: оба/обе and oblique forms', () => {
  it('positive: оба (m) / обе (f) and their oblique forms (обоих/обеих/обоим/обеим/обоими/обеими)', () => {
    expect(analyze('оба').find((x) => x.pos === 'numeral')!.features.gender).toBe('m');
    expect(analyze('обе').find((x) => x.pos === 'numeral')!.features.gender).toBe('f');
    expect(analyze('обоих').find((x) => x.pos === 'numeral' && x.lemma === 'оба')).toBeDefined();
    expect(analyze('обеих').find((x) => x.pos === 'numeral' && x.lemma === 'обе')).toBeDefined();
    expect(analyze('обоим').find((x) => x.pos === 'numeral')!.features.case).toBe('dat');
    expect(analyze('обеими').find((x) => x.pos === 'numeral')!.features.case).toBe('inst');
  });
  it('positive: oblique cardinals десяти/двадцати/пяти/сорока/ста/трёх/семи', () => {
    for (const w of ['десяти', 'двадцати', 'пяти', 'сорока', 'ста', 'трёх', 'семи']) {
      const c = analyze(w).find((x) => x.pos === 'numeral');
      expect(c, w).toBeDefined();
      expect(c!.features.case).not.toBe('nom');
    }
  });
  it('positive: двухсот — oblique (genitive) of двести', () => {
    const c = analyze('двухсот').find((x) => x.pos === 'numeral')!;
    expect(c).toBeDefined();
    expect(c.lemma).toBe('двести');
    expect(c.features.case).toBe('gen');
  });
  it('positive: collective oblique двоих/троих/четверых', () => {
    for (const w of ['двоих', 'троих', 'четверых']) {
      const c = analyze(w).find((x) => x.pos === 'numeral');
      expect(c, w).toBeDefined();
      expect(c!.features.case).not.toBe('nom');
    }
  });
});

describe('archaic/dialect closed-class aliases', () => {
  it('positive: чрез = через (governs accusative)', () => {
    const c = analyze('чрез').find((x) => x.pos === 'preposition')!;
    expect(c).toBeDefined();
    expect(c.features.case).toBe('acc');
  });
  it('positive: ежели/коли = если (subordinating conjunction)', () => {
    expect(analyze('ежели').find((x) => x.pos === 'conjunction')!.lemma).toBe('если');
    expect(analyze('коли').find((x) => x.pos === 'conjunction')!.lemma).toBe('если');
  });
  it('positive: дабы = чтобы', () => {
    expect(analyze('дабы').find((x) => x.pos === 'conjunction')!.lemma).toBe('чтобы');
  });
  it('positive: сей/сия/сие decline like этот, pronoun_type demonstrative', () => {
    const c = analyze('сего').find((x) => x.lemma === 'сей')!;
    expect(c).toBeDefined();
    expect(c.features).toMatchObject({ case: 'gen', gender: 'm' });
  });
  it('positive: оный declines like a regular hard adjective', () => {
    const c = analyze('оного').find((x) => x.lemma === 'оный')!;
    expect(c).toBeDefined();
    expect(c.features.case).toBe('gen');
  });
  it('positive: по-прежнему/по-моему/по-русски resolve without a "?" key (sentence-level coverage counts them as resolved)', () => {
    for (const w of ['по-прежнему', 'по-моему', 'по-русски']) {
      const c = analyze(w)[0]!;
      expect(c.pos).toBe('adverb');
      expect(c.key.startsWith('?')).toBe(false);
      expect(c.confidence).toBe(0.95);
    }
  });
});

describe('rule generation: abstract -ость nouns (outrank the -ти infinitive guess)', () => {
  it('positive: смелости (unknown) — genitive/dative/prepositional singular of an abstract -ость noun, not a verb', () => {
    const cands = analyze('смелости');
    expect(cands[0]!.pos).toBe('noun');
    expect(cands[0]!.lemma).toBe('смелость');
    expect(cands[0]!.confidence).toBe(0.55);
    expect(['gen', 'dat', 'prep']).toContain(cands[0]!.features.case);
    expect(cands.some((c) => c.pos === 'verb')).toBe(false);
  });
  it('positive: смелостью — instrumental singular of an abstract -ость noun', () => {
    const c = analyze('смелостью')[0]!;
    expect(c.pos).toBe('noun');
    expect(c.features).toMatchObject({ case: 'inst', gender: 'f', number: 'sg' });
  });
  it('positive: смелость (bare) — nominative singular of an abstract -ость noun', () => {
    const c = analyze('смелость')[0]!;
    expect(c.pos).toBe('noun');
    expect(c.features.case).toBe('nom');
  });
  it('positive: везти (real с/з/й-stem, unknown) still gets the -ти infinitive guess', () => {
    const c = analyze('везти')[0]!;
    expect(c.pos).toBe('verb');
    expect(c.features.verb_form).toBe('infinitive');
  });
  it('negative: an unknown -ти word whose stem does NOT end in с/з/й is not guessed as an infinitive', () => {
    const cands = analyze('болти');
    expect(cands[0]!.pos).not.toBe('verb');
  });
});

describe('rule generation: ending-pattern fallback (last resort)', () => {
  it('an entirely unknown word gets a "?" key and confidence <= 0.55, no stress', () => {
    const c = analyze('глокаякуздра')[0]!;
    expect(c.key.startsWith('?')).toBe(true);
    expect(c.confidence).toBeLessThanOrEqual(0.55);
    expect(c.features.stress).toBeUndefined();
  });
});

describe('rule generation: archaic instrumental -ою/-ею (= -ой/-ей)', () => {
  it('positive: каморкою — 19th-century spelling of the dictionary form каморкой, confidence 0.95', () => {
    const c = analyze('каморкою')[0]!;
    expect(c.lemma).toBe('каморка');
    expect(c.features).toMatchObject({ case: 'inst', gender: 'f', number: 'sg' });
    expect(c.confidence).toBe(0.95);
    expect(c.notes.join(' ')).toMatch(/older instrumental ending -ою/);
  });
  it('positive: одною resolves to the numeral один, not a made-up "одный"', () => {
    const c = analyze('одною')[0]!;
    expect(c.lemma).toBe('один');
    expect(c.pos).toBe('numeral');
    expect(c.features).toMatchObject({ case: 'inst', gender: 'f' });
  });
  it('negative: a word ending in -ою with no -ой counterpart anywhere falls through to the ordinary guess chain', () => {
    const c = analyze('пузырою')[0]!;
    expect(c.confidence).toBeLessThan(0.95);
  });
});

describe('rule generation: possessive adjectives -ин/-ов/-ев', () => {
  it('positive: хозяйкиной — possessive adjective from the known noun хозяйка, confidence 0.8', () => {
    const cands = analyze('хозяйкиной');
    const c = cands.find((x) => x.pos === 'adjective' && x.lemma === 'хозяйка')!;
    expect(c).toBeDefined();
    expect(c.confidence).toBe(0.8);
    expect(['gen', 'dat', 'inst', 'prep']).toContain(c.features.case);
    expect(c.features.gender).toBe('f');
  });
  it('negative: a capitalised -ин word (a surname-shaped guess) is kept below the proper-name fallback threshold', () => {
    const c = analyze('Жилин')[0]!;
    if (c.pos === 'adjective') expect(c.confidence).toBeLessThan(0.6);
  });
});

describe('rule generation: indefinite pronouns off full paradigms', () => {
  it('positive: какое-то — indefinite какой, neuter singular', () => {
    const c = analyze('какое-то').find((x) => x.lemma === 'какой-то')!;
    expect(c).toBeDefined();
    expect(c.pos).toBe('pronoun');
    expect(c.features).toMatchObject({ gender: 'n', number: 'sg' });
    expect(c.features.pronoun_type).toBe('indefinite');
  });
  it('positive: чьего-то — indefinite чей, declined', () => {
    const c = analyze('чьего-то').find((x) => x.lemma === 'чей-то')!;
    expect(c).toBeDefined();
    expect(c.features.case).toBe('gen');
  });
  it('positive: где-то — indefinite adverb, not a pronoun', () => {
    const c = analyze('где-то')[0]!;
    expect(c.pos).toBe('adverb');
  });
});

describe('closed-class: быть (буду/был/есть/будь) and the analytic future construction', () => {
  it('positive: буду/будешь/будет resolve to быть, confidence 1, future tense', () => {
    const c = analyze('будет').find((x) => x.lemma === 'быть')!;
    expect(c).toBeDefined();
    expect(c.confidence).toBe(1);
    expect(c.features).toMatchObject({ tense: 'future', person: 3, number: 'sg' });
  });
  it('positive: был/была/было/были resolve to быть, past tense with gender/number', () => {
    const c = analyze('была').find((x) => x.lemma === 'быть')!;
    expect(c.features).toMatchObject({ verb_form: 'past', gender: 'f' });
  });
  it('positive: есть is the invariant present of быть', () => {
    const c = analyze('есть').find((x) => x.lemma === 'быть')!;
    expect(c).toBeDefined();
    expect(c.confidence).toBe(1);
  });
  it('positive: будь/будьте are imperatives of быть', () => {
    expect(analyze('будь').find((x) => x.lemma === 'быть')!.features.verb_form).toBe('imperative');
    expect(analyze('будьте').find((x) => x.lemma === 'быть')!.features.number).toBe('pl');
  });
});

describe('rule generation: archaic -ти infinitives (folk-tale spelling of -ть)', () => {
  it('positive: говорити — older spelling of the known verb говорить, confidence 0.9', () => {
    const c = analyze('говорити')[0]!;
    expect(c.lemma).toBe('говорить');
    expect(c.features.verb_form).toBe('infinitive');
    expect(c.confidence).toBe(0.9);
    expect(c.notes.join(' ')).toMatch(/older infinitive ending -ти/);
  });
  it('negative: an unknown-base -ти word with no -ть counterpart falls through to the ordinary guess chain', () => {
    const c = analyze('пузырити')[0]!;
    expect(c.confidence).toBeLessThan(0.9);
  });
});

describe('rule generation: hyphenated colloquial particles (-то/-таки/-ка/-с/-де/-тка)', () => {
  it('positive: книгу-то — the base книгу analysed normally, -то attached as a clitic', () => {
    const c = analyze('книгу-то')[0]!;
    expect(c.lemma).toBe('книга');
    expect(c.features.case).toBe('acc');
    expect(c.morphemes.some((m) => m.role === 'clitic')).toBe(true);
    expect(c.notes.join(' ')).toMatch(/-то: colloquial emphatic particle/);
  });
  it('positive: an unknown base + -таки still gets the clitic attached, base falls to the ordinary guess', () => {
    const c = analyze('пришёл-таки')[0]!;
    expect(c.morphemes.some((m) => m.role === 'clitic' && m.text === '-таки')).toBe(true);
  });
});

describe('rule generation: по- manner adverbs (по-своему, по-русски, по-прежнему)', () => {
  it('positive: по-своему — по- + dative свой, adverb of manner, confidence 0.95', () => {
    const c = analyze('по-своему')[0]!;
    expect(c.pos).toBe('adverb');
    expect(c.confidence).toBe(0.95);
  });
  it('positive: по-русски — по- + -ски, adverb of manner', () => {
    const c = analyze('по-русски')[0]!;
    expect(c.pos).toBe('adverb');
    expect(c.confidence).toBe(0.95);
  });
  it('negative: a по- word that is neither -ски nor a known dative form is not force-guessed as this adverb pattern', () => {
    const c = analyze('по-зеленому')[0];
    // "зеленому" is not in the PO_DATIVE_ADVERBS shortlist, so this specific rule must not fire
    expect(c?.confidence).not.toBe(0.95);
  });
});

describe('names index', () => {
  it('Раскольников resolves to a proper candidate with a register note', () => {
    const c = analyze('Раскольников').find((x) => x.pos === 'proper')!;
    expect(c).toBeDefined();
    expect(c.lemma).toBe('Родион Романович Раскольников');
    expect(c.confidence).toBe(0.95);
  });
  it('Родя (diminutive) resolves to the same canonical name with an intimate-register note', () => {
    const c = analyze('Родя').find((x) => x.pos === 'proper')!;
    expect(c).toBeDefined();
    expect(c.notes.join(' ')).toMatch(/intimate/);
  });
});

export {};
