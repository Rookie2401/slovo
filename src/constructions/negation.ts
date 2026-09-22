/**
 * Negation: не + verb (with the genitive-object note context.ts already
 * applied to the object token), ни…ni doubled coordination, and
 * никто/ничего/etc. + не — Russian requires the не even though the
 * negative pronoun already says "no one/nothing" (double negation is
 * grammatical, not a mistake).
 */
import type { AnalyzedToken, FoundConstruction } from '../morphology/sentence';
import { chosen } from '../morphology/sentence';

export function findNegationConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word' || t.norm.toLowerCase() !== 'не') continue;
    const next = tokens[t.i + 1];
    if (!next || next.kind !== 'word') continue;
    const nc = chosen(next);
    if (!nc) continue;
    const negPronoun = tokens.slice(Math.max(0, t.i - 3), t.i).find((x) => x.kind === 'word' && chosen(x)?.features.pronoun_type === 'negative');
    const genObject = tokens.slice(t.i + 1, t.i + 4).find((x) => x.kind === 'word' && chosen(x)?.features.case === 'gen' && (chosen(x)?.pos === 'noun' || chosen(x)?.pos === 'pronoun'));
    const members = [negPronoun?.i, t.i, next.i, genObject?.i].filter((x): x is number => x !== undefined);
    const roles: Record<number, string> = { [t.i]: 'negation' };
    if (negPronoun) roles[negPronoun.i] = 'negative pronoun';
    if (genObject) roles[genObject.i] = 'genitive object (negated)';
    let explanation = `не negates ${next.text}.`;
    if (negPronoun) explanation += ` ${negPronoun.text} + не is required double negation in Russian — unlike English, the negative pronoun does not cancel the не.`;
    if (genObject) explanation += ` Under negation, a direct object often shifts from the accusative to the genitive (${genObject.text}).`;
    out.push({
      type: negPronoun ? 'negation' : 'negation-genitive',
      pattern: negPronoun ? 'negation:double' : genObject ? 'negation:genitive-object' : 'negation:plain',
      label: 'negation',
      gloss: `not …`,
      explanation,
      tokens: members.sort((a, b) => a - b),
      roles,
      features: { negated: true },
      confidence: 0.85,
      source: 'syntax_engine',
      head: t.i,
    });
  }

  // ни…ни (neither…nor): two "ни X" conjuncts
  const niTokens = tokens.filter((t) => t.kind === 'word' && t.norm.toLowerCase() === 'ни');
  for (let i = 0; i + 1 < niTokens.length; i++) {
    const a = niTokens[i]!;
    const b = niTokens[i + 1]!;
    if (b.i - a.i > 8) continue;
    out.push({
      type: 'negation',
      pattern: 'negation:ni-ni',
      label: 'ни…ни',
      gloss: 'neither…nor',
      explanation: 'ни…ни: doubled coordinating negation, "neither…nor" — the clause also needs its own не on the verb.',
      tokens: [a.i, b.i],
      roles: { [a.i]: 'ни (first)', [b.i]: 'ни (second)' },
      features: { negated: true },
      confidence: 0.8,
      source: 'syntax_engine',
      head: a.i,
    });
  }
  return out;
}
