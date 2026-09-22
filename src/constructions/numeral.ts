/**
 * Numeral-phrase construction: wraps the numeral + the counted noun (whose
 * case syntax/context.ts already picked) into one reportable unit with a
 * plain explanation of the government pattern.
 */
import type { AnalyzedToken, FoundConstruction } from '../morphology/sentence';
import { chosen } from '../morphology/sentence';

export function findNumeralConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'numeral') continue;
    const noun = tokens[t.i + 1];
    const nc = noun && noun.kind === 'word' ? chosen(noun) : undefined;
    if (!nc || nc.pos !== 'noun') continue;
    const oneLike = c.lemma === 'один';
    const smallLike = ['два', 'три', 'четыре'].includes(c.lemma);
    const explanation = oneLike
      ? `один agrees with ${noun!.text} like an adjective and takes a singular noun.`
      : smallLike
        ? `${c.lemma} governs the genitive singular of the counted noun: ${noun!.text} is genitive singular, not plural.`
        : `${c.lemma} governs the genitive plural of the counted noun: ${noun!.text} is genitive plural.`;
    out.push({
      type: 'numeral-phrase',
      pattern: `numeral:${c.lemma}`,
      label: `${t.text} ${noun!.text}`,
      gloss: `${c.gloss} ${nc.gloss}`,
      explanation,
      tokens: [t.i, noun!.i],
      roles: { [t.i]: 'numeral', [noun!.i]: 'counted noun' },
      features: { case: nc.features.case, number: nc.features.number },
      confidence: 0.85,
      source: 'syntax_engine',
      head: t.i,
    });
  }
  return out;
}
