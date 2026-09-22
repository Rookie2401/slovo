/**
 * The engine's bridge to the dictionary: `AnalysisContext` (the accessors
 * morphology needs, injected so tests run against the in-memory fixture in
 * `test/fixtures/dict.ts` and never fetch) and `dictionaryCandidates` (turns
 * the raw `FormReading`s the context returns into `Candidate`s).
 *
 * Feature-code decoding follows the table documented in
 * `src/dictionary/types.ts` (`FeatureCode`). Stem/ending/postfix segmentation
 * is the shared per-form rule in `src/dictionary/segment.ts` — the same one the
 * runtime `candidatesFor` uses — so the chips a learner sees are exactly what
 * the engine computed; a suppletive form (люди for человек) is left unsegmented
 * with a note, never a fabricated split.
 */
import type { Case, Gender, MorphFeatures, Number_, Person, Pos } from '../database/types';
import type { DictLexeme, FormReading } from '../dictionary/types';
import { segmentForm } from '../dictionary/segment';
import { COMBINING_ACUTE } from '../tokenizer/cyrillic';
import type { Candidate } from './candidate';
import { endingGloss } from './describe';

/** What morphology needs from the dictionary package, injected so tests can fake it. */
export interface AnalysisContext {
  /** every reading known for a loose dictionary key (form-shard lookup) */
  readings(key: string): FormReading[];
  /** resolve a lexeme id ("verb:говорить") to its full record */
  lexeme(id: string): DictLexeme | undefined;
  /** names index hit for a surface form, when it names a known character */
  character?(form: string): { canonical: string; kind: string } | undefined;
}

const CASES: Record<string, Case> = { nom: 'nom', gen: 'gen', dat: 'dat', acc: 'acc', inst: 'inst', prep: 'prep', loc: 'loc', part: 'part', voc: 'voc' };
const isCase = (s?: string): boolean => !!s && s in CASES;
const isGender = (s?: string): s is Gender => s === 'm' || s === 'f' || s === 'n';
const isNumber = (s?: string): s is Number_ => s === 'sg' || s === 'pl';

/** Decode a compact FeatureCode (see src/dictionary/types.ts) into MorphFeatures. Pure. */
export function decodeFeatureCode(code: string): MorphFeatures {
  const parts = code.split(':');
  const head = parts[0];
  const f: MorphFeatures = {};
  switch (head) {
    case 'n': {
      const [num, cas] = parts.slice(1);
      if (isNumber(num)) f.number = num;
      if (isCase(cas)) f.case = CASES[cas!];
      break;
    }
    case 'a': {
      const rest = parts.slice(1);
      if (rest[0] === 'short') {
        f.degree = 'short';
        if (rest[1] === 'pl') f.number = 'pl';
        else {
          f.number = 'sg';
          if (isGender(rest[1])) f.gender = rest[1];
        }
        break;
      }
      if (rest[0] === 'comp') {
        f.degree = 'comparative';
        break;
      }
      let i = 0;
      if (rest[0] === 'sup') {
        f.degree = 'superlative';
        i = 1;
      } else f.degree = 'positive';
      if (isGender(rest[i])) {
        f.gender = rest[i] as Gender;
        i++;
      }
      if (rest[i] === 'pl') {
        f.number = 'pl';
        i++;
      } else if (isNumber(rest[i])) {
        f.number = rest[i] as Number_;
        i++;
      }
      if (isCase(rest[i])) f.case = CASES[rest[i]!];
      break;
    }
    case 'v': {
      const rest = parts.slice(1);
      if (rest[0] === 'inf') {
        f.verb_form = 'infinitive';
        break;
      }
      if (rest[0] === 'pf') {
        const tag = rest[1] ?? '';
        const num: Number_ = tag.startsWith('sg') ? 'sg' : 'pl';
        const person = Number(tag.slice(2)) as Person;
        f.verb_form = 'present-future';
        f.mood = 'indicative';
        f.number = num;
        if (person >= 1 && person <= 3) f.person = person;
        break;
      }
      if (rest[0] === 'past') {
        f.verb_form = 'past';
        f.tense = 'past';
        f.mood = 'indicative';
        if (rest[1] === 'pl') f.number = 'pl';
        else {
          f.number = 'sg';
          if (isGender(rest[1])) f.gender = rest[1] as Gender;
        }
        break;
      }
      if (rest[0] === 'imp') {
        f.verb_form = 'imperative';
        f.mood = 'imperative';
        f.number = rest[1] === 'pl' ? 'pl' : 'sg';
        break;
      }
      if (rest[0] === 'pap' || rest[0] === 'paa' || rest[0] === 'ppp' || rest[0] === 'ppa') {
        f.verb_form = rest[0] === 'pap' ? 'participle-act-pres' : rest[0] === 'paa' ? 'participle-act-past' : rest[0] === 'ppp' ? 'participle-pass-pres' : 'participle-pass-past';
        f.voice = rest[0] === 'ppp' || rest[0] === 'ppa' ? 'passive' : 'active';
        let i = 1;
        if (isGender(rest[i])) {
          f.gender = rest[i] as Gender;
          i++;
        }
        if (isNumber(rest[i])) {
          f.number = rest[i] as Number_;
          i++;
        }
        if (isCase(rest[i])) f.case = CASES[rest[i]!];
        break;
      }
      if (rest[0] === 'pps') {
        f.verb_form = 'participle-short';
        f.voice = 'passive';
        if (isGender(rest[1])) f.gender = rest[1] as Gender;
        else if (rest[1] === 'pl') f.number = 'pl';
        break;
      }
      if (rest[0] === 'ger') {
        f.verb_form = rest[1] === 'past' ? 'gerund-past' : 'gerund-pres';
        break;
      }
      break;
    }
    case 'p': {
      const rest = parts.slice(1);
      if (/^[123]$/.test(rest[0] ?? '')) {
        f.person = Number(rest[0]) as Person;
        if (isNumber(rest[1])) f.number = rest[1] as Number_;
        if (isCase(rest[2])) f.case = CASES[rest[2]!];
        break;
      }
      let i = 0;
      if (isGender(rest[i])) {
        f.gender = rest[i] as Gender;
        i++;
      }
      if (isNumber(rest[i])) {
        f.number = rest[i] as Number_;
        i++;
      }
      if (isCase(rest[i])) f.case = CASES[rest[i]!];
      break;
    }
    case 'num': {
      const rest = parts.slice(1);
      let i = 0;
      if (isGender(rest[i])) {
        f.gender = rest[i] as Gender;
        i++;
      }
      if (isNumber(rest[i])) {
        f.number = rest[i] as Number_;
        i++;
      }
      if (isCase(rest[i])) f.case = CASES[rest[i]!];
      break;
    }
    case 'x':
    default:
      break;
  }
  return f;
}

