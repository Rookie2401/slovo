/**
 * The Russian (modern Cyrillic) alphabet inventory as the learner meets it:
 * all 33 letters with name, IPA sound(s), hard/soft pairing, voiced/voiceless
 * partner, confusables for an English-literate reader, and a description of
 * the cursive/italic shape (the glyph itself is the same Cyrillic character —
 * the italic look comes from `font-style: italic` on PT Serif; `cursiveNote`
 * spells out in words how the shape changes, since several letters change a
 * great deal: т→"m"-like, д→"g"/"∂"-like, г→"ᴦ"-like, и→"u"-like, п→"n"-like).
 *
 * Also: the four pre-reform (1918) letters ѣ і ѳ ѵ as a recognition-only
 * group, and the stress mark (´) as a sign.
 */

export type SymbolKind = 'vowel' | 'consonant' | 'sign';

export interface RuleExample {
  word: string;
  /** index of the stressed vowel in the normalized word, -1 if not applicable */
  stressIndex: number;
  translit: string;
  ipa: string;
}

export interface Rule {
  title: string;
  text: string;
  examples: RuleExample[];
}

export interface SymbolInfo {
  /** canonical upper-case form, e.g. 'А' */
  symbol: string;
  /** lower-case form, e.g. 'а' */
  lower: string;
  kind: SymbolKind;
  /** the Russian name of the letter, e.g. "бэ" */
  name: string;
  /** sound(s): hard first, then soft, for paired consonants; one entry otherwise */
  ipa: string[];
  articulation: string;
  vowel?: boolean;
  /** е ё ю я: pronounced with a [j] glide word-initially / after a vowel / after ъ ь */
  iotated?: boolean;
  /** vowel that signals a preceding consonant is soft: е ё и ю я */
  softIndicator?: boolean;
  /** for consonants */
  hardness?: 'paired' | 'always-hard' | 'always-soft';
  voiced?: boolean;
  /** the letter that shares this one's place/manner but opposite voicing */
  voicedPartner?: string;
  /** visually confusable Cyrillic letters (for drill distractors) */
  confusable?: string[];
  /** the Latin letter an English reader may mistake this for, and why */
  latinConfusable?: string;
  /** the printed form; the italic/cursive look is CSS font-style:italic on the same character */
  cursive: string;
  /** words describing how the cursive/italic shape differs from the printed one */
  cursiveNote: string;
  /** pre-reform (1918) letter, recognition only */
  preReform?: boolean;
  /** modern equivalent, for pre-reform letters */
  pair?: string;
  notes?: string;
}

function V(symbol: string, name: string, ipa: string[], extra: Partial<SymbolInfo> = {}): SymbolInfo {
  return {
    symbol,
    lower: symbol.toLowerCase(),
    kind: 'vowel',
    name,
    ipa,
    vowel: true,
    articulation: '',
    cursive: symbol,
    cursiveNote: 'a slanted form of the printed letter, otherwise unchanged',
    ...extra,
  };
}

function C(symbol: string, name: string, ipa: string[], hardness: SymbolInfo['hardness'], voiced: boolean, voicedPartner: string | undefined, extra: Partial<SymbolInfo> = {}): SymbolInfo {
  return {
    symbol,
    lower: symbol.toLowerCase(),
    kind: 'consonant',
    name,
    ipa,
    hardness,
    voiced,
    voicedPartner,
    articulation: '',
    cursive: symbol,
    cursiveNote: 'a slanted form of the printed letter, otherwise unchanged',
    ...extra,
  };
}

