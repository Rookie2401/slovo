#!/usr/bin/env node
/**
 * Builds the shipped dictionary (public/dict/manifest.json, forms/*.json,
 * lex/*.json) from data/dict/{nouns,verbs,adjectives,others}.csv +
 * ru_50k.txt, per PLAN.md §B / ARCHITECTURE.md.
 *
 * Usage:
 *   node scripts/build-dictionary.mjs [--all-forms] [--limit=N]
 *
 *   --all-forms   build the form index for every dictionary form, not just
 *                 ones that occur in the bundled corpus. Used automatically
 *                 when public/corpus/index.json doesn't exist yet; pass it
 *                 explicitly (usually with --limit) to develop/test before
 *                 package A's corpus has landed.
 *   --limit=N     only process the first N rows of each CSV (dev iteration).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  parseTsv,
  splitAlternatives,
  splitSenses,
  splitAccent,
  classifyOther,
  makeIdAssigner,
  lookupRank,
  parseRu50k,
  extractWordSurfaces,
  looseKey,
  shardLetter,
  foldedPrefix,
  lemmaOfLexemeId,
  groupAndSplit,
  computeStem,
  buildWorkBundle,
  applyOverrides,
  PRONOUN_ADJ_LEMMAS,
} from './dict-lib.mjs';
import { computeCoverage } from './coverage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DICT = path.join(ROOT, 'data', 'dict');
const CORPUS_DIR = path.join(ROOT, 'public', 'corpus');
const OUT_DICT = path.join(ROOT, 'public', 'dict');
const OUT_FORMS = path.join(OUT_DICT, 'forms');
const OUT_LEX = path.join(OUT_DICT, 'lex');
const OUT_WORKS = path.join(OUT_DICT, 'works');
/** per-work bundles are meant for a phone; warn loudly if one blows past this */
const WORK_BUNDLE_WARN_BYTES = 6 * 1024 * 1024;
const BUILD_LOG_DIR = path.join(ROOT, 'data', 'build');
const COVERAGE_JSON = path.join(ROOT, 'src', 'data', 'coverage.json');

const MAX_SHARD_BYTES = 300 * 1024;

// --------------------------------------------------------------- CLI args

const argv = process.argv.slice(2);
const forceAllForms = argv.includes('--all-forms');
const limitArg = argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined;

function readCsv(name) {
  const text = readFileSync(path.join(DATA_DICT, name), 'utf8');
  const { rows } = parseTsv(text);
  return limit ? rows.slice(0, limit) : rows;
}

// --------------------------------------------------------------- lexeme building

const assignId = makeIdAssigner();
/** lexemes in build order, keyed by id for O(1) lookup during partner resolution */
const lexemes = [];
const lexemeById = new Map();
/** `${pos}:${bareLemma}` -> array of ids, first-seen order, for partner resolution */
const idsByPosLemma = new Map();

function registerLexeme(lex, bareLemma) {
  lexemeById.set(lex.id, lex);
  const k = `${lex.pos}:${bareLemma}`;
  const arr = idsByPosLemma.get(k) ?? [];
  arr.push(lex.id);
  idsByPosLemma.set(k, arr);
  lexemes.push(lex);
}

function nonEmpty(s) {
  return s !== undefined && s !== '' ? s : undefined;
}

let guessedOthersCount = 0;
let skippedPronounFormRows = 0;

// ---- nouns.csv

