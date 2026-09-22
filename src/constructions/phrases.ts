/**
 * Phrase-level constructions: prepositional phrases (preposition + the noun
 * phrase it governs, case already picked by syntax/context.ts), participle
 * and gerund clauses, бы conditionals, чтобы purpose clauses, and
 * comparatives (быстрее + чем).
 */
import type { AnalyzedToken, FoundConstruction } from '../morphology/sentence';
import { chosen } from '../morphology/sentence';
import { prepositionEntry } from '../lexicon/closed-class';
import { caseName } from '../morphology/describe';

function isModifierOfNoun(pos: string): boolean {
  return pos === 'adjective' || pos === 'numeral' || pos === 'adverb';
}

/** Preposition + the noun phrase before its head noun (adjectives/possessives included). */
export function findPrepositionalPhrases(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'preposition') continue;
    const entry = prepositionEntry(t.key);
    // find the head: next noun/proper/standalone-pronoun, possibly after modifiers
    let head: AnalyzedToken | undefined;
    const npStart: number[] = [];
    for (let j = t.i + 1; j < tokens.length && j <= t.i + 6; j++) {
      const w = tokens[j]!;
      if (w.kind !== 'word') break;
      const wc = chosen(w);
      if (!wc) break;
      if (wc.pos === 'noun' || wc.pos === 'proper') {
        head = w;
        break;
      }
      if (wc.pos === 'pronoun' || isModifierOfNoun(wc.pos)) {
        npStart.push(j);
        if (wc.pos === 'pronoun' && (wc.features.pronoun_type === 'personal' || wc.features.pronoun_type === 'negative' || wc.features.pronoun_type === 'indefinite' || wc.features.pronoun_type === 'relative' || wc.features.pronoun_type?.startsWith('interrogative'))) {
          head = w;
          break;
        }
        continue;
      }
      break;
    }
    if (!head) continue;
    const hc = chosen(head)!;
    const idxs = [t.i, ...npStart, head.i].sort((a, b) => a - b);
    const roles: Record<number, string> = {};
    for (const i of idxs) roles[i] = i === t.i ? 'preposition' : i === head.i ? 'noun phrase head' : 'modifier';
    out.push({
      type: 'prepositional-phrase',
      pattern: `pp:${t.norm}`,
      label: `${t.text} ${tokens.slice(idxs[0], head.i + 1).filter((x) => x.kind === 'word').map((x) => x.text).join(' ')}`,
      gloss: `${c.gloss} ${hc.gloss}`,
      explanation: `${t.text} governs the ${caseName(hc.features.case)}: ${entry ? entry.senses.find((s) => s.case === hc.features.case)?.sense ?? entry.senses[0]!.sense : c.gloss}.`,
      tokens: idxs,
      roles,
      features: { case: hc.features.case, preposition: t.norm, governed_case: hc.features.case },
      confidence: 0.85,
      source: 'syntax_engine',
      head: head.i,
    });
  }
  return out;
}

/** Participle clauses: an active/passive participle (declined, not a plain finite verb) with what it modifies. */
export function findParticipleClauses(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'verb' || !c.features.verb_form?.startsWith('participle')) continue;
    // the noun it agrees with: nearest noun before it (or after, if none before) matching gender/number
    const before = tokens.slice(0, t.i).reverse().find((x) => x.kind === 'word' && chosen(x)?.pos === 'noun');
    const target = before ?? tokens.slice(t.i + 1).find((x) => x.kind === 'word' && chosen(x)?.pos === 'noun');
    const kind = c.features.verb_form === 'participle-act-pres' ? 'present active' : c.features.verb_form === 'participle-act-past' ? 'past active' : c.features.verb_form === 'participle-pass-pres' ? 'present passive' : 'past passive';
    out.push({
      type: 'participle-clause',
      pattern: `participle:${c.features.verb_form}`,
      label: `${kind} participle: ${c.lemma}`,
      gloss: c.gloss,
      explanation: `${t.text} is a ${kind} participle of ${c.lemma}: it works like an adjective and opens a reduced relative clause${target ? ` describing ${target.text}` : ''} ("the one who is/was …ing", "the thing that was …ed").`,
      tokens: target ? [target.i, t.i].sort((a, b) => a - b) : [t.i],
      roles: target ? { [target.i]: 'described noun', [t.i]: 'participle' } : { [t.i]: 'participle' },
      features: { verb_form: c.features.verb_form, voice: c.features.voice, gender: c.features.gender, number: c.features.number, case: c.features.case },
      confidence: 0.7,
      source: 'syntax_engine',
      head: t.i,
    });
  }
  return out;
}

