/**
 * A readable dependency sketch: one main predicate, its arguments,
 * prepositional phrases, modifiers and negation. Deliberately shallow — see
 * ARCHITECTURE.md's "known limits".
 */
import { chosen, type AnalyzedToken, type ClauseInfo, type FoundConstruction, type FoundDependency } from '../morphology/sentence';

export function buildDependencies(tokens: AnalyzedToken[], allConstructions: FoundConstruction[], clause: ClauseInfo): FoundDependency[] {
  const [lo, hi] = clause.range ?? [0, tokens.length];
  const constructions = allConstructions.filter((c) => c.tokens.every((i) => i >= lo && i < hi));
  const deps: FoundDependency[] = [];
  const has = new Set<number>();
  const add = (d: FoundDependency) => {
    if (has.has(d.dependent)) return;
    has.add(d.dependent);
    deps.push(d);
  };
  const root = clause.predicate ?? -1;
  if (clause.verb) add({ head: null, dependent: root, relation: 'predicate', confidence: 0.85 });
  if (clause.subject !== undefined) add({ head: root >= 0 ? root : null, dependent: clause.subject, relation: 'subject', confidence: 0.8 });
  if (clause.object !== undefined) add({ head: root >= 0 ? root : null, dependent: clause.object, relation: 'object', confidence: 0.75 });
  if (clause.indirectObject !== undefined) add({ head: root >= 0 ? root : null, dependent: clause.indirectObject, relation: 'indirect-object', confidence: 0.7 });
  if (clause.experiencer !== undefined) add({ head: root >= 0 ? root : null, dependent: clause.experiencer, relation: 'experiencer', explanation: 'dative experiencer of an impersonal predicate', confidence: 0.75 });
  if (clause.possessor !== undefined) add({ head: root >= 0 ? root : null, dependent: clause.possessor, relation: 'possessor', explanation: 'у + genitive possessor', confidence: 0.75 });
  if (clause.agreement?.target != null && clause.agreement.target !== root) add({ head: root >= 0 ? root : null, dependent: clause.agreement.target, relation: 'agreement-target', explanation: clause.agreement.explanation, confidence: 0.7 });

  for (const c of constructions) {
    if (c.type === 'prepositional-phrase') {
      for (const t of c.tokens) {
        if (t === c.head) continue;
        add({ head: c.head, dependent: t, relation: t === c.tokens[0] && chosen(tokens[t]!)?.pos === 'preposition' ? 'preposition' : 'modifier', confidence: 0.8 });
      }
      if (!has.has(c.head)) add({ head: root >= 0 ? root : null, dependent: c.head, relation: 'prepositional-object', explanation: c.gloss, confidence: 0.6 });
    }
    if (c.type === 'participle-clause' || c.type === 'gerund-clause') {
      for (const t of c.tokens) if (t !== c.head) add({ head: c.head, dependent: t, relation: 'modifier', confidence: 0.6 });
      if (!has.has(c.head)) add({ head: root >= 0 ? root : null, dependent: c.head, relation: 'adverbial', explanation: c.label, confidence: 0.55 });
    }
    if (c.type === 'name' && c.tokens.length > 1) {
      const [first, ...rest] = c.tokens;
      for (const t of rest) add({ head: first!, dependent: t, relation: 'apposition', confidence: 0.7 });
    }
    if (c.type === 'negation' || c.type === 'negation-genitive') {
      for (const t of c.tokens) {
        if (chosen(tokens[t]!)?.pos === 'particle') add({ head: root >= 0 ? root : null, dependent: t, relation: 'negation', confidence: 0.75 });
      }
    }
    if (c.type === 'numeral-phrase') {
      const [num, noun] = c.tokens;
      if (noun !== undefined && num !== undefined) add({ head: noun, dependent: num, relation: 'modifier', explanation: 'numeral modifying the counted noun', confidence: 0.7 });
    }
  }

  for (const t of tokens) {
    if (t.kind !== 'word' || has.has(t.i) || t.i < lo || t.i >= hi) continue;
    const c = chosen(t);
    if (!c) continue;
    if (c.pos === 'adjective' || (c.pos === 'pronoun' && (c.features.pronoun_type === 'possessive' || c.features.pronoun_type === 'demonstrative'))) {
      add({ head: root >= 0 ? root : t.i > 0 ? t.i - 1 : null, dependent: t.i, relation: 'modifier', confidence: 0.55 });
    } else if (c.pos === 'adverb') {
      add({ head: root >= 0 ? root : null, dependent: t.i, relation: 'adverbial', confidence: 0.5 });
    } else if (c.pos === 'conjunction') {
      add({ head: root >= 0 ? root : null, dependent: t.i, relation: 'conjunction', confidence: 0.5 });
    } else if (c.pos === 'pronoun' && (c.features.pronoun_type === 'interrogative/relative' || c.features.pronoun_type === 'relative')) {
      add({ head: root >= 0 ? root : null, dependent: t.i, relation: 'relative-clause', explanation: 'relative pronoun: begins a relative clause', confidence: 0.5 });
    } else if (c.pos === 'particle') {
      add({ head: t.i > 0 ? t.i - 1 : null, dependent: t.i, relation: 'modifier', confidence: 0.4 });
    } else if (c.features.case === 'voc') {
      add({ head: root >= 0 ? root : null, dependent: t.i, relation: 'vocative', confidence: 0.6 });
    }
  }
  return deps;
}