const nounRows = readCsv('nouns.csv');
const nounPartnerBare = new Map(); // id -> bare lemma of partner
for (const row of nounRows) {
  const bare = row.bare;
  const id = assignId('noun', bare);
  const senses = splitSenses(row.translations_en);
  // the CSV's own epicene marker is "both" (e.g. сирота, коллега, судья), not "common" — map it
  const gender = row.gender === 'm' || row.gender === 'f' || row.gender === 'n' ? row.gender : row.gender === 'both' ? 'common' : undefined;
  const animacy = row.animate === '1' ? 'anim' : row.animate === '0' ? 'inan' : undefined;
  const indeclinable = row.indeclinable === '1';
  const sg = {};
  const pl = {};
  for (const col of ['nom', 'gen', 'dat', 'acc', 'inst', 'prep']) {
    const sgVal = nonEmpty(row[`sg_${col}`]);
    const plVal = nonEmpty(row[`pl_${col}`]);
    if (sgVal) sg[col] = sgVal;
    if (plVal) pl[col] = plVal;
  }
  const paradigm = {
    kind: 'noun',
    ...(Object.keys(sg).length ? { sg } : {}),
    ...(Object.keys(pl).length ? { pl } : {}),
    ...(row.sg_only === '1' ? { sg_only: true } : {}),
    ...(row.pl_only === '1' ? { pl_only: true } : {}),
  };
  const lex = {
    id,
    lemma: bare,
    acc: row.accented || bare,
    pos: 'noun',
    gloss: senses[0] ?? bare,
    senses,
    ...(gender ? { gender } : {}),
    ...(animacy ? { animacy } : {}),
    ...(indeclinable ? { indeclinable: true } : {}),
    ...((Object.keys(sg).length || Object.keys(pl).length) ? { paradigm } : {}),
  };
  registerLexeme(lex, bare);
  if (nonEmpty(row.partner)) nounPartnerBare.set(id, row.partner);
}

// ---- verbs.csv

const verbRows = readCsv('verbs.csv');
const verbPartnerBare = new Map();
for (const row of verbRows) {
  const bare = row.bare;
  const id = assignId('verb', bare);
  const senses = splitSenses(row.translations_en);
  const aspect = row.aspect === 'imperfective' || row.aspect === 'perfective' || row.aspect === 'biaspectual' ? row.aspect : undefined;
  const reflexive = bare.endsWith('ся') || bare.endsWith('сь');
  const imperative = {};
  if (nonEmpty(row.imperative_sg)) imperative.sg = row.imperative_sg;
  if (nonEmpty(row.imperative_pl)) imperative.pl = row.imperative_pl;
  const past = {};
  for (const g of ['m', 'f', 'n', 'pl']) if (nonEmpty(row[`past_${g}`])) past[g] = row[`past_${g}`];
  const presfut = {};
  for (const pn of ['sg1', 'sg2', 'sg3', 'pl1', 'pl2', 'pl3']) if (nonEmpty(row[`presfut_${pn}`])) presfut[pn] = row[`presfut_${pn}`];
  const paradigm = {
    kind: 'verb',
    infinitive: row.accented || bare,
    ...(Object.keys(imperative).length ? { imperative } : {}),
    ...(Object.keys(past).length ? { past } : {}),
    ...(Object.keys(presfut).length ? { presfut } : {}),
  };
  const lex = {
    id,
    lemma: bare,
    acc: row.accented || bare,
    pos: 'verb',
    gloss: senses[0] ?? bare,
    senses,
    ...(aspect ? { aspect } : {}),
    ...(reflexive ? { reflexive: true } : {}),
    paradigm,
  };
  registerLexeme(lex, bare);
  if (nonEmpty(row.partner)) verbPartnerBare.set(id, row.partner);
}

// ---- adjectives.csv (incl. the small closed list of pronouns declined like adjectives)

