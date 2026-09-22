/**
 * Closed-class pronoun tables: personal (with the н- forms used after a
 * preposition), possessive, demonstrative, interrogative/relative,
 * reflexive себя/свой, negative and indefinite (-то/-нибудь/-либо/кое-).
 * Hand-written because these ~40 words carry most of a sentence's structure
 * and a dictionary form-index entry would be wasteful for a closed class.
 * Source: 'rule' (closed-class tables are deterministic, not dictionary hits).
 */
import type { Candidate } from '../../morphology/candidate';
import type { Morpheme } from '../../database/types';
import type { Case, Gender, MorphFeatures, Number_, Person } from '../../database/types';
import { caseTableEntries, hardAdjective, possessiveMoy, possessiveNash } from '../../morphology/paradigms';
import { looseKey } from '../../tokenizer/cyrillic';

const INDEX = new Map<string, Candidate[]>();

function whole(form: string): Morpheme[] {
  return [{ text: form, role: 'stem', gloss: 'whole word (closed class)', start: 0, end: form.length }];
}

function add(form: string, c: Omit<Candidate, 'morphemes' | 'source' | 'confidence' | 'notes'> & { notes?: string[] }) {
  const key = looseKey(form);
  const cand: Candidate = { ...c, morphemes: whole(form), source: 'rule', confidence: 1, notes: c.notes ?? [] };
  const list = INDEX.get(key) ?? [];
  list.push(cand);
  INDEX.set(key, list);
}

function personal(lemma: string, gloss: string, person: Person, forms: Partial<Record<Case, string | string[]>>, opts: { gender?: Gender; number: Number_ }) {
  for (const [case_, val] of Object.entries(forms) as Array<[Case, string | string[]]>) {
    for (const form of Array.isArray(val) ? val : [val]) {
      const features: MorphFeatures = { case: case_, number: opts.number, person, gender: opts.gender, pronoun_type: 'personal' };
      add(form, { key: `pronoun:${lemma}`, lemma, pos: 'pronoun', gloss, features, partner: undefined });
    }
  }
}

/** н- forms used after a preposition (него, ней, ним, них…): same cell, extra note. */
function personalAfterPrep(lemma: string, gloss: string, person: Person, forms: Partial<Record<Case, string | string[]>>, opts: { gender?: Gender; number: Number_ }) {
  for (const [case_, val] of Object.entries(forms) as Array<[Case, string | string[]]>) {
    for (const form of Array.isArray(val) ? val : [val]) {
      const features: MorphFeatures = { case: case_, number: opts.number, person, gender: opts.gender, pronoun_type: 'personal' };
      add(form, {
        key: `pronoun:${lemma}`, lemma, pos: 'pronoun', gloss, features,
        notes: ['the н- form used after a preposition (его/ему/им → него/нему/ним)'],
      });
    }
  }
}

// ---- personal pronouns -----------------------------------------------
personal('я', 'I', 1, { nom: 'я', gen: 'меня', dat: 'мне', acc: 'меня', inst: ['мной', 'мною'], prep: 'мне' }, { number: 'sg' });
personal('ты', 'you (familiar)', 2, { nom: 'ты', gen: 'тебя', dat: 'тебе', acc: 'тебя', inst: ['тобой', 'тобою'], prep: 'тебе' }, { number: 'sg' });
personal('он', 'he/it', 3, { nom: 'он', gen: 'его', dat: 'ему', acc: 'его', inst: 'им', prep: 'нём' }, { number: 'sg', gender: 'm' });
personalAfterPrep('он', 'he/it', 3, { gen: 'него', dat: 'нему', acc: 'него', inst: 'ним' }, { number: 'sg', gender: 'm' });
personal('она', 'she/it', 3, { nom: 'она', gen: 'её', dat: 'ей', acc: 'её', inst: ['ей', 'ею'], prep: 'ней' }, { number: 'sg', gender: 'f' });
personalAfterPrep('она', 'she/it', 3, { gen: 'неё', dat: 'ней', acc: 'неё', inst: ['ней', 'нею'] }, { number: 'sg', gender: 'f' });
personal('оно', 'it', 3, { nom: 'оно', gen: 'его', dat: 'ему', acc: 'его', inst: 'им', prep: 'нём' }, { number: 'sg', gender: 'n' });
personalAfterPrep('оно', 'it', 3, { gen: 'него', dat: 'нему', acc: 'него', inst: 'ним' }, { number: 'sg', gender: 'n' });
personal('мы', 'we', 1, { nom: 'мы', gen: 'нас', dat: 'нам', acc: 'нас', inst: 'нами', prep: 'нас' }, { number: 'pl' });
personal('вы', 'you (plural/polite)', 2, { nom: 'вы', gen: 'вас', dat: 'вам', acc: 'вас', inst: 'вами', prep: 'вас' }, { number: 'pl' });
personal('они', 'they', 3, { nom: 'они', gen: 'их', dat: 'им', acc: 'их', inst: 'ими', prep: 'них' }, { number: 'pl' });
personalAfterPrep('они', 'they', 3, { gen: 'них', dat: 'ним', acc: 'них', inst: 'ними' }, { number: 'pl' });

