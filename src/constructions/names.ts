/**
 * Names: a run of consecutive proper-name tokens resolving to the same
 * canonical person (given + patronymic + surname) is one construction; a
 * single name's register (diminutive/patronymic/full) was already noted on
 * the token by morphology/analyze.ts's names-index hook, so this module
 * mainly groups adjacent tokens and restates the register for the sentence
 * view.
 */
import type { AnalyzedToken, FoundConstruction } from '../morphology/sentence';
import { chosen } from '../morphology/sentence';

export function findNameConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind !== 'word') {
      i++;
      continue;
    }
    const c = chosen(t);
    if (!c || c.pos !== 'proper') {
      i++;
      continue;
    }
    const run = [t];
    let j = i + 1;
    while (j < tokens.length) {
      const w = tokens[j]!;
      if (w.kind === 'word' && chosen(w)?.pos === 'proper' && chosen(w)?.lemma === c.lemma) {
        run.push(w);
        j++;
        continue;
      }
      break;
    }
    const registers = run.map((x) => x.notes.find((n) => /register|patronymic|surname|diminutive|nickname/.test(n)) ?? '').filter(Boolean);
    out.push({
      type: 'name',
      pattern: `name:${c.lemma}`,
      label: run.map((x) => x.text).join(' '),
      gloss: c.lemma,
      explanation: run.length > 1
        ? `${run.map((x) => x.text).join(' ')} names ${c.lemma} in full — given name, patronymic and/or surname together: the most formal, respectful way to address or refer to someone.`
        : `${t.text} refers to ${c.lemma}.${registers.length ? ' ' + registers[0] : ''}`,
      tokens: run.map((x) => x.i),
      roles: Object.fromEntries(run.map((x, k) => [x.i, run.length > 1 ? (k === 0 ? 'given name' : k === run.length - 1 ? 'surname' : 'patronymic') : 'name'])),
      features: {},
      confidence: 0.9,
      source: 'syntax_engine',
      head: run[0]!.i,
    });
    i = j;
  }
  return out;
}