const adjRows = readCsv('adjectives.csv');
let pronounFromAdjectivesCount = 0;
for (const row of adjRows) {
  const bare = row.bare;
  const isPronoun = PRONOUN_ADJ_LEMMAS.has(bare);
  const pos = isPronoun ? 'pronoun' : 'adjective';
  const id = assignId(pos, bare);
  const senses = splitSenses(row.translations_en);
  const blocks = { m: {}, f: {}, n: {}, pl: {} };
  for (const g of ['m', 'f', 'n', 'pl']) {
    for (const c of ['nom', 'gen', 'dat', 'acc', 'inst', 'prep']) {
      const v = nonEmpty(row[`decl_${g}_${c}`]);
      if (v) blocks[g][c] = v;
    }
  }
  const short = {};
  for (const g of ['m', 'f', 'n', 'pl']) if (nonEmpty(row[`short_${g}`])) short[g] = row[`short_${g}`];
  const hasParadigm = Object.values(blocks).some((b) => Object.keys(b).length > 0) || Object.keys(short).length > 0 || nonEmpty(row.comparative) || nonEmpty(row.superlative);
  const paradigm = hasParadigm
    ? {
        kind: 'adjective',
        ...(Object.keys(blocks.m).length ? { m: blocks.m } : {}),
        ...(Object.keys(blocks.f).length ? { f: blocks.f } : {}),
        ...(Object.keys(blocks.n).length ? { n: blocks.n } : {}),
        ...(Object.keys(blocks.pl).length ? { pl: blocks.pl } : {}),
        ...(Object.keys(short).length ? { short } : {}),
        ...(nonEmpty(row.comparative) ? { comparative: row.comparative } : {}),
        ...(nonEmpty(row.superlative) ? { superlative: row.superlative } : {}),
      }
    : undefined;
  const lex = {
    id,
    lemma: bare,
    acc: row.accented || bare,
    pos,
    gloss: senses[0] ?? bare,
    senses,
    ...(paradigm ? { paradigm } : {}),
    ...(isPronoun ? { extra: { pronoun_type: 'determinative' } } : {}),
  };
  registerLexeme(lex, bare);
  if (isPronoun) pronounFromAdjectivesCount++;
}

// ---- others.csv (no POS column — closed-class tables + fallback guess)

const otherRows = readCsv('others.csv');
for (const row of otherRows) {
  const bare = row.bare;
  const classified = classifyOther(bare);
  if (classified.skip) {
    skippedPronounFormRows++;
    continue;
  }
  const id = assignId(classified.pos, bare);
  const senses = splitSenses(row.translations_en);
  const lex = {
    id,
    lemma: bare,
    acc: row.accented || bare,
    pos: classified.pos,
    gloss: senses[0] ?? bare,
    senses,
    ...(classified.gender ? { gender: classified.gender } : {}),
    ...(classified.extra ? { extra: classified.extra } : {}),
  };
  if (classified.guessed) {
    lex.extra = { ...(lex.extra ?? {}), ...(classified.note ? { note: classified.note } : { note: 'pos guessed' }) };
    guessedOthersCount++;
  }
  registerLexeme(lex, bare);
  lex.__singleFormCode = classified.code; // consumed below, not part of the shipped shape
}

console.log(`Lexemes built: nouns=${nounRows.length} verbs=${verbRows.length} adjectives=${adjRows.length - pronounFromAdjectivesCount} pronouns(adj)=${pronounFromAdjectivesCount} others=${lexemes.length - nounRows.length - verbRows.length - adjRows.length}`);
console.log(`others.csv: ${skippedPronounFormRows} pronoun case-form rows skipped (covered by package D), ${guessedOthersCount} rows POS-guessed via the ending-pattern fallback`);

// --------------------------------------------------------------- curated overrides
//
// The OpenRussian dump has occasional data errors (a wrong gender, a word filed under
// the wrong POS) that no amount of parsing logic can fix — they need a human call.
// data/curated/dict-overrides.json is a small, hand-maintained patch file applied here,
// after every lexeme has an id but before anything (partner resolution, rank, stem,
// the form index, sharding) is built from the lexeme set, so a dropped lexeme leaves no
// trace and a corrected field is what everything downstream sees.

const OVERRIDES_PATH = path.join(ROOT, 'data', 'curated', 'dict-overrides.json');
let overridesApplied = 0;
if (existsSync(OVERRIDES_PATH)) {
  const overrides = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8'));
  overridesApplied = applyOverrides({
    lexemes,
    lexemeById,
    idsByPosLemma,
    overrides,
    onUnknownId: (id, patch) => console.log(`  ! dict-overrides.json: unknown lexeme id "${id}" — nothing to apply (${patch.why ?? 'no reason given'})`),
  });
  console.log(`Curated overrides: ${overridesApplied} applied from data/curated/dict-overrides.json`);
} else {
  console.log('No data/curated/dict-overrides.json found — skipping curated overrides.');
}