export const VOWELS: SymbolInfo[] = [
  V('А', 'а', ['a'], { articulation: 'open central vowel, like a in "father" when stressed', latinConfusable: 'A — looks the same, and the stressed sound is close too' }),
  V('О', 'о', ['o'], { articulation: 'mid back rounded vowel, like o in British "more"; reduces sharply when unstressed (аканье)', latinConfusable: 'O — looks the same and is a reasonable guess for the stressed sound' }),
  V('У', 'у', ['u'], { articulation: 'like oo in "moon"', latinConfusable: 'Y — looks like a Latin Y but sounds like "oo"; a false friend' }),
  V('Ы', 'ы', ['ɨ'], { articulation: 'a back unrounded vowel with no real English equivalent — say "ee" with the tongue pulled back and lips unrounded; never begins a native Russian word', cursiveNote: 'the two halves (ь + a short stroke) stay separate, slanted, usually joined by a small connecting stroke' }),
  V('Э', 'э', ['e'], { articulation: 'like e in "met"; mostly loanwords and a few native words (это, этот, эти)', confusable: ['З'], notes: 'Not the same letter as З (zе) — э opens to the left, з is a closed curve.' }),
  V('И', 'и', ['i'], { articulation: 'like ee in "see"; signals that the preceding consonant is soft', softIndicator: true, confusable: ['Й', 'Н'], latinConfusable: 'a mirrored capital N — mind the direction of the diagonal stroke', cursiveNote: 'becomes a rounded shape close to a Latin cursive "u" — very different from the print form; do not confuse it with print и once italicised' }),
  V('Е', 'е', ['je', 'ʲe'], { articulation: 'ye as in "yes" word-initially, after a vowel, or after ъ/ь; softens the preceding consonant and sounds like plain e elsewhere', iotated: true, softIndicator: true, latinConfusable: 'E — looks the same but is never just a plain "e" sound in isolation', confusable: ['Ё', 'Э'] }),
  V('Ё', 'ё', ['jo', 'ʲo'], { articulation: 'yo as in "yonder"; always carries the stress of its word; print (and this app, per the setting) often leaves the dots off and writes it as е', iotated: true, softIndicator: true, confusable: ['Е'] }),
  V('Ю', 'ю', ['ju', 'ʲu'], { articulation: 'yu as in "you"', iotated: true, softIndicator: true }),
  V('Я', 'я', ['ja', 'ʲa'], { articulation: 'ya as in "yard"', iotated: true, softIndicator: true }),
];

