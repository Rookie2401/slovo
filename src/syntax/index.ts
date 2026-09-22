import type { TokenKind } from '../database/types';
import { findAspectConstructions } from '../constructions/aspect';
import { findMotionConstructions } from '../constructions/motion';
import { findImpersonalConstructions } from '../constructions/impersonal';
import { findNameConstructions } from '../constructions/names';
import { findNegationConstructions } from '../constructions/negation';
import { findNumeralConstructions } from '../constructions/numeral';
import { findComparativeConstructions, findConditionalConstructions, findGerundClauses, findParticipleClauses, findPrepositionalPhrases, findPurposeConstructions } from '../constructions/phrases';
import { findReflexiveConstructions } from '../constructions/reflexive';
import { analyzeWord, ENGINE_RULES_VERSION } from '../morphology/analyze';
import type { AnalysisContext } from '../morphology/dictionary';
import type { AnalyzedToken, FoundConstruction, SentenceAnalysis } from '../morphology/sentence';
import { looseKey, normalize } from '../tokenizer/cyrillic';
import { analyzeClause, computeAgreement } from './clause';
import { applyContext } from './context';
import { buildDependencies } from './dependencies';

/** Mirrors the Hindi reader's SentenceInput plus the Russian-specific sourceStress carried from an accented source (Azbuka editions). */
export interface SentenceInput {
  text: string;
  kind: TokenKind;
  id?: number;
  sourceStress?: number;
}

const CLAUSE_BREAKERS = new Set(['что', 'чтобы', 'чтоб', 'если', 'когда', 'пока', 'хотя', 'как', 'чем', 'будто']);
const COORD = new Set(['и', 'а', 'но', 'или', 'да', 'либо']);
const RELATIVE = /^котор/;

/**
 * Full deterministic analysis of one sentence: word candidates → context
 * reranking → constructions → clause(s) → dependencies, mirroring the
 * Hindi reader's orchestration shape (analyze.ts → syntax/{context,clause,
 * dependencies}.ts → constructions/*), but with an injected `ctx` since
 * package B's dictionary runtime may not exist yet (see
 * morphology/dictionary.ts).
 */
export function analyzeSentence(input: SentenceInput[], ctx: AnalysisContext): SentenceAnalysis {
  const tokens: AnalyzedToken[] = input.map((t, i) => {
    const key = looseKey(t.text);
    return {
      i,
      text: t.text,
      norm: normalize(t.text),
      key,
      kind: t.kind,
      candidates: t.kind === 'word' ? analyzeWord(t.text, key, ctx) : [],
      chosen: 0,
      notes: [],
      tokenId: t.id,
      sourceStress: t.sourceStress,
    };
  });

  applyContext(tokens);

  const constructions: FoundConstruction[] = [
    ...findAspectConstructions(tokens),
    ...findMotionConstructions(tokens),
    ...findImpersonalConstructions(tokens),
    ...findReflexiveConstructions(tokens),
    ...findNegationConstructions(tokens),
    ...findNumeralConstructions(tokens),
    ...findPrepositionalPhrases(tokens),
    ...findParticipleClauses(tokens),
    ...findGerundClauses(tokens),
    ...findConditionalConstructions(tokens),
    ...findPurposeConstructions(tokens),
    ...findComparativeConstructions(tokens),
    ...findNameConstructions(tokens),
  ];

  const { ranges, startedByCoord } = splitClauses(tokens, constructions);
  const clauses = ranges.map((r) => ({ ...analyzeClause(tokens, constructions, r), range: r }));

  // Coordinated predicates sharing one subject (один молодой человек вышел … и отправился):
  // "и" splits them into separate clause windows so each predicate's own agreement is checked,
  // but a clause with no subject of its own that was cut off from the PREVIOUS one by "и"
  // (not by a relative/subordinating breaker) inherits that earlier clause's subject.
  for (let i = 1; i < clauses.length; i++) {
    if (!startedByCoord[i] || clauses[i]!.subject !== undefined || !clauses[i]!.verb) continue;
    for (let j = i - 1; j >= 0; j--) {
      const subj = clauses[j]!.subject;
      if (subj === undefined) continue;
      clauses[i]!.subject = subj;
      clauses[i]!.agreement = computeAgreement(tokens, subj, clauses[i]!.verb!.features, clauses[i]!.experiencer);
      clauses[i]!.notes = [...clauses[i]!.notes, `subject inherited from the earlier coordinated clause: ${tokens[subj]!.text} … и … — no new subject appears before this predicate.`];
      break;
    }
  }

  const clause = [...clauses].reverse().find((c) => c.verb) ?? clauses[clauses.length - 1] ?? analyzeClause(tokens, constructions);
  const dependencies = clauses.flatMap((c) => buildDependencies(tokens, constructions, c));

  // ambiguity flag: an undecided near-tie between candidates of a different lemma/pos
  for (const t of tokens) {
    if (t.decided) continue;
    const c = t.candidates[t.chosen];
    if (!c) continue;
    const rival = t.candidates.find((x, i) => i !== t.chosen && (x.lemma !== c.lemma || x.pos !== c.pos) && Math.abs(x.confidence - c.confidence) < 0.05);
    if (rival) t.ambiguous = true;
  }

  return { tokens, constructions, dependencies, clause, clauses, rulesVersion: ENGINE_RULES_VERSION };
}