// Precompute CoreLexeme.stem (longest common prefix of the paradigm cells) on every
// lexeme, once, so both the full lex shards and the per-work bundles carry it and
// candidatesFor never has to walk a paradigm at runtime to segment a surface form.
for (const lex of lexemes) lex.stem = computeStem(lex.paradigm);

// --------------------------------------------------------------- partner resolution

function resolvePartner(bareLemma, pos) {
  const ids = idsByPosLemma.get(`${pos}:${bareLemma}`);
  return ids && ids.length > 0 ? ids[0] : undefined;
}
let unresolvedPartners = 0;
for (const [id, bare] of nounPartnerBare) {
  const p = resolvePartner(bare, 'noun');
  if (p) lexemeById.get(id).partner = p;
  else unresolvedPartners++;
}
for (const [id, bare] of verbPartnerBare) {
  const p = resolvePartner(bare, 'verb');
  if (p) lexemeById.get(id).partner = p;
  else unresolvedPartners++;
}

// --------------------------------------------------------------- frequency rank

const rankMap = parseRu50k(readFileSync(path.join(DATA_DICT, 'ru_50k.txt'), 'utf8'));
let rankedCount = 0;
for (const lex of lexemes) {
  const r = lookupRank(rankMap, lex.lemma);
  if (r !== undefined) {
    lex.rank = r;
    rankedCount++;
  }
}

// --------------------------------------------------------------- form index

/** key -> array of [lexemeId, code, stress] tuples (deduped) */
const formIndex = new Map();
const seenTuples = new Set();

function addReading(rawCell, lexemeId, code) {
  if (!rawCell) return;
  for (const alt of splitAlternatives(rawCell)) {
    const { plain, stress } = splitAccent(alt);
    if (!plain) continue;
    const key = looseKey(plain);
    const tupleKey = `${key}${lexemeId}${code}${stress}`;
    if (seenTuples.has(tupleKey)) continue;
    seenTuples.add(tupleKey);
    const arr = formIndex.get(key) ?? [];
    arr.push([lexemeId, code, stress]);
    formIndex.set(key, arr);
  }
}

let fallbackCitationFormCount = 0;

for (const lex of lexemes) {
  if (lex.__singleFormCode !== undefined) {
    addReading(lex.acc, lex.id, lex.__singleFormCode);
    delete lex.__singleFormCode;
    continue;
  }
  const p = lex.paradigm;
  const readingsBefore = seenTuples.size;
  if (p) {
    if (p.kind === 'noun') {
      for (const [num, block] of [['sg', p.sg], ['pl', p.pl]]) {
        if (!block) continue;
        for (const [cs, cell] of Object.entries(block)) addReading(cell, lex.id, `n:${num}:${cs}`);
      }
    } else if (p.kind === 'adjective') {
      const prefix = lex.pos === 'pronoun' ? 'p' : 'a';
      for (const g of ['m', 'f', 'n']) {
        const block = p[g];
        if (!block) continue;
        for (const [cs, cell] of Object.entries(block)) addReading(cell, lex.id, `${prefix}:${g}:sg:${cs}`);
      }
      if (p.pl) for (const [cs, cell] of Object.entries(p.pl)) addReading(cell, lex.id, `${prefix}:pl:${cs}`);
      if (p.short) for (const [g, cell] of Object.entries(p.short)) addReading(cell, lex.id, g === 'pl' ? `${prefix}:short:pl` : `${prefix}:short:${g}`);
      if (p.comparative) addReading(p.comparative, lex.id, `${prefix}:comp`);
      if (p.superlative) addReading(p.superlative, lex.id, `${prefix}:sup`);
    } else if (p.kind === 'verb') {
      addReading(p.infinitive, lex.id, 'v:inf');
      if (p.imperative) for (const [num, cell] of Object.entries(p.imperative)) addReading(cell, lex.id, `v:imp:${num}`);
      if (p.past) for (const [g, cell] of Object.entries(p.past)) addReading(cell, lex.id, `v:past:${g}`);
      if (p.presfut) for (const [pn, cell] of Object.entries(p.presfut)) addReading(cell, lex.id, `v:pf:${pn}`);
    }
  }
  // A meaningful slice of nouns.csv/verbs.csv/adjectives.csv rows (indeclinables like
  // США/кино/пальто, but also plain missing paradigm data like "как", "бок", "пусть")
  // carry NO non-empty paradigm cell at all. Without a fallback these lexemes would be
  // unreachable from any surface form — index the bare citation form itself instead of
  // silently dropping them (TODO(integration): package D's morphology/analyze.ts should
  // still treat these as ordinary dictionary hits, not guesses, since they come from B).
  if (seenTuples.size === readingsBefore) {
    const prefix = lex.pos === 'pronoun' ? 'p' : lex.pos === 'adjective' ? 'a' : undefined;
    const defaultCode = lex.pos === 'noun' ? 'n:sg:nom' : lex.pos === 'verb' ? 'v:inf' : prefix ? `${prefix}:m:sg:nom` : 'x';
    addReading(lex.acc, lex.id, defaultCode);
    if (seenTuples.size !== readingsBefore) fallbackCitationFormCount++;
  }
}

