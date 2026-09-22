/**
 * Rule generation for forms the dictionary and closed-class tables do not
 * cover directly: participles and gerunds built from a known verb's stem,
 * comparatives/superlatives and -о adverbs from a known adjective, prefixed
 * verbs peeled down to a known base verb, diminutives peeled down to a
 * known noun/adjective, and — last resort — an ending-pattern guess whose
 * key is prefixed "?" and whose confidence never exceeds 0.55 (never shown
 * with stress, per PLAN.md §D). A rule candidate never invents a lemma that
 * is not a plausible Russian word; when the reconstructed base is not
 * actually in the dictionary the same rule still fires, just at guess
 * confidence, so the caller always gets a reading — the confidence and the
 * note are what tell the learner how sure the engine is.
 */
import type { Gender, MorphFeatures, Number_, Morpheme, Pos } from '../database/types';
import type { DictLexeme } from '../dictionary/types';
import { closedClassCandidates } from '../lexicon/closed-class';
import { looseKey } from '../tokenizer/cyrillic';
import type { Candidate } from './candidate';
import type { AnalysisContext } from './dictionary';
import { dictionaryCandidates } from './dictionary';
import { endingGloss } from './describe';

function whole(text: string, gloss: string, start: number, end: number): Morpheme {
  return { text, role: 'stem', gloss, start, end };
}

/** Adjective-type case/gender/number endings, longest first so "ими" is tried before "и". */
const ADJ_ENDINGS: Array<[string, MorphFeatures]> = [
  ['ого', { gender: 'm', number: 'sg', case: 'gen' }], ['ому', { gender: 'm', number: 'sg', case: 'dat' }],
  // soft-stem equivalents (прежний -> прежнего/прежнему, синий -> синего/синему)
  ['его', { gender: 'm', number: 'sg', case: 'gen' }], ['ему', { gender: 'm', number: 'sg', case: 'dat' }],
  ['ыми', { number: 'pl', case: 'inst' }], ['ими', { number: 'pl', case: 'inst' }],
  ['ых', { number: 'pl', case: 'gen' }], ['их', { number: 'pl', case: 'gen' }],
  ['ым', { gender: 'm', number: 'sg', case: 'inst' }], ['им', { gender: 'm', number: 'sg', case: 'inst' }],
  ['ые', { number: 'pl', case: 'nom' }], ['ие', { number: 'pl', case: 'nom' }],
  ['ою', { gender: 'f', number: 'sg', case: 'inst' }], ['ей', { gender: 'f', number: 'sg', case: 'gen' }],
  ['ую', { gender: 'f', number: 'sg', case: 'acc' }], ['юю', { gender: 'f', number: 'sg', case: 'acc' }],
  ['ая', { gender: 'f', number: 'sg', case: 'nom' }], ['яя', { gender: 'f', number: 'sg', case: 'nom' }],
  ['ое', { gender: 'n', number: 'sg', case: 'nom' }], ['ее', { gender: 'n', number: 'sg', case: 'nom' }],
  ['ой', { gender: 'm', number: 'sg', case: 'nom' }], ['ый', { gender: 'm', number: 'sg', case: 'nom' }], ['ий', { gender: 'm', number: 'sg', case: 'nom' }],
  ['ом', { gender: 'm', number: 'sg', case: 'prep' }], ['ем', { gender: 'm', number: 'sg', case: 'prep' }],
];

function splitAdjEnding(surface: string): { base: string; ending: string; features: MorphFeatures } | null {
  const lower = surface.toLowerCase();
  for (const [end, feat] of ADJ_ENDINGS) {
    if (lower.endsWith(end) && lower.length > end.length + 1) return { base: surface.slice(0, -end.length), ending: surface.slice(-end.length), features: { ...feat } };
  }
  return null;
}

function findReading(base: string, ctx: AnalysisContext, wantPos: Pos): { id: string; lex: DictLexeme } | undefined {
  for (const candidateBase of new Set([base])) {
    const readings = ctx.readings(candidateBase.toLowerCase());
    for (const [id] of readings) {
      const lex = ctx.lexeme(id);
      if (lex && lex.pos === wantPos) return { id, lex };
    }
  }
  return undefined;
}

/** Try several reconstructed infinitives/lemmas in priority order; first dictionary hit wins. */
function firstKnown(bases: string[], ctx: AnalysisContext, wantPos: Pos): { id: string; lex: DictLexeme; base: string } | undefined {
  for (const b of bases) {
    const hit = findReading(b, ctx, wantPos);
    if (hit) return { ...hit, base: b };
  }
  return undefined;
}

const guessKey = (lemma: string, pos: Pos) => `?${pos}:${lemma}`;

function ruleOrGuess(opts: {
  surface: string;
  known: { id: string; lex: DictLexeme; base: string } | undefined;
  guessLemma: string;
  guessPos: Pos;
  features: MorphFeatures;
  morphemes: Morpheme[];
  ruleGloss: (lex: DictLexeme) => string;
  ruleNote: (lex: DictLexeme) => string;
  guessGloss: string;
  guessNote: string;
  ruleConfidence: number;
  guessConfidence: number;
  partner?: (lex: DictLexeme) => string | undefined;
}): Candidate {
  if (opts.known) {
    const { lex, id } = opts.known;
    return {
      key: id,
      lemma: lex.lemma,
      pos: opts.guessPos,
      gloss: opts.ruleGloss(lex),
      features: { ...opts.features, aspect: lex.aspect },
      morphemes: opts.morphemes,
      notes: [opts.ruleNote(lex)],
      source: 'rule',
      confidence: opts.ruleConfidence,
      partner: opts.partner?.(lex),
    };
  }
  return {
    key: guessKey(opts.guessLemma, opts.guessPos),
    lemma: opts.guessLemma,
    pos: opts.guessPos,
    gloss: opts.guessGloss,
    features: opts.features,
    morphemes: opts.morphemes,
    notes: [opts.guessNote, 'Not in the dictionary: this reading is a guess. Correct it if it is wrong.'],
    source: 'statistical',
    confidence: opts.guessConfidence,
  };
}

