import type { AlphabetSkill } from '../database/types';
import { pronounce, transliterate } from '../pronunciation';
import { ALL_LETTERS, symbolInfo, type SymbolInfo } from './inventory';

/**
 * Drill item generation. Every item names the skill it exercises so the
 * mastery model can score it. Distractors come from confusable letters
 * first, then from the same kind (vowel/consonant/sign).
 */
export type DrillMode = 'symbol_to_sound' | 'sound_to_symbol' | 'contrast' | 'visual' | 'syllable' | 'word' | 'sentence' | 'cursive';

export interface DrillItem {
  mode: DrillMode;
  skill: AlphabetSkill;
  symbols: string[];
  prompt: string;
  promptSub?: string;
  options: string[];
  answer: string;
  explain: string;
  selfGraded?: boolean;
  speak?: string;
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function distractors(info: SymbolInfo, pool: SymbolInfo[], n: number, rnd: () => number): SymbolInfo[] {
  const out: SymbolInfo[] = [];
  const seen = new Set([info.symbol]);
  for (const c of info.confusable ?? []) {
    const ci = symbolInfo(c);
    if (ci && !seen.has(ci.symbol) && ci.kind === info.kind) {
      out.push(ci);
      seen.add(ci.symbol);
    }
    if (out.length >= n) return out;
  }
  const same = shuffle(pool.filter((p) => !seen.has(p.symbol) && p.kind === info.kind), rnd);
  for (const p of same) {
    if (out.length >= n) break;
    out.push(p);
    seen.add(p.symbol);
  }
  return out;
}

export function symbolToSound(sym: string, known: SymbolInfo[], rnd = Math.random): DrillItem | null {
  const info = symbolInfo(sym);
  if (!info || !info.ipa[0]) return null;
  const pool = known.length >= 4 ? known : ALL_LETTERS;
  const sound = info.ipa[0]!;
  const ds = distractors(info, pool, 3, rnd)
    .map((d) => d.ipa[0])
    .filter((s, i, a): s is string => !!s && a.indexOf(s) === i && s !== sound)
    .slice(0, 3);
  if (ds.length < 2) return null;
  return { mode: 'symbol_to_sound', skill: 'symbol_to_sound', symbols: [sym], prompt: info.symbol, options: shuffle([sound, ...ds], rnd), answer: sound, explain: `${info.symbol} (${info.name}) — ${info.articulation}`, speak: info.symbol };
}

export function soundToSymbol(sym: string, known: SymbolInfo[], rnd = Math.random): DrillItem | null {
  const info = symbolInfo(sym);
  if (!info || !info.ipa[0]) return null;
  const pool = known.length >= 4 ? known : ALL_LETTERS;
  const ds = distractors(info, pool, 3, rnd).map((d) => d.symbol);
  if (ds.length < 2) return null;
  return { mode: 'sound_to_symbol', skill: 'sound_to_symbol', symbols: [sym], prompt: info.ipa[0]!, promptSub: `/${info.ipa.join(', ')}/`, options: shuffle([info.symbol, ...ds], rnd), answer: info.symbol, explain: `${info.ipa[0]} is written ${info.symbol} (${info.name}).`, speak: info.symbol };
}

/** Pairs the learner must keep apart: hard/soft look, voicing, shape confusions. */
export const CONTRAST_PAIRS: Array<[string, string, string]> = [
  ['Ш', 'Щ', 'щ has a small tail below — otherwise the same three-legged shape'],
  ['Ц', 'Щ', 'ц has one tail below the last leg only; щ has a tail below the middle'],
  ['Ь', 'Ъ', 'ъ has a short stroke on the right of the loop; ь does not'],
  ['Ы', 'Ь', 'ы is ь plus a short vertical stroke — a real vowel, not a sign'],
  ['Е', 'Э', 'е is the common iotated vowel; э is the plain e, mostly loanwords'],
  ['И', 'Й', 'й carries a breve (˘) above and is always the consonant [j]'],
  ['О', 'А', 'the two vowels that merge toward a schwa when unstressed (аканье)'],
  ['Б', 'В', 'similar bodies: б has a loop above the stem, в has two loops beside it'],
  ['П', 'Н', 'п has a straight top bar; н has a diagonal crossbar in the middle'],
  ['Г', 'Ч', 'easy to confuse only in italics — upright they are unrelated shapes'],
  ['Х', 'Ж', 'х crosses in an X; ж has three vertical strokes through a center bar'],
  ['Р', 'В', 'р has one loop and a descender; в has two loops and no descender'],
  ['З', 'Э', 'both open curves — з opens left with flat ends, э opens left and is rounder'],
];

export function contrast(a: string, b: string, why: string, rnd = Math.random): DrillItem | null {
  const ia = symbolInfo(a);
  const ib = symbolInfo(b);
  if (!ia || !ib) return null;
  const target = rnd() < 0.5 ? ia : ib;
  return { mode: 'contrast', skill: 'visual', symbols: [a, b], prompt: target.ipa[0] ?? target.name, promptSub: `Which is ${target.name}?`, options: shuffle([a, b], rnd), answer: target.symbol, explain: `${a} = ${ia.name}, ${b} = ${ib.name}. ${why}.`, speak: target.symbol };
}

export function visual(sym: string, rnd = Math.random): DrillItem | null {
  const info = symbolInfo(sym);
  if (!info) return null;
  const ds = distractors(info, ALL_LETTERS, 3, rnd).map((d) => d.symbol);
  if (ds.length < 2) return null;
  return { mode: 'visual', skill: 'visual', symbols: [sym], prompt: `Find ${info.name}`, promptSub: info.ipa[0], options: shuffle([sym, ...ds], rnd), answer: sym, explain: `${sym} is ${info.name}. ${info.notes ?? ''}`.trim() };
}

/** A consonant + a vowel: pick the right sound. Russian has no dependent vowel signs — the syllable is just two adjacent letters. */
export function syllable(consonant: string, known: Set<string>, rnd = Math.random): DrillItem | null {
  const cInfo = symbolInfo(consonant);
  if (!cInfo || cInfo.kind !== 'consonant') return null;
  const vowels = ALL_LETTERS.filter((v) => v.vowel && known.has(v.symbol));
  if (vowels.length < 3) return null;
  const combos = vowels.map((v) => ({ form: consonant + v.lower, sound: pronounce(consonant + v.lower, 1).ipa }));
  const target = combos[Math.floor(rnd() * combos.length)]!;
  const others = shuffle(combos.filter((c) => c !== target), rnd)
    .slice(0, 3)
    .map((c) => c.sound);
  return { mode: 'syllable', skill: 'syllable', symbols: [consonant, target.form[1]!.toUpperCase()], prompt: target.form, options: shuffle([target.sound, ...others], rnd), answer: target.sound, explain: `${target.form} → ${target.sound}`, speak: target.form };
}

/** Real word → choose its pronunciation among near misses. `stressIndex` is passed when known (e.g. from a dictionary reading); -1 (default) skips vowel reduction, per the "never claim certainty you don't have" rule. */
export function word(w: string, otherWords: string[], rnd = Math.random, stressIndex = -1): DrillItem | null {
  const p = pronounce(w, stressIndex);
  const ds = otherWords.map((x) => pronounce(x).translit).filter((x) => x !== p.translit);
  if (ds.length < 2) return null;
  const uses = Array.from(new Set(Array.from(w.toLowerCase()).map((c) => c.toUpperCase())));
  return { mode: 'word', skill: 'word', symbols: uses, prompt: w, options: shuffle([p.translit, ...shuffle(ds, rnd).slice(0, 3)], rnd), answer: p.translit, explain: `${w} → ${transliterate(w)} → ${p.translit} (${p.ipa}).`, speak: w };
}

/** Real sentence: the learner reads it aloud and self-grades. */
export function sentence(text: string, symbols: string[]): DrillItem {
  return { mode: 'sentence', skill: 'context', symbols, prompt: text, options: ['I read it', 'I got stuck'], answer: 'I read it', explain: pronounce(text.replace(/[.,!?;:«»""()]/g, '')).translit, selfGraded: true, speak: text };
}

/** Cursive reading: the printed word vs. its italic rendering (same letters — CSS handles the shape). */
export function cursive(w: string): DrillItem {
  const symbols = Array.from(new Set(Array.from(w.toLowerCase()).map((c) => c.toUpperCase())));
  return { mode: 'cursive', skill: 'cursive', symbols, prompt: w, options: ['I read it', 'I got stuck'], answer: 'I read it', explain: `${w} → ${pronounce(w).translit}`, selfGraded: true };
}

export function knownInfos(known: Set<string>): SymbolInfo[] {
  return ALL_LETTERS.filter((s) => known.has(s.symbol));
}

export { ALL_LETTERS };