const totalFormCountBeforeRestriction = formIndex.size;
console.log(`Citation-form fallback: ${fallbackCitationFormCount} lexemes had no usable paradigm cell in the CSV (indeclinables + missing data) — indexed their bare lemma instead of dropping them.`);

// --------------------------------------------------------------- corpus restriction

const corpusIndexPath = path.join(CORPUS_DIR, 'index.json');
const corpusExists = existsSync(corpusIndexPath);
const restrictToCorpus = corpusExists && !forceAllForms;

/** parsed corpus books, kept around (not just their keys) so buildWorkBundle can reuse them below without re-reading disk. */
const books = [];
if (corpusExists) {
  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json' && !f.endsWith('.en.json') && !f.endsWith('.cast.json'));
  for (const f of files) books.push(JSON.parse(readFileSync(path.join(CORPUS_DIR, f), 'utf8')));
}

if (restrictToCorpus) {
  const corpusKeys = new Set();
  for (const book of books) {
    for (const ch of book.chapters ?? []) {
      for (const para of ch.paragraphs ?? []) {
        for (const surf of extractWordSurfaces(para.text ?? '')) corpusKeys.add(looseKey(surf));
      }
    }
  }
  let kept = 0;
  for (const key of formIndex.keys()) if (corpusKeys.has(key)) kept++;
  for (const key of Array.from(formIndex.keys())) if (!corpusKeys.has(key)) formIndex.delete(key);
  console.log(`Corpus restriction: public/corpus/index.json found — form index restricted to ${kept} corpus keys (of ${totalFormCountBeforeRestriction} total dictionary keys).`);
} else if (corpusExists && forceAllForms) {
  console.log(`--all-forms passed: keeping all ${totalFormCountBeforeRestriction} dictionary form keys even though public/corpus/index.json exists.`);
} else {
  console.log(`public/corpus/index.json not found — building ALL-FORMS (${totalFormCountBeforeRestriction} keys); this is the automatic fallback while package A's corpus hasn't landed yet.`);
}

// --------------------------------------------------------------- per-work bundles
//
// A chapter's tokens span nearly every letter of the alphabet, so preloadForms()
// touching the global, letter-sharded form/lex index for one chapter ends up
// fetching most of the ~166 form shards and hundreds of ~300 KB lex shards —
// unusable on a phone. Ship one small self-contained bundle per bundled work
// instead (forms actually used in that work + CoreLexeme for each one's
// lexemes); the global shards stay for on-demand paradigm lookups and for
// user-imported texts that aren't covered by any bundle (preloadForms/lexeme()).

