import { afterEach, describe, expect, it } from 'vitest';
import type { DictLexeme, DictManifest, FormShard, LexShard } from '../src/dictionary/types';
import { __configureDictionary, __resetDictionaryCache, candidatesFor, preloadForms } from '../src/dictionary/index';

/**
 * Regression suite for the two bugs the coordinator's `probe-word.mts спустился` /
 * browser repro found in the paradigm-LCP-based segmentation:
 *  - verb:спуститься's paradigm-wide longest common prefix is "спу" (dragged down by
 *    the т->щ mutation in presfut "спущусь"), so спустился wrongly segmented as спу|стился.
 *  - lexeme(id) could get stuck returning a bundle's paradigm-less CoreLexeme forever.
 * candidatesFor now segments per surface form against the LEMMA (not the whole paradigm),
 * and lexeme(id) always upgrades a `core: true` cache entry — see src/dictionary/index.ts.
 *
 * The algorithm never touches the paradigm at all, so these fixture lexemes only need the
 * fields candidatesFor actually reads: id/lemma/acc/pos/gloss/senses(+reflexive/gender).
 */

function lex(partial: Partial<DictLexeme> & Pick<DictLexeme, 'id' | 'lemma' | 'pos'>): DictLexeme {
  return { acc: partial.lemma, gloss: partial.lemma, senses: [partial.lemma], ...partial };
}

const LEXEMES: DictLexeme[] = [
  lex({ id: 'verb:спуститься', lemma: 'спуститься', pos: 'verb', aspect: 'perfective', reflexive: true }),
  lex({ id: 'noun:муравей', lemma: 'муравей', pos: 'noun', gender: 'm', animacy: 'anim' }),
  lex({ id: 'noun:каморка', lemma: 'каморка', pos: 'noun', gender: 'f' }),
  lex({ id: 'noun:человек', lemma: 'человек', pos: 'noun', gender: 'm', animacy: 'anim' }),
  lex({ id: 'adjective:молодой', lemma: 'молодой', pos: 'adjective' }),
  lex({ id: 'adjective:жаркий', lemma: 'жаркий', pos: 'adjective' }),
  lex({ id: 'verb:говорить', lemma: 'говорить', pos: 'verb', aspect: 'imperfective' }),
];

/** [surfaceKey, surface, lexemeId, featureCode] — one reading per example. */
const READINGS: Array<[string, string, string, string]> = [
  ['спустился', 'спустился', 'verb:спуститься', 'v:past:m'],
  ['муравей', 'муравей', 'noun:муравей', 'n:sg:nom'],
  ['каморки', 'каморки', 'noun:каморка', 'n:sg:gen'],
  ['человека', 'человека', 'noun:человек', 'n:sg:gen'],
  ['люди', 'люди', 'noun:человек', 'n:pl:nom'],
  ['молодого', 'молодого', 'adjective:молодой', 'a:m:sg:gen'],
  ['жаркое', 'жаркое', 'adjective:жаркий', 'a:n:sg:nom'],
  ['говорил', 'говорил', 'verb:говорить', 'v:past:m'],
];

function firstLetter(s: string): string {
  return s[0]!;
}

function buildManifestAndShards(): { manifest: DictManifest; forms: Record<string, FormShard>; lex: Record<string, LexShard> } {
  const forms: Record<string, FormShard> = {};
  for (const [key, , lexemeId, code] of READINGS) {
    const shardName = firstLetter(key);
    (forms[shardName] ??= {})[key] = [[lexemeId, code, -1]];
  }
  const lexShards: Record<string, LexShard> = {};
  for (const l of LEXEMES) {
    const shardName = firstLetter(l.lemma);
    (lexShards[shardName] ??= {})[l.id] = l;
  }
  const manifest: DictManifest = {
    version: 1,
    built_at: '2026-01-01T00:00:00Z',
    sources: [],
    form_shards: Object.fromEntries(Object.keys(forms).map((k) => [k, `${k}.json`])),
    lex_shards: Object.fromEntries(Object.keys(lexShards).map((k) => [k, `${k}.json`])),
    work_bundles: {},
    lexeme_count: LEXEMES.length,
    form_count: READINGS.length,
    coverage: { overall: 1, by_work: {} },
  };
  return { manifest, forms: forms, lex: lexShards };
}

function installFakeFetch() {
  const { manifest, forms, lex: lexShards } = buildManifestAndShards();
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest } as Response;
    const fm = /forms\/([^/]+)\.json$/.exec(url);
    if (fm && forms[fm[1]!]) return { ok: true, json: async () => forms[fm[1]!] } as Response;
    const lm = /lex\/([^/]+)\.json$/.exec(url);
    if (lm && lexShards[lm[1]!]) return { ok: true, json: async () => lexShards[lm[1]!] } as Response;
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as typeof fetch;
  __configureDictionary({ baseUrl: './dict/', fetchImpl });
}