export const CONSONANTS: SymbolInfo[] = [
  C('Б', 'бэ', ['b', 'bʲ'], 'paired', true, 'П', { articulation: 'voiced labial stop', latinConfusable: 'B — looks and sounds the same' }),
  C('В', 'вэ', ['v', 'vʲ'], 'paired', true, 'Ф', { articulation: 'voiced labiodental fricative', confusable: ['Б'], latinConfusable: 'looks like a Latin B but sounds like V — a false friend' }),
  C('Г', 'гэ', ['ɡ', 'ɡʲ'], 'paired', true, 'К', { articulation: 'voiced velar stop; in a few words (its own genitive ending -ого/-его, лёгкий, мягкий, бог) it is pronounced [v] or [x] instead', cursiveNote: 'loses its printed right angle and becomes a small raised hook, close to the shape "ᴦ" — quite different from print' }),
  C('Д', 'дэ', ['d', 'dʲ'], 'paired', true, 'Т', { articulation: 'voiced dental stop', cursiveNote: 'grows a loop that drops below the line, close to a Latin cursive "g" (or the "∂" partial-derivative sign) — very different from the print form' }),
  C('Ж', 'жэ', ['ʐ'], 'always-hard', true, 'Ш', { articulation: 'voiced postalveolar fricative, like the s in "pleasure"; always hard even when written before и/е', confusable: ['Х'] }),
  C('З', 'зэ', ['z', 'zʲ'], 'paired', true, 'С', { articulation: 'voiced dental fricative, like z in "zoo"', confusable: ['Э'], notes: 'Not the same letter as Э — з is a closed curve open to the left with a flat top and bottom.' }),
  C('К', 'ка', ['k', 'kʲ'], 'paired', false, 'Г', { articulation: 'voiceless velar stop, like k in "skate" (unaspirated)', latinConfusable: 'K — looks and sounds the same' }),
  C('Л', 'эль', ['l', 'lʲ'], 'paired', true, undefined, { articulation: 'a sonorant (always voiced, no voiceless partner); hard л is "dark" (tongue back), soft ль is close to English "ly"', cursiveNote: 'gains a small opening hook/loop before the upstroke, used to join smoothly from the previous letter' }),
  C('М', 'эм', ['m', 'mʲ'], 'paired', true, undefined, { articulation: 'sonorant bilabial nasal, like m in "moon"', latinConfusable: 'M — looks and sounds the same', cursiveNote: 'gains the same opening hook as л before its three humps' }),
  C('Н', 'эн', ['n', 'nʲ'], 'paired', true, undefined, { articulation: 'sonorant dental nasal, like n in "net"', latinConfusable: 'looks like a Latin H but sounds like N — a false friend' }),
  C('П', 'пэ', ['p', 'pʲ'], 'paired', false, 'Б', { articulation: 'voiceless labial stop, like p in "spin" (unaspirated)', cursiveNote: 'the top crossbar drops and rounds, so the letter becomes close to a Latin cursive "n" — different from the print form' }),
  C('Р', 'эр', ['r', 'rʲ'], 'paired', true, undefined, { articulation: 'sonorant alveolar trill/tap, like a rolled Scottish r', latinConfusable: 'looks like a Latin P but sounds like R — a false friend' }),
  C('С', 'эс', ['s', 'sʲ'], 'paired', false, 'З', { articulation: 'voiceless dental fricative, like s in "sun"', latinConfusable: 'looks like a Latin C but sounds like S — a false friend' }),
  C('Т', 'тэ', ['t', 'tʲ'], 'paired', false, 'Д', { articulation: 'voiceless dental stop, like t in "stop" (unaspirated)', latinConfusable: 'T — looks and sounds the same', confusable: ['Г', 'Ш'], cursiveNote: 'grows a bar over the top (like a macron) or three legs, close to a Latin cursive "m" — different from print, and easily confused with cursive ш if the bar is missing' }),
  C('Ф', 'эф', ['f', 'fʲ'], 'paired', false, 'В', { articulation: 'voiceless labiodental fricative, like f in "fun"' }),
  C('Х', 'ха', ['x', 'xʲ'], 'paired', false, undefined, { articulation: 'voiceless velar fricative, like ch in Scottish "loch"; no voiced partner', latinConfusable: 'looks like a Latin X but sounds like "kh" — a false friend', confusable: ['Ж'] }),
  C('Ц', 'цэ', ['ts'], 'always-hard', false, undefined, { articulation: 'voiceless dental affricate, like ts in "cats"; always hard', confusable: ['Щ'] }),
  C('Ч', 'че', ['tɕ'], 'always-soft', false, undefined, { articulation: 'voiceless palatal affricate, like ch in "cheese"; always soft. In что, чтобы and a handful of other words it is pronounced ш instead.', notes: 'что → [ʂto], not [tɕto] — a fixed exception worth learning as a whole word.' }),
  C('Ш', 'ша', ['ʂ'], 'always-hard', false, 'Ж', { articulation: 'voiceless postalveolar fricative, like sh in "shop"; always hard even when written before и/е', confusable: ['Щ', 'Т'] }),
  C('Щ', 'ща', ['ɕː'], 'always-soft', false, undefined, { articulation: 'voiceless, long, soft "shch" — like fresh cheese in "fresh cheese" said quickly; always soft', confusable: ['Ш', 'Ц'] }),
  C('Й', 'и краткое', ['j'], 'always-soft', true, undefined, { articulation: 'the consonant "y" sound, like y in "yes"; always soft; carries a breve (˘) so it is never confused with a vowel', confusable: ['И'], notes: 'A consonant, not a vowel, even though it looks like и with a mark on top.' }),
];

export const SIGNS: SymbolInfo[] = [
  { symbol: 'Ъ', lower: 'ъ', kind: 'sign', name: 'твёрдый знак', ipa: [''], articulation: 'no sound of its own: marks that a following iotated vowel (е ё ю я) keeps its [j] glide after a prefix ending in a consonant (съезд, объявить) — the consonant stays hard', cursive: 'Ъ', cursiveNote: 'a small slanted stroke with a short leg on the right; easy to confuse with cursive ь, which has no leg', confusable: ['Ь'] },
  { symbol: 'Ь', lower: 'ь', kind: 'sign', name: 'мягкий знак', ipa: [''], articulation: 'no sound of its own: marks that the preceding consonant is soft (мать, коньки) or, before a vowel, that the vowel keeps its [j] glide (пью, статья)', cursive: 'Ь', cursiveNote: 'a small loop with a short vertical stroke; no leg, unlike cursive ъ', confusable: ['Ъ', 'Ы'] },
];

