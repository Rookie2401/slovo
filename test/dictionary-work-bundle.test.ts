import { afterEach, describe, expect, it } from 'vitest';
import { computeStem, toCoreLexeme, buildWorkBundle } from '../scripts/dict-lib.mjs';
import type { DictLexeme, DictManifest, FormShard, WorkBundle } from '../src/dictionary/types';
import { __configureDictionary, __resetDictionaryCache, candidatesFor, preloadWork, readingsFor, lexemeSync } from '../src/dictionary/index';

// ----------------------------------------------------------------- fixture lexemes (mirrors dictionary-candidates.test.ts)

const govoritParadigm = {
  kind: 'verb' as const,
  infinitive: "говори'ть",
  imperative: { sg: "говори'", pl: "говори'те" },
  past: { m: "говори'л", f: "говори'ла", n: "говори'ло", pl: "говори'ли" },
  presfut: { sg1: "говорю'", sg2: "говори'шь", sg3: "говори'т", pl1: "говори'м", pl2: "говори'те", pl3: "говоря'т" },
};
const govoritLexemeFull = {
  id: 'verb:говорить',
  lemma: 'говорить',
  acc: "говори'ть",
  pos: 'verb' as const,
  gloss: 'speak, talk',
  senses: ['speak, talk'],
  aspect: 'imperfective' as const,
  paradigm: govoritParadigm,
};

const chelovekParadigm = {
  kind: 'noun' as const,
  sg: { nom: "челове'к", gen: "челове'ка" },
  pl: { nom: "лю'ди", gen: "люде'й" },
};
const chelovekLexemeFull = {
  id: 'noun:человек',
  lemma: 'человек',
  acc: "челове'к",
  pos: 'noun' as const,
  gloss: 'person, people',
  senses: ['person, people'],
  gender: 'm' as const,
  animacy: 'anim' as const,
  paradigm: chelovekParadigm,
};

describe('computeStem (build-time) matches what the runtime would derive from the paradigm', () => {
  it('говорить -> "говор" (regular verb, common prefix across all cells)', () => {
    expect(computeStem(govoritParadigm)).toBe('говор');
  });
  it('человек/люди -> "" (suppletive, no common prefix at all)', () => {
    expect(computeStem(chelovekParadigm)).toBe('');
  });
  it('a lexeme with no paradigm -> ""', () => {
    expect(computeStem(undefined)).toBe('');
  });
});