// ---------------------------------------------------------------- participles / gerunds

interface PtcpRule {
  suffixes: string[];
  verbForm: MorphFeatures['verb_form'];
  voice: 'active' | 'passive';
  tense: 'present' | 'past';
  infinitives: (base: string) => string[];
  label: string;
}

const PARTICIPLE_RULES: PtcpRule[] = [
  { suffixes: ['ющ', 'ущ'], verbForm: 'participle-act-pres', voice: 'active', tense: 'present', infinitives: (b) => [b + 'ть'], label: 'present active participle' },
  { suffixes: ['ящ', 'ащ'], verbForm: 'participle-act-pres', voice: 'active', tense: 'present', infinitives: (b) => [b + 'ить', b + 'ать', b + 'еть'], label: 'present active participle' },
  { suffixes: ['вш'], verbForm: 'participle-act-past', voice: 'active', tense: 'past', infinitives: (b) => [b + 'ть'], label: 'past active participle' },
  { suffixes: ['ш'], verbForm: 'participle-act-past', voice: 'active', tense: 'past', infinitives: (b) => [b + 'ти', b + 'чь'], label: 'past active participle' },
  { suffixes: ['енн', 'нн'], verbForm: 'participle-pass-past', voice: 'passive', tense: 'past', infinitives: (b) => [b + 'ить', b + 'ать', b + 'еть', b + 'ть'], label: 'passive past participle' },
  { suffixes: ['т'], verbForm: 'participle-pass-past', voice: 'passive', tense: 'past', infinitives: (b) => [b + 'ть'], label: 'passive past participle' },
  { suffixes: ['ем', 'ом'], verbForm: 'participle-pass-pres', voice: 'passive', tense: 'present', infinitives: (b) => [b + 'ть'], label: 'present passive participle' },
  { suffixes: ['им'], verbForm: 'participle-pass-pres', voice: 'passive', tense: 'present', infinitives: (b) => [b + 'ить'], label: 'present passive participle' },
];

function participleGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  // reflexive participles (улыбающийся, вернувшийся) keep -ся invariant at the very end,
  // after the adjective ending, so it is peeled off before the normal adjective-ending split.
  const reflexive = /ся$/i.test(surface) && surface.length > 4;
  const core = reflexive ? surface.slice(0, -2) : surface;
  const split = splitAdjEnding(core);
  if (!split) return [];
  const { base, ending, features } = split;
  const out: Candidate[] = [];
  for (const rule of PARTICIPLE_RULES) {
    for (const suf of rule.suffixes) {
      if (!base.toLowerCase().endsWith(suf)) continue;
      const stem = base.slice(0, -suf.length);
      if (stem.length < 1) continue;
      const infinitives = rule.infinitives(stem.toLowerCase()).map((inf) => (reflexive ? inf.replace(/ть$/, 'ться') : inf));
      const known = firstKnown(infinitives, ctx, 'verb');
      const suffixMorph: Morpheme = { text: base.slice(-suf.length), role: 'suffix', gloss: `${rule.label} suffix`, start: stem.length, end: base.length };
      const morphemes: Morpheme[] = [
        whole(surface.slice(0, stem.length), 'verb stem', 0, stem.length),
        suffixMorph,
        { text: ending, role: 'ending', gloss: endingGloss(features), start: base.length, end: core.length },
      ];
      if (reflexive) morphemes.push({ text: surface.slice(core.length), role: 'postfix', gloss: 'reflexive/middle marker -ся', start: core.length, end: surface.length });
      const feat: MorphFeatures = { ...features, verb_form: rule.verbForm, voice: rule.voice, tense: rule.tense === 'past' ? 'past' : 'present', reflexive: reflexive || undefined };
      out.push(ruleOrGuess({
        surface, known, guessLemma: (known?.base ?? infinitives[0]!), guessPos: 'verb', features: feat, morphemes,
        ruleGloss: (lex) => `${rule.label} of ${lex.lemma} ("${lex.gloss}")`,
        ruleNote: (lex) => `${rule.label}: generated from the known verb ${lex.lemma} (stem + -${suf}- + adjective ending${reflexive ? ' + -ся' : ''})`,
        guessGloss: `${rule.label} (?)`,
        guessNote: `looks like a ${rule.label} (stem + -${suf}- + adjective ending${reflexive ? ' + -ся' : ''}), but the base verb is not in the dictionary`,
        ruleConfidence: 0.85, guessConfidence: 0.5,
      }));
      return out; // first matching suffix wins
    }
  }
  return out;
}

function gerundGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const lower = surface.toLowerCase();
  // past gerund: -вшись (reflexive), -вши, -в — a reflexive gerund's base infinitive ends
  // -ться, not -ть (вернувшись -> вернуться, not вернуть, a different, non-reflexive verb).
  for (const [suf, reflexive] of [['вшись', true], ['вши', false], ['в', false]] as Array<[string, boolean]>) {
    if (lower.endsWith(suf) && surface.length > suf.length + 1) {
      const stem = surface.slice(0, -suf.length);
      const infinitives = [reflexive ? `${stem.toLowerCase()}ться` : `${stem.toLowerCase()}ть`];
      const known = firstKnown(infinitives, ctx, 'verb');
      const morphemes: Morpheme[] = [whole(stem, 'verb stem', 0, stem.length), { text: surface.slice(-suf.length), role: 'suffix', gloss: 'past gerund suffix', start: stem.length, end: surface.length }];
      return [ruleOrGuess({
        surface, known, guessLemma: known?.base ?? infinitives[0]!, guessPos: 'verb',
        features: { verb_form: 'gerund-past', tense: 'past', reflexive: reflexive || undefined },
        morphemes,
        ruleGloss: (lex) => `having ${lex.gloss.replace(/^to /, '')}ed — past gerund of ${lex.lemma}`,
        ruleNote: (lex) => `past gerund: generated from the known verb ${lex.lemma} (stem + -${suf})`,
        guessGloss: 'past gerund (?)', guessNote: `looks like a past gerund (stem + -${suf}), but the base verb is not in the dictionary`,
        ruleConfidence: 0.85, guessConfidence: 0.5,
      })];
    }
  }
  // present gerund: -я/-а (non-reflexive: думая, говоря, видя, слыша), -ясь/-ась (reflexive:
  // улыбаясь, оглядываясь, обращаясь) — tried longest-first so a reflexive form is not
  // mistaken for a non-reflexive one with a stray -сь left dangling.
  for (const [suf, reflexive] of [['ясь', true], ['ась', true], ['я', false], ['а', false]] as Array<[string, boolean]>) {
    if (!lower.endsWith(suf) || surface.length <= suf.length + 1) continue;
    const stem = surface.slice(0, -suf.length);
    // stripping just the gerund suffix -я leaves a stem that already carries the thematic
    // vowel for -ать/-ять verbs (дума-я -> дума, + -ть = думать), but not for -еть/-ить verbs
    // (говор-я -> говор, + -ить = говорить) — so both a bare -ть/-ться and the four full
    // endings are tried; whichever matches a real dictionary verb wins.
    const endings = reflexive ? ['ться', 'аться', 'яться', 'еться', 'иться'] : ['ть', 'ать', 'ять', 'еть', 'ить'];
    // -овать/-евать verbs (чувствовать, рисовать, советовать…) alternate their stem before
    // -ть (чувствова-) and before the personal endings (чувству-ют): no infinitive-shaped
    // reconstruction from the gerund stem can recover "чувствовать", so the presfut 3pl form
    // (which IS built directly on the gerund's own stem, чувству- + -ют) is tried as a
    // fallback search key — ctx.lexeme() then still returns the real lemma чувствовать.
    const presfutPl3 = reflexive ? ['ются', 'утся', 'ятся', 'атся'] : ['ют', 'ут', 'ят', 'ат'];
    const infinitives = [...endings.map((e) => stem.toLowerCase() + e), ...presfutPl3.map((e) => stem.toLowerCase() + e)];
    const known = firstKnown(infinitives, ctx, 'verb');
    const morphemes: Morpheme[] = [whole(stem, 'verb stem', 0, stem.length), { text: surface.slice(-suf.length), role: 'suffix', gloss: 'present gerund suffix', start: stem.length, end: surface.length }];
    // present gerund is a low-priority guess unless the base verb is confirmed known: -я/-а
    // collides with too many noun/adjective endings otherwise.
    if (known) {
      return [ruleOrGuess({
        surface, known, guessLemma: known.base, guessPos: 'verb', features: { verb_form: 'gerund-pres', tense: 'present', reflexive: reflexive || undefined }, morphemes,
        ruleGloss: (lex) => `while ...ing — present gerund of ${lex.lemma} ("${lex.gloss}")`,
        ruleNote: (lex) => `present gerund: generated from the known verb ${lex.lemma} (stem + -${suf})`,
        guessGloss: '', guessNote: '', ruleConfidence: 0.8, guessConfidence: 0.5,
      })];
    }
  }
  return [];
}

// ---------------------------------------------------------------- comparative / superlative / -о adverb

function comparativeGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const lower = surface.toLowerCase();
  for (const suf of ['ее', 'ей']) {
    if (lower.endsWith(suf) && surface.length > suf.length + 2) {
      const stem = surface.slice(0, -suf.length);
      const known = firstKnown([stem.toLowerCase() + 'ый', stem.toLowerCase() + 'ий', stem.toLowerCase() + 'ой'], ctx, 'adjective');
      const morphemes: Morpheme[] = [whole(stem, 'adjective stem', 0, stem.length), { text: surface.slice(-suf.length), role: 'suffix', gloss: 'comparative suffix', start: stem.length, end: surface.length }];
      return [ruleOrGuess({
        surface, known, guessLemma: stem.toLowerCase() + 'ый', guessPos: 'adjective',
        features: { degree: 'comparative' }, morphemes,
        ruleGloss: (lex) => `more ${lex.gloss} — comparative of ${lex.lemma}`,
        ruleNote: (lex) => `comparative: generated from the known adjective ${lex.lemma} (stem + -${suf})`,
        guessGloss: 'comparative (?)', guessNote: `ends in -${suf}: looks like a comparative, but the base adjective is not in the dictionary`,
        ruleConfidence: 0.85, guessConfidence: 0.5,
      })];
    }
  }
  return [];
}

function superlativeGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const split = splitAdjEnding(surface);
  if (!split) return [];
  const { base, ending, features } = split;
  const lower = base.toLowerCase();
  for (const suf of ['ейш', 'айш']) {
    if (lower.endsWith(suf)) {
      const stem = base.slice(0, -suf.length);
      if (stem.length < 1) continue;
      const known = firstKnown([stem.toLowerCase() + 'ый', stem.toLowerCase() + 'ий'], ctx, 'adjective');
      const morphemes: Morpheme[] = [
        whole(surface.slice(0, stem.length), 'adjective stem', 0, stem.length),
        { text: base.slice(-suf.length), role: 'suffix', gloss: 'superlative suffix', start: stem.length, end: base.length },
        { text: ending, role: 'ending', gloss: endingGloss(features), start: base.length, end: surface.length },
      ];
      return [ruleOrGuess({
        surface, known, guessLemma: stem.toLowerCase() + 'ый', guessPos: 'adjective',
        features: { ...features, degree: 'superlative' }, morphemes,
        ruleGloss: (lex) => `the most ${lex.gloss} / a very ${lex.gloss} — superlative of ${lex.lemma}`,
        ruleNote: (lex) => `superlative: generated from the known adjective ${lex.lemma} (stem + -${suf}- + adjective ending)`,
        guessGloss: 'superlative (?)', guessNote: `looks like a superlative (stem + -${suf}- + adjective ending), but the base adjective is not in the dictionary`,
        ruleConfidence: 0.85, guessConfidence: 0.5,
      })];
    }
  }
  return [];
}

function adverbGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const lower = surface.toLowerCase();
  if (!(lower.endsWith('о') || lower.endsWith('е')) || surface.length < 3) return [];
  const stem = surface.slice(0, -1);
  const known = firstKnown([stem.toLowerCase() + 'ый', stem.toLowerCase() + 'ий', stem.toLowerCase() + 'ой'], ctx, 'adjective');
  const morphemes: Morpheme[] = [whole(stem, 'adjective stem', 0, stem.length), { text: surface.slice(-1), role: 'ending', gloss: 'adverbial -о/-е ending', start: stem.length, end: surface.length }];
  return [ruleOrGuess({
    surface, known, guessLemma: stem.toLowerCase() + 'ый', guessPos: 'adverb', features: {}, morphemes,
    ruleGloss: (lex) => `...ly (${lex.gloss}) — adverb from ${lex.lemma}`,
    ruleNote: (lex) => `adverb in -${surface.slice(-1)}: generated from the known adjective ${lex.lemma}`,
    guessGloss: 'adverb (?)', guessNote: `ends in -${surface.slice(-1)}: could be an adverb, but no base adjective was found in the dictionary`,
    ruleConfidence: 0.85, guessConfidence: 0.4,
  })];
}

// ---------------------------------------------------------------- prefixed verbs

const VERB_PREFIXES = ['пере', 'через', 'вз', 'воз', 'из', 'раз', 'под', 'над', 'пред', 'по', 'при', 'у', 'вы', 'за', 'на', 'от', 'про', 'с', 'в', 'до', 'о', 'об'].sort((a, b) => b.length - a.length);

function prefixedVerbGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const lower = surface.toLowerCase();
  for (const prefix of VERB_PREFIXES) {
    if (!lower.startsWith(prefix) || lower.length - prefix.length < 3) continue;
    const remainder = surface.slice(prefix.length);
    const readings = ctx.readings(remainder.toLowerCase());
    for (const [id, code, stress] of readings) {
      const lex = ctx.lexeme(id);
      if (!lex || lex.pos !== 'verb') continue;
      const morphemes: Morpheme[] = [
        { text: surface.slice(0, prefix.length), role: 'prefix', gloss: `prefix ${prefix}-`, start: 0, end: prefix.length },
        whole(remainder, `base verb ${lex.lemma}`, prefix.length, surface.length),
      ];
      void code;
      void stress;
      return [{
        key: `?verb:${prefix}${lex.lemma}`,
        lemma: `${prefix}${lex.lemma}`,
        pos: 'verb',
        gloss: `${prefix}- + ${lex.gloss} (prefixed form, meaning shifts with the prefix)`,
        features: { aspect: prefix ? 'perfective' : lex.aspect },
        morphemes,
        notes: [`prefixed verb: ${prefix}- added to the known verb ${lex.lemma}; a prefix usually makes an imperfective verb perfective and narrows or shifts its meaning`],
        source: 'rule',
        confidence: 0.6,
      }];
    }
  }
  return [];
}

// ---------------------------------------------------------------- possessive adjectives -ин/-ов/-ев

/**
 * -ин/-ов/-ев possessive adjectives (хозяйкин, мамин, папин, Сонин; отцов) from a known
 * noun/name: "mixed" declension (see paradigms.ts's possessiveIn) — every oblique cell is an
 * ordinary hard-adjective ending, so a matched ending can mean several cells at once (-ой is
 * genitive/dative/instrumental/prepositional feminine singular, all spelled alike), exactly
 * like свой's feminine column; context.ts's existing adjective/pronoun-agreement rule picks
 * among them from the head noun, same mechanism.
 */
const POSS_IN_ENDINGS: Array<[string, MorphFeatures[]]> = [
  ['ого', [{ gender: 'm', number: 'sg', case: 'gen' }]],
  ['ому', [{ gender: 'm', number: 'sg', case: 'dat' }]],
  ['ыми', [{ number: 'pl', case: 'inst' }]],
  ['ых', [{ number: 'pl', case: 'gen' }, { number: 'pl', case: 'prep' }]],
  ['ым', [{ gender: 'm', number: 'sg', case: 'inst' }, { number: 'pl', case: 'dat' }]],
  ['ом', [{ gender: 'm', number: 'sg', case: 'prep' }]],
  ['ой', [{ gender: 'f', number: 'sg', case: 'gen' }, { gender: 'f', number: 'sg', case: 'dat' }, { gender: 'f', number: 'sg', case: 'inst' }, { gender: 'f', number: 'sg', case: 'prep' }]],
  ['у', [{ gender: 'f', number: 'sg', case: 'acc' }]],
  ['ы', [{ number: 'pl', case: 'nom' }]],
  ['а', [{ gender: 'f', number: 'sg', case: 'nom' }]],
  ['о', [{ gender: 'n', number: 'sg', case: 'nom' }]],
  ['', [{ gender: 'm', number: 'sg', case: 'nom' }]],
];
const POSS_IN_SUFFIXES = ['ин', 'ов', 'ев'];

function possessiveAdjectiveGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const lower = surface.toLowerCase();
  // Capitalised -ин/-ов/-ев words are just as often plain surnames (Жилин, Пушкин, Иванов —
  // historically the SAME suffix, but no longer felt as "belonging to жила/пушка/Иван" in
  // running text) as they are a genuine possessive adjective from a name (Сонин, Танин). Since
  // a surname reading and this reading cannot be told apart from the word alone, a capitalised
  // match is kept at a lower confidence so context.ts's capitalised-non-initial-proper fallback
  // can still win when nothing else marks the word as a name.
  const capitalized = /^\p{Lu}/u.test(surface);
  for (const [end, featsList] of POSS_IN_ENDINGS) {
    if (end && !lower.endsWith(end)) continue;
    if (surface.length - end.length < 3) continue;
    const base = end ? surface.slice(0, surface.length - end.length) : surface;
    for (const suf of POSS_IN_SUFFIXES) {
      if (!base.toLowerCase().endsWith(suf)) continue;
      const stem = base.slice(0, -suf.length);
      if (stem.length < 1) continue;
      // -ин attaches to a fem. -а/-я noun (хозяйка/Соня); -ов/-ев to a consonant-final name
      // (best effort: no fleeting-vowel reconstruction, so a name like отец → отцов is not
      // recovered — a known gap).
      const nounBases = suf === 'ин' ? [`${stem}а`, `${stem}я`] : [stem];
      const known = firstKnown(nounBases, ctx, 'noun');
      const endingText = surface.slice(base.length);
      const morphemes: Morpheme[] = [
        whole(surface.slice(0, stem.length), 'stem (guess)', 0, stem.length),
        { text: surface.slice(stem.length, base.length), role: 'suffix', gloss: `possessive adjective suffix -${suf}-`, start: stem.length, end: base.length },
      ];
      if (endingText) morphemes.push({ text: endingText, role: 'ending', gloss: endingGloss(featsList[0]!), start: base.length, end: surface.length });
      return featsList.map((features) => ruleOrGuess({
        surface, known, guessLemma: known?.base ?? `${stem}${suf}`, guessPos: 'adjective', features, morphemes,
        ruleGloss: (lex) => `${lex.lemma}'s (possessive adjective from ${lex.lemma})`,
        ruleNote: (lex) => `possessive adjective: generated from the known noun ${lex.lemma} (stem + -${suf}-)${capitalized ? ' — or this may simply be a surname' : ''}`,
        guessGloss: 'possessive adjective (?)', guessNote: `looks like a possessive adjective (stem + -${suf}-), but the base noun is not in the dictionary`,
        ruleConfidence: capitalized ? 0.55 : 0.8, guessConfidence: 0.5,
      }));
    }
  }
  return [];
}

// ---------------------------------------------------------------- diminutives

interface DimRule { suffixes: string[]; wantPos: Pos; reconstruct: (stem: string) => string[]; gender?: Gender; }
const DIM_RULES: DimRule[] = [
  { suffixes: ['очк', 'ечк'], wantPos: 'noun', reconstruct: (s) => [s + 'ка', s + 'а'], gender: 'f' },
  { suffixes: ['еньк'], wantPos: 'adjective', reconstruct: (s) => [s + 'ый', s + 'ий'] },
  { suffixes: ['ушк'], wantPos: 'noun', reconstruct: (s) => [s + 'а', s] },
  { suffixes: ['чик', 'ик'], wantPos: 'noun', reconstruct: (s) => [s], gender: 'm' },
];

function diminutiveGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const split = splitAdjEnding(surface) ?? { base: surface.replace(/[ауыоеийя]$/i, (m) => (surface.length > 2 ? '' : m)), ending: '', features: {} as MorphFeatures };
  // try both: adjective-ending split (маленький) and a plain noun-ending strip (коробочка)
  const attempts: Array<{ base: string; ending: string; features: MorphFeatures }> = [split];
  const nounEndMatch = /^(.+?)(а|я|ы|и|е|у|ю|ой|ей|ом|ем)$/.exec(surface);
  if (nounEndMatch) attempts.push({ base: nounEndMatch[1]!, ending: nounEndMatch[2]!, features: {} });
  for (const { base, ending, features } of attempts) {
    for (const rule of DIM_RULES) {
      for (const suf of rule.suffixes) {
        if (!base.toLowerCase().endsWith(suf)) continue;
        const stem = base.slice(0, -suf.length);
        if (stem.length < 1) continue;
        const known = firstKnown(rule.reconstruct(stem.toLowerCase()), ctx, rule.wantPos);
        const morphemes: Morpheme[] = [
          whole(surface.slice(0, stem.length), 'stem', 0, stem.length),
          { text: base.slice(-suf.length), role: 'suffix', gloss: 'diminutive suffix', start: stem.length, end: base.length },
        ];
        if (ending) morphemes.push({ text: ending, role: 'ending', gloss: endingGloss(features), start: base.length, end: surface.length });
        return [ruleOrGuess({
          surface, known, guessLemma: (known?.base ?? rule.reconstruct(stem.toLowerCase())[0]!), guessPos: rule.wantPos,
          features: { ...features, gender: rule.gender ?? features.gender },
          morphemes,
          ruleGloss: (lex) => `little ${lex.gloss} — diminutive of ${lex.lemma}`,
          ruleNote: (lex) => `diminutive: generated from the known word ${lex.lemma} (stem + -${suf}-)`,
          guessGloss: 'diminutive (?)', guessNote: `looks like a diminutive (stem + -${suf}-), but the base word is not in the dictionary`,
          ruleConfidence: 0.75, guessConfidence: 0.5,
        })];
      }
    }
  }
  return [];
}

// ---------------------------------------------------------------- last resort: ending-pattern guess

/**
 * Abstract feminine nouns in -ость (нерешимость, радость, смелость…) — a very productive
 * suffix. -ости alone is genuinely 3-way ambiguous (genitive/dative/prepositional singular
 * all spelled the same); -остью is unambiguously instrumental; bare -ость is the nominative.
 * Checked before the verb-infinitive guess below (and outranks it: 0.55 > 0.5), since -ости
 * words would otherwise wrongly match the (now-restricted) -ти infinitive ending.
 */
