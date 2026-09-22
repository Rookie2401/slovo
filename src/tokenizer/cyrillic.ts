/**
 * Cyrillic tokenizer. The source text is authoritative: tokens are offsets
 * into the paragraph, `surface_original` is the exact slice. Normalisation
 * exists only for lookup.
 *
 *  - normalize(): NFC, combining stress marks (U+0301, U+0300) removed, ASCII
 *    apostrophe variants unified. Case is kept.
 *  - looseKey(): lower case, ё→е, pre-reform letters folded (ѣ→е, і→и, ѳ→ф,
 *    ѵ→и, word-final ъ after a consonant dropped). This is the dictionary key.
 *  - Hyphenated words (кто-то, по-моему, из-за, Санкт-Петербург) are ONE token;
 *    `parts` gives the pieces. A dash between spaces or a double hyphen is punctuation.
 */

export const COMBINING_ACUTE = '́';
export const COMBINING_GRAVE = '̀';

const CYRILLIC_LETTER = /[Ѐ-ӿԀ-ԯ]/;
const LATIN_LETTER = /[A-Za-zÀ-ɏ]/;

export function isCyrillicLetter(ch: string): boolean {
  return CYRILLIC_LETTER.test(ch);
}
export function isLatinLetter(ch: string): boolean {
  return LATIN_LETTER.test(ch);
}
export function isCombiningMark(ch: string): boolean {
  return ch === COMBINING_ACUTE || ch === COMBINING_GRAVE;
}
export function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}
export function hasCyrillic(s: string): boolean {
  return CYRILLIC_LETTER.test(s);
}

