/**
 * Small declension generators shared by the closed-class tables
 * (pronouns/numerals) and the rule guesser. Pure string generation from a
 * stem — no lookups. Kept separate from the dictionary bridge because the
 * dictionary's own adjective paradigms come from the CSV dump (package B);
 * these are for words this package hand-declines (relative/demonstrative
 * pronouns, rule-generated participles and comparatives/superlatives).
 */
import type { Case, Gender, Number_ } from '../database/types';

export interface CaseTable {
  m: Partial<Record<Case, string>>;
  f: Partial<Record<Case, string>>;
  n: Partial<Record<Case, string>>;
  pl: Partial<Record<Case, string>>;
}

/**
 * Hard-stem adjective-type declension (any word that inflects like an
 * adjective: real adjectives, most participles, который/какой/чей-type
 * pronouns). `stressedNom` picks -ой over -ый for the m.sg.nom (какой,
 * молодой); `velar` applies the к/г/х-after-и spelling rule (ы→и) to every
 * cell it touches (жаркий, какой's plural какие); `animate` makes the m.sg
 * and pl accusative equal the genitive instead of the nominative.
 */
export function hardAdjective(stem: string, opts: { stressedNom?: boolean; velar?: boolean; animate?: boolean } = {}): CaseTable {
  const { stressedNom = false, velar = false, animate = false } = opts;
  const mNom = stressedNom ? `${stem}ой` : velar ? `${stem}ий` : `${stem}ый`;
  const yOrI = (ending: string) => (velar ? ending.replace(/ы/g, 'и') : ending);
  const m: CaseTable['m'] = {
    nom: mNom,
    gen: `${stem}ого`,
    dat: `${stem}ому`,
    inst: `${stem}${yOrI('ым')}`,
    prep: `${stem}ом`,
  };
  m.acc = animate ? m.gen : m.nom;
  const f: CaseTable['f'] = {
    nom: `${stem}ая`,
    gen: `${stem}ой`,
    dat: `${stem}ой`,
    acc: `${stem}ую`,
    inst: `${stem}ой`,
    prep: `${stem}ой`,
  };
  const n: CaseTable['n'] = {
    nom: `${stem}ое`,
    gen: m.gen,
    dat: m.dat,
    acc: `${stem}ое`,
    inst: m.inst,
    prep: m.prep,
  };
  const pl: CaseTable['pl'] = {
    nom: `${stem}${yOrI('ые')}`,
    gen: `${stem}${yOrI('ых')}`,
    dat: `${stem}${yOrI('ым')}`,
    inst: `${stem}${yOrI('ыми')}`,
    prep: `${stem}${yOrI('ых')}`,
  };
  pl.acc = animate ? pl.gen : pl.nom;
  return { m, f, n, pl };
}

/**
 * мой/твой/свой-type possessive. `stem` is the full vowel-final stem
 * (мо-/тво-/сво-), so that m.nom is stem+"й" (мой), f.nom is stem+"я" (моя),
 * n.nom is stem+"ё" (моё) and every oblique form is stem+ending (моего,
 * моей, моих…).
 */
export function possessiveMoy(stem: string, animate = false): CaseTable {
  const m: CaseTable['m'] = { nom: `${stem}й`, gen: `${stem}его`, dat: `${stem}ему`, inst: `${stem}им`, prep: `${stem}ём` };
  m.acc = animate ? m.gen : m.nom;
  const f: CaseTable['f'] = { nom: `${stem}я`, gen: `${stem}ей`, dat: `${stem}ей`, acc: `${stem}ю`, inst: `${stem}ей`, prep: `${stem}ей` };
  const n: CaseTable['n'] = { nom: `${stem}ё`, gen: m.gen, dat: m.dat, acc: `${stem}ё`, inst: m.inst, prep: m.prep };
  const pl: CaseTable['pl'] = { nom: `${stem}и`, gen: `${stem}их`, dat: `${stem}им`, inst: `${stem}ими`, prep: `${stem}их` };
  pl.acc = animate ? pl.gen : pl.nom;
  return { m, f, n, pl };
}

/**
 * -ин/-ов/-ев possessive adjective (хозяйкин, мамин, папин, отцов…): "mixed"
 * declension — every oblique cell is the ordinary hard-adjective form
 * (хозяйкиного, хозяйкиной, хозяйкиным…), but the four nominative cells are
 * short, noun-like (bare stem for m.nom/m.acc-inanimate, stem+а for f.nom,
 * stem+о for n.nom/acc, stem+ы for pl.nom/acc-inanimate) rather than the
 * hard adjective's -ый/-ая/-ое/-ые.
 */
export function possessiveIn(stem: string, animate = false): CaseTable {
  const table = hardAdjective(stem, {});
  table.m.nom = stem;
  table.m.acc = animate ? table.m.gen : stem;
  table.f.nom = `${stem}а`;
  table.f.acc = `${stem}у`; // мамину, not the hard adjective's -ую (маминую)
  table.n.nom = `${stem}о`;
  table.n.acc = `${stem}о`;
  table.pl.nom = `${stem}ы`;
  table.pl.acc = animate ? table.pl.gen : `${stem}ы`;
  return table;
}

/** наш/ваш-type possessive: stem "наш"/"ваш". */
export function possessiveNash(stem: string, animate = false): CaseTable {
  const m: CaseTable['m'] = { nom: stem, gen: `${stem}его`, dat: `${stem}ему`, inst: `${stem}им`, prep: `${stem}ем` };
  m.acc = animate ? m.gen : m.nom;
  const f: CaseTable['f'] = { nom: `${stem}а`, gen: `${stem}ей`, dat: `${stem}ей`, acc: `${stem}у`, inst: `${stem}ей`, prep: `${stem}ей` };
  const n: CaseTable['n'] = { nom: `${stem}е`, gen: m.gen, dat: m.dat, acc: `${stem}е`, inst: m.inst, prep: m.prep };
  const pl: CaseTable['pl'] = { nom: `${stem}и`, gen: `${stem}их`, dat: `${stem}им`, inst: `${stem}ими`, prep: `${stem}их` };
  pl.acc = animate ? pl.gen : pl.nom;
  return { m, f, n, pl };
}

/** Flatten a CaseTable into [gender-or-'pl', case, form] triples for indexing. */
export function* caseTableEntries(t: CaseTable): Generator<[Gender | 'pl', Case, string]> {
  for (const g of ['m', 'f', 'n', 'pl'] as const) {
    const col = t[g];
    for (const c of Object.keys(col) as Case[]) {
      const form = col[c];
      if (form) yield [g === 'pl' ? 'pl' : (g as Gender), c, form];
    }
  }
}

export type { Number_ };