function abstractNounGuess(surface: string): Candidate[] {
  const lower = surface.toLowerCase();
  const mkNoun = (endText: string, features: MorphFeatures, note: string): Candidate => {
    const stemText = surface.slice(0, surface.length - endText.length);
    const lemma = `${stemText}ость`;
    const morphemes: Morpheme[] = [];
    if (stemText) morphemes.push(whole(stemText, 'stem (guess)', 0, stemText.length));
    morphemes.push({ text: endText, role: 'ending', gloss: endingGloss(features), start: stemText.length, end: surface.length });
    return {
      key: guessKey(lemma, 'noun'), lemma, pos: 'noun', gloss: `${note} (?)`, features, morphemes,
      notes: [note, 'Not in the dictionary and no rule matched. This is a low-confidence guess from the word\'s ending.'],
      source: 'statistical', confidence: 0.55,
    };
  };
  if (lower.endsWith('остью') && surface.length > 5) return [mkNoun('остью', { gender: 'f', number: 'sg', case: 'inst' }, 'ends in -остью: instrumental singular of an abstract -ость noun')];
  if (lower.endsWith('ости') && surface.length > 4) {
    return (['gen', 'dat', 'prep'] as const).map((cs) =>
      mkNoun('ости', { gender: 'f', number: 'sg', case: cs }, `ends in -ости: ${cs === 'gen' ? 'genitive' : cs === 'dat' ? 'dative' : 'prepositional'} singular of an abstract -ость noun`),
    );
  }
  if (lower.endsWith('ость') && surface.length > 4) return [mkNoun('ость', { gender: 'f', number: 'sg', case: 'nom' }, 'ends in -ость: an abstract feminine noun, nominative singular')];
  return [];
}

function endingPatternGuess(surface: string): Candidate[] {
  const lower = surface.toLowerCase();
  const out: Candidate[] = [];
  const mk = (lemma: string, pos: Pos, features: MorphFeatures, note: string, confidence: number, endText: string): Candidate => {
    const stemText = surface.slice(0, surface.length - endText.length);
    const morphemes: Morpheme[] = [];
    if (stemText) morphemes.push(whole(stemText, 'stem (guess)', 0, stemText.length));
    if (endText) morphemes.push({ text: endText, role: 'ending', gloss: endingGloss(features), start: stemText.length, end: surface.length });
    return {
      key: guessKey(lemma, pos), lemma, pos, gloss: `${note} (?)`, features, morphemes,
      notes: [note, 'Not in the dictionary and no rule matched. This is a low-confidence guess from the word\'s ending.'],
      source: 'statistical', confidence,
    };
  };
  const abstractNoun = abstractNounGuess(surface);
  if (abstractNoun.length) return abstractNoun;
  // -ти is only a plausible infinitive ending for с/з/й-stem verbs (нести, везти, идти-type);
  // an unrestricted -ти guess wrongly claimed -ость nouns like нерешимости (see above).
  if (/ть$/.test(lower)) {
    out.push(mk(surface, 'verb', { verb_form: 'infinitive' }, 'ends in -ть: looks like an infinitive', 0.5, 'ть'));
    return out;
  }
  if (/[сзй]ти$/.test(lower)) {
    out.push(mk(surface, 'verb', { verb_form: 'infinitive' }, 'ends in -ти (с/з/й-stem): looks like an infinitive', 0.5, 'ти'));
    return out;
  }
  const adj = splitAdjEnding(surface);
  if (adj) {
    out.push(mk(adj.base.toLowerCase() + 'ый', 'adjective', adj.features, 'adjective-shaped ending: guessed agreement from the ending alone', 0.5, adj.ending));
    return out;
  }
  if (lower.endsWith('о') || lower.endsWith('е')) {
    out.push(mk(surface.slice(0, -1) + 'ый', 'adverb', {}, 'ends in -о/-е: possibly an adverb', 0.4, surface.slice(-1)));
    out.push(mk(surface, 'noun', { gender: 'n', number: 'sg' }, 'ends in -о/-е: or possibly a neuter noun', 0.35, ''));
    return out;
  }
  const gender: Gender = /[бвгджзклмнпрстфхцчшщ]$/i.test(lower) ? 'm' : /[ая]$/i.test(lower) ? 'f' : 'm';
  out.push(mk(surface, 'noun', { gender, number: 'sg' }, 'not in the dictionary and no ending pattern matched; read as a noun by default — it may be a name', 0.4, ''));
  return out;
}

/**
 * Archaic feminine singular instrumental in -ою/-ею (своею, самою, одною, кровлею…): the
 * 19th-century spelling of -ой/-ей, still common in Dostoevsky/Tolstoy. Deterministic, not
 * really a "guess" — if the -ой/-ей counterpart has a dictionary or closed-class reading that
 * is instrumental singular feminine, this word means the same thing, so it gets that reading's
 * confidence-0.95 near-certainty rather than a low-confidence statistical guess.
 */
function archaicInstrumentalGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const lower = surface.toLowerCase();
  let counterpart: string | undefined;
  if (lower.endsWith('ою') && surface.length > 3) counterpart = `${surface.slice(0, -2)}ой`;
  else if (lower.endsWith('ею') && surface.length > 3) counterpart = `${surface.slice(0, -2)}ей`;
  if (!counterpart) return [];
  const key = looseKey(counterpart);
  const candidates = [...closedClassCandidates(key, counterpart), ...dictionaryCandidates(key, counterpart, ctx)];
  const hit = candidates.find((c) => c.features.case === 'inst' && c.features.gender === 'f' && c.features.number === 'sg');
  if (!hit) return [];
  // counterpart and surface are always the same length (-ой/-ою, -ей/-ею are both 2 chars), so
  // morpheme offsets carry over; only the very last morpheme's printed text needs the real spelling.
  const morphemes = hit.morphemes.map((m) => (m.end === surface.length ? { ...m, text: surface.slice(m.start, m.end) } : m));
  return [{
    ...hit,
    morphemes,
    notes: [...hit.notes, `older instrumental ending -${surface.slice(-2)} (= -${counterpart.slice(-2)})`],
    source: 'rule',
    confidence: 0.95,
  }];
}