export const VOWELS = new Set(['а', 'е', 'ё', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я', 'ѣ', 'і', 'ѵ']);
export function isVowel(ch: string): boolean {
  return VOWELS.has(ch.toLowerCase());
}

/**
 * Printed editions (lib.ru, Tolstoy's чтò / бòльшая) mark a disambiguating
 * stress with a precomposed LATIN accented vowel inside a Cyrillic word. Map
 * those to the Cyrillic letter + a combining mark so the word stays one token
 * and the mark counts as a source stress.
 */
const LATIN_ACCENTED: Record<string, string> = {
  'ò': 'о̀', 'ó': 'о́', 'à': 'а̀', 'á': 'а́', 'è': 'ѐ', 'é': 'е́',
  'ù': 'у̀', 'ú': 'у́', 'ì': 'ѝ', 'í': 'и́', 'ý': 'ы́',
};
const LATIN_ACCENTED_RE = /[òóàáèéùúìíý]/g;
const isLatinAccented = (ch: string) => Object.prototype.hasOwnProperty.call(LATIN_ACCENTED, ch);

/** Decompose so that precomposed ѐ/ѝ (NFC of е/и + grave) expose their marks too. */
function decomposed(s: string): string {
  return s.replace(LATIN_ACCENTED_RE, (c) => LATIN_ACCENTED[c]!).normalize('NFD');
}

/** NFC, stress marks (acute and grave, incl. precomposed ѐ/ѝ and Latin ò-style marks) stripped, apostrophes unified; case preserved. */
export function normalize(s: string): string {
  return decomposed(s).replace(/[̀́]/g, '').normalize('NFC').replace(/[’ʼ`´]/g, "'");
}

/** Index of the stressed vowel in normalize(s) when s carries a stress mark (acute, or the grave that printed editions use to disambiguate чтò), else -1. */
export function sourceStressIndex(s: string): number {
  const nfd = decomposed(s);
  let out = 0;
  for (let i = 0; i < nfd.length; i++) {
    const ch = nfd[i]!;
    if (ch === COMBINING_ACUTE || ch === COMBINING_GRAVE) return out - 1;
    if (/[̀-ͯ]/.test(ch)) continue;
    out++;
  }
  return -1;
}

const PRE_REFORM: Record<string, string> = { 'ѣ': 'е', 'і': 'и', 'ѳ': 'ф', 'ѵ': 'и', 'ї': 'и' };

/** Loose dictionary key: lower case, ё→е, pre-reform letters folded, final hard sign dropped. */
export function looseKey(s: string): string {
  let k = normalize(s).toLowerCase().replace(/ё/g, 'е').replace(/[ѣіѳѵї]/g, (c) => PRE_REFORM[c] ?? c);
  if (k.length > 1 && k.endsWith('ъ') && !isVowel(k[k.length - 2]!) && k[k.length - 2] !== 'ь') k = k.slice(0, -1);
  return k;
}

/** Does the word look like pre-reform (1918) orthography? */
export function isPreReform(s: string): boolean {
  return /[ѣіѳѵ]/i.test(s) || (/[бвгджзклмнпрстфхцчшщ]ъ$/i.test(s));
}

export type TokenKind = 'word' | 'number' | 'punct' | 'latin' | 'other';

export interface RawToken {
  kind: TokenKind;
  start: number;
  end: number;
  text: string;
  /** hyphen-separated parts of a hyphenated word (кто-то → ["кто","то"]) */
  parts?: string[];
}

const isWordChar = (ch: string) => isCyrillicLetter(ch) || isCombiningMark(ch);
const isHyphen = (ch: string) => ch === '-' || ch === '‑';

/**
 * Tokenize one paragraph. Words are maximal runs of Cyrillic letters (with
 * combining marks) joined by single hyphens between letters; Latin runs are
 * `latin` (French in War and Peace); digit runs `number`; everything else
 * printable is `punct` (each punctuation cluster is one token; `--`, `…`, «»
 * kept whole); whitespace is skipped.
 */
export function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (isWordChar(ch)) {
      let j = i;
      // a Latin accented vowel (чтò) continues a Cyrillic run; it never starts one
      const runChar = (k: number) => isWordChar(text[k]!) || (k > i && isLatinAccented(text[k]!));
      while (j < n && runChar(j)) j++;
      // hyphen joins two letter runs (кто-то, из-за, по-моему)
      while (j < n - 1 && isHyphen(text[j]!) && isWordChar(text[j + 1]!)) {
        j++;
        while (j < n && runChar(j)) j++;
      }
      const t = text.slice(i, j);
      const tok: RawToken = { kind: 'word', start: i, end: j, text: t };
      if (/[-‑]/.test(t)) tok.parts = t.split(/[-‑]/);
      out.push(tok);
      i = j;
      continue;
    }
    if (isLatinLetter(ch)) {
      let j = i;
      while (j < n && (isLatinLetter(text[j]!) || (text[j] === "'" && j + 1 < n && isLatinLetter(text[j + 1]!)) || (isHyphen(text[j]!) && j + 1 < n && isLatinLetter(text[j + 1]!)))) j++;
      out.push({ kind: 'latin', start: i, end: j, text: text.slice(i, j) });
      i = j;
      continue;
    }
    if (isDigit(ch)) {
      let j = i;
      while (j < n && (isDigit(text[j]!) || ((text[j] === ',' || text[j] === '.') && j + 1 < n && isDigit(text[j + 1]!)))) j++;
      out.push({ kind: 'number', start: i, end: j, text: text.slice(i, j) });
      i = j;
      continue;
    }
    // punctuation cluster: same character repeated (…, --, !!!) or a single mark
    let j = i + 1;
    if (ch === '-' || ch === '.' || ch === '!' || ch === '?') while (j < n && (text[j] === ch || (ch === '.' && text[j] === '.'))) j++;
    out.push({ kind: 'punct', start: i, end: j, text: text.slice(i, j) });
    i = j;
  }
  return out;
}

const SENTENCE_END = /^[.!?…]+$/;
const CLOSERS = new Set(['»', '"', '”', '’', ')', '’']);
const OPENERS = new Set(['«', '"', '“', '„', '(', '—', '–', '-', '--']);

/**
 * Sentence ranges over a token list: [startIndex, endIndex) pairs. A sentence
 * ends at . ! ? … (plus any closing quotes/brackets that follow) when the next
 * word token starts with a capital letter or an opener/dash begins the next
 * sentence. Ellipses inside dialogue ("Да... я не знаю") do not end a sentence
 * when the next word is lower case.
 */
export function sentenceRanges(tokens: RawToken[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind !== 'punct' || !SENTENCE_END.test(t.text)) continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j]!.kind === 'punct' && CLOSERS.has(tokens[j]!.text)) j++;
    const next = tokens[j];
    if (!next) { ranges.push([start, tokens.length]); start = tokens.length; break; }
    const nextWord = tokens.slice(j).find((x) => x.kind !== 'punct');
    const startsCapital = nextWord ? /^[\p{Lu}]/u.test(nextWord.text) || nextWord.kind === 'number' : true;
    const opener = next.kind === 'punct' && OPENERS.has(next.text);
    if (startsCapital || opener) {
      ranges.push([start, j]);
      start = j;
      i = j - 1;
    }
  }
  if (start < tokens.length) ranges.push([start, tokens.length]);
  return ranges;
}

export function isWordToken(t: { kind: TokenKind }): boolean {
  return t.kind === 'word';
}

export interface LetterUse {
  /** the letter as printed */
  letter: string;
  /** lower-case letter (ё kept distinct) */
  lower: string;
  index: number;
}

/** Letters of a word (for the alphabet curriculum / decodability). Hyphens and marks skipped. */
export function lettersOf(word: string): LetterUse[] {
  const out: LetterUse[] = [];
  const s = normalize(word);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (isCyrillicLetter(ch)) out.push({ letter: ch, lower: ch.toLowerCase(), index: i });
  }
  return out;
}

/** Syllable count = vowel count (Russian has no syllabic consonants). */
export function syllableCount(word: string): number {
  let n = 0;
  for (const ch of normalize(word).toLowerCase()) if (VOWELS.has(ch)) n++;
  return n;
}