const work_bundles = {};
let maxWorkBundleBytes = 0;
let maxWorkBundleSlug = '';
const oversizedWorkBundles = [];
if (corpusExists) {
  mkdirSync(OUT_WORKS, { recursive: true });
  for (const f of readdirSync(OUT_WORKS)) unlinkSync(path.join(OUT_WORKS, f));
  for (const book of books) {
    const { forms, lexemes: bundleLexemes } = buildWorkBundle({ book, formIndex, lexemeById, maxSenses: 6 });
    const json = JSON.stringify({ slug: book.slug, forms, lexemes: bundleLexemes });
    writeFileSync(path.join(OUT_WORKS, `${book.slug}.json`), json, 'utf8');
    work_bundles[book.slug] = `${book.slug}.json`;
    const jsonBytes = Buffer.byteLength(json, 'utf8'); // not json.length (UTF-16 units) — Cyrillic is 2 bytes/char in UTF-8
    if (jsonBytes > maxWorkBundleBytes) {
      maxWorkBundleBytes = jsonBytes;
      maxWorkBundleSlug = book.slug;
    }
    if (jsonBytes > WORK_BUNDLE_WARN_BYTES) oversizedWorkBundles.push([book.slug, jsonBytes]);
  }
  console.log(`Wrote ${Object.keys(work_bundles).length} per-work bundles (largest: ${maxWorkBundleSlug}.json, ${(maxWorkBundleBytes / 1024 / 1024).toFixed(2)} MB)`);
  if (oversizedWorkBundles.length > 0) {
    for (const [slug, bytes] of oversizedWorkBundles) console.log(`  ! ${slug}.json is ${(bytes / 1024 / 1024).toFixed(2)} MB — over the ${(WORK_BUNDLE_WARN_BYTES / 1024 / 1024).toFixed(0)} MB phone-friendly target.`);
  }
} else {
  console.log('No corpus present — no per-work bundles written.');
}

// --------------------------------------------------------------- sharding

const formEntries = Array.from(formIndex.entries());
const formShards = groupAndSplit(
  formEntries,
  (key) => shardLetter(key[0] ?? '_'),
  (key, depth) => foldedPrefix(key, depth),
  MAX_SHARD_BYTES,
);

const lexEntries = lexemes.map((l) => [l.id, l]);
const lexShards = groupAndSplit(
  lexEntries,
  (id) => shardLetter(lemmaOfLexemeId(id)[0] ?? '_'),
  (id, depth) => foldedPrefix(lemmaOfLexemeId(id), depth),
  MAX_SHARD_BYTES,
);

mkdirSync(OUT_FORMS, { recursive: true });
mkdirSync(OUT_LEX, { recursive: true });
function unlinkSafe(p) {
  try {
    unlinkSync(p);
  } catch {
    /* ignore */
  }
}
for (const f of readdirSync(OUT_FORMS)) unlinkSafe(path.join(OUT_FORMS, f));
for (const f of readdirSync(OUT_LEX)) unlinkSafe(path.join(OUT_LEX, f));

const form_shards = {};
let maxFormShardBytes = 0;
let maxFormShardName = '';
for (const [name, entries] of formShards) {
  const obj = {};
  for (const [k, v] of entries) obj[k] = v;
  const json = JSON.stringify(obj);
  writeFileSync(path.join(OUT_FORMS, `${name}.json`), json, 'utf8');
  form_shards[name] = `${name}.json`;
  const jsonBytes = Buffer.byteLength(json, 'utf8');
  if (jsonBytes > maxFormShardBytes) {
    maxFormShardBytes = jsonBytes;
    maxFormShardName = name;
  }
}

const lex_shards = {};
let maxLexShardBytes = 0;
let maxLexShardName = '';
for (const [name, entries] of lexShards) {
  const obj = {};
  for (const [k, v] of entries) obj[k] = v;
  const json = JSON.stringify(obj);
  writeFileSync(path.join(OUT_LEX, `${name}.json`), json, 'utf8');
  lex_shards[name] = `${name}.json`;
  const jsonBytes = Buffer.byteLength(json, 'utf8');
  if (jsonBytes > maxLexShardBytes) {
    maxLexShardBytes = jsonBytes;
    maxLexShardName = name;
  }
}