/**
 * Folk-tale/archaic infinitives in -ти (гуляти, видати, казати, бити, бранити, пеняти…): the
 * pre-modern spelling of the -ть infinitive, still used for archaic/folkloric flavour. Same
 * deterministic-counterpart technique as archaicInstrumentalGuess above.
 */
function archaicInfinitiveGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const lower = surface.toLowerCase();
  if (!lower.endsWith('ти') || surface.length < 4) return [];
  const counterpart = `${surface.slice(0, -2)}ть`;
  const key = looseKey(counterpart);
  const candidates = [...closedClassCandidates(key, counterpart), ...dictionaryCandidates(key, counterpart, ctx)];
  const hit = candidates.find((c) => c.pos === 'verb' && c.features.verb_form === 'infinitive');
  if (!hit) return [];
  // -ти and -ть are both 2 characters, so offsets carry over; only the last morpheme's printed
  // text needs the real (-ти) spelling.
  const morphemes = hit.morphemes.map((m) => (m.end === surface.length ? { ...m, text: surface.slice(m.start, m.end) } : m));
  return [{ ...hit, morphemes, notes: [...hit.notes, 'older infinitive ending -ти (= -ть)'], source: 'rule', confidence: 0.9 }];
}

/**
 * Hyphenated colloquial particles (сестра-то, книгу-то, пришёл-таки, ну-ка, да-с): the
 * tokenizer keeps a hyphenated word as one token (кто-то, по-моему…), so a form like
 * сестра-то never matches anything on its own. When the LAST hyphen-part is a known clitic
 * particle, the base is analysed normally (through the full dictionary/closed-class/guess
 * chain) and the particle is attached as a `clitic` morpheme.
 */
const HYPHEN_CLITICS: Record<string, string> = {
  то: '-то: colloquial emphatic particle',
  таки: '-таки: colloquial emphatic particle ("after all, all the same")',
  ка: '-ка: colloquial softening particle (with an imperative: "go on, do X")',
  с: '-с: archaic deferential particle (old-fashioned polite speech, "sir")',
  де: '-де: archaic reported-speech particle ("so they say")',
  тка: '-тка: colloquial softening particle (dialect variant of -ка)',
};

function hyphenatedCliticGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const dash = surface.lastIndexOf('-');
  if (dash < 1) return [];
  const base = surface.slice(0, dash);
  const clitic = surface.slice(dash + 1).toLowerCase();
  const note = HYPHEN_CLITICS[clitic];
  if (!note) return [];
  const baseKey = looseKey(base);
  let baseCands = [...closedClassCandidates(baseKey, base), ...dictionaryCandidates(baseKey, base, ctx)];
  if (!baseCands.length) baseCands = ruleGuesses(base, ctx);
  return baseCands.map((c) => ({
    ...c,
    morphemes: [...c.morphemes, { text: surface.slice(dash), role: 'clitic', gloss: note, start: dash, end: surface.length }],
    notes: [...c.notes, note],
  }));
}

/**
 * по- + dative-form pronoun/adjective, or по- + -ски: adverbs of manner (по-своему "in one's
 * own way", по-русски "in Russian", по-прежнему "as before").
 */
const PO_DATIVE_ADVERBS: Record<string, string> = {
  своему: "in one's own way", нашему: 'in our way', вашему: 'in your way', моему: 'in my way', твоему: 'in your way',
  ихнему: 'in their way (colloquial)', прежнему: 'as before, as previously',
};

function poAdverbGuess(surface: string): Candidate[] {
  const lower = surface.toLowerCase();
  if (!lower.startsWith('по-') || surface.length < 5) return [];
  const rest = surface.slice(3);
  const lowerRest = rest.toLowerCase();
  const morphemes: Morpheme[] = [
    { text: surface.slice(0, 2), role: 'prefix', gloss: 'по- (manner adverb)', start: 0, end: 2 },
    whole(rest, 'base', 2, surface.length),
  ];
  // no leading "?": these are deterministic rule matches at 0.95, not low-confidence guesses —
  // an unmarked key here previously kept them counted as "unresolved" in sentence-level coverage.
  if (lowerRest.endsWith('ски') && rest.length > 3) {
    const base = rest.slice(0, -3);
    return [{
      key: `adverb:${lower}`, lemma: surface, pos: 'adverb', gloss: `in a ${base}-ish way / in ${base}`, features: {}, morphemes,
      notes: ['по- + -ски: adverb of manner ("in X fashion/language")'], source: 'rule', confidence: 0.95,
    }];
  }
  const glossBase = PO_DATIVE_ADVERBS[lowerRest];
  if (glossBase) {
    return [{
      key: `adverb:${lower}`, lemma: surface, pos: 'adverb', gloss: glossBase, features: {}, morphemes,
      notes: [`по- + dative ${rest}: adverb of manner`], source: 'rule', confidence: 0.95,
    }];
  }
  return [];
}

/**
 * Past tense (был/была/было/были-shaped), including reflexive forms (-лся/-лась/-лось/-лись:
 * удалось, вернулся) — checks the dictionary for the reconstructed infinitive first (rule,
 * 0.85), falling back to the same shape of guess the old ending-pattern fallback used to make
 * unconditionally (0.45) when the base verb is not known.
 */
function pastTenseGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const lower = surface.toLowerCase();
  const m = /^(.+?)(л|ла|ло|ли)(ся|сь)?$/.exec(lower);
  if (!m) return [];
  const [, stemLower, end, postfix] = m;
  if (!/[аяоуыи]$/.test(stemLower!)) return []; // a genuine past-tense marker needs a vowel before -л (стол is not "сто" + л)
  const stem = surface.slice(0, stemLower!.length);
  const reflexive = !!postfix;
  const gender: Gender | undefined = end === 'ла' ? 'f' : end === 'ло' ? 'n' : end === 'л' ? 'm' : undefined;
  const number: Number_ | undefined = end === 'ли' ? 'pl' : 'sg';
  const lemma = reflexive ? `${stem}ться` : `${stem}ть`;
  const known = firstKnown([lemma], ctx, 'verb');
  const isNu = /ну$/i.test(stem);
  const features: MorphFeatures = { verb_form: 'past', gender, number, reflexive: reflexive || undefined, ...(isNu ? { aspect: 'perfective' as const } : {}) };
  const morphemes: Morpheme[] = [whole(stem, 'verb stem', 0, stem.length), { text: surface.slice(stem.length, stem.length + end!.length), role: 'ending', gloss: 'past tense ending', start: stem.length, end: stem.length + end!.length }];
  if (postfix) morphemes.push({ text: surface.slice(stem.length + end!.length), role: 'postfix', gloss: 'reflexive/middle marker', start: stem.length + end!.length, end: surface.length });
  return [ruleOrGuess({
    surface, known, guessLemma: lemma, guessPos: 'verb', features, morphemes,
    ruleGloss: (lex) => `${lex.gloss} (past${reflexive ? ', reflexive' : ''})`,
    ruleNote: (lex) => `past tense: generated from the known verb ${lex.lemma}${isNu ? ' (-нуть class, characteristically perfective)' : ''}`,
    guessGloss: 'past-tense verb (?)', guessNote: `ends in -${end}${postfix ?? ''}: looks like a past-tense verb`,
    ruleConfidence: 0.85, guessConfidence: 0.45,
  })];
}

/**
 * Short passive past participles used impersonally/predicatively (сказано, сделано,
 * написано, решено, велено — "было сказано" = "it was said"): neuter singular only, built on
 * a known perfective (or imperfective, for велено-type) verb.
 */
const SHORT_PASSIVE_ENDINGS: Array<[string, string[]]> = [
  ['ано', ['ать']], ['яно', ['ять']], ['ено', ['ить', 'еть']], ['ёно', ['ить', 'еть']], ['то', ['ть']],
];

function shortPassiveParticipleGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const lower = surface.toLowerCase();
  for (const [suf, infEndings] of SHORT_PASSIVE_ENDINGS) {
    if (!lower.endsWith(suf) || surface.length <= suf.length + 1) continue;
    const stem = surface.slice(0, -suf.length);
    const infinitives = infEndings.map((e) => stem.toLowerCase() + e);
    const known = firstKnown(infinitives, ctx, 'verb');
    const morphemes: Morpheme[] = [whole(stem, 'verb stem', 0, stem.length), { text: surface.slice(-suf.length), role: 'ending', gloss: 'short passive participle ending (neuter)', start: stem.length, end: surface.length }];
    if (known) {
      return [ruleOrGuess({
        surface, known, guessLemma: known.base, guessPos: 'verb',
        features: { verb_form: 'participle-short', voice: 'passive', gender: 'n', degree: 'short' }, morphemes,
        ruleGloss: (lex) => `it is/was ${lex.gloss.replace(/^to /, '')}ed — short passive participle of ${lex.lemma}`,
        ruleNote: () => `predicative: "it is/was ${surface}" — short neuter passive participle, generated from the known verb ${known.lex.lemma}`,
        guessGloss: '', guessNote: '', ruleConfidence: 0.85, guessConfidence: 0.5,
      })];
    }
  }
  return [];
}

/**
 * An inflected form of an adjective whose dictionary entry carries NO paradigm (прежний,
 * собачий, бумажный — the citation-form-fallback lexemes the coordinator's B-side notes
 * describe): when the reconstructed nominative citation form (stem + -ий/-ый/-ой) matches a
 * known adjective lexeme, decline it by rule.
 */
function adjectiveDeclineGuess(surface: string, ctx: AnalysisContext): Candidate[] {
  const split = splitAdjEnding(surface);
  if (!split) return [];
  const { base, ending, features } = split;
  const known = firstKnown([`${base}ий`, `${base}ый`, `${base}ой`], ctx, 'adjective');
  if (!known) return [];
  const morphemes: Morpheme[] = [whole(surface.slice(0, base.length), 'adjective stem', 0, base.length), { text: ending, role: 'ending', gloss: endingGloss(features), start: base.length, end: surface.length }];
  return [{
    key: known.id, lemma: known.lex.lemma, pos: 'adjective', gloss: known.lex.gloss, senses: known.lex.senses,
    features, morphemes, notes: [`declined by rule — the dictionary has no table for this adjective (${known.lex.lemma})`],
    source: 'rule', confidence: 0.9,
  }];
}

/** Every rule generator, run in order; the first that produces a result wins (each already falls back to a guess internally when its base word is unknown). */
export function ruleGuesses(surface: string, ctx: AnalysisContext): Candidate[] {
  const archaic = archaicInstrumentalGuess(surface, ctx);
  if (archaic.length) return archaic;
  const archaicInf = archaicInfinitiveGuess(surface, ctx);
  if (archaicInf.length) return archaicInf;
  const poAdverb = poAdverbGuess(surface);
  if (poAdverb.length) return poAdverb;
  const hyphenClitic = hyphenatedCliticGuess(surface, ctx);
  if (hyphenClitic.length) return hyphenClitic;
  const shortPassive = shortPassiveParticipleGuess(surface, ctx);
  if (shortPassive.length) return shortPassive;
  const pastTense = pastTenseGuess(surface, ctx);
  if (pastTense.length) return pastTense;
  // superlative/comparative checked before participle: their -ейш-/-айш-/-ее/-ей
  // markers are more specific than the participle rules' bare -ш suffix, which
  // would otherwise wrongly claim any word ending in -ейший (быстрейший).
  const chain = [superlativeGuess, comparativeGuess, adjectiveDeclineGuess, participleGuess, gerundGuess, prefixedVerbGuess, possessiveAdjectiveGuess, diminutiveGuess, adverbGuess];
  for (const fn of chain) {
    const r = fn(surface, ctx);
    if (r.length) return r;
  }
  return endingPatternGuess(surface);
}
