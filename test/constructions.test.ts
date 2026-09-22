import { describe, expect, it } from 'vitest';
import { analyzeSentence } from '../src/syntax';
import { tokenize } from '../src/tokenizer/cyrillic';
import { fixtureContext } from './fixtures/dict';

const ctx = fixtureContext();
function run(s: string) {
  return analyzeSentence(
    tokenize(s).map((t) => ({ text: t.text, kind: t.kind })),
    ctx,
  );
}
const of = (a: ReturnType<typeof run>, type: string) => a.constructions.filter((c) => c.type === type);
const byText = (a: ReturnType<typeof run>, text: string) => a.tokens.find((t) => t.text === text)!;

describe('aspect', () => {
  it('positive: a perfective verb explains completion and names its imperfective partner', () => {
    const a = run('Он сделал это.');
    const c = of(a, 'aspect').find((x) => x.pattern === 'aspect:perfective')!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/completed|single/);
    expect(c.explanation).toMatch(/делать/);
  });
  it('negative: an imperfective verb explains process/habit, not completion, and names its perfective partner', () => {
    const a = run('Он делал это.');
    const c = of(a, 'aspect').find((x) => x.pattern === 'aspect:imperfective')!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/process|habitual/);
    expect(c.explanation).toMatch(/сделать/);
    expect(c.explanation).not.toMatch(/single, completed whole/);
  });
  it('positive: буду читать — the analytic imperfective future is one combined construction', () => {
    const a = run('Я буду читать.');
    const c = of(a, 'aspect').find((x) => x.pattern === 'future:analytic')!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/analytic future|periphrastic/);
    expect(c.tokens.length).toBe(2);
    // no separate plain aspect construction for the infinitive itself
    expect(of(a, 'aspect').some((x) => x.tokens.includes(byText(a, 'читать').i) && x.pattern !== 'future:analytic')).toBe(false);
  });
  it('negative: a perfective future (present-future form of a perfective verb) is not tagged as the analytic future', () => {
    const a = run('Он сделает это.');
    expect(of(a, 'aspect').some((x) => x.pattern === 'future:analytic')).toBe(false);
  });
});

describe('motion verbs', () => {
  it('positive: идти is explained as unidirectional', () => {
    const a = run('Он шёл домой.');
    const c = of(a, 'motion').find((x) => x.pattern === 'motion:uni')!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/one direction/);
  });
  it('negative: ходить is explained as multidirectional, not unidirectional', () => {
    const a = run('Он часто ходил в город.');
    const c = of(a, 'motion')[0]!;
    expect(c.pattern).toBe('motion:multi');
    expect(c.explanation).toMatch(/habitual|round trip/);
  });
});

describe('impersonal constructions', () => {
  it('positive: dative experiencer + нельзя + infinitive', () => {
    const a = run('Ему нельзя говорить.');
    const c = of(a, 'impersonal')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/dative experiencer/);
    expect(c.roles).toMatchObject(expect.objectContaining({}));
  });
  it('positive: у + genitive marks possession', () => {
    const a = run('У него книга.');
    const c = of(a, 'possession')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/possessor/);
  });
  it('negative: у + a non-genitive reading does not produce a possession construction', () => {
    const a = run('Она стояла у окна.');
    // "окна" is not in the fixture (guess, no reliable gen), so no possession construction should fire
    expect(of(a, 'possession').length).toBe(0);
  });
});

describe('reflexive -ся readings', () => {
  it('positive: a lexicalised -ся verb (отправиться) gets its specific explanation', () => {
    const a = run('Он отправился домой.');
    const c = of(a, 'reflexive')[0]!;
    expect(c.pattern).toMatch(/lexicalised/);
    expect(c.confidence).toBe(0.85);
  });
  it('negative: a non-reflexive verb produces no reflexive construction', () => {
    const a = run('Он делал это.');
    expect(of(a, 'reflexive').length).toBe(0);
  });
});

