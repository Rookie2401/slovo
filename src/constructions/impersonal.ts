/**
 * Impersonal constructions: dative experiencer + predicative/3sg-n verb
 * (мне холодно, ему пришлось, нельзя/надо/можно + infinitive), and у +
 * genitive "have" (у меня книга).
 */
import type { AnalyzedToken, FoundConstruction } from '../morphology/sentence';
import { chosen } from '../morphology/sentence';

function isDativeExperiencer(t: AnalyzedToken | undefined): boolean {
  if (!t) return false;
  const c = chosen(t);
  return !!c && (c.pos === 'pronoun' || c.pos === 'noun' || c.pos === 'proper') && c.features.case === 'dat';
}
function isInfinitive(t: AnalyzedToken | undefined): boolean {
  const c = t && chosen(t);
  return !!c && c.pos === 'verb' && c.features.verb_form === 'infinitive';
}

export function findImpersonalConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c) continue;

    // predicative (надо/нужно/нельзя/можно/жаль/пора/холодно…) [+ dative experiencer] [+ infinitive]
    if (c.pos === 'predicative') {
      const dat = [tokens[t.i - 1], tokens[t.i - 2]].find(isDativeExperiencer);
      const inf = [tokens[t.i + 1], tokens[t.i + 2]].find(isInfinitive);
      const members = [dat?.i, t.i, inf?.i].filter((x): x is number => x !== undefined).sort((a, b) => a - b);
      const roles: Record<number, string> = { [t.i]: 'impersonal predicate' };
      if (dat) roles[dat.i] = 'dative experiencer';
      if (inf) roles[inf.i] = 'infinitive (the thing that is necessary/possible/etc.)';
      out.push({
        type: 'impersonal',
        pattern: `impersonal:${c.lemma}`,
        label: `impersonal: ${c.lemma}`,
        gloss: c.gloss,
        explanation: `${c.lemma} is an impersonal predicative: it needs no grammatical subject.${dat ? ` ${dat.text} is the dative experiencer — the one affected — not a subject.` : ' The one affected, if named, stands in the dative (мне, ему…), not the nominative.'}${inf ? ` ${inf.text} names the action.` : ''}`,
        tokens: members,
        roles,
        features: { negated: undefined },
        confidence: 0.85,
        source: 'syntax_engine',
        head: t.i,
      });
      continue;
    }

    // у + genitive "have" (у меня книга; the "есть" is often dropped for ownership already known)
    if (c.pos === 'preposition' && t.norm.toLowerCase() === 'у') {
      const owner = tokens[t.i + 1];
      const oc = owner && chosen(owner);
      if (!oc || oc.features.case !== 'gen') continue;
      out.push({
        type: 'possession',
        pattern: 'possession:у',
        label: `possession: у ${owner!.text}`,
        gloss: `${owner!.text} has…`,
        explanation: `у + genitive marks the possessor: у ${owner!.text} = "${owner!.text} has" (literally "at/by ${owner!.text}"). The thing possessed stays nominative (with есть if existence/availability is asserted) — it is not the object of у.`,
        tokens: [t.i, owner!.i],
        roles: { [t.i]: 'possession marker', [owner!.i]: 'possessor' },
        features: { preposition: 'у' },
        confidence: 0.8,
        source: 'syntax_engine',
        head: owner!.i,
      });
    }
  }
  return out;
}