describe('toCoreLexeme', () => {
  it('keeps only the CoreLexeme fields, drops the paradigm, and attaches the precomputed stem', () => {
    const core = toCoreLexeme(govoritLexemeFull);
    expect(core).not.toHaveProperty('paradigm');
    expect(core.stem).toBe('говор');
    expect(core.id).toBe('verb:говорить');
    expect(core.aspect).toBe('imperfective');
  });

  it('caps senses at maxSenses (default 6)', () => {
    const lex = { ...govoritLexemeFull, senses: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
    const core = toCoreLexeme(lex);
    expect(core.senses).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('computes stem on the fly if the source lexeme somehow lacks one (defensive)', () => {
    const core = toCoreLexeme(chelovekLexemeFull);
    expect(core.stem).toBe('');
  });
});

describe('buildWorkBundle', () => {
  it('includes only the form keys that occur in the book, and only the lexemes those readings reference', () => {
    const formIndex = new Map<string, Array<[string, string, number]>>([
      ['говорю', [['verb:говорить', 'v:pf:sg1', 5]]],
      ['человек', [['noun:человек', 'n:sg:nom', 5]]],
      ['люди', [['noun:человек', 'n:pl:nom', 1]]],
      ['неупомянутое', [['noun:призрак', 'n:sg:nom', -1]]], // not in the book text below
    ]);
    const lexemeById = new Map<string, DictLexeme>([
      ['verb:говорить', { ...govoritLexemeFull, stem: 'говор' }],
      ['noun:человек', { ...chelovekLexemeFull, stem: '' }],
    ]);
    const book = {
      slug: 'test-work',
      chapters: [{ paragraphs: [{ text: 'Человек говорю люди.' }] }],
    };

    const { forms, lexemes } = buildWorkBundle({ book, formIndex, lexemeById, maxSenses: 6 });

    expect(Object.keys(forms).sort()).toEqual(['говорю', 'люди', 'человек']);
    expect(Object.keys(lexemes).sort()).toEqual(['noun:человек', 'verb:говорить']);
    expect(lexemes['verb:говорить']!.stem).toBe('говор');
    expect(lexemes['verb:говорить']).not.toHaveProperty('paradigm');
  });

  it('skips a key with no reading in the global formIndex (out-of-dictionary word)', () => {
    const formIndex = new Map<string, Array<[string, string, number]>>();
    const lexemeById = new Map<string, DictLexeme>();
    const book = { slug: 'x', chapters: [{ paragraphs: [{ text: 'бессловие' }] }] };
    const { forms, lexemes } = buildWorkBundle({ book, formIndex, lexemeById });
    expect(forms).toEqual({});
    expect(lexemes).toEqual({});
  });
});

// ----------------------------------------------------------------- runtime: preloadWork

function fakeDictionaryWithBundle(manifest: DictManifest, bundles: Record<string, WorkBundle>) {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest } as Response;
    const m = /works\/([^/]+)\.json$/.exec(url);
    const slug = m?.[1];
    if (slug && bundles[slug]) return { ok: true, json: async () => bundles[slug] } as Response;
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as typeof fetch;
  __configureDictionary({ baseUrl: './dict/', fetchImpl });
}

describe('preloadWork', () => {
  afterEach(() => __resetDictionaryCache());

  const manifest: DictManifest = {
    version: 1,
    built_at: '2026-01-01T00:00:00Z',
    sources: [],
    form_shards: {},
    lex_shards: {},
    work_bundles: { 'test-work': 'test-work.json' },
    lexeme_count: 1,
    form_count: 1,
    coverage: { overall: 1, by_work: {} },
  };
  const bundle: WorkBundle = {
    slug: 'test-work',
    forms: { говорю: [['verb:говорить', 'v:pf:sg1', 5]] } as FormShard,
    lexemes: { 'verb:говорить': toCoreLexeme({ ...govoritLexemeFull }) },
  };

  it('loads a bundle once and makes readingsFor/lexemeSync answer synchronously, without touching any global shard', async () => {
    let formShardFetches = 0;
    let lexShardFetches = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest } as Response;
      if (url.includes('/forms/')) formShardFetches++;
      if (url.includes('/lex/')) lexShardFetches++;
      if (url.endsWith('works/test-work.json')) return { ok: true, json: async () => bundle } as Response;
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as typeof fetch;
    __configureDictionary({ baseUrl: './dict/', fetchImpl });

    await preloadWork('test-work');
    expect(readingsFor('говорю')).toEqual([['verb:говорить', 'v:pf:sg1', 5]]);
    expect(lexemeSync('verb:говорить')?.lemma).toBe('говорить');
    expect(formShardFetches).toBe(0);
    expect(lexShardFetches).toBe(0);

    const cands = candidatesFor('говорю', 'говорю');
    expect(cands[0]?.morphemes.find((m) => m.role === 'stem')?.text).toBe('говор');
  });

  it('is memoised per slug (one fetch even across repeated calls)', async () => {
    let bundleFetches = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest } as Response;
      if (url.endsWith('works/test-work.json')) {
        bundleFetches++;
        return { ok: true, json: async () => bundle } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as typeof fetch;
    __configureDictionary({ baseUrl: './dict/', fetchImpl });

    await Promise.all([preloadWork('test-work'), preloadWork('test-work'), preloadWork('test-work')]);
    expect(bundleFetches).toBe(1);
  });

  it('rejects for a slug with no bundle in the manifest', async () => {
    fakeDictionaryWithBundle(manifest, {});
    await expect(preloadWork('no-such-work')).rejects.toThrow(/no-such-work/);
  });

  it('a work bundle lexeme never overwrites an already-loaded full (paradigm-bearing) lexeme for the same id', async () => {
    const fullLexShard = { 'verb:говорить': { ...govoritLexemeFull, stem: 'говор' } };
    const manifestWithLex: DictManifest = { ...manifest, lex_shards: { г: 'г.json' }, work_bundles: { 'test-work': 'test-work.json' } };
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifestWithLex } as Response;
      if (url.endsWith('lex/г.json')) return { ok: true, json: async () => fullLexShard } as Response;
      if (url.endsWith('works/test-work.json')) return { ok: true, json: async () => bundle } as Response;
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as typeof fetch;
    __configureDictionary({ baseUrl: './dict/', fetchImpl });

    const { lexeme } = await import('../src/dictionary/index');
    const full = await lexeme('verb:говорить'); // loads the full lex shard first
    expect(full?.paradigm).toBeDefined();

    await preloadWork('test-work'); // bundle's lighter CoreLexeme must not clobber it
    expect(lexemeSync('verb:говорить')?.paradigm).toBeDefined();
  });

  it('bundle preloaded FIRST: lexeme(id) still fetches and upgrades the cached entry to the full, paradigm-bearing one (the paradigm-view bug)', async () => {
    const fullLexShard = { 'verb:говорить': { ...govoritLexemeFull, stem: 'говор' } };
    const manifestWithLex: DictManifest = { ...manifest, lex_shards: { г: 'г.json' }, work_bundles: { 'test-work': 'test-work.json' } };
    let lexShardFetches = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifestWithLex } as Response;
      if (url.endsWith('lex/г.json')) {
        lexShardFetches++;
        return { ok: true, json: async () => fullLexShard } as Response;
      }
      if (url.endsWith('works/test-work.json')) return { ok: true, json: async () => bundle } as Response;
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as typeof fetch;
    __configureDictionary({ baseUrl: './dict/', fetchImpl });

    await preloadWork('test-work'); // chapter reading path: caches only the lighter, core:true CoreLexeme
    expect(lexemeSync('verb:говорить')?.paradigm).toBeUndefined();
    expect(lexemeSync('verb:говорить')?.core).toBe(true);
    expect(lexShardFetches).toBe(0);

    const { lexeme } = await import('../src/dictionary/index');
    const full = await lexeme('verb:говорить'); // WordPanel paradigm view calls this
    expect(full?.paradigm).toBeDefined();
    expect(lexShardFetches).toBe(1);
    // and the upgrade is now visible to the sync accessor too
    expect(lexemeSync('verb:говорить')?.paradigm).toBeDefined();
  });

  it('lexeme(id) does not refetch once the full entry is already cached (core is falsy on it)', async () => {
    const fullLexShard = { 'verb:говорить': { ...govoritLexemeFull, stem: 'говор' } };
    const manifestWithLex: DictManifest = { ...manifest, lex_shards: { г: 'г.json' }, work_bundles: { 'test-work': 'test-work.json' } };
    let lexShardFetches = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifestWithLex } as Response;
      if (url.endsWith('lex/г.json')) {
        lexShardFetches++;
        return { ok: true, json: async () => fullLexShard } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as typeof fetch;
    __configureDictionary({ baseUrl: './dict/', fetchImpl });

    const { lexeme } = await import('../src/dictionary/index');
    await lexeme('verb:говорить');
    await lexeme('verb:говорить');
    expect(lexShardFetches).toBe(1); // second call short-circuits on the cached full entry
  });
});