describe('candidatesFor: per-form segmentation (base vs lemmaBase), replacing the paradigm-LCP approach', () => {
  afterEach(() => __resetDictionaryCache());

  async function segment(key: string, surface: string) {
    installFakeFetch();
    await preloadForms([key]);
    const c = candidatesFor(key, surface)[0]!;
    return {
      stem: c.morphemes.find((m) => m.role === 'stem')?.text,
      ending: c.morphemes.find((m) => m.role === 'ending')?.text,
      postfix: c.morphemes.find((m) => m.role === 'postfix')?.text,
      notes: c.notes,
      candidate: c,
    };
  }

  it('спустился -> спусти|л|ся (NOT спу|стился — the т/щ mutation in спущусь must not drag the stem down)', async () => {
    const { stem, ending, postfix, notes } = await segment('спустился', 'спустился');
    expect(stem).toBe('спусти');
    expect(ending).toBe('л');
    expect(postfix).toBe('ся');
    expect(notes.join(' ')).not.toMatch(/suppletive/);
  });

  it('муравей -> муравей|(zero ending), with an "ending: —" note instead of a missing ending chip', async () => {
    const { stem, ending, notes } = await segment('муравей', 'муравей');
    expect(stem).toBe('муравей');
    expect(ending).toBeUndefined();
    expect(notes).toContain('ending: —');
  });

  it('каморки -> каморк|и (the trailing nominative vowel а->и is a normal ending swap, not an alternation)', async () => {
    const { stem, ending, notes } = await segment('каморки', 'каморки');
    expect(stem).toBe('каморк');
    expect(ending).toBe('и');
    expect(notes.filter((n) => n.startsWith('stem alternation'))).toEqual([]);
  });

  it('человека -> человек|а', async () => {
    const { stem, ending, notes } = await segment('человека', 'человека');
    expect(stem).toBe('человек');
    expect(ending).toBe('а');
    expect(notes.join(' ')).not.toMatch(/suppletive/);
  });

  it('люди -> suppletive (no letters in common with lemma человек at all); the whole surface stands in as one unsegmented stem chip', async () => {
    const { stem, ending, notes } = await segment('люди', 'люди');
    expect(stem).toBe('люди'); // rawStem length 0 < 2 -> forced '', so the full base is pushed as the (unsegmented) stem
    expect(ending).toBeUndefined();
    expect(notes.join(' ')).toMatch(/suppletive/);
  });

  it('молодого -> молод|ого', async () => {
    const { stem, ending, notes } = await segment('молодого', 'молодого');
    expect(stem).toBe('молод');
    expect(ending).toBe('ого');
    expect(notes.filter((n) => n.startsWith('stem alternation'))).toEqual([]);
  });

  it('жаркое -> жарк|ое', async () => {
    const { stem, ending, notes } = await segment('жаркое', 'жаркое');
    expect(stem).toBe('жарк');
    expect(ending).toBe('ое');
    expect(notes.filter((n) => n.startsWith('stem alternation'))).toEqual([]);
  });

  it('говорил -> говори|л', async () => {
    const { stem, ending, notes } = await segment('говорил', 'говорил');
    expect(stem).toBe('говори');
    expect(ending).toBe('л');
    expect(notes.join(' ')).not.toMatch(/suppletive/);
  });

  it('a real stem alternation still gets flagged with the exact "lemmaBase -> surfaceTail" note (спущусь: спусти -> спущ)', async () => {
    // спущусь is not one of the corpus readings above, but reuses the same lexeme
    // (verb:спуститься) via a synthetic reading to prove the note text/mechanism itself.
    installFakeFetch();
    const manifestExtra = {
      version: 1,
      built_at: '2026-01-01T00:00:00Z',
      sources: [],
      form_shards: { с: 'с.json' },
      lex_shards: { с: 'с.json' },
      work_bundles: {},
      lexeme_count: 1,
      form_count: 1,
      coverage: { overall: 1, by_work: {} },
    } as DictManifest;
    const formsExtra: Record<string, FormShard> = { с: { спущусь: [['verb:спуститься', 'v:pf:sg1', -1]] } };
    const lexExtra: Record<string, LexShard> = { с: { 'verb:спуститься': lex({ id: 'verb:спуститься', lemma: 'спуститься', pos: 'verb', reflexive: true }) } };
    __configureDictionary({
      baseUrl: './dict/',
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifestExtra } as Response;
        if (url.endsWith('forms/с.json')) return { ok: true, json: async () => formsExtra['с'] } as Response;
        if (url.endsWith('lex/с.json')) return { ok: true, json: async () => lexExtra['с'] } as Response;
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }) as typeof fetch,
    });
    await preloadForms(['спущусь']);
    const c = candidatesFor('спущусь', 'спущусь')[0]!;
    expect(c.morphemes.find((m) => m.role === 'stem')?.text).toBe('спу');
    expect(c.morphemes.find((m) => m.role === 'postfix')?.text).toBe('сь');
    expect(c.notes).toContain('stem alternation: спусти → спущ');
  });
});
