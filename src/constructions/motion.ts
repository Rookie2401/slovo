/**
 * Motion verbs: unidirectional (идти, вышел…) vs multidirectional (ходить,
 * выходить…) — `features.motion` is already set by the dictionary bridge
 * from the lexeme's `extra.motion`, so this module only explains it.
 */
import type { AnalyzedToken, FoundConstruction } from '../morphology/sentence';
import { chosen } from '../morphology/sentence';

export function findMotionConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'verb' || !c.features.motion) continue;
    const uni = c.features.motion === 'uni';
    const explanation = uni
      ? `${c.lemma} is a unidirectional motion verb: motion in one direction, on a single occasion (as opposed to habitual back-and-forth motion).`
      : `${c.lemma} is a multidirectional motion verb: habitual motion, a round trip, or motion with no fixed direction (as opposed to a single trip one way).`;
    out.push({
      type: 'motion',
      pattern: `motion:${c.features.motion}`,
      label: uni ? 'unidirectional motion' : 'multidirectional motion',
      gloss: c.gloss,
      explanation,
      tokens: [t.i],
      roles: { [t.i]: 'motion verb' },
      features: { motion: c.features.motion, aspect: c.features.aspect },
      confidence: 0.85,
      source: 'syntax_engine',
      head: t.i,
    });
  }
  return out;
}