/** Gerund clauses: an adverbial participle (не изменяемое) describing a simultaneous/prior action of the subject. */
export function findGerundClauses(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'verb' || !c.features.verb_form?.startsWith('gerund')) continue;
    const past = c.features.verb_form === 'gerund-past';
    out.push({
      type: 'gerund-clause',
      pattern: `gerund:${c.features.verb_form}`,
      label: `${past ? 'past' : 'present'} gerund: ${c.lemma}`,
      gloss: c.gloss,
      explanation: past
        ? `${t.text} is a past gerund of ${c.lemma}: an action completed before the main verb, done by the same subject ("having …ed, …").`
        : `${t.text} is a present gerund of ${c.lemma}: an action happening at the same time as the main verb, done by the same subject ("while …ing, …").`,
      tokens: [t.i],
      roles: { [t.i]: 'gerund' },
      features: { verb_form: c.features.verb_form, aspect: c.features.aspect },
      confidence: 0.7,
      source: 'syntax_engine',
      head: t.i,
    });
  }
  return out;
}

/** бы: conditional/subjunctive marker with a past-tense verb. */
export function findConditionalConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word' || t.norm.toLowerCase() !== 'бы') continue;
    const verb = [tokens[t.i - 1], tokens[t.i + 1]].find((x) => x && x.kind === 'word' && chosen(x)?.pos === 'verb' && chosen(x)?.features.verb_form === 'past');
    out.push({
      type: 'conditional',
      pattern: 'conditional:бы',
      label: 'бы conditional/subjunctive',
      gloss: 'would…',
      explanation: `бы with a past-tense verb${verb ? ` (${verb.text})` : ''} makes a conditional or subjunctive: "would …", a wish, or a polite suggestion — not an actual past event.`,
      tokens: verb ? [t.i, verb.i].sort((a, b) => a - b) : [t.i],
      roles: verb ? { [t.i]: 'бы', [verb.i]: 'verb (conditional/subjunctive)' } : { [t.i]: 'бы' },
      features: { mood: 'conditional' },
      confidence: 0.8,
      source: 'syntax_engine',
      head: verb?.i ?? t.i,
    });
  }
  return out;
}

/** чтобы: purpose ("in order to") or a wish/request clause. */
export function findPurposeConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word' || (t.norm.toLowerCase() !== 'чтобы' && t.norm.toLowerCase() !== 'чтоб')) continue;
    const verb = tokens.slice(t.i + 1, t.i + 4).find((x) => x.kind === 'word' && chosen(x)?.pos === 'verb');
    out.push({
      type: 'purpose',
      pattern: 'purpose:чтобы',
      label: 'чтобы purpose/wish clause',
      gloss: 'so that / in order to',
      explanation: `чтобы introduces a purpose or wish clause; the verb after it (${verb ? verb.text : 'that follows'}) takes the past-tense form used as a subjunctive, regardless of actual time.`,
      tokens: verb ? [t.i, verb.i] : [t.i],
      roles: verb ? { [t.i]: 'чтобы', [verb.i]: 'subjunctive verb' } : { [t.i]: 'чтобы' },
      features: { mood: 'conditional' },
      confidence: 0.85,
      source: 'syntax_engine',
      head: t.i,
    });
  }
  return out;
}

/** Comparative + чем: "faster than…". */
export function findComparativeConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.features.degree !== 'comparative') continue;
    const chem = tokens.slice(t.i + 1, t.i + 3).find((x) => x.kind === 'word' && x.norm.toLowerCase() === 'чем');
    const standard = chem ? tokens[chem.i + 1] : undefined;
    out.push({
      type: 'comparative',
      pattern: 'comparative',
      label: `comparative: ${c.lemma}`,
      gloss: c.gloss,
      explanation: chem && standard
        ? `${t.text} is a comparative; чем ${standard.text} names what it is compared to ("more … than ${standard.text}").`
        : `${t.text} is a comparative ("more …"); a following чем + noun/pronoun would name what it is compared to, or the standard is understood without being repeated (than before).`,
      tokens: chem && standard ? [t.i, chem.i, standard.i] : [t.i],
      roles: chem && standard ? { [t.i]: 'comparative', [chem.i]: 'чем', [standard.i]: 'standard of comparison' } : { [t.i]: 'comparative' },
      features: { degree: 'comparative' },
      confidence: 0.8,
      source: 'syntax_engine',
      head: t.i,
    });
  }
  return out;
}