// reflexive личное себя: no nominative
personal('себя', 'oneself/myself/himself…', 3, { gen: 'себя', dat: 'себе', acc: 'себя', inst: ['собой', 'собою'], prep: 'себе' }, { number: 'sg' });

// ---- possessive pronouns -----------------------------------------------
function possessive(lemma: string, gloss: string, table: ReturnType<typeof possessiveMoy> | ReturnType<typeof possessiveNash>) {
  for (const [g, c, form] of caseTableEntries(table)) {
    const features: MorphFeatures = { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg', pronoun_type: 'possessive' };
    add(form, { key: `pronoun:${lemma}`, lemma, pos: 'pronoun', gloss, features });
  }
}
possessive('мой', 'my', possessiveMoy('мо'));
possessive('твой', 'your (familiar)', possessiveMoy('тво'));
possessive('свой', "one's own (agrees with the possessor, any person)", possessiveMoy('сво'));
possessive('наш', 'our', possessiveNash('наш'));
possessive('ваш', 'your (plural/polite)', possessiveNash('ваш'));
// его/её/их as possessives are invariable (the 3rd-person genitive frozen as a possessive)
add('его', { key: 'pronoun:его', lemma: 'его', pos: 'pronoun', gloss: 'his/its', features: { pronoun_type: 'possessive' }, notes: ['invariable possessive: the frozen genitive of он/оно, never declined'] });
add('её', { key: 'pronoun:её', lemma: 'её', pos: 'pronoun', gloss: 'her', features: { pronoun_type: 'possessive' }, notes: ['invariable possessive: the frozen genitive of она, never declined'] });
add('их', { key: 'pronoun:их', lemma: 'их', pos: 'pronoun', gloss: 'their', features: { pronoun_type: 'possessive' }, notes: ['invariable possessive: the frozen genitive of они, never declined'] });

// ---- demonstrative -----------------------------------------------
function demonstrative(lemma: string, gloss: string, table: ReturnType<typeof hardAdjective>, type: 'demonstrative' | 'relative' = 'demonstrative') {
  for (const [g, c, form] of caseTableEntries(table)) {
    const features: MorphFeatures = { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg', pronoun_type: type };
    add(form, { key: `pronoun:${lemma}`, lemma, pos: 'pronoun', gloss, features });
  }
}
// этот/тот/весь do not follow the hard-adjective vowel exactly (этот, тот, весь are irregular), so hand table:
const etotForms: Array<[string, Gender | 'pl', Case]> = [
  ['этот', 'm', 'nom'], ['этого', 'm', 'gen'], ['этому', 'm', 'dat'], ['этим', 'm', 'inst'], ['этом', 'm', 'prep'],
  ['эта', 'f', 'nom'], ['этой', 'f', 'gen'], ['этой', 'f', 'dat'], ['эту', 'f', 'acc'], ['этой', 'f', 'inst'], ['этой', 'f', 'prep'],
  ['это', 'n', 'nom'], ['этого', 'n', 'gen'], ['этому', 'n', 'dat'], ['это', 'n', 'acc'], ['этим', 'n', 'inst'], ['этом', 'n', 'prep'],
  ['эти', 'pl', 'nom'], ['этих', 'pl', 'gen'], ['этим', 'pl', 'dat'], ['эти', 'pl', 'acc'], ['этими', 'pl', 'inst'], ['этих', 'pl', 'prep'],
];
for (const [form, g, c] of etotForms) {
  const features: MorphFeatures = { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg', pronoun_type: 'demonstrative' };
  add(form, { key: 'pronoun:этот', lemma: 'этот', pos: 'pronoun', gloss: 'this', features });
}
const totForms: Array<[string, Gender | 'pl', Case]> = [
  ['тот', 'm', 'nom'], ['того', 'm', 'gen'], ['тому', 'm', 'dat'], ['тем', 'm', 'inst'], ['том', 'm', 'prep'],
  ['та', 'f', 'nom'], ['той', 'f', 'gen'], ['той', 'f', 'dat'], ['ту', 'f', 'acc'], ['той', 'f', 'inst'], ['той', 'f', 'prep'],
  ['то', 'n', 'nom'], ['того', 'n', 'gen'], ['тому', 'n', 'dat'], ['то', 'n', 'acc'], ['тем', 'n', 'inst'], ['том', 'n', 'prep'],
  ['те', 'pl', 'nom'], ['тех', 'pl', 'gen'], ['тем', 'pl', 'dat'], ['те', 'pl', 'acc'], ['теми', 'pl', 'inst'], ['тех', 'pl', 'prep'],
];
for (const [form, g, c] of totForms) {
  const features: MorphFeatures = { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg', pronoun_type: 'demonstrative' };
  add(form, { key: 'pronoun:тот', lemma: 'тот', pos: 'pronoun', gloss: 'that', features });
}
const vesForms: Array<[string, Gender | 'pl', Case]> = [
  ['весь', 'm', 'nom'], ['всего', 'm', 'gen'], ['всему', 'm', 'dat'], ['всем', 'm', 'inst'], ['всём', 'm', 'prep'],
  ['вся', 'f', 'nom'], ['всей', 'f', 'gen'], ['всей', 'f', 'dat'], ['всю', 'f', 'acc'], ['всей', 'f', 'inst'], ['всей', 'f', 'prep'],
  ['всё', 'n', 'nom'], ['всего', 'n', 'gen'], ['всему', 'n', 'dat'], ['всё', 'n', 'acc'], ['всем', 'n', 'inst'], ['всём', 'n', 'prep'],
  ['все', 'pl', 'nom'], ['всех', 'pl', 'gen'], ['всем', 'pl', 'dat'], ['все', 'pl', 'acc'], ['всеми', 'pl', 'inst'], ['всех', 'pl', 'prep'],
];
for (const [form, g, c] of vesForms) {
  const features: MorphFeatures = { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg', pronoun_type: 'determinative' };
  add(form, {
    key: 'pronoun:весь', lemma: 'весь', pos: 'pronoun', gloss: g === 'n' ? 'everything/all (of it)' : g === 'pl' ? 'everyone/all' : 'all/the whole',
    features,
    notes: form === 'всё' ? ['всё: neuter singular — "everything" / "all of it"'] : form === 'все' ? ['все: plural — "everyone" / "all (of them)"'] : [],
  });
}

// чей ("whose") has a e→ь stem alternation (чей but чьего, чья, чьё…) that no hardAdjective
// stem/ending split reproduces, so — like этот/тот/весь — it is hand-tabled.
const cheyForms: Array<[string, Gender | 'pl', Case]> = [
  ['чей', 'm', 'nom'], ['чьего', 'm', 'gen'], ['чьему', 'm', 'dat'], ['чьим', 'm', 'inst'], ['чьём', 'm', 'prep'],
  ['чья', 'f', 'nom'], ['чьей', 'f', 'gen'], ['чьей', 'f', 'dat'], ['чью', 'f', 'acc'], ['чьей', 'f', 'inst'], ['чьей', 'f', 'prep'],
  ['чьё', 'n', 'nom'], ['чьего', 'n', 'gen'], ['чьему', 'n', 'dat'], ['чьё', 'n', 'acc'], ['чьим', 'n', 'inst'], ['чьём', 'n', 'prep'],
  ['чьи', 'pl', 'nom'], ['чьих', 'pl', 'gen'], ['чьим', 'pl', 'dat'], ['чьи', 'pl', 'acc'], ['чьими', 'pl', 'inst'], ['чьих', 'pl', 'prep'],
];
for (const [form, g, c] of cheyForms) {
  const features: MorphFeatures = { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg', pronoun_type: 'demonstrative' };
  add(form, { key: 'pronoun:чей', lemma: 'чей', pos: 'pronoun', gloss: 'whose', features });
}

// сей/сия/сие ("this" — archaic/bookish, still common in 19th-century prose): irregular like
// этот, hand-tabled the same way.
const seyForms: Array<[string, Gender | 'pl', Case]> = [
  ['сей', 'm', 'nom'], ['сего', 'm', 'gen'], ['сему', 'm', 'dat'], ['сим', 'm', 'inst'], ['сём', 'm', 'prep'],
  ['сия', 'f', 'nom'], ['сей', 'f', 'gen'], ['сей', 'f', 'dat'], ['сию', 'f', 'acc'], ['сей', 'f', 'inst'], ['сей', 'f', 'prep'],
  ['сие', 'n', 'nom'], ['сего', 'n', 'gen'], ['сему', 'n', 'dat'], ['сие', 'n', 'acc'], ['сим', 'n', 'inst'], ['сём', 'n', 'prep'],
  ['сии', 'pl', 'nom'], ['сих', 'pl', 'gen'], ['сим', 'pl', 'dat'], ['сии', 'pl', 'acc'], ['сими', 'pl', 'inst'], ['сих', 'pl', 'prep'],
];
for (const [form, g, c] of seyForms) {
  const features: MorphFeatures = { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg', pronoun_type: 'demonstrative' };
  add(form, { key: 'pronoun:сей', lemma: 'сей', pos: 'pronoun', gloss: 'this (archaic/bookish)', features });
}

// оный ("that, the aforesaid" — archaic/legal): regular hard-adjective declension.
demonstrative('оный', 'that, the aforesaid (archaic/legal)', hardAdjective('он'));

// ---- interrogative / relative -----------------------------------------------
const KTO: Array<[string, Case]> = [['кто', 'nom'], ['кого', 'gen'], ['кому', 'dat'], ['кого', 'acc'], ['кем', 'inst'], ['ком', 'prep']];
for (const [form, c] of KTO) add(form, { key: 'pronoun:кто', lemma: 'кто', pos: 'pronoun', gloss: 'who', features: { case: c, number: 'sg', person: 3, pronoun_type: 'interrogative/relative' } });
const CHTO: Array<[string, Case]> = [['что', 'nom'], ['чего', 'gen'], ['чему', 'dat'], ['что', 'acc'], ['чем', 'inst'], ['чём', 'prep']];
for (const [form, c] of CHTO) add(form, { key: 'pronoun:что', lemma: 'что', pos: 'pronoun', gloss: 'what/which/that', features: { case: c, number: 'sg', pronoun_type: 'interrogative/relative' } });

demonstrative('какой', 'what kind of / which', hardAdjective('как', { stressedNom: true, velar: true }));
// который is the relative pronoun ("which/who…"), not demonstrative: it stands in for an
// already-established antecedent (каморки, которую…), so it is a STANDALONE pronoun for
// headNounAfter purposes, not a modifier skipped in favour of a following noun.
demonstrative('который', 'which/who (relative)', hardAdjective('котор'), 'relative');

// negative
const NIKTO: Array<[string, Case]> = [['никто', 'nom'], ['никого', 'gen'], ['никому', 'dat'], ['никого', 'acc'], ['никем', 'inst'], ['ником', 'prep']];
for (const [form, c] of NIKTO) add(form, { key: 'pronoun:никто', lemma: 'никто', pos: 'pronoun', gloss: 'nobody', features: { case: c, number: 'sg', pronoun_type: 'negative' }, notes: ['negative pronoun: needs не with the verb (никто не пришёл)'] });
const NICHTO: Array<[string, Case]> = [['ничто', 'nom'], ['ничего', 'gen'], ['ничему', 'dat'], ['ничто', 'acc'], ['ничем', 'inst'], ['ничём', 'prep']];
for (const [form, c] of NICHTO) add(form, { key: 'pronoun:ничто', lemma: 'ничто', pos: 'pronoun', gloss: 'nothing', features: { case: c, number: 'sg', pronoun_type: 'negative' }, notes: ['negative pronoun: needs не with the verb (ничего не видел)'] });

// ---- indefinite -то/-нибудь/-либо/кое- ---------------------------------------
// Built off the FULL paradigm of every pronoun (and a handful of adverbs) that forms
// indefinites productively: кто/что, какой/который/чей (declined, agree like adjectives —
// какое-то ощущение), сколько, and где/куда/откуда/когда/как/почему/зачем (invariable adverbs).
type IndefBase = Array<[string, MorphFeatures]>;
function flatBase(pairs: Array<[string, Case]>): IndefBase {
  return pairs.map(([form, c]) => [form, { case: c, number: 'sg' }]);
}
function tableBase(table: ReturnType<typeof hardAdjective>): IndefBase {
  const out: IndefBase = [];
  for (const [g, c, form] of caseTableEntries(table)) out.push([form, { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg' }]);
  return out;
}
function generateIndefinite(lemma: string, gloss: string, base: IndefBase, pos: 'pronoun' | 'adverb' = 'pronoun') {
  for (const suffix of ['то', 'нибудь', 'либо'] as const) {
    const nuance = suffix === 'то' ? 'a specific but unnamed one' : suffix === 'нибудь' ? 'any one at all (future, question, imperative)' : 'any one whatsoever (more formal than -нибудь)';
    for (const [form, feat] of base) {
      add(`${form}-${suffix}`, { key: `${pos}:${lemma}-${suffix}`, lemma: `${lemma}-${suffix}`, pos, gloss: `${gloss} (${nuance})`, features: { ...feat, pronoun_type: pos === 'pronoun' ? 'indefinite' : undefined } });
    }
  }
  for (const [form, feat] of base) {
    add(`кое-${form}`, { key: `${pos}:кое-${lemma}`, lemma: `кое-${lemma}`, pos, gloss: `${gloss} (known to the speaker, unnamed to the listener)`, features: { ...feat, pronoun_type: pos === 'pronoun' ? 'indefinite' : undefined } });
  }
}
generateIndefinite('кто', 'someone', flatBase(KTO));
generateIndefinite('что', 'something', flatBase(CHTO));
generateIndefinite('какой', 'some kind of', tableBase(hardAdjective('как', { stressedNom: true, velar: true })));
generateIndefinite('который', 'some (indefinite, which one)', tableBase(hardAdjective('котор')));
generateIndefinite('чей', "someone's (whose, indefinite)", cheyForms.map(([form, g, c]) => [form, { case: c, gender: g === 'pl' ? undefined : g, number: g === 'pl' ? 'pl' : 'sg' }]));
// сколько ("how many/much") is invariable in ordinary use
for (const suffix of ['то', 'нибудь'] as const) {
  add(`сколько-${suffix}`, { key: `pronoun:сколько-${suffix}`, lemma: `сколько-${suffix}`, pos: 'pronoun', gloss: 'some amount, how much/many (indefinite)', features: { pronoun_type: 'indefinite' } });
}
const INDEF_ADVERBS: Array<[string, string]> = [
  ['где', 'somewhere'], ['куда', '(to) somewhere'], ['откуда', 'from somewhere'],
  ['когда', 'sometime'], ['как', 'somehow'], ['почему', 'for some reason'], ['зачем', 'for some purpose'],
];
for (const [base, gloss] of INDEF_ADVERBS) generateIndefinite(base, gloss, [[base, {}]], 'adverb');

export function pronounCandidates(key: string): Candidate[] {
  return INDEX.get(key) ?? [];
}

export function isPronounForm(key: string): boolean {
  return INDEX.has(key);
}
