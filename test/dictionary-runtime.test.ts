import { afterEach, describe, expect, it } from 'vitest';
import type { DictManifest, FormShard, LexShard } from '../src/dictionary/types';
import { __configureDictionary, __resetDictionaryCache, loadManifest, preloadForms, readingsFor, lexeme, lexemeSync } from '../src/dictionary/index';

const manifest: DictManifest = {
  version: 1,
  built_at: '2026-01-01T00:00:00Z',
  sources: [],
  form_shards: { к: 'к.json' },
  lex_shards: { к: 'к.json' },
  work_bundles: {},
  lexeme_count: 1,
  form_count: 1,
  coverage: { overall: 1, by_work: {} },
};
const forms: FormShard = { кот: [['noun:кот', 'n:sg:nom', 1]] };
const lex: LexShard = { 'noun:кот': { id: 'noun:кот', lemma: 'кот', acc: "ко'т", pos: 'noun', gloss: 'cat', senses: ['cat'], gender: 'm', animacy: 'anim', stem: 'кот' } };

describe('dictionary runtime loader (fake fetch)', () => {
  afterEach(() => __resetDictionaryCache());

  it('preloadForms fetches the manifest + the right form and lex shards, then readingsFor/lexemeSync answer sync', async () => {
    const calls: string[] = [];
    __configureDictionary({
      baseUrl: './dict/',
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest } as Response;
        if (url.endsWith('forms/к.json')) return { ok: true, json: async () => forms } as Response;
        if (url.endsWith('lex/к.json')) return { ok: true, json: async () => lex } as Response;
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }) as typeof fetch,
    });

    expect(readingsFor('кот')).toEqual([]); // nothing preloaded yet
    await preloadForms(['кот']);
    expect(readingsFor('кот')).toEqual([['noun:кот', 'n:sg:nom', 1]]);
    expect(lexemeSync('noun:кот')?.gloss).toBe('cat');
    expect(calls.filter((u) => u.endsWith('manifest.json'))).toHaveLength(1);
    expect(calls.some((u) => u.endsWith('forms/к.json'))).toBe(true);
    expect(calls.some((u) => u.endsWith('lex/к.json'))).toBe(true);
  });

  it('a rejected fetch clears the memo so a later retry can succeed (never caches a rejection forever)', async () => {
    let attempt = 0;
    __configureDictionary({
      baseUrl: './dict/',
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('manifest.json')) {
          attempt++;
          if (attempt === 1) throw new Error('network down');
          return { ok: true, json: async () => manifest } as Response;
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }) as typeof fetch,
    });

    await expect(loadManifest()).rejects.toThrow('network down');
    // second call must retry (not replay the same rejected promise) and succeed
    const m = await loadManifest();
    expect(m.lexeme_count).toBe(1);
    expect(attempt).toBe(2);
  });

  it('concurrent callers while a fetch is in flight share the one underlying request', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    __configureDictionary({
      baseUrl: './dict/',
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.endsWith('manifest.json')) return { ok: false, status: 404, json: async () => ({}) } as Response;
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { ok: true, json: async () => manifest } as Response;
      }) as typeof fetch,
    });

    await Promise.all([loadManifest(), loadManifest(), loadManifest()]);
    expect(maxInFlight).toBe(1);
  });

  it('a 404 rejects with an error (non-ok response), and does not poison the cache for a later good fetch', async () => {
    let good = false;
    __configureDictionary({
      baseUrl: './dict/',
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('manifest.json')) return { ok: good, status: good ? 200 : 404, json: async () => manifest } as Response;
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }) as typeof fetch,
    });

    await expect(loadManifest()).rejects.toThrow();
    good = true;
    const m = await loadManifest();
    expect(m.lexeme_count).toBe(1);
  });

  it('lexeme(id) fetches its shard on demand for an id outside any preloaded batch', async () => {
    __configureDictionary({
      baseUrl: './dict/',
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest } as Response;
        if (url.endsWith('lex/к.json')) return { ok: true, json: async () => lex } as Response;
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }) as typeof fetch,
    });
    expect(lexemeSync('noun:кот')).toBeUndefined();
    const l = await lexeme('noun:кот');
    expect(l?.lemma).toBe('кот');
    expect(lexemeSync('noun:кот')?.lemma).toBe('кот'); // now cached
  });
});
