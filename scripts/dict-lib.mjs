/**
 * Pure, dependency-free helpers shared by scripts/build-dictionary.mjs and
 * scripts/coverage.mjs. Plain JS (no TS import) so `node scripts/build-dictionary.mjs`
 * works directly (see package.json's `dict:build`).
 *
 * `looseKey`/`normalize`/`extractWordSurfaces` are deliberately kept in lockstep
 * with `src/tokenizer/cyrillic.ts` (`normalize`, `looseKey`, and the word-token
 * segmentation inside `tokenize`) — test/dictionary-lib.test.ts asserts equality
 * against the TS source on a battery of fixtures so the two never drift apart.
 */

// --------------------------------------------------------------- tokenizer mirror

const COMBINING_ACUTE = '́';
const COMBINING_GRAVE = '̀';

const CYRILLIC_LETTER = /[Ѐ-ӿԀ-ԯ]/;

export function isCyrillicLetter(ch) {
  return CYRILLIC_LETTER.test(ch);
}

export function isCombiningMark(ch) {
  return ch === COMBINING_ACUTE || ch === COMBINING_GRAVE;
}

const VOWELS = new Set(['а', 'е', 'ё', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я', 'ѣ', 'і', 'ѵ']);
export function isVowel(ch) {
  return VOWELS.has(ch.toLowerCase());
}

/** NFC, stress marks stripped, apostrophes unified; case preserved. Mirrors cyrillic.ts normalize(). */
export function normalize(s) {
  return s.normalize('NFC').replace(/[̀́]/g, '').replace(/[’ʼ`´]/g, "'");
}

const PRE_REFORM = { ѣ: 'е', і: 'и', ѳ: 'ф', ѵ: 'и', ї: 'и' };

/** Loose dictionary key: lower case, ё→е, pre-reform letters folded, final hard sign dropped. Mirrors cyrillic.ts looseKey(). */
export function looseKey(s) {
  let k = normalize(s)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ѣіѳѵї]/g, (c) => PRE_REFORM[c] ?? c);
  if (k.length > 1 && k.endsWith('ъ') && !isVowel(k[k.length - 2]) && k[k.length - 2] !== 'ь') k = k.slice(0, -1);
  return k;
}

const isWordChar = (ch) => isCyrillicLetter(ch) || isCombiningMark(ch);
const isHyphen = (ch) => ch === '-' || ch === '‑';

/**
 * Word-token surfaces of a text, mirroring the word-segmentation rules inside
 * `tokenize()` in cyrillic.ts (maximal Cyrillic-letter runs joined by single
 * hyphens between letters). Used at build time to know exactly which dictionary
 * keys the corpus tokenizer will actually produce, without importing the TS
 * tokenizer (so the plain `node scripts/build-dictionary.mjs` path works).
 */
export function extractWordSurfaces(text) {
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (isWordChar(ch)) {
      let j = i;
      while (j < n && isWordChar(text[j])) j++;
      while (j < n - 1 && isHyphen(text[j]) && isWordChar(text[j + 1])) {
        j++;
        while (j < n && isWordChar(text[j])) j++;
      }
      out.push(text.slice(i, j));
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

// --------------------------------------------------------------- accent helpers

/** "челове'к" -> { plain: "человек", stress: 6 }; stress -1 when no apostrophe mark. Mirrors accent.ts splitAccent(). */
export function splitAccent(acc) {
  const i = acc.indexOf("'");
  if (i < 0) return { plain: acc, stress: -1 };
  const plain = acc.slice(0, i) + acc.slice(i + 1);
  return { plain, stress: i - 1 };
}

/** Put the combining acute over the stressed vowel for display. Mirrors accent.ts withAcute(). */
export function withAcute(plain, stress) {
  if (stress < 0 || stress >= plain.length) return plain;
  return plain.slice(0, stress + 1) + COMBINING_ACUTE + plain.slice(stress + 1);
}

// --------------------------------------------------------------- CSV (TSV)

/** Tab-separated, header row, no quoting. Returns array of plain objects keyed by header. */
export function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split('\t');
  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split('\t');
    const row = {};
    for (let ci = 0; ci < header.length; ci++) row[header[ci]] = cols[ci] ?? '';
    rows.push(row);
  }
  return { header, rows };
}

/** Paradigm cells may hold comma-separated alternatives ("то'т, того'"). */
export function splitAlternatives(cell) {
  if (!cell) return [];
  return cell
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** translations_en: ';' between senses, ',' inside a sense (kept as-is within a sense). */
export function splitSenses(cell) {
  if (!cell) return [];
  return cell
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// --------------------------------------------------------------- shard naming

/** First letter of a key, folded like looseKey (ё->е, pre-reform folded); non Cyrillic-letter -> "_". */
export function shardLetter(ch) {
  if (!ch) return '_';
  const k = looseKey(ch);
  const c = k[0] ?? '_';
  return isCyrillicLetter(c) ? c : '_';
}

/**
 * Resolve the shard name a given lookup string belongs to, given the shard
 * sizes already decided at build time (shardsOfLetter: letter -> array of
 * final shard names starting with that letter, longest-prefix-first). Tries
 * increasingly long prefixes (1, 2, 3 letters, folded) until one names a shard
 * that was actually written; falls back to the bare single letter.
 */
export function foldedPrefix(key, len) {
  let out = '';
  for (let i = 0; i < len && i < key.length; i++) out += shardLetter(key[i]);
  return out;
}

/** `pos:lemma` or `pos:lemma#2` -> `lemma`. */
export function lemmaOfLexemeId(id) {
  const colon = id.indexOf(':');
  const rest = colon >= 0 ? id.slice(colon + 1) : id;
  return rest.replace(/#\d+$/, '');
}

/**
 * Groups `[key, value]` entries into shards no bigger than `maxBytes`
 * (approximated as each entry's JSON size), first by the folded first
 * letter of `letterOf(key)`, then splitting any oversized letter-group by
 * increasingly long folded prefixes (up to 6) — the same scheme
 * `resolveShardName` above expects to be able to reconstruct from just the
 * key and the final set of shard names. Returns Map<shardName, entries[]>.
 */
export function groupAndSplit(entries, letterOf, prefixOfDepth, maxBytes) {
  const byLetter = new Map();
  for (const e of entries) {
    const l = letterOf(e[0]);
    const arr = byLetter.get(l) ?? [];
    arr.push(e);
    byLetter.set(l, arr);
  }
  const shards = new Map();
  function place(name, group, depth) {
    // UTF-8 byte length, not JS string .length (UTF-16 code units) — Cyrillic text is 2
    // bytes/char in UTF-8, so .length alone understates real file size by ~1.3-1.5x and let
    // shards through well over the target (caught by an on-disk size check post-build).
    const size = group.reduce((n, [k, v]) => n + Buffer.byteLength(k, 'utf8') + Buffer.byteLength(JSON.stringify(v), 'utf8') + 4, 2);
    if (size <= maxBytes || depth >= 6) {
      shards.set(name, group);
      return;
    }
    const sub = new Map();
    for (const e of group) {
      const p = prefixOfDepth(e[0], depth + 1);
      const arr = sub.get(p) ?? [];
      arr.push(e);
      sub.set(p, arr);
    }
    for (const [p, g] of sub) place(p, g, depth + 1);
  }
  for (const [letter, group] of byLetter) place(letter, group, 1);
  return shards;
}

/**
 * `known` is a shard-name -> filename record, e.g. DictManifest.form_shards / .lex_shards.
 * Must try the LONGEST folded prefix first, down to 1: a build-time split is a strict
 * partition, so at most one prefix length is ever a given lemma's real terminal shard — but
 * a SHORTER prefix can still coincidentally exist as its own (unrelated) shard, e.g. the
 * lemma "с" (a one-letter preposition) gets its own tiny shard "с.json" even though every
 * other с-word lives under a deeper shard like "сп.json". Searching short-to-long would
 * wrongly stop at "с" for every с-word. Mirrors src/dictionary/index.ts's resolveShardName.
 */
export function resolveShardName(key, known) {
  const folded = key
    .split('')
    .map((c) => (isCyrillicLetter(looseKey(c)[0] ?? '') ? looseKey(c) : '_'))
    .join('');
  for (let len = Math.min(6, folded.length); len >= 1; len--) {
    const prefix = folded.slice(0, len);
    if (Object.prototype.hasOwnProperty.call(known, prefix)) return prefix;
  }
  return Object.prototype.hasOwnProperty.call(known, '_') ? '_' : undefined;
}

// --------------------------------------------------------------- closed classes (others.csv)

export const PREPOSITIONS = new Set([
  'в', 'во', 'на', 'с', 'со', 'к', 'ко', 'у', 'о', 'об', 'обо', 'от', 'ото', 'до', 'из', 'изо',
  'для', 'без', 'безо', 'под', 'подо', 'над', 'перед', 'передо', 'при', 'про', 'через', 'чрез',
  'сквозь', 'между', 'меж', 'среди', 'посреди', 'вместо', 'вокруг', 'около', 'после', 'кроме',
  'ради', 'благодаря', 'согласно', 'вопреки', 'навстречу', 'вдоль', 'поперёк', 'внутри', 'вне',
  'возле', 'близ', 'против', 'мимо', 'сверх', 'помимо', 'путём', 'по', 'за', 'из-за', 'из-под',
  'по-над', 'ввиду', 'вследствие', 'насчёт', 'наподобие', 'посредством', 'сверху', 'снизу',
  'позади', 'впереди', 'касательно', 'исходя', 'спустя', 'включая', 'исключая', 'несмотря',
]);

export const CONJUNCTIONS = new Set([
  'и', 'а', 'но', 'да', 'или', 'либо', 'ни', 'что', 'чтобы', 'чтоб', 'если', 'когда', 'пока',
  'покуда', 'хотя', 'хоть', 'потому', 'поэтому', 'так', 'как', 'чем', 'нежели', 'словно', 'будто',
  'ибо', 'зато', 'однако', 'также', 'тоже', 'притом', 'причём', 'раз', 'дабы', 'коли', 'ежели',
]);

export const PARTICLES = new Set([
  'не', 'ни', 'ли', 'ль', 'бы', 'б', 'же', 'ж', 'вот', 'вон', 'это', 'только', 'лишь', 'уже',
  'ещё', 'еще', 'даже', 'разве', 'неужели', 'ведь', 'почти', 'именно', 'просто', 'прямо', 'чуть',
  'едва', 'якобы', 'авось', 'нате', 'пусть', 'пускай', 'давай', 'давайте', 'вроде', 'типа', 'мол',
  'де', 'таки', 'ка', 'то', 'небось', 'ага', 'угу', 'нет',
]);

export const NUMERALS = new Set([
  'один', 'одна', 'одно', 'одни', 'два', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь',
  'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать', 'двадцать', 'тридцать', 'сорок',
  'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто', 'сто', 'двести', 'триста',
  'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот', 'тысяча', 'миллион',
  'миллиард', 'сколько', 'несколько', 'оба', 'обе', 'полтора', 'полтораста',
]);

export const PREDICATIVES = new Set([
  'надо', 'нельзя', 'можно', 'жаль', 'нужно', 'пора', 'жалко', 'стыдно', 'страшно', 'видно',
  'слышно', 'известно', 'понятно', 'холодно', 'жарко', 'темно', 'светло', 'весело', 'скучно',
  'грустно', 'больно', 'душно', 'тихо', 'спокойно',
]);

/** Nominative personal/interrogative pronoun lemmas kept as `pronoun` lexemes from others.csv. */
export const PERSONAL_PRONOUNS = new Set(['я', 'ты', 'он', 'она', 'оно', 'мы', 'вы', 'они', 'себя', 'кто', 'что']);

/** person/gender/pronoun_type of the personal pronoun's nominative lemma, for the feature code + lexeme fields. */
export const PERSONAL_PRONOUN_INFO = {
  я: { person: 1, number: 'sg', code: 'p:1:sg:nom' },
  ты: { person: 2, number: 'sg', code: 'p:2:sg:nom' },
  он: { person: 3, number: 'sg', gender: 'm', code: 'p:3:sg:nom' },
  она: { person: 3, number: 'sg', gender: 'f', code: 'p:3:sg:nom' },
  оно: { person: 3, number: 'sg', gender: 'n', code: 'p:3:sg:nom' },
  мы: { person: 1, number: 'pl', code: 'p:1:pl:nom' },
  вы: { person: 2, number: 'pl', code: 'p:2:pl:nom' },
  они: { person: 3, number: 'pl', code: 'p:3:pl:nom' },
  себя: { pronoun_type: 'reflexive', code: 'p:refl' },
  кто: { pronoun_type: 'interrogative', code: 'p:interr:nom' },
  что: { pronoun_type: 'interrogative', code: 'p:interr:nom' },
};

/**
 * others.csv rows that are inflected case forms of the personal pronouns
 * above (меня, ему, её, нас…). A hand-written pronoun table in package D
 * covers recognising these; package B skips them so it doesn't ship a
 * second, incomplete source of truth for the same forms.
 */
export const SKIP_PRONOUN_CASE_FORMS = new Set([
  'меня', 'мне', 'мной', 'мною', 'тебя', 'тебе', 'тобой', 'тобою', 'его', 'ему', 'им', 'её', 'ее',
  'ей', 'ею', 'нас', 'нам', 'нами', 'вас', 'вам', 'вами', 'их', 'ими', 'него', 'нему', 'ним',
  'неё', 'нее', 'ней', 'них', 'ними', 'кого', 'кому', 'кем', 'чего', 'чему', 'чём', 'чем',
]);

/** adjectives.csv lemmas that are grammatically pronouns (declined like adjectives). */
export const PRONOUN_ADJ_LEMMAS = new Set([
  'тот', 'этот', 'весь', 'который', 'сам', 'самый', 'мой', 'твой', 'свой', 'наш', 'ваш', 'такой',
  'каждый', 'другой', 'иной', 'никакой', 'некоторый', 'некий', 'ничей', 'какой', 'чей', 'всякий',
]);

/**
 * Classify an others.csv row (no POS column in the source). Closed-class
 * tables first, then the ending-pattern fallback from PLAN.md §B:
 * adverb when the word ends -о/-е/-и/-ски, else particle with a
 * `note: 'pos guessed'`.
 */
export function classifyOther(bare) {
  if (SKIP_PRONOUN_CASE_FORMS.has(bare)) return { skip: true };
  if (PERSONAL_PRONOUNS.has(bare)) {
    const info = PERSONAL_PRONOUN_INFO[bare];
    return { pos: 'pronoun', code: info.code, extra: { pronoun_type: info.pronoun_type ?? 'personal' }, gender: info.gender };
  }
  if (PREPOSITIONS.has(bare)) return { pos: 'preposition', code: 'x' };
  if (CONJUNCTIONS.has(bare)) return { pos: 'conjunction', code: 'x' };
  if (NUMERALS.has(bare)) return { pos: 'numeral', code: 'x' };
  if (PREDICATIVES.has(bare)) return { pos: 'predicative', code: 'x' };
  if (PARTICLES.has(bare)) return { pos: 'particle', code: 'x' };
  if (/[оеи]$/.test(bare) || /ски$/.test(bare)) return { pos: 'adverb', code: 'x', guessed: true };
  return { pos: 'particle', code: 'x', guessed: true, note: 'pos guessed' };
}

// --------------------------------------------------------------- misc build helpers

/** Assigns `pos:lemma` ids, suffixing homographs `#2`, `#3`, … in first-seen order. */
export function makeIdAssigner() {
  const seen = new Map();
  return function assignId(pos, lemma) {
    const base = `${pos}:${lemma}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
}

/** rank: exact match on the lemma against the ru_50k map; retry with ё->е when not found. */
export function lookupRank(rankMap, lemma) {
  if (rankMap.has(lemma)) return rankMap.get(lemma);
  const folded = lemma.replace(/ё/g, 'е');
  if (folded !== lemma && rankMap.has(folded)) return rankMap.get(folded);
  return undefined;
}

export function parseRu50k(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/);
  let rank = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    rank++;
    const sp = line.lastIndexOf(' ');
    const word = sp >= 0 ? line.slice(0, sp) : line;
    if (!map.has(word)) map.set(word, rank);
  }
  return map;
}

// --------------------------------------------------------------- CoreLexeme / per-work bundles

/** Every accented paradigm-cell string of a lexeme's paradigm, flattened (raw, still accented). */
export function paradigmCells(paradigm) {
  if (!paradigm) return [];
  const out = [];
  const pushBlock = (block) => {
    if (!block) return;
    for (const v of Object.values(block)) if (v) out.push(v);
  };
  if (paradigm.kind === 'noun') {
    pushBlock(paradigm.sg);
    pushBlock(paradigm.pl);
  } else if (paradigm.kind === 'adjective') {
    pushBlock(paradigm.m);
    pushBlock(paradigm.f);
    pushBlock(paradigm.n);
    pushBlock(paradigm.pl);
    pushBlock(paradigm.short);
    if (paradigm.comparative) out.push(paradigm.comparative);
    if (paradigm.superlative) out.push(paradigm.superlative);
  } else if (paradigm.kind === 'verb') {
    if (paradigm.infinitive) out.push(paradigm.infinitive);
    pushBlock(paradigm.imperative);
    pushBlock(paradigm.past);
    pushBlock(paradigm.presfut);
  }
  return out;
}

/** Longest common prefix of a set of (already plain/unaccented) strings. */
export function longestCommonPrefix(strings) {
  const nonEmpty = strings.filter((s) => s.length > 0);
  if (nonEmpty.length === 0) return '';
  let prefix = nonEmpty[0];
  for (const s of nonEmpty.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++;
    prefix = prefix.slice(0, i);
    if (prefix === '') break;
  }
  return prefix;
}

/**
 * Precomputed `CoreLexeme.stem`: longest common prefix (plain, unaccented) of
 * the paradigm cells; '' when there's no paradigm at all, or when the
 * lexeme is suppletive (человек/люди — no common prefix despite having cells).
 * Mirrored by index.ts's paradigm-based fallback (same computation, just run
 * lazily at runtime instead of once at build time) — test/dictionary-work-bundle.test.ts
 * asserts they agree.
 */
export function computeStem(paradigm) {
  const cells = paradigmCells(paradigm).map((c) => splitAccent(c).plain);
  return cells.length > 0 ? longestCommonPrefix(cells) : '';
}

/**
 * Reduces a full lexeme (with `stem` already set, see computeStem) to the shape shipped in
 * a work bundle. `core: true` marks it as the lighter, paradigm-less shape — the runtime's
 * lexeme(id) uses that (not "does it have a paradigm?", which a genuinely full entry can
 * also lack, e.g. a preposition) to know it still needs upgrading to the authoritative one.
 */
export function toCoreLexeme(lex, maxSenses = 6) {
  const core = {
    id: lex.id,
    lemma: lex.lemma,
    acc: lex.acc,
    pos: lex.pos,
    gloss: lex.gloss,
    senses: (lex.senses ?? []).slice(0, maxSenses),
    stem: lex.stem ?? computeStem(lex.paradigm),
    core: true,
  };
  if (lex.gender) core.gender = lex.gender;
  if (lex.animacy) core.animacy = lex.animacy;
  if (lex.aspect) core.aspect = lex.aspect;
  if (lex.partner) core.partner = lex.partner;
  if (lex.indeclinable) core.indeclinable = true;
  if (lex.reflexive) core.reflexive = true;
  if (lex.rank !== undefined) core.rank = lex.rank;
  if (lex.extra) core.extra = lex.extra;
  return core;
}

/**
 * Builds one work's lightweight bundle: only the form-index entries for keys
 * that actually occur in `book`'s paragraphs, plus CoreLexeme entries for
 * every lexeme those readings reference. `formIndex`/`lexemeById` are the
 * build's global, already-restricted Maps (key -> FormReading[], id -> full lexeme).
 */
export function buildWorkBundle({ book, formIndex, lexemeById, maxSenses = 6 }) {
  const forms = {};
  const neededIds = new Set();
  for (const ch of book.chapters ?? []) {
    for (const para of ch.paragraphs ?? []) {
      for (const surf of extractWordSurfaces(para.text ?? '')) {
        const key = looseKey(surf);
        if (Object.prototype.hasOwnProperty.call(forms, key)) continue;
        const readings = formIndex.get(key);
        if (!readings) continue;
        forms[key] = readings;
        for (const [id] of readings) neededIds.add(id);
      }
    }
  }
  const lexemes = {};
  for (const id of neededIds) {
    const lex = lexemeById.get(id);
    if (!lex) continue;
    lexemes[id] = toCoreLexeme(lex, maxSenses);
  }
  return { forms, lexemes };
}

// --------------------------------------------------------------- curated overrides

/**
 * Applies a small hand-maintained patch file (data/curated/dict-overrides.json) to the
 * in-progress lexeme set: fixes a wrong field (gender, animacy, pos, gloss, aspect,
 * partner) or drops a lexeme entirely (`drop: true`) that shouldn't exist at all. Mutates
 * `lexemes`/`lexemeById`/`idsByPosLemma` in place; returns the number of entries applied
 * (an unknown id in `overrides` is reported via `onUnknownId`, not counted or thrown on —
 * the build should never crash over a stale override key).
 */
export function applyOverrides({ lexemes, lexemeById, idsByPosLemma, overrides, onUnknownId }) {
  let applied = 0;
  for (const [id, patch] of Object.entries(overrides)) {
    const lex = lexemeById.get(id);
    if (!lex) {
      if (onUnknownId) onUnknownId(id, patch);
      continue;
    }
    if (patch.drop) {
      const idx = lexemes.indexOf(lex);
      if (idx >= 0) lexemes.splice(idx, 1);
      lexemeById.delete(id);
      const posLemmaKey = `${lex.pos}:${lex.lemma}`;
      const siblingIds = idsByPosLemma?.get(posLemmaKey);
      if (siblingIds) {
        const i = siblingIds.indexOf(id);
        if (i >= 0) siblingIds.splice(i, 1);
      }
      applied++;
      continue;
    }
    if (patch.gender !== undefined) lex.gender = patch.gender;
    if (patch.animacy !== undefined) lex.animacy = patch.animacy;
    if (patch.pos !== undefined) lex.pos = patch.pos;
    if (patch.gloss !== undefined) lex.gloss = patch.gloss;
    if (patch.aspect !== undefined) lex.aspect = patch.aspect;
    if (patch.partner !== undefined) lex.partner = patch.partner;
    applied++;
  }
  return applied;
}