export const ALL_LETTERS: SymbolInfo[] = [...VOWELS, ...CONSONANTS, ...SIGNS];

/** The four pre-reform (pre-1918) letters, recognition only. */
export const PRE_REFORM: SymbolInfo[] = [
  { symbol: 'Ѣ', lower: 'ѣ', kind: 'vowel', name: 'ять (yat)', ipa: ['e'], vowel: true, articulation: 'pronounced exactly like е after the 1918 reform folded it in; spelled ѣ in words such as хлѣбъ (хлеб), рѣка (река) in pre-reform texts', cursive: 'Ѣ', cursiveNote: 'a slanted form of the printed letter', preReform: true, pair: 'Е', notes: 'Recognition only — Wikisource Azbuka-era texts and old book titles use it; the tokenizer folds it to е for lookup.' },
  { symbol: 'І', lower: 'і', kind: 'vowel', name: 'и десятеричное (i desyatirichnoye)', ipa: ['i'], vowel: true, articulation: 'pronounced exactly like и; written instead of и before another vowel or before й (Россія, мірь) and in the word міръ "world" (vs миръ "peace")', cursive: 'І', cursiveNote: 'a slanted form of the printed letter, with the dot kept', preReform: true, pair: 'И', notes: 'Recognition only — folded to и by the tokenizer.' },
  { symbol: 'Ѳ', lower: 'ѳ', kind: 'consonant', name: 'фита (fita)', ipa: ['f'], articulation: 'pronounced exactly like ф; used in Greek-derived words (ѳеатръ театр, Ѳедоръ Фёдор) to preserve the Greek θ', cursive: 'Ѳ', cursiveNote: 'a slanted form of the printed letter (a circle crossed by a vertical stroke)', preReform: true, pair: 'Ф', notes: 'Recognition only — folded to ф by the tokenizer.' },
  { symbol: 'Ѵ', lower: 'ѵ', kind: 'vowel', name: 'ижица (izhitsa)', ipa: ['i'], vowel: true, articulation: 'pronounced like и (occasionally в); very rare even in pre-reform texts, mostly church usage (мѵро, сѵнодъ)', cursive: 'Ѵ', cursiveNote: 'a slanted form of the printed letter (a V-like shape)', preReform: true, pair: 'И', notes: 'Recognition only — folded to и by the tokenizer.' },
];

/** The stress mark, entered as a combining acute over the stressed vowel. */
export const STRESS_MARK: SymbolInfo = {
  symbol: '́',
  lower: '́',
  kind: 'sign',
  name: 'знак ударения (stress mark)',
  ipa: [''],
  articulation: 'a combining acute accent placed over the stressed vowel (мо́ре, молоко́); not part of normal spelling — dictionaries, primers and disambiguation use it, and this app can show it per the stress-marks setting',
  cursive: '́',
  cursiveNote: 'not written in cursive; it sits above the vowel exactly as printed',
};

export const ALL_SYMBOLS: SymbolInfo[] = [...ALL_LETTERS, ...PRE_REFORM, STRESS_MARK];

const BY_SYMBOL: Map<string, SymbolInfo> = new Map();
for (const s of ALL_SYMBOLS) {
  BY_SYMBOL.set(s.symbol, s);
  BY_SYMBOL.set(s.lower, s);
}

export function symbolInfo(sym: string): SymbolInfo | undefined {
  if (!sym) return undefined;
  const direct = BY_SYMBOL.get(sym);
  if (direct) return direct;
  const nfc = sym.normalize('NFC');
  return BY_SYMBOL.get(nfc) ?? BY_SYMBOL.get(nfc.toUpperCase()) ?? BY_SYMBOL.get(nfc.toLowerCase());
}

export const VOICED_PAIRS: Array<[string, string]> = CONSONANTS.filter((c) => c.voicedPartner && c.voiced).map((c) => [c.symbol, c.voicedPartner!]);
export const HARD_SOFT_CONSONANTS: SymbolInfo[] = CONSONANTS.filter((c) => c.hardness === 'paired');
export const ALWAYS_HARD: SymbolInfo[] = CONSONANTS.filter((c) => c.hardness === 'always-hard');
export const ALWAYS_SOFT: SymbolInfo[] = CONSONANTS.filter((c) => c.hardness === 'always-soft');
