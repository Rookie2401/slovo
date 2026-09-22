/**
 * Aspect: for every finite verb, why perfective or imperfective was used
 * here, with a contrast against its aspectual partner when the dictionary
 * knows one (Candidate.partner, already resolved by the dictionary bridge —
 * no extra lookup needed here).
 */
import type { AnalyzedToken, FoundConstruction } from '../morphology/sentence';
import { chosen } from '../morphology/sentence';

const FINITE = new Set(['past', 'present-future', 'imperative', 'infinitive']);

function partnerLemma(partnerKey: string): string {
  const i = partnerKey.indexOf(':');
  return i >= 0 ? partnerKey.slice(i + 1) : partnerKey;
}

export function findAspectConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  const consumed = new Set<number>();

  // analytic imperfective future: буду/будешь/будет/будем/будете/будут + infinitive — an
  // imperfective verb has no simple future, so быть in the future tense plus the infinitive
  // builds it periphrastically. One combined construction, not two separate finite+infinitive
  // ones, and the infinitive is excluded from the ordinary per-token loop below.
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'verb' || c.lemma !== 'быть' || c.features.tense !== 'future') continue;
    const next = tokens[t.i + 1];
    const nc = next && next.kind === 'word' ? chosen(next) : undefined;
    if (!nc || nc.pos !== 'verb' || nc.features.verb_form !== 'infinitive') continue;
    out.push({
      type: 'aspect',
      pattern: 'future:analytic',
      label: 'analytic future (imperfective)',
      gloss: `will ${nc.gloss}`,
      explanation: `${t.text} + ${next.text}: the analytic future of an imperfective verb. ${nc.lemma} has no simple (one-word) future form, so быть in the future tense (${c.gloss}) plus the infinitive builds the future periphrastically.`,
      tokens: [t.i, next.i],
      roles: { [t.i]: 'future auxiliary (быть)', [next.i]: 'infinitive' },
      features: { aspect: 'imperfective', tense: 'future', verb_form: 'present-future', person: c.features.person, number: c.features.number },
      confidence: 0.9,
      source: 'syntax_engine',
      head: t.i,
    });
    consumed.add(t.i);
    consumed.add(next.i);
  }

  for (const t of tokens) {
    if (t.kind !== 'word' || consumed.has(t.i)) continue;
    const c = chosen(t);
    if (!c || c.pos !== 'verb' || !c.features.verb_form || !FINITE.has(c.features.verb_form)) continue;
    const aspect = c.features.aspect;
    let explanation: string;
    if (aspect === 'perfective') {
      explanation = `${c.lemma} is perfective: it presents the action as a single, completed whole, or focuses on its result — not as an ongoing or repeated process.`;
    } else if (aspect === 'imperfective') {
      explanation = `${c.lemma} is imperfective: it presents the action as a process, a habitual/repeated action, a general fact, or (especially in a negated past) simply that the event did not take place.`;
    } else if (aspect === 'biaspectual') {
      explanation = `${c.lemma} is biaspectual: the same form serves as both perfective and imperfective; only the context shows which is meant here.`;
    } else {
      // a guessed verb (not in the dictionary) still needs to serve as the clause's predicate —
      // subject/agreement checking should not silently fail just because the aspect is unknown.
      explanation = `${c.lemma}: not in the dictionary, so its aspect is not known. It is still read as the main verb here.`;
    }
    let contrast: string | undefined;
    if (c.partner) {
      const other = partnerLemma(c.partner);
      contrast = aspect === 'perfective'
        ? `Its imperfective partner is ${other} — use ${other} for the ongoing/repeated version of this action.`
        : `Its perfective partner is ${other} — use ${other} once the action is seen as a single completed event.`;
    }
    out.push({
      type: 'aspect',
      pattern: `aspect:${aspect ?? 'unknown'}`,
      label: aspect ? `${aspect} verb` : 'verb (aspect unknown)',
      gloss: c.gloss,
      explanation: contrast ? `${explanation} ${contrast}` : explanation,
      tokens: [t.i],
      roles: { [t.i]: 'predicate' },
      features: { aspect, verb_form: c.features.verb_form, tense: c.features.tense, gender: c.features.gender, number: c.features.number, person: c.features.person },
      confidence: aspect ? 0.85 : Math.min(0.5, c.confidence),
      source: 'syntax_engine',
      head: t.i,
    });
  }
  return out;
}