/**
 * Split the sentence into clause windows: cuts fall at subordinating
 * conjunctions and relative который-forms (when both sides have a finite
 * verb), coordinating conjunctions joining two full clauses, and semicolons
 * / dashes used as clause joiners. Also reports, per resulting range,
 * whether it was opened by a COORDINATING cut ("и" and friends) rather than
 * a subordinating/relative one — analyzeSentence uses that to let a
 * same-subject coordinated predicate inherit its subject.
 */
function splitClauses(tokens: AnalyzedToken[], constructions: FoundConstruction[]): { ranges: Array<[number, number]>; startedByCoord: boolean[] } {
  const verbal = [...new Set(constructions.filter((c) => c.type === 'aspect').map((c) => c.head))];
  const cuts: number[] = [];
  const cutTypes = new Map<number, 'coord' | 'breaker'>();
  const cut = (i: number, type: 'coord' | 'breaker') => {
    if (i > 0 && i < tokens.length && !cuts.includes(i)) {
      cuts.push(i);
      cutTypes.set(i, type);
    }
  };
  for (const t of tokens) {
    if (t.i === 0) continue;
    if (t.kind === 'punct') {
      if ((t.text === ';' || t.text === '—' || t.text === '–') && verbal.some((i) => i < t.i) && verbal.some((i) => i > t.i)) cut(t.i, 'breaker');
      continue;
    }
    if (t.kind !== 'word') continue;
    const c = t.candidates[t.chosen];
    if (!c) continue;
    const lower = t.norm.toLowerCase();
    const isBreaker = CLAUSE_BREAKERS.has(lower) || RELATIVE.test(lower);
    const isCoord = COORD.has(lower) && c.pos === 'conjunction';
    if (!isBreaker && !isCoord) continue;
    const from = cuts.length ? Math.max(...cuts) : 0;
    const leftVerbal = verbal.some((i) => i < t.i && i >= from);
    const rightVerbal = verbal.some((i) => i > t.i);
    if (isBreaker && (leftVerbal || cuts.length === 0) && rightVerbal) cut(t.i, 'breaker');
    else if (isCoord && leftVerbal && rightVerbal) cut(t.i, 'coord');
  }
  cuts.sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  const startedByCoord: boolean[] = [];
  let start = 0;
  let pendingType: 'coord' | 'breaker' | undefined;
  for (const c of cuts) {
    if (c > start) {
      ranges.push([start, c]);
      startedByCoord.push(pendingType === 'coord');
    }
    start = c;
    pendingType = cutTypes.get(c);
  }
  ranges.push([start, tokens.length]);
  startedByCoord.push(pendingType === 'coord');
  const keep = ranges.map(([a, b]) => b > a);
  return { ranges: ranges.filter((_, k) => keep[k]), startedByCoord: startedByCoord.filter((_, k) => keep[k]) };
}

export { ENGINE_RULES_VERSION };
