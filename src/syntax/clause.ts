/**
 * Clause analysis: predicate / nominative subject / accusative object /
 * dative experiencer / у-possessor, subject–predicate agreement (flagged
 * when it does not hold — never hidden), and a word-order note. Shallow by
 * design (ARCHITECTURE.md: "clauses split, not attached").
 */
import type { MorphFeatures } from '../database/types';
import { describeFeatures } from '../morphology/describe';
import { chosen, type AnalyzedToken, type ClauseInfo, type FoundConstruction } from '../morphology/sentence';

function nounLike(pos: string): boolean {
  return pos === 'noun' || pos === 'proper' || pos === 'pronoun';
}

/**
 * Subject–predicate agreement, factored out so a coordinated predicate that
 * shares an earlier clause's subject (одна человек вышел … и отправился —
 * see syntax/index.ts's coordination pass) can have its own agreement
 * checked against that inherited subject, not just a locally-found one.
 */
export function computeAgreement(tokens: AnalyzedToken[], subject: number | undefined, verbFeat: MorphFeatures, experiencer?: number): NonNullable<ClauseInfo['agreement']> {
  const isPast = verbFeat.verb_form === 'past';
  const actual: MorphFeatures = { gender: verbFeat.gender, number: verbFeat.number, person: verbFeat.person };
  if (subject === undefined) {
    return {
      target: null,
      targetLabel: 'no overt subject',
      expected: {},
      actual,
      matches: null,
      explanation: experiencer !== undefined
        ? `Impersonal clause: there is no grammatical subject. ${tokens[experiencer]!.text} is the dative experiencer, not the subject; the verb defaults to 3rd person singular (or neuter past).`
        : 'No nominative subject was found in this clause.',
    };
  }
  const sc = chosen(tokens[subject]!)!;
  const expected: MorphFeatures = isPast
    ? { gender: sc.features.gender, number: sc.features.number }
    : { person: sc.pos === 'pronoun' ? sc.features.person : sc.features.number === 'pl' ? undefined : 3, number: sc.features.number };
  const checks: boolean[] = [];
  if (expected.gender && actual.gender) checks.push(expected.gender === actual.gender);
  if (expected.number && actual.number) checks.push(expected.number === actual.number);
  if (expected.person && actual.person) checks.push(expected.person === actual.person);
  const matches = checks.length ? checks.every(Boolean) : null;
  let explanation = isPast
    ? `Past tense agrees with its subject ${tokens[subject]!.text} in gender and number: expected ${describeFeatures(expected)}, the verb shows ${describeFeatures(actual)}.`
    : `The verb agrees with its subject ${tokens[subject]!.text} in person and number: expected ${describeFeatures(expected)}, the verb shows ${describeFeatures(actual)}.`;
  if (matches === false) explanation += ' ⚠ The verb form does not show this agreement — check the reading.';
  return { target: subject, targetLabel: `the subject ${tokens[subject]!.text}`, expected, actual, matches, explanation };
}

export function analyzeClause(tokens: AnalyzedToken[], constructions: FoundConstruction[], range?: [number, number]): ClauseInfo {
  const info: ClauseInfo = { notes: [] };
  const [lo, hi] = range ?? [0, tokens.length];
  const inRange = (c: FoundConstruction) => c.tokens.every((i) => i >= lo && i < hi);

  const aspectCs = constructions.filter((c) => c.type === 'aspect' && inRange(c));
  if (!aspectCs.length) return info;
  // the main predicate is the last FINITE verb (past/present-future/imperative); a trailing
  // infinitive is usually a dependent complement of an earlier finite verb (захотел
  // напиться), which does not itself carry person/gender/number to agree with the subject.
  const verbC = [...aspectCs].reverse().find((c) => c.features.verb_form !== 'infinitive') ?? aspectCs[aspectCs.length - 1]!;
  info.verb = verbC;
  info.predicate = verbC.head;

  // every token of a prepositional phrase, including its head noun, is the preposition's
  // object, not a candidate for the clause's own subject/object slots
  const ppTokens = new Set(constructions.filter((c) => c.type === 'prepositional-phrase' && inRange(c)).flatMap((c) => c.tokens));
  const impersonalC = constructions.find((c) => c.type === 'impersonal' && inRange(c) && c.tokens.includes(verbC.head));
  const possessionC = constructions.find((c) => c.type === 'possession' && inRange(c));

  let experiencer: number | undefined;
  if (impersonalC) {
    const entry = Object.entries(impersonalC.roles).find(([, v]) => v === 'dative experiencer');
    if (entry) experiencer = Number(entry[0]);
  }
  let possessor: number | undefined;
  if (possessionC) {
    const entry = Object.entries(possessionC.roles).find(([, v]) => v === 'possessor');
    if (entry) possessor = Number(entry[0]);
  }

  let subject: number | undefined;
  let object: number | undefined;
  let indirectObject: number | undefined;
  for (let i = lo; i < hi; i++) {
    if (ppTokens.has(i) || i === experiencer || i === possessor) continue;
    const t = tokens[i]!;
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || !nounLike(c.pos)) continue;
    if (c.features.case === 'nom' && subject === undefined) subject = i;
    else if (c.features.case === 'acc' && object === undefined) object = i;
    else if (c.features.case === 'dat' && indirectObject === undefined) indirectObject = i;
  }
  info.subject = subject;
  info.object = object;
  info.indirectObject = indirectObject;
  info.experiencer = experiencer;
  info.possessor = possessor;

  // ---- agreement
  const verbFeat = verbC.features;
  info.agreement = computeAgreement(tokens, subject, verbFeat, experiencer);

  // ---- aspect note (reuse the aspect construction's own explanation)
  if (verbFeat.aspect) info.aspect = { aspect: verbFeat.aspect, explanation: verbC.explanation };

  // ---- word order
  if (object !== undefined && subject !== undefined && object < subject) {
    info.wordOrder = `${tokens[object]!.text} precedes the subject ${tokens[subject]!.text} — the object is fronted for emphasis; unmarked order would be subject–verb–object.`;
  } else if (subject !== undefined && verbC.head < subject) {
    info.wordOrder = `the verb ${tokens[verbC.head]!.text} precedes its subject ${tokens[subject]!.text} — a narrative inversion; unmarked order would put the subject first.`;
  }

  return info;
}
