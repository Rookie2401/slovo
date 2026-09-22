import { normalize } from '../tokenizer/cyrillic';

/**
 * Two layers, kept apart on purpose:
 *   written Cyrillic  →  transliterate()   one Latin cluster per letter, no context (for the alphabet stages)
 *                     →  pronounce()       stress-aware phonology: reduction, devoicing, assimilation,
 *                                          palatalisation, and a handful of fixed lexical exceptions
 *
 * pronounce() is pure and deterministic: same (form, stressIndex) always
 * produces the same result. `stressIndex` is the index of the stressed vowel
 * in normalize(form) (same convention as Token.source_stress / MorphFeatures.stress
 * / dictionary FormReading[2]); pass -1 when the stress is not known — reduction
 * is then skipped and confidence drops to 0.7, per "never say the stress is certain
 * when it isn't" (ARCHITECTURE.md).
 */

// ---------------------------------------------------------------- transliterate

const TRANSLIT_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '"', ы: 'y', ь: "'",
  э: 'e', ю: 'yu', я: 'ya',
  // pre-reform, folded for display purposes to their modern sound
  ѣ: 'e', і: 'i', ѳ: 'f', ѵ: 'i',
};

/**
 * Letter-by-letter transliteration: one fixed Latin cluster per Cyrillic
 * letter, no context applied (no schwa/reduction, no iotation rules). Used
 * for the alphabet stages, where the point is to show what each letter is
 * called, not how a whole word is actually said — see pronounce() for that.
 */
export function transliterate(form: string): string {
  const s = normalize(form);
  let out = '';
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const mapped = TRANSLIT_MAP[lower];
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    out += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}

// ------------------------------------------------------------------ pronounce

export interface Pronunciation {
  /** practical Latin rendering of the actual pronunciation (yevo, shto, kharasho…) */
  translit: string;
  /** bracketed IPA-ish transcription, e.g. "[fxot]" */
  ipa: string;
  /** 1 = stress known and only regular rules fired; 0.7 = stress unknown; lower for lexical exceptions */
  confidence: number;
  /** one entry per rule that fired, in the order applied */
  notes: string[];
}

