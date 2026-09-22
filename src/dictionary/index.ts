/**
 * Runtime dictionary loader. Fetches shards on demand (relative `./dict/…`
 * paths so the built app runs from any sub-path — GitHub Pages project
 * sites included) and memoises them with rejection-clearing (`asyncCache`)
 * so a transient network failure never wedges the app.
 *
 * Two ways in:
 *  - `preloadWork(slug)` is the fast path for a bundled work (public/dict/works/<slug>.json):
 *    one small fetch carries exactly the form readings and CoreLexemes that
 *    work's own text uses. A chapter's tokens span nearly every letter of the
 *    alphabet, so without this, reading one chapter of Crime and Punishment
 *    would fetch most of the ~166 global form shards and hundreds of ~300 KB
 *    lex shards — unusable on a phone.
 *  - `preloadForms(keys)` is the fallback for text the bundles don't cover
 *    (a user-imported book): it fetches whichever global, letter-sharded form
 *    shards those keys land in, then the lex shards the resulting readings
 *    reference, so `candidatesFor` can still run synchronously afterward.
 *
 * Both feed the same two module-level maps (`formsByKey`, `lexemesById`) that
 * `readingsFor`/`lexemeSync`/`candidatesFor` read synchronously (O(1), no
 * per-call shard scan). `lexeme(id)` is the async, on-demand path to the full
 * DictLexeme (with paradigm) for a paradigm view — it always resolves and
 * loads that lexeme's actual lex shard, which then supersedes any lighter
 * CoreLexeme a bundle may have already cached for the same id.
 */
import type { Gender, Morpheme } from '../database/types';
import { isCyrillicLetter, looseKey } from '../tokenizer/cyrillic';
import { splitAccent, withAcute } from './accent';
import { decodeFeatureCode } from './features';
import { segmentForm } from './segment';
import { memoAsync, memoAsyncKeyed } from './asyncCache';
import type { DictLexeme, DictManifest, FormReading, FormShard, LexShard, WorkBundle } from './types';
import type { Candidate } from '../morphology/candidate';

export { decodeFeatureCode } from './features';
export { splitAccent, withAcute } from './accent';

// --------------------------------------------------------------- config (test seam)

let baseUrl = './dict/';
let fetchImpl: typeof fetch = (...args: Parameters<typeof fetch>) => fetch(...args);

/** Test-only: point the loader at a fake fetch / different base URL. */
export function __configureDictionary(opts: { baseUrl?: string; fetchImpl?: typeof fetch }): void {
  if (opts.baseUrl !== undefined) baseUrl = opts.baseUrl;
  if (opts.fetchImpl !== undefined) fetchImpl = opts.fetchImpl;
}

/** Test-only: drop every cached shard/bundle/manifest so a fresh scenario starts clean. */
export function __resetDictionaryCache(): void {
  manifestBox.current = null;
  formShardPromises = {};
  lexShardPromises = {};
  workBundlePromises = {};
  formsByKey.clear();
  lexemesById.clear();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`dictionary fetch failed: ${url} (${res.status})`);
  return (await res.json()) as T;
}

// --------------------------------------------------------------- manifest

const manifestBox: { current: Promise<DictManifest> | null } = { current: null };

export function loadManifest(): Promise<DictManifest> {
  return memoAsync(manifestBox, () => fetchJson<DictManifest>(`${baseUrl}manifest.json`));
}

// --------------------------------------------------------------- shard resolution

/** Fold one character the way looseKey folds a whole string; non-Cyrillic-letter -> "_". */
function foldChar(ch: string | undefined): string {
  if (!ch) return '_';
  const k = looseKey(ch);
  const c = k[0] ?? '_';
  return isCyrillicLetter(c) ? c : '_';
}

