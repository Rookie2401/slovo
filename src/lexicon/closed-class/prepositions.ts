/**
 * Prepositions with the case(s) they govern. Some govern a single case
 * always (у, для, без, из, от, до, к, о/об, про, через → always the same
 * case); some govern different cases for different meanings (в, на, с, за,
 * под, между, по) — those list every governed case with a short sense note,
 * and syntax/context.ts picks between them from the neighbouring verb/noun
 * (the в/на motion rule lives there, not here).
 */
import type { Candidate } from '../../morphology/candidate';
import type { Morpheme } from '../../database/types';
import type { Case } from '../../database/types';
import { looseKey } from '../../tokenizer/cyrillic';

export interface PrepositionSense {
  case: Case;
  sense: string;
}

export interface PrepositionEntry {
  form: string;
  senses: PrepositionSense[];
}

export const PREPOSITIONS: PrepositionEntry[] = [
  { form: 'в', senses: [{ case: 'prep', sense: 'location: inside/at (в доме)' }, { case: 'acc', sense: 'motion into, or a point in time (в дом; в среду; в час)' }] },
  { form: 'во', senses: [{ case: 'prep', sense: 'location: inside/at (variant of в before a consonant cluster)' }, { case: 'acc', sense: 'motion into (variant of в)' }] },
  { form: 'на', senses: [{ case: 'prep', sense: 'location: on/at a surface or event (на столе)' }, { case: 'acc', sense: 'motion onto, or a duration/destination (на стол; на улицу)' }] },
  { form: 'с', senses: [{ case: 'inst', sense: 'accompaniment: with (с другом)' }, { case: 'gen', sense: 'motion away from a surface, or a starting point (со стола; с утра)' }] },
  { form: 'со', senses: [{ case: 'inst', sense: 'accompaniment: with (variant of с)' }, { case: 'gen', sense: 'motion away from a surface (variant of с)' }] },
  { form: 'за', senses: [{ case: 'inst', sense: 'location: behind, or occupied with (за столом)' }, { case: 'acc', sense: 'motion behind, or "in exchange for / during" (за стол; за час)' }] },
  { form: 'под', senses: [{ case: 'inst', sense: 'location: under (под столом)' }, { case: 'acc', sense: 'motion under, or "toward (a time)" (под вечер — toward evening)' }] },
  { form: 'между', senses: [{ case: 'inst', sense: 'location: between (между домами)' }, { case: 'gen', sense: 'between, literary alternative' }] },
  { form: 'по', senses: [{ case: 'dat', sense: 'along/around, according to, distributive (по улице; по средам)' }, { case: 'acc', sense: 'up to and including (по колено)' }, { case: 'prep', sense: 'after (по приезде) — a bookish sense' }] },
  { form: 'у', senses: [{ case: 'gen', sense: 'possessor/location: at, by, "have" (у меня, у окна)' }] },
  { form: 'для', senses: [{ case: 'gen', sense: 'purpose: for (для тебя)' }] },
  { form: 'без', senses: [{ case: 'gen', sense: 'without (без денег)' }] },
  { form: 'из', senses: [{ case: 'gen', sense: 'motion out of, origin (из дома)' }] },
  { form: 'из-за', senses: [{ case: 'gen', sense: 'from behind, or "because of" (из-за угла; из-за дождя)' }] },
  { form: 'из-под', senses: [{ case: 'gen', sense: 'from under (из-под стола)' }] },
  { form: 'от', senses: [{ case: 'gen', sense: 'motion away from, source (от двери; письмо от друга)' }] },
  { form: 'до', senses: [{ case: 'gen', sense: 'up to, until (до вечера)' }] },
  { form: 'к', senses: [{ case: 'dat', sense: 'motion toward, addressee (к дому; к другу)' }] },
  { form: 'ко', senses: [{ case: 'dat', sense: 'motion toward (variant of к before a consonant cluster)' }] },
  { form: 'о', senses: [{ case: 'prep', sense: 'about, concerning (о книге)' }] },
  { form: 'об', senses: [{ case: 'prep', sense: 'about, concerning (variant of о before a vowel)' }] },
  { form: 'обо', senses: [{ case: 'prep', sense: 'about, concerning (variant of о before мне/всём)' }] },
  { form: 'про', senses: [{ case: 'acc', sense: 'about (colloquial: про тебя)' }] },
  { form: 'через', senses: [{ case: 'acc', sense: 'across, through, or "after (a time)" (через дорогу; через час)' }] },
  { form: 'чрез', senses: [{ case: 'acc', sense: 'across, through, or "after (a time)" — older spelling of через' }] },
  { form: 'при', senses: [{ case: 'prep', sense: 'in the presence of, attached to, at the time of (при мне; при школе)' }] },
  { form: 'над', senses: [{ case: 'inst', sense: 'location: above (над столом)' }] },
  { form: 'перед', senses: [{ case: 'inst', sense: 'location: in front of, before (перед домом)' }] },
];

const INDEX = new Map<string, PrepositionEntry>();
for (const p of PREPOSITIONS) INDEX.set(looseKey(p.form), p);

export function prepositionEntry(key: string): PrepositionEntry | undefined {
  return INDEX.get(key);
}

function whole(form: string): Morpheme[] {
  return [{ text: form, role: 'stem', gloss: 'whole word (closed class)', start: 0, end: form.length }];
}

/** All candidates for a preposition key: one per governed case, ranked by first-listed (most common) sense. */
export function prepositionCandidates(key: string, surface: string): Candidate[] {
  const entry = INDEX.get(key);
  if (!entry) return [];
  return entry.senses.map((s, i) => ({
    key: `preposition:${entry.form}`,
    lemma: entry.form,
    pos: 'preposition',
    gloss: s.sense.replace(/\s*\(.*\)$/, ''),
    features: { case: s.case },
    morphemes: whole(surface),
    notes: [`governs the ${s.case}: ${s.sense}`],
    source: 'rule',
    confidence: entry.senses.length === 1 ? 1 : i === 0 ? 0.7 : 0.6,
  }));
}