const MODERN_VOWELS = new Set(['а', 'е', 'ё', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я']);
const IOTATED = new Set(['е', 'ё', 'ю', 'я']);
const SOFT_INDICATOR = new Set(['е', 'ё', 'и', 'ю', 'я']);
const ALWAYS_HARD_SET = new Set(['ж', 'ш', 'ц']);
const ALWAYS_SOFT_SET = new Set(['ч', 'щ', 'й']);
const SONORANTS = new Set(['л', 'м', 'н', 'р', 'й']);
/** voiced obstruent → its voiceless partner */
const VOICED_TO_VOICELESS: Record<string, string> = { б: 'п', в: 'ф', г: 'к', д: 'т', ж: 'ш', з: 'с' };
/** voiceless obstruent → its voiced partner */
const VOICELESS_TO_VOICED: Record<string, string> = { п: 'б', ф: 'в', к: 'г', т: 'д', ш: 'ж', с: 'з' };
const OBSTRUENTS = new Set(['б', 'п', 'в', 'ф', 'г', 'к', 'д', 'т', 'ж', 'ш', 'з', 'с', 'х', 'ц', 'ч', 'щ']);

// hard/soft IPA for consonants (ipa symbol used in the bracketed transcription)
const CONS_IPA: Record<string, string> = {
  б: 'b', в: 'v', г: 'ɡ', д: 'd', ж: 'ʐ', з: 'z', к: 'k', л: 'l', м: 'm', н: 'n',
  п: 'p', р: 'r', с: 's', т: 't', ф: 'f', х: 'x', ц: 'ts', ч: 'tɕ', ш: 'ʂ', щ: 'ɕː', й: 'j',
};
// plain-Latin (practical) rendering of the same consonants
const CONS_TRANSLIT: Record<string, string> = {
  б: 'b', в: 'v', г: 'g', д: 'd', ж: 'zh', з: 'z', к: 'k', л: 'l', м: 'm', н: 'n',
  п: 'p', р: 'r', с: 's', т: 't', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', й: 'y',
};
// stressed (full-quality) vowel IPA
const VOWEL_IPA_STRESSED: Record<string, string> = { а: 'a', о: 'o', у: 'u', ы: 'ɨ', э: 'e', и: 'i', е: 'e', ё: 'o', ю: 'u', я: 'a' };
const VOWEL_TRANSLIT_STRESSED: Record<string, string> = { а: 'a', о: 'o', у: 'u', ы: 'y', э: 'e', и: 'i', е: 'e', ё: 'o', ю: 'u', я: 'a' };

/** Whole-word lexical exceptions that override the regular letter-by-letter pass. */
const CHTO_WORDS = new Set(['что', 'чтобы', 'что-то', 'что-нибудь', 'кое-что', 'ничто', 'нечто']);
const CHN_SHN_WORDS = new Set(['конечно', 'скучно', 'нарочно', 'яичница', 'скворечник', 'прачечная', 'подсвечник']);

export function pronounce(form: string, stressIndex = -1): Pronunciation {
  const norm = normalize(form);
  const work = norm.toLowerCase();
  const notes: string[] = [];
  let confidence = stressIndex >= 0 ? 1 : 0.7;
  if (stressIndex < 0) notes.push('stress unknown — vowel reduction not applied');

  // ---- whole-word lexical exception: что-family (ч realised as ш) ----
  if (CHTO_WORDS.has(work)) {
    const rest = work.slice(1); // everything after ч
    confidence = Math.min(confidence, 0.9);
    notes.push(`${work} is pronounced [ʂto…]: ч is realised as ш — a fixed exception, not the regular ч sound`);
    const tail = pronounceLetters(rest, stressIndex < 0 ? -1 : Math.max(0, stressIndex - 1), notes, false);
    return {
      ipa: `[ʂ${tail.ipa}]`,
      translit: `sh${tail.translit}`,
      confidence,
      notes,
    };
  }

  const chnException = CHN_SHN_WORDS.has(work) && work.includes('чн');

  const result = pronounceLetters(work, stressIndex, notes, chnException);
  if (chnException) confidence = Math.min(confidence, 0.9);
  return { ipa: `[${result.ipa}]`, translit: result.translit, confidence, notes };
}

function pronounceLetters(work: string, stressIndex: number, notes: string[], chnException: boolean): { ipa: string; translit: string } {
  const chars = Array.from(work);
  const n = chars.length;
  const isVowel = (ch: string) => MODERN_VOWELS.has(ch);

  // ---- targeted string-level exceptions (apply before the general pass) ----
  const endsOgoEgo = /(ого|его)$/.test(work);
  const endsTsa = /(ться|тся)$/.test(work);
  const isBog = work === 'бог';
  const hasGk = /гк/.test(work); // лёгкий, мягкий, мягко…

  // vowel order, for pretonic/post-tonic distance
  const vowelPositions: number[] = [];
  for (let i = 0; i < n; i++) if (isVowel(chars[i]!)) vowelPositions.push(i);
  const stressVowelOrder = stressIndex >= 0 ? vowelPositions.indexOf(stressIndex) : -1;

  // ---- consonant voicing pass (right to left: regressive assimilation + final devoicing) ----
  const voicedAt: Record<number, boolean> = {};
  let nextVoicing: 'voiced' | 'voiceless' | null = null;
  const isWordFinalSound = (i: number) => {
    for (let j = i + 1; j < n; j++) if (chars[j] !== 'ь' && chars[j] !== 'ъ') return false;
    return true;
  };
  for (let i = n - 1; i >= 0; i--) {
    const ch = chars[i]!;
    if (ch === 'ь' || ch === 'ъ') continue; // transparent to voicing, but preserves whatever is already pending
    if (isVowel(ch)) {
      nextVoicing = null;
      continue;
    }
    if (SONORANTS.has(ch) && ch !== 'й') {
      nextVoicing = null; // sonorants neither trigger nor undergo the assimilation
      continue;
    }
    if (ch === 'й') {
      nextVoicing = null;
      continue;
    }
    if (ch === 'в') {
      // в behaves like a sonorant for triggering purposes, but can itself be devoiced
      const vVoiced = nextVoicing !== 'voiceless';
      voicedAt[i] = vVoiced;
      nextVoicing = null;
      continue;
    }
    if (OBSTRUENTS.has(ch)) {
      const lexVoiced = ch in VOICED_TO_VOICELESS;
      let voiced: boolean;
      if (nextVoicing === 'voiced') voiced = true;
      else if (nextVoicing === 'voiceless') voiced = false;
      else voiced = lexVoiced && !isWordFinalSound(i);
      voicedAt[i] = voiced;
      nextVoicing = voiced ? 'voiced' : 'voiceless';
      continue;
    }
  }

  let devoicedNoted = false;
  let assimilatedNoted = false;

  const ipaParts: string[] = [];
  const translitParts: string[] = [];

  for (let i = 0; i < n; i++) {
    const ch = chars[i]!;
    if (ch === 'ь' || ch === 'ъ') continue; // silent; softness already applied to the previous consonant

    if (isVowel(ch)) {
      const stressed = stressIndex >= 0 && i === stressIndex;
      const precededByVowelOrBoundary = i === 0 || isVowel(chars[i - 1]!) || chars[i - 1] === 'ъ' || chars[i - 1] === 'ь';
      const iotate = IOTATED.has(ch) && precededByVowelOrBoundary;
      if (ch === 'ё') {
        // ё is always stressed in standard orthography
        ipaParts.push((precededByVowelOrBoundary ? 'j' : '') + 'o');
        translitParts.push((precededByVowelOrBoundary ? 'y' : '') + 'o');
        continue;
      }
      if (stressed || stressIndex < 0) {
        const glide = iotate ? 'j' : '';
        const glideT = iotate ? 'y' : '';
        ipaParts.push(glide + VOWEL_IPA_STRESSED[ch]);
        translitParts.push(glideT + VOWEL_TRANSLIT_STRESSED[ch]);
        continue;
      }
      // unstressed reduction
      const vi = vowelPositions.indexOf(i);
      const immediatelyPretonic = vi === stressVowelOrder - 1;
      if (ch === 'о' || ch === 'а') {
        if (immediatelyPretonic) {
          ipaParts.push('ɐ');
          translitParts.push('a');
          notes.push(`${ch} before the stress → [ɐ]`);
        } else {
          ipaParts.push('ə');
          translitParts.push('a');
          notes.push(`${ch} unstressed → [ə]`);
        }
      } else if (ch === 'е' || ch === 'я') {
        const glide = iotate ? 'j' : '';
        const glideT = iotate ? 'y' : '';
        ipaParts.push(glide + 'ɪ');
        translitParts.push(glideT + 'e');
        notes.push(`${ch} unstressed → [ɪ]`);
      } else {
        // и, у, ы, э: kept at full quality for V0 (no documented reduction)
        const glide = iotate ? 'j' : '';
        const glideT = iotate ? 'y' : '';
        ipaParts.push(glide + VOWEL_IPA_STRESSED[ch]);
        translitParts.push(glideT + VOWEL_TRANSLIT_STRESSED[ch]);
      }
      continue;
    }

    // ---- consonants ----
    if (chnException && ch === 'ч' && chars[i + 1] === 'н') {
      ipaParts.push('ʂn');
      translitParts.push('shn');
      notes.push('-чн- → [ʂn]: a fixed exception in this word (most -чн- words keep [tɕn])');
      i++; // consume the н too
      continue;
    }

    if (ch === 'г' && isBog && isWordFinalSound(i)) {
      ipaParts.push('x');
      translitParts.push('kh');
      notes.push('final г in бог → [x]: an old exception (regular final devoicing would give [k])');
      continue;
    }
    if (ch === 'г' && hasGk && chars[i + 1] === 'к') {
      ipaParts.push('x');
      translitParts.push('kh');
      notes.push('-гк- → [xk]: a fixed exception (лёгкий, мягкий and their forms)');
      continue;
    }
    if (ch === 'г' && endsOgoEgo && isWordFinalSound(i) === false && i === n - 2) {
      ipaParts.push('v');
      translitParts.push('v');
      notes.push('-ого/-его → [-əvə]: the adjective/pronoun genitive ending pronounces г as в');
      continue;
    }

    if (endsTsa && ch === 'т' && (chars.slice(i).join('') === 'ться' || chars.slice(i).join('') === 'тся')) {
      ipaParts.push('tsə');
      translitParts.push('tsa');
      notes.push('-ться/-тся → [tsə]: pronounced as one cluster, not [tsʲa]');
      i = n; // consumed the rest of the word
      break;
    }

    if (!OBSTRUENTS.has(ch) && !SONORANTS.has(ch) && ch !== 'в') continue; // safety net

    const nextCh = chars[i + 1];
    const soft = ALWAYS_SOFT_SET.has(ch) ? true : ALWAYS_HARD_SET.has(ch) ? false : nextCh === 'ь' || (nextCh !== undefined && SOFT_INDICATOR.has(nextCh));
    let base = CONS_IPA[ch]!;
    let baseT = CONS_TRANSLIT[ch]!;

    if (OBSTRUENTS.has(ch) && ch !== 'х' && ch !== 'ц' && ch !== 'ч' && ch !== 'щ') {
      const shouldBeVoiced = voicedAt[i];
      const isLexicallyVoiced = ch in VOICED_TO_VOICELESS;
      if (shouldBeVoiced !== undefined && shouldBeVoiced !== isLexicallyVoiced) {
        const swapped = isLexicallyVoiced ? VOICED_TO_VOICELESS[ch]! : VOICELESS_TO_VOICED[ch]!;
        base = CONS_IPA[swapped]!;
        baseT = CONS_TRANSLIT[swapped]!;
        if (isWordFinalSound(i) && isLexicallyVoiced && !shouldBeVoiced && !devoicedNoted) {
          notes.push(`final ${ch} devoiced → [${base}]`);
          devoicedNoted = true;
        } else if (!assimilatedNoted) {
          notes.push(`${ch} assimilates in voicing to the next consonant → [${base}]`);
          assimilatedNoted = true;
        }
      }
    } else if (ch === 'в') {
      const shouldBeVoiced = voicedAt[i];
      if (shouldBeVoiced === false) {
        base = CONS_IPA['ф']!;
        baseT = CONS_TRANSLIT['ф']!;
        if (!assimilatedNoted) {
          notes.push('в devoiced by the following voiceless consonant → [f]');
          assimilatedNoted = true;
        }
      }
    }

    if (soft && !ALWAYS_SOFT_SET.has(ch) && !ALWAYS_HARD_SET.has(ch)) base += 'ʲ';
    ipaParts.push(base);
    translitParts.push(baseT);
  }

  return { ipa: ipaParts.join(''), translit: translitParts.join('') };
}
