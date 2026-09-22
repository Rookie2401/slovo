/**
 * Plain-English descriptions of morphological features. Shared by the
 * dictionary bridge, the guessers, syntax/context, clause analysis and the
 * constructions — every explanation string a learner sees is built from
 * these so the wording stays consistent across the engine.
 */
import type { Case, Gender, MorphFeatures, Number_, Person } from '../database/types';

export const CASE_NAMES: Record<Case, string> = {
  nom: 'nominative',
  gen: 'genitive',
  dat: 'dative',
  acc: 'accusative',
  inst: 'instrumental',
  prep: 'prepositional',
  loc: 'second locative',
  part: 'partitive',
  voc: 'vocative',
};

export function caseName(c?: Case): string {
  return c ? CASE_NAMES[c] : 'case unknown';
}

export function genderName(g?: Gender): string {
  return g === 'm' ? 'masculine' : g === 'f' ? 'feminine' : g === 'n' ? 'neuter' : g === 'common' ? 'common gender' : '';
}

export function numberName(n?: Number_): string {
  return n === 'pl' ? 'plural' : n === 'sg' ? 'singular' : '';
}

export function personName(p?: Person): string {
  return p === 1 ? '1st person' : p === 2 ? '2nd person' : p === 3 ? '3rd person' : '';
}

/** "genitive singular", "past, masculine", "3rd person plural, present" */
export function describeFeatures(f: MorphFeatures): string {
  const parts: string[] = [];
  if (f.pronoun_type) parts.push(f.pronoun_type);
  if (f.verb_form === 'infinitive') return 'infinitive';
  if (f.verb_form === 'past') {
    const g = genderName(f.gender);
    return ['past', g || numberName(f.number)].filter(Boolean).join(', ');
  }
  if (f.verb_form === 'present-future') {
    return [personName(f.person), numberName(f.number), f.tense === 'future' ? 'future' : 'present'].filter(Boolean).join(' ');
  }
  if (f.verb_form === 'imperative') return ['imperative', numberName(f.number)].filter(Boolean).join(' ');
  if (f.verb_form?.startsWith('participle')) {
    const kind = f.verb_form === 'participle-act-pres' ? 'active present participle'
      : f.verb_form === 'participle-act-past' ? 'active past participle'
      : f.verb_form === 'participle-pass-pres' ? 'passive present participle'
      : f.verb_form === 'participle-pass-past' ? 'passive past participle'
      : 'short participle';
    return [kind, genderName(f.gender), numberName(f.number), caseName(f.case)].filter(Boolean).join(' ');
  }
  if (f.verb_form?.startsWith('gerund')) return f.verb_form === 'gerund-past' ? 'past gerund' : 'present gerund';
  if (f.degree === 'comparative') return 'comparative';
  if (f.degree === 'superlative') parts.push('superlative');
  if (f.degree === 'short') parts.push('short form');
  const g = genderName(f.gender);
  const n = numberName(f.number);
  const c = caseName(f.case);
  if (f.person) parts.push(personName(f.person));
  if (g) parts.push(g);
  if (n) parts.push(n);
  if (f.case) parts.push(c);
  return parts.filter(Boolean).join(' ') || 'uninflected';
}

/** Ending gloss for a morpheme chip, e.g. "genitive singular ending". */
export function endingGloss(f: MorphFeatures): string {
  const d = describeFeatures(f);
  return d === 'uninflected' ? 'ending' : `${d} ending`;
}