/** "нача'ло" -> combining-acute display form "нача́ло", for lemma display. */
function toAcuteDisplay(acc: string): string {
  const idx = acc.indexOf("'");
  if (idx <= 0) return acc.replace(/'/g, '');
  const plain = acc.slice(0, idx) + acc.slice(idx + 1);
  return plain.slice(0, idx) + COMBINING_ACUTE + plain.slice(idx);
}

function accentedLemma(lex: DictLexeme): string | undefined {
  if (!lex.acc || !lex.acc.includes("'")) return undefined;
  return toAcuteDisplay(lex.acc);
}

/** Turn the raw dictionary readings for `key` into Candidates for `surface`. */
export function dictionaryCandidates(key: string, surface: string, ctx: AnalysisContext): Candidate[] {
  const readings = ctx.readings(key);
  const out: Candidate[] = [];
  for (const [lexemeId, code, stress] of readings) {
    const lex = ctx.lexeme(lexemeId);
    if (!lex) continue;
    const features = decodeFeatureCode(code);
    // a noun's gender is a fixed lexical property, not part of its feature code (unlike an
    // adjective's, which is inflectional and already came from decodeFeatureCode above)
    if (lex.pos === 'noun' && lex.gender && !features.gender) features.gender = lex.gender;
    if (lex.aspect) features.aspect = lex.aspect;
    // present-future is spelled the same for both aspects; which tense it names depends on
    // the verb's own aspect (an imperfective's non-past form is present, a perfective's is future)
    if (features.verb_form === 'present-future') features.tense = lex.aspect === 'perfective' ? 'future' : 'present';
    if (lex.reflexive) features.reflexive = true;
    if (lex.animacy) features.animacy = lex.animacy;
    if (lex.extra?.pronoun_type) features.pronoun_type = lex.extra.pronoun_type;
    if (lex.extra?.motion) features.motion = lex.extra.motion;
    if (stress >= 0) features.stress = stress;
    // segmentation shared with the runtime dictionary (src/dictionary/segment.ts): the chips a
    // learner sees are exactly what the engine computed
    const seg = segmentForm(surface, lex);
    const morphemes: Candidate['morphemes'] = [];
    let pos = 0;
    const stemText = seg.stem || seg.base;
    morphemes.push({ text: stemText, role: 'stem', gloss: 'stem', start: 0, end: stemText.length });
    pos = stemText.length;
    if (seg.ending) {
      morphemes.push({ text: seg.ending, role: 'ending', gloss: endingGloss(features), start: pos, end: pos + seg.ending.length });
      pos += seg.ending.length;
    }
    if (seg.postfix) morphemes.push({ text: seg.postfix, role: 'postfix', gloss: 'reflexive/middle marker -ся', start: pos, end: pos + seg.postfix.length });
    const notes: string[] = [...seg.notes];
    out.push({
      key: lexemeId,
      lemma: lex.lemma,
      lemmaAccented: accentedLemma(lex),
      pos: lex.pos as Pos,
      gloss: lex.gloss,
      senses: lex.senses,
      features,
      morphemes,
      notes,
      source: 'dictionary',
      confidence: 1,
      partner: lex.partner,
      rank: lex.rank,
    });
  }
  return out.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
}