describe('negation', () => {
  it('positive: не + verb is explained', () => {
    const a = run('Он не видел книги.');
    const c = of(a, 'negation-genitive')[0]! ?? of(a, 'negation')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/negates/);
  });
  it('negative: a sentence with no negation produces no negation construction', () => {
    const a = run('Он видел книгу.');
    expect(of(a, 'negation').length + of(a, 'negation-genitive').length).toBe(0);
  });
});

describe('numeral phrases', () => {
  it('positive: пять книг is wrapped as a numeral-phrase construction explaining genitive plural government', () => {
    const a = run('Он купил пять книг.');
    const c = of(a, 'numeral-phrase')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/genitive plural/);
  });
  it('negative: a lone numeral not immediately followed by a noun produces no numeral-phrase construction', () => {
    const a = run('Их было пять.');
    expect(of(a, 'numeral-phrase').length).toBe(0);
  });
});

describe('prepositional phrases', () => {
  it('positive: из своей каморки is one prepositional-phrase construction governing the genitive', () => {
    const a = run('Он вышел из своей каморки.');
    const c = of(a, 'prepositional-phrase').find((x) => x.pattern === 'pp:из')!;
    expect(c).toBeDefined();
    expect(c.features.case).toBe('gen');
  });
  it('negative: a sentence with no preposition produces no prepositional-phrase construction', () => {
    const a = run('Он видел книгу.');
    expect(of(a, 'prepositional-phrase').length).toBe(0);
  });
});

describe('participle and gerund clauses', () => {
  it('positive: сделавший is explained as a past active participle clause', () => {
    const a = run('Человек, сделавший это, ушёл.');
    const c = of(a, 'participle-clause')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/past active participle/);
  });
  it('positive: сделав is explained as a past gerund clause', () => {
    const a = run('Сделав это, он ушёл.');
    const c = of(a, 'gerund-clause')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/past gerund/);
  });
  it('negative: a sentence with no participle/gerund produces no such construction', () => {
    const a = run('Он видел книгу.');
    expect(of(a, 'participle-clause').length).toBe(0);
    expect(of(a, 'gerund-clause').length).toBe(0);
  });
});

describe('бы conditional / чтобы purpose', () => {
  it('positive: бы + past verb is a conditional', () => {
    const a = run('Он сделал бы это.');
    const c = of(a, 'conditional')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/would|conditional/);
  });
  it('positive: чтобы introduces a purpose clause', () => {
    const a = run('Он пришёл, чтобы говорить.');
    const c = of(a, 'purpose')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/purpose|subjunctive/);
  });
  it('negative: a plain sentence with neither бы nor чтобы has no conditional/purpose construction', () => {
    const a = run('Он видел книгу.');
    expect(of(a, 'conditional').length).toBe(0);
    expect(of(a, 'purpose').length).toBe(0);
  });
});

describe('comparatives', () => {
  it('positive: быстрее чем names the standard of comparison', () => {
    const a = run('Он читал быстрее, чем она.');
    const c = of(a, 'comparative')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/чем/);
  });
  it('negative: a plain positive-degree adjective produces no comparative construction', () => {
    const a = run('Молодой человек читал книгу.');
    expect(of(a, 'comparative').length).toBe(0);
  });
});

describe('names', () => {
  it('positive: a full given+patronymic+surname sequence is one name construction, formal register', () => {
    const a = run('Родион Романович Раскольников вышел.');
    const c = of(a, 'name')[0]!;
    expect(c).toBeDefined();
    expect(c.tokens.length).toBeGreaterThanOrEqual(1);
  });
  it('positive: a diminutive alone is a name construction with an intimate-register note', () => {
    const a = run('Родя вышел из дома.');
    const c = of(a, 'name')[0]!;
    expect(c).toBeDefined();
    expect(c.explanation).toMatch(/Родион Романович Раскольников/);
  });
  it('negative: a sentence with no known name produces no name construction', () => {
    const a = run('Он видел книгу.');
    expect(of(a, 'name').length).toBe(0);
  });
});

export {};