// --------------------------------------------------------------- coverage

let coverage = { overall: 0, by_work: {} };
let coverageMode = 'no-corpus';
if (corpusExists) {
  coverageMode = restrictToCorpus ? 'corpus-restricted' : 'all-forms';
  const result = computeCoverage({ corpusDir: CORPUS_DIR, hasKey: (key) => formIndex.has(key) });
  coverage = { overall: result.overall, by_work: result.byWork };
  mkdirSync(BUILD_LOG_DIR, { recursive: true });
  writeFileSync(
    path.join(BUILD_LOG_DIR, 'unknown-forms.txt'),
    result.unknownTop300.map(([key, count]) => `${key}\t${count}`).join('\n') + '\n',
    'utf8',
  );
  console.log(`Coverage: overall ${(result.overall * 100).toFixed(2)}% of ${result.totalTokens} word tokens across ${Object.keys(result.byWork).length} work(s).`);
} else {
  mkdirSync(BUILD_LOG_DIR, { recursive: true });
  writeFileSync(path.join(BUILD_LOG_DIR, 'unknown-forms.txt'), 'public/corpus is empty — package A has not built the corpus yet, so coverage/unknown-forms could not be computed.\n', 'utf8');
  console.log('No corpus present — coverage not computed (see data/build/unknown-forms.txt).');
}

mkdirSync(path.dirname(COVERAGE_JSON), { recursive: true });
writeFileSync(
  COVERAGE_JSON,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      mode: coverageMode,
      lexeme_count: lexemes.length,
      form_count: formIndex.size,
      ranked_lexeme_count: rankedCount,
      others_csv: { skipped_pronoun_case_forms: skippedPronounFormRows, pos_guessed: guessedOthersCount, total_rows: otherRows.length },
      unresolved_aspect_gender_partners: unresolvedPartners,
      overrides_applied: overridesApplied,
      coverage,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

// --------------------------------------------------------------- manifest

const manifest = {
  version: 1,
  built_at: new Date().toISOString(),
  sources: [
    { name: 'OpenRussian dictionary dump', license: 'CC BY-SA 4.0', url: 'https://en.openrussian.org/' },
    { name: 'hermitdave FrequencyWords (ru_50k)', license: 'CC BY-SA 4.0', url: 'https://github.com/hermitdave/FrequencyWords' },
  ],
  form_shards,
  lex_shards,
  work_bundles,
  lexeme_count: lexemes.length,
  form_count: formIndex.size,
  coverage,
  // Additive fields beyond the frozen DictManifest shape in src/dictionary/types.ts (that
  // interface has no slot for this — extra JSON keys are invisible to, but harmless for, a
  // typed reader). Recorded per PLAN.md §B: "record how many were guessed in the manifest".
  others_csv_pos_guessed: guessedOthersCount,
  // Count of data/curated/dict-overrides.json entries applied (fixed fields or dropped
  // lexemes) — see the coordinator's follow-up on curated data-error overrides.
  overrides_applied: overridesApplied,
};
writeFileSync(path.join(OUT_DICT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`\nWrote ${Object.keys(form_shards).length} form shards (largest: ${maxFormShardName}.json, ${(maxFormShardBytes / 1024).toFixed(1)} KB)`);
console.log(`Wrote ${Object.keys(lex_shards).length} lex shards (largest: ${maxLexShardName}.json, ${(maxLexShardBytes / 1024).toFixed(1)} KB)`);
console.log(`Lexemes: ${lexemes.length} (ranked: ${rankedCount}); unresolved aspect/gender partners: ${unresolvedPartners}; curated overrides applied: ${overridesApplied}`);
console.log(`Form index: ${formIndex.size} keys`);
console.log('Done.');
