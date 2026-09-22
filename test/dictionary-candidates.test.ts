import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DictLexeme, DictManifest, FormShard, LexShard } from '../src/dictionary/types';
import { __configureDictionary, __resetDictionaryCache, candidatesFor, loadManifest, preloadForms, readingsFor, lexemeSync } from '../src/dictionary/index';

/** Builds a fake fetch() over an in-memory manifest + shards, for a self-contained fixture dictionary. */
function fakeDictionary(manifest: DictManifest, forms: Record<string, FormShard>, lex: Record<string, LexShard>) {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown;
    if (url.endsWith('manifest.json')) body = manifest;
    else {
      const m = /forms\/([^/]+)\.json$/.exec(url) ?? /lex\/([^/]+)\.json$/.exec(url);
      const name = m?.[1];
      if (url.includes('/forms/') && name && forms[name]) body = forms[name];
      else if (url.includes('/lex/') && name && lex[name]) body = lex[name];
    }
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response;
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
  __configureDictionary({ baseUrl: './dict/', fetchImpl });
}

const govoritLexeme: DictLexeme = {
  id: 'verb:говорить',
  lemma: 'говорить',
  acc: "говори'ть",
  pos: 'verb',
  gloss: 'speak, talk',
  senses: ['speak, talk'],
  aspect: 'imperfective',
  stem: 'говор', // precomputed at build time, as scripts/dict-lib.mjs's computeStem() would
  paradigm: {
    kind: 'verb',
    infinitive: "говори'ть",
    imperative: { sg: "говори'", pl: "говори'те" },
    past: { m: "говори'л", f: "говори'ла", n: "говори'ло", pl: "говори'ли" },
    presfut: { sg1: "говорю'", sg2: "говори'шь", sg3: "говори'т", pl1: "говори'м", pl2: "говори'те", pl3: "говоря'т" },
  },
};

const chelovekLexeme: DictLexeme = {
  id: 'noun:человек',
  lemma: 'человек',
  acc: "челове'к",
  pos: 'noun',
  gloss: 'person, people',
  senses: ['person, people'],
  gender: 'm',
  animacy: 'anim',
  stem: '', // suppletive: человек/человека vs люди/людей share no common prefix
  paradigm: {
    kind: 'noun',
    sg: { nom: "челове'к", gen: "челове'ка" },
    pl: { nom: "лю'ди", gen: "люде'й" },
  },
};

const uchitsyaLexeme: DictLexeme = {
  id: 'verb:учиться',
  lemma: 'учиться',
  acc: "учи'ться",
  pos: 'verb',
  gloss: 'to study, learn',
  senses: ['to study, learn'],
  aspect: 'imperfective',
  reflexive: true,
  stem: 'уч',
  paradigm: {
    kind: 'verb',
    infinitive: "учи'ться",
    presfut: { sg1: "учу'сь", sg3: "у'чится" },
  },
};

const manifest: DictManifest = {
  version: 1,
  built_at: '2026-01-01T00:00:00Z',
  sources: [],
  form_shards: { г: 'г.json', ч: 'ч.json', л: 'л.json', у: 'у.json' },
  lex_shards: { г: 'г.json', ч: 'ч.json', у: 'у.json' },
  work_bundles: {},
  lexeme_count: 4,
  form_count: 4,
  coverage: { overall: 1, by_work: {} },
};

const forms: Record<string, FormShard> = {
  г: { говорю: [['verb:говорить', 'v:pf:sg1', 5]] },
  ч: { человек: [['noun:человек', 'n:sg:nom', 5]] },
  л: { люди: [['noun:человек', 'n:pl:nom', 1]] },
  у: { учится: [['verb:учиться', 'v:pf:sg3', 0]] },
};

const lex: Record<string, LexShard> = {
  г: { 'verb:говорить': govoritLexeme },
  ч: { 'noun:человек': chelovekLexeme },
  у: { 'verb:учиться': uchitsyaLexeme },
};