/**
 * Resolve which shard (of the ones actually listed in the manifest) a key
 * belongs to. Must try the LONGEST folded prefix first, down to 1 (build-
 * dictionary.mjs only ever splits that far): a build-time split is a strict
 * partition, so at most one prefix length is ever the real terminal shard for
 * a given lemma — but a SHORTER prefix can still coincidentally exist as its
 * own (unrelated) shard, e.g. the lemma "с" (a one-letter preposition) is its
 * own tiny shard "с.json" even though every other с-word lives under deeper
 * shards like "сп.json". Searching short-to-first would wrongly stop at "с"
 * for every с-word and hand back the wrong shard (silently missing the id).
 * Mirrors scripts/dict-lib.mjs resolveShardName/shardLetter.
 */
function resolveShardName(key: string, known: Record<string, string>): string | undefined {
  const folded = Array.from(key)
    .map((c) => foldChar(c))
    .join('');
  for (let len = Math.min(6, folded.length); len >= 1; len--) {
    const prefix = folded.slice(0, len);
    if (known[prefix]) return prefix;
  }
  return known['_'];
}

function lemmaOfLexemeId(id: string): string {
  const colon = id.indexOf(':');
  const rest = colon >= 0 ? id.slice(colon + 1) : id;
  return rest.replace(/#\d+$/, '');
}

// --------------------------------------------------------------- merged, O(1) lookup maps
//
// Every loader below (form shard, lex shard, work bundle) feeds these two maps;
// readingsFor/lexemeSync/candidatesFor never scan per-shard caches.

const formsByKey = new Map<string, FormReading[]>();
/** A value here is either a full DictLexeme (from a lex shard — has `paradigm` when the
 *  lexeme has one) or a lighter CoreLexeme (from a work bundle, never has `paradigm`).
 *  CoreLexeme is structurally assignable to DictLexeme (paradigm is optional), so one map
 *  serves both without a union/cast — `lexeme(id)` is what guarantees you the full one. */
const lexemesById = new Map<string, DictLexeme>();

let formShardPromises: Partial<Record<string, Promise<FormShard>>> = {};
let lexShardPromises: Partial<Record<string, Promise<LexShard>>> = {};
let workBundlePromises: Partial<Record<string, Promise<WorkBundle>>> = {};

function loadFormShard(shardName: string, fileName: string): Promise<FormShard> {
  return memoAsyncKeyed(formShardPromises, shardName, async () => {
    const shard = await fetchJson<FormShard>(`${baseUrl}forms/${fileName}`);
    for (const [key, readings] of Object.entries(shard)) formsByKey.set(key, readings);
    return shard;
  });
}

function loadLexShard(shardName: string, fileName: string): Promise<LexShard> {
  return memoAsyncKeyed(lexShardPromises, shardName, async () => {
    const shard = await fetchJson<LexShard>(`${baseUrl}lex/${fileName}`);
    // Authoritative full record — always wins over a lighter CoreLexeme a work bundle cached.
    for (const [id, lex] of Object.entries(shard)) lexemesById.set(id, lex);
    return shard;
  });
}

// --------------------------------------------------------------- public: preload / sync reads

/**
 * Fast path for a bundled work: one small fetch (public/dict/works/<slug>.json)
 * carries every form reading and CoreLexeme that work's own chapters use.
 * Memoised per slug (rejection-clearing) — cheap to call again per chapter.
 */
export async function preloadWork(slug: string): Promise<void> {
  const manifest = await loadManifest();
  const fileName = manifest.work_bundles[slug];
  if (!fileName) throw new Error(`dictionary: no bundle for work "${slug}" (not in manifest.work_bundles)`);
  await memoAsyncKeyed(workBundlePromises, slug, async () => {
    const bundle = await fetchJson<WorkBundle>(`${baseUrl}works/${fileName}`);
    for (const [key, readings] of Object.entries(bundle.forms)) formsByKey.set(key, readings);
    for (const [id, lex] of Object.entries(bundle.lexemes)) if (!lexemesById.has(id)) lexemesById.set(id, lex);
    return bundle;
  });
}

/**
 * Fallback for text no bundle covers (a user-imported book): fetches the
 * global form shards those keys land in, then the lex shards the resulting
 * readings reference, so `candidatesFor` can run synchronously afterward.
 * Prefer `preloadWork` for anything in the bundled library.
 */
export async function preloadForms(keys: Iterable<string>): Promise<void> {
  const manifest = await loadManifest();
  const keyList = Array.from(new Set(Array.from(keys)));

  const formShardNames = new Set<string>();
  for (const key of keyList) {
    const shardName = resolveShardName(key, manifest.form_shards);
    if (shardName) formShardNames.add(shardName);
  }
  await Promise.all(Array.from(formShardNames).map((shardName) => loadFormShard(shardName, manifest.form_shards[shardName]!)));

  const neededLexemeIds = new Set<string>();
  for (const key of keyList) for (const [lexemeId] of readingsFor(key)) neededLexemeIds.add(lexemeId);

  const lexShardNames = new Set<string>();
  for (const id of neededLexemeIds) {
    const shardName = resolveShardName(lemmaOfLexemeId(id), manifest.lex_shards);
    if (shardName) lexShardNames.add(shardName);
  }
  await Promise.all(Array.from(lexShardNames).map((shardName) => loadLexShard(shardName, manifest.lex_shards[shardName]!)));
}

/** Sync lookup of every known reading for a loose key; [] when nothing is loaded/known. */
export function readingsFor(key: string): FormReading[] {
  return formsByKey.get(key) ?? [];
}

/** Sync lookup of a cached lexeme (full DictLexeme from a lex shard, or a lighter CoreLexeme from a work bundle); undefined when not loaded (yet). */
export function lexemeSync(id: string): DictLexeme | undefined {
  return lexemesById.get(id);
}

/**
 * Async, on-demand lookup of the FULL lexeme (paradigm included when it has one). Skips the
 * fetch if the cache already holds the authoritative entry (`!cached.core`) — note that's
 * NOT the same as "has a paradigm": plenty of genuinely full entries (prepositions,
 * conjunctions, particles...) never have one. Only a bundle-sourced CoreLexeme is marked
 * `core: true`; loading its real lex shard supersedes it in the cache. For paradigm views,
 * search, etc. outside a preloaded chapter.
 */
export async function lexeme(id: string): Promise<DictLexeme | undefined> {
  const cached = lexemesById.get(id);
  if (cached && !cached.core) return cached;
  const manifest = await loadManifest();
  const shardName = resolveShardName(lemmaOfLexemeId(id), manifest.lex_shards);
  if (shardName) await loadLexShard(shardName, manifest.lex_shards[shardName]!);
  return lexemesById.get(id);
}

// --------------------------------------------------------------- candidatesFor

/** Short technical label for a feature code, for the stem/ending morpheme glosses. */
function glossForCode(code: string, lexemeGender?: Gender): string {
  const parts = code.split(':');
  if (code === 'x') return 'uninflected';
  if (parts[0] === 'v' && parts[1] === 'inf') return 'infinitive';
  const CASE_NAMES: Record<string, string> = { nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', inst: 'instrumental', prep: 'prepositional', loc: 'locative', part: 'partitive', voc: 'vocative' };
  const cs = parts.find((p) => CASE_NAMES[p]);
  const num = parts.includes('pl') ? 'plural' : parts.includes('sg') ? 'singular' : undefined;
  if (parts[0] === 'n' || parts[0] === 'a' || parts[0] === 'p' || parts[0] === 'num') {
    return [num, cs ? CASE_NAMES[cs] : undefined].filter(Boolean).join(' ') || 'form';
  }
  if (parts[0] === 'v') {
    if (parts[1] === 'pf') {
      const m = /^(sg|pl)([123])$/.exec(parts[2] ?? '');
      return m ? `${m[2]}${m[1]}` : 'present/future';
    }
    if (parts[1] === 'past') return ['past', parts[2] === 'pl' ? 'plural' : parts[2] ?? (lexemeGender ?? '')].filter(Boolean).join(' ');
    if (parts[1] === 'imp') return `imperative ${parts[2] ?? ''}`.trim();
  }
  if (parts[1] === 'comp') return 'comparative';
  if (parts[1] === 'sup') return 'superlative';
  if (parts[1] === 'short') return `short ${parts[2] ?? ''}`.trim();
  return 'form';
}

/** Does `plainForm` differ from `surfacePlain` only by ё/е or a pre-reform-letter fold (same length)? */
function isOrthographicVariant(plainForm: string, surfacePlain: string): boolean {
  if (plainForm === surfacePlain) return false;
  if (plainForm.length !== surfacePlain.length) return false;
  return looseKey(plainForm) === looseKey(surfacePlain);
}

/**
 * Turns the readings for `key` into Candidates. `surface` is the token's
 * actual printed form (used only to segment stem/ending/postfix against —
 * the readings themselves come from readingsFor(key), so the lexemes they
 * reference must already be cached, see preloadWork()/preloadForms()).
 *
 * Segmentation is per-form, not from the paradigm's longest common prefix
 * (that breaks under consonant mutation / stress-shift spellings — e.g.
 * verb:спуститься's paradigm LCP is "спу", from presfut "спущусь", even
 * though every OTHER form shares "спусти"). Instead: base = surface minus
 * -ся/-сь; lemmaBase = the lemma reduced the same way (see lemmaBaseFor);
 * stem = longest common prefix(base, lemmaBase), floored at 2 letters —
 * shorter than that and we call it unsegmentable/suppletive (человек/люди)
 * rather than show a meaningless 1-letter "stem"; ending = whatever's left
 * of base. A stem more than 1 letter short of lemmaBase (the lemma's own
 * final letter, usually just its citation-form ending, doesn't count) means
 * a real stem alternation happened and gets a note.
 */
export function candidatesFor(key: string, surface: string): Candidate[] {
  const surfacePlain = surface.normalize('NFC').replace(/[̀́]/g, '').toLowerCase();
  const out: Candidate[] = [];
  for (const [lexemeId, code, stress] of readingsFor(key)) {
    const lex = lexemeSync(lexemeId);
    if (!lex) continue; // not preloaded for this reading — degrade gracefully

    const features = decodeFeatureCode(code, lex);
    if (stress >= 0) features.stress = stress;

    // shared with the analysis engine (src/dictionary/segment.ts) so chips never diverge
    const { base, stem, ending, postfix, notes } = segmentForm(surfacePlain, lex);

    const morphemes: Morpheme[] = [];
    if (stem) morphemes.push({ text: stem, role: 'stem', gloss: lex.gloss });
    else morphemes.push({ text: base, role: 'stem', gloss: lex.gloss });
    if (ending) morphemes.push({ text: ending, role: 'ending', gloss: glossForCode(code, lex.gender) });
    if (postfix) morphemes.push({ text: postfix, role: 'postfix', gloss: 'reflexive/passive marker (-ся/-сь)' });

    const { plain: lemmaPlain, stress: lemmaStress } = splitAccent(lex.acc);
    const lemmaAccented = withAcute(lemmaPlain, lemmaStress);

    const variant = isOrthographicVariant(stem + ending, surfacePlain);

    out.push({
      key: lexemeId,
      lemma: lex.lemma,
      lemmaAccented,
      pos: lex.pos,
      gloss: lex.gloss,
      senses: lex.senses,
      features,
      morphemes,
      notes,
      source: 'dictionary',
      confidence: 1,
      partner: lex.partner,
      rank: lex.rank,
      ...(variant ? { variant: true } : {}),
    });
  }
  out.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  return out;
}

export type { Candidate };