describe('candidatesFor', () => {
  beforeEach(() => {
    __resetDictionaryCache();
    fakeDictionary(manifest, forms, lex);
  });
  afterEach(() => __resetDictionaryCache());

  it('segments a regular verb form into stem + ending (говорить/говорю)', async () => {
    await preloadForms(['говорю']);
    const cands = candidatesFor('говорю', 'говорю');
    expect(cands).toHaveLength(1);
    const c = cands[0]!;
    expect(c.key).toBe('verb:говорить');
    expect(c.lemma).toBe('говорить');
    expect(c.pos).toBe('verb');
    expect(c.source).toBe('dictionary');
    expect(c.confidence).toBe(1);
    expect(c.features).toMatchObject({ verb_form: 'present-future', tense: 'present', number: 'sg', person: 1 });
    const stem = c.morphemes.find((m) => m.role === 'stem');
    const ending = c.morphemes.find((m) => m.role === 'ending');
    expect(stem?.text).toBe('говор');
    expect(ending?.text).toBe('ю');
  });

  it('человек (nominative, zero ending) segments cleanly against its own lemma — not suppletive', async () => {
    await preloadForms(['человек']);
    // Per-form segmentation: lemmaBase for a noun is the lemma itself ("человек"); the
    // nominative reading's surface equals the lemma exactly, so stem = the whole word and
    // there's no ending at all (a genuine zero ending, not suppletion).
    const human = candidatesFor('человек', 'человек')[0]!;
    expect(human.key).toBe('noun:человек');
    expect(human.morphemes.find((m) => m.role === 'stem')?.text).toBe('человек');
    expect(human.morphemes.find((m) => m.role === 'ending')).toBeUndefined();
    expect(human.notes).toContain('ending: —');
    expect(human.notes.join(' ')).not.toMatch(/suppletive/);
  });

  it('flags a suppletive lexeme with an empty stem and a note (люди has no common prefix with lemma человек at all)', async () => {
    await preloadForms(['люди']);
    const lyudi = candidatesFor('люди', 'люди')[0]!;
    expect(lyudi.key).toBe('noun:человек');
    expect(lyudi.morphemes.find((m) => m.role === 'stem')?.text).toBe('люди');
    expect(lyudi.notes.join(' ')).toMatch(/suppletive/);
  });

  it('segments the -ся/-сь postfix separately for a reflexive verb', async () => {
    await preloadForms(['учится']);
    const c = candidatesFor('учится', 'учится')[0]!;
    const postfix = c.morphemes.find((m) => m.role === 'postfix');
    expect(postfix?.text).toBe('ся');
    // lemmaBase = "учиться" minus -ся minus the infinitive ending -ть = "учи"; "учится" minus
    // the -ся postfix is "учит", which starts with "учи" in full, so stem = "учи" and the
    // mechanical remainder "т" is the ending (same rule that gives говорил -> говори|л).
    const stem = c.morphemes.find((m) => m.role === 'stem');
    expect(stem?.text).toBe('учи');
    const ending = c.morphemes.find((m) => m.role === 'ending');
    expect(ending?.text).toBe('т');
  });

  it('readingsFor / lexemeSync answer synchronously once preloadForms resolves', async () => {
    await preloadForms(['говорю']);
    expect(readingsFor('говорю')).toHaveLength(1);
    expect(lexemeSync('verb:говорить')?.lemma).toBe('говорить');
  });

  it('returns [] / no candidates for an unknown key', async () => {
    await preloadForms(['нектонеслово']);
    expect(readingsFor('нектонеслово')).toEqual([]);
    expect(candidatesFor('нектонеслово', 'нектонеслово')).toEqual([]);
  });

  it('loadManifest is memoised (same object identity across repeated / concurrent calls)', async () => {
    const [a, b, c] = await Promise.all([loadManifest(), loadManifest(), loadManifest()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
