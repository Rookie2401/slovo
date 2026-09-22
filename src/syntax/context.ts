/**
 * Context pass: rerank a token's candidates using its neighbours. Every
 * decision is recorded as a plain-English note on the token, and a token a
 * rule has `decided` is never touched again by a later rule (see
 * syntax/index.ts, which runs this before the constructions).
 */
import type { Case } from '../database/types';
import { prepositionEntry } from '../lexicon/closed-class';
import type { Candidate } from '../morphology/candidate';
import { caseName } from '../morphology/describe';
import { chosen, type AnalyzedToken } from '../morphology/sentence';

function nextWordToken(tokens: AnalyzedToken[], i: number): AnalyzedToken | undefined {
  for (let j = i + 1; j < tokens.length; j++) if (tokens[j]!.kind === 'word') return tokens[j];
  return undefined;
}
function prevWordToken(tokens: AnalyzedToken[], i: number): AnalyzedToken | undefined {
  for (let j = i - 1; j >= 0; j--) if (tokens[j]!.kind === 'word') return tokens[j];
  return undefined;
}
function isModifyingPronoun(c: Candidate): boolean {
  return c.pos === 'pronoun' && (c.features.pronoun_type === 'possessive' || c.features.pronoun_type === 'demonstrative' || c.features.pronoun_type === 'determinative');
}
function isStandalonePronoun(c: Candidate): boolean {
  return c.pos === 'pronoun' && !isModifyingPronoun(c);
}

/**
 * The head noun of a PP or a modifier chain: the next word, skipping
 * adjectives/numerals/adverbs and MODIFYING pronouns (possessive/
 * demonstrative: свой, этот, который…) in between (в чрезвычайно жаркое
 * время; из своей каморки). A standalone pronoun (он, кто, никто…) is
 * itself the head, not skipped (к нему).
 */
function headNounAfter(tokens: AnalyzedToken[], i: number): AnalyzedToken | undefined {
  for (let j = i + 1; j < tokens.length && j <= i + 5; j++) {
    const t = tokens[j]!;
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c) return undefined;
    if (c.pos === 'noun' || c.pos === 'proper') {
      // a noun/adjective homograph (dictionary dumps sometimes rank a substantivised form
      // like жаркое "a roast" above the adjective жаркий) is read as the modifier, not the
      // head, when a later noun is available for it to agree with instead.
      const laterNoun = tokens.slice(j + 1, j + 4).find((w) => w.kind === 'word' && ['noun', 'proper'].includes(chosen(w)?.pos ?? ''));
      if (laterNoun && t.candidates.some((x) => x.pos === 'adjective')) continue;
      return t;
    }
    if (isStandalonePronoun(c)) return t;
    if (c.pos === 'adverb') {
      // an adverb/noun homograph (дома "at home" vs дома, gen. sg of дом) at the end of the
      // phrase is still worth reconsidering as the head — a following preposition governs it
      // exactly like an ordinary noun once one of its candidates has a matching case.
      if (t.candidates.some((x) => x.pos === 'noun' || x.pos === 'proper')) return t;
      continue;
    }
    if (c.pos === 'adjective' || c.pos === 'numeral' || isModifyingPronoun(c)) continue;
    return undefined;
  }
  return undefined;
}

function safeChosen(t: AnalyzedToken | undefined): Candidate | undefined {
  return t ? chosen(t) : undefined;
}

function promote(t: AnalyzedToken, pred: (c: Candidate) => boolean, note?: string): boolean {
  const idx = t.candidates.findIndex(pred);
  if (idx < 0) return false;
  t.chosen = idx;
  t.decided = true;
  if (note) t.notes.push(note);
  return true;
}

/** Nouns whose "point in time" sense takes в/на + accusative rather than the usual prepositional. */
const TIME_NOUNS = new Set(['время', 'час', 'минута', 'секунда', 'день', 'неделя', 'вечер', 'утро', 'ночь', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье', 'понедельник', 'вторник']);

function isMotionVerb(c: Candidate | undefined): boolean {
  return !!c && c.pos === 'verb' && !!c.features.motion;
}

/** Lower-cased norm, so a rule keyed on a specific word still fires when that word is capitalised (sentence-initial). */
function nl(t: AnalyzedToken): string {
  return t.norm.toLowerCase();
}

/** под/за/через/про also take в/на's "point in time" accusative for a time noun (под вечер, за час, через час). */
const TIME_ACC_PREPS = new Set(['в', 'во', 'на', 'под', 'за', 'через', 'про']);

/** Common verbs that govern the genitive/dative/instrumental for their object instead of the default accusative. */
const GEN_VERBS = new Set(['избегать', 'избегнуть', 'бояться', 'достигать', 'лишиться', 'ждать', 'искать', 'хотеть', 'требовать']);
const DAT_VERBS = new Set(['помогать', 'мешать', 'верить', 'радоваться']);
const INST_VERBS = new Set(['управлять', 'владеть', 'пользоваться', 'заниматься', 'интересоваться', 'гордиться']);

export function applyContext(tokens: AnalyzedToken[]): void {
  // ---- 1. prepositions govern the following noun phrase's case. A noun immediately governed
  // by a preposition can NEVER be nominative — so once a case is picked for the preposition,
  // the head noun's own reading is restricted to the cases that preposition can govern (never
  // nominative), trying the chosen sense first and falling back to any other sense it lists.
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'preposition') continue;
    const entry = prepositionEntry(t.key);
    if (!entry) continue;
    const head = headNounAfter(tokens, t.i);
    let wantCase: Case | undefined;
    let reason = '';
    if (entry.senses.length === 1) {
      wantCase = entry.senses[0]!.case;
    } else if (TIME_ACC_PREPS.has(nl(t)) && head && TIME_NOUNS.has(chosen(head)!.lemma)) {
      wantCase = 'acc';
      reason = `${t.text} + accusative: a point in time (${t.text} ${head.text})`;
    } else if ((nl(t) === 'в' || nl(t) === 'во' || nl(t) === 'на') && (isMotionVerb(safeChosen(prevWordToken(tokens, t.i))) || isMotionVerb(safeChosen(nextWordToken(tokens, headNounAfter(tokens, t.i)?.i ?? t.i))))) {
      wantCase = 'acc';
      reason = `${t.text} + accusative: motion into/onto (destination of the nearby motion verb)`;
    } else {
      // default to the first-listed (most common) sense, already the top-ranked candidate
      wantCase = entry.senses[0]!.case;
    }
    if (!promote(t, (x) => x.pos === 'preposition' && x.features.case === wantCase)) continue;
    if (reason) t.notes.push(reason);
    if (head && !head.decided) {
      const headC = chosen(head);
      const governedCases = [wantCase, ...entry.senses.map((s) => s.case).filter((cs) => cs !== wantCase)];
      let idx = -1;
      let usedCase: Case | undefined;
      for (const cs of governedCases) {
        // no lemma filter: headC may itself be a non-noun homograph (дома the adverb "at
        // home"), so any noun/proper/pronoun candidate of this SAME TOKEN with the governed
        // case is a legitimate alternative reading, whatever lemma it belongs to.
        idx = head.candidates.findIndex((x) => (x.pos === 'noun' || x.pos === 'proper' || x.pos === 'pronoun') && x.features.case === cs);
        if (idx >= 0) {
          usedCase = cs;
          break;
        }
      }
      // last resort: none of the preposition's listed senses matched a reading (a defective
      // guess, most likely), but nominative is still never valid here — take any non-nominative
      // reading of the same lemma rather than leave an impossible nom-after-preposition.
      if (idx < 0 && headC?.features.case === 'nom') {
        idx = head.candidates.findIndex((x) => (x.pos === 'noun' || x.pos === 'proper' || x.pos === 'pronoun') && x.lemma === headC.lemma && x.features.case !== 'nom');
        usedCase = idx >= 0 ? head.candidates[idx]!.features.case : undefined;
      }
      if (idx >= 0) {
        head.chosen = idx;
        head.decided = true;
        head.notes.push(`${caseName(usedCase)}: governed by the preposition ${t.text}${reason ? ' — ' + reason : ''}`);
        // the preposition's OWN displayed case must follow its resolved object: за + ногу
        // (idiomatic accusative "by/at") should show за as accusative, not its default sense.
        if (usedCase && usedCase !== wantCase) {
          const pIdx = t.candidates.findIndex((x) => x.pos === 'preposition' && x.features.case === usedCase);
          if (pIdx >= 0) t.chosen = pIdx;
        }
      }
    }
  }

  // ---- 2. adjective, or a possessive/demonstrative pronoun (свой, этот…), agrees with the
  // noun it modifies — picking the reading whose case/gender/number matches the head noun,
  // which is what actually disambiguates a form like своей (gen/dat/prep all spelled alike).
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || t.decided) continue;
    // gate on the TOP candidate's class, or on merely HAVING an adjective/modifying-pronoun
    // candidate: a noun/adjective homograph (жаркое) is only worth reconsidering here when a
    // later noun gives it something to agree with, which headNounAfter has already checked
    // by skipping past it — so if it comes back as `t` itself never happens (loop starts after).
    const canModify = c.pos === 'adjective' || isModifyingPronoun(c) || t.candidates.some((x) => x.pos === 'adjective' || isModifyingPronoun(x));
    if (!canModify) continue;
    const head = headNounAfter(tokens, t.i - 1) ?? headNounAfter(tokens, t.i);
    if (!head || head.i === t.i) continue;
    const hc = chosen(head);
    if (!hc || (hc.pos !== 'noun' && hc.pos !== 'proper' && hc.pos !== 'pronoun')) continue;
    const idx = t.candidates.findIndex((x) => (x.pos === 'adjective' || isModifyingPronoun(x)) && x.features.case === hc.features.case && (x.features.number === 'pl' ? hc.features.number === 'pl' : x.features.gender === hc.features.gender && hc.features.number !== 'pl'));
    if (idx >= 0) {
      t.chosen = idx;
      t.decided = true;
      t.notes.push(`agrees with ${head.text} (${caseName(hc.features.case)}${hc.features.number === 'pl' ? ' plural' : hc.features.gender ? ' ' + hc.features.gender : ''})`);
    }
  }

  // ---- 2c. backward agreement: an adjective immediately before a word that has a matching
  // noun reading settles that word's reading (высокого пятиэтажного дома: дома is a noun/
  // particle homograph — the unambiguous genitive adjectives right before it settle it). Runs
  // per-adjective rather than tracking whole chains: each adjective in a run already carries
  // its own correct case/gender/number from the dictionary, so checking the word immediately
  // after each one (including another adjective, harmlessly a no-op) covers the whole chain.
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'adjective') continue;
    const next = nextWordToken(tokens, t.i);
    if (!next || next.decided) continue;
    const idx = next.candidates.findIndex((x) => (x.pos === 'noun' || x.pos === 'proper') && x.features.case === c.features.case && (c.features.number === 'pl' ? x.features.number === 'pl' : x.features.gender === c.features.gender && x.features.number !== 'pl'));
    if (idx >= 0) {
      next.chosen = idx;
      next.decided = true;
      next.notes.push(`${caseName(c.features.case)}: agrees with the preceding adjective ${t.text}`);
    }
  }

  // ---- 3. всё (with ё) is neuter singular "everything"; все (no ё) is plural "everyone" —
  // looseKey folds ё, so the two forms share a dictionary key and must be told apart by the
  // printed surface, which still carries the ё.
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const normLower = t.norm.toLowerCase();
    if (normLower !== 'все' && normLower !== 'всё') continue;
    const wantsNeuter = t.text.toLowerCase().includes('ё');
    promote(
      t,
      (x) => x.lemma === 'весь' && (wantsNeuter ? x.features.gender === 'n' : x.features.number === 'pl'),
      wantsNeuter ? 'всё (with ё): neuter singular — "everything / all of it"' : 'все (no ё): plural — "everyone / all of them"',
    );
  }

  // ---- 4. что: conjunction "that" after a verb of speech/thought + comma, else the pronoun
  for (const t of tokens) {
    if (t.kind !== 'word' || nl(t) !== 'что') continue;
    const prevPunct = tokens[t.i - 1];
    const beforeThat = prevPunct && prevPunct.kind === 'punct' && prevPunct.text === ',' ? prevWordToken(tokens, prevPunct.i) : undefined;
    const beforeC = beforeThat ? chosen(beforeThat) : undefined;
    if (beforeC && beforeC.pos === 'verb') {
      promote(t, (x) => x.pos === 'conjunction', `conjunction "that": follows the verb ${beforeThat!.text} introducing a reported clause`);
    } else {
      promote(t, (x) => x.pos === 'pronoun');
    }
  }

  // ---- 4b. чем: the comparative conjunction "than" after a comparative — either the synthetic
  // -ее/-ей form right before it, or the analytic более/менее earlier in the same clause
  // (более похожа на шкаф, чем на квартиру) — otherwise the instrumental of что.
  for (const t of tokens) {
    if (t.kind !== 'word' || nl(t) !== 'чем') continue;
    const nearby = tokens.slice(Math.max(0, t.i - 6), t.i);
    const hasComparative = nearby.some((x) => x.kind === 'word' && (chosen(x)?.features.degree === 'comparative' || nl(x) === 'более' || nl(x) === 'менее'));
    if (hasComparative) {
      promote(t, (x) => x.pos === 'conjunction', 'comparative conjunction "than": follows a comparative (более/менее, or an -ее/-ей form)');
    }
  }

  // ---- 5. negation + genitive: a negated verb's direct object often stands in the genitive
  for (const t of tokens) {
    if (t.kind !== 'word' || nl(t) !== 'не') continue;
    const verb = nextWordToken(tokens, t.i);
    if (!verb || chosen(verb)?.pos !== 'verb') continue;
    const obj = nextWordToken(tokens, verb.i);
    if (!obj || obj.decided) continue;
    const oc = chosen(obj);
    if (!oc || (oc.pos !== 'noun' && oc.pos !== 'pronoun')) continue;
    const gen = obj.candidates.findIndex((x) => x.lemma === oc.lemma && x.features.case === 'gen');
    if (gen >= 0) {
      obj.chosen = gen;
      obj.decided = true;
      obj.notes.push(`genitive because ${verb.text} is negated (не + verb often takes a genitive object instead of accusative)`);
    }
  }

  // ---- 5b. verb government: some common verbs govern a case other than the accusative for
  // their object (an object-of-preposition-shaped fact, but with no preposition in sight).
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'verb') continue;
    const govCase: Case | undefined = GEN_VERBS.has(c.lemma) ? 'gen' : DAT_VERBS.has(c.lemma) ? 'dat' : INST_VERBS.has(c.lemma) ? 'inst' : undefined;
    if (!govCase) continue;
    const obj = nextWordToken(tokens, t.i);
    if (!obj || obj.decided) continue;
    const oc = chosen(obj);
    if (!oc || (oc.pos !== 'noun' && oc.pos !== 'pronoun' && oc.pos !== 'proper')) continue;
    const idx = obj.candidates.findIndex((x) => x.lemma === oc.lemma && x.features.case === govCase);
    if (idx >= 0) {
      obj.chosen = idx;
      obj.decided = true;
      obj.notes.push(`${caseName(govCase)}: governed by the verb ${t.text} (${c.lemma} takes the ${caseName(govCase)}, not the accusative)`);
    }
  }

  // ---- 6. numerals govern the counted noun: 2-4 -> genitive singular, 5+ -> genitive plural
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'numeral') continue;
    const noun = nextWordToken(tokens, t.i);
    if (!noun || noun.decided) continue;
    const nc = chosen(noun);
    if (!nc || nc.pos !== 'noun') continue;
    const smallNumeral = ['два', 'три', 'четыре'].includes(c.lemma) && c.features.case !== 'gen';
    const wantNumber = smallNumeral ? 'sg' : 'pl';
    if (c.lemma === 'один') continue; // agrees like an adjective, does not force genitive
    const idx = noun.candidates.findIndex((x) => x.lemma === nc.lemma && x.features.case === 'gen' && x.features.number === wantNumber);
    if (idx >= 0) {
      noun.chosen = idx;
      noun.decided = true;
      noun.notes.push(`genitive ${wantNumber === 'pl' ? 'plural' : 'singular'}: governed by the numeral ${t.text} (${smallNumeral ? '2-4 take the genitive singular' : '5 and up take the genitive plural'})`);
    }
  }

  // ---- 7. a capitalised word with no real reading is probably a name: not sentence-initial,
  // or sentence-initial but with nothing else to go on either way. The governed case is
  // guessed from a preceding preposition or government verb, and the lemma is reconstructed
  // to a plausible nominative from that case's typical ending (Костылина, after ждать (+gen)
  // -> nominative guess Костылин) rather than left as the inflected surface.
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    if (!/^\p{Lu}/u.test(t.text)) continue;
    const c = chosen(t);
    if (c && c.pos === 'proper') continue;
    if (c && !c.key.startsWith('?') && c.confidence >= 0.6) continue; // a real reading beats the capitalisation guess — sentence-initial capitals are eligible too, as long as nothing better was found
    const idx = t.candidates.findIndex((x) => x.pos === 'proper');
    if (idx >= 0) {
      t.chosen = idx;
      t.decided = true;
      continue;
    }

    const prevWord = prevWordToken(tokens, t.i);
    const prevC = prevWord ? chosen(prevWord) : undefined;
    let guessedCase: Case | undefined;
    if (prevC?.pos === 'preposition') guessedCase = prepositionEntry(prevWord!.key)?.senses[0]?.case;
    else if (prevC?.pos === 'verb') guessedCase = GEN_VERBS.has(prevC.lemma) ? 'gen' : DAT_VERBS.has(prevC.lemma) ? 'dat' : INST_VERBS.has(prevC.lemma) ? 'inst' : undefined;
    const lower = t.text.toLowerCase();
    // one or more (nominative, case) reconstructions, most likely first — a prepositional -е
    // ending is genuinely ambiguous between a feminine -а noun (Москве -> Москва) and a
    // masculine bare-stem noun (Петербурге -> Петербург), so both are offered.
    const reconstructions: Array<[string, Case]> = [[t.text, 'nom']];
    if (guessedCase === 'gen' && /[ая]$/.test(lower)) reconstructions.unshift([t.text.slice(0, -1), 'gen']);
    else if (guessedCase === 'dat' && /[ую]$/.test(lower)) reconstructions.unshift([t.text.slice(0, -1), 'dat']);
    else if (guessedCase === 'inst' && /ым$/.test(lower)) reconstructions.unshift([t.text.slice(0, -2), 'inst']);
    else if (guessedCase === 'prep' && /е$/.test(lower)) {
      reconstructions.unshift([t.text.slice(0, -1), 'prep']); // masculine bare-stem noun
      reconstructions.unshift([`${t.text.slice(0, -1)}а`, 'prep']); // feminine -а noun (tried first: Москве -> Москва)
    }

    for (const [nominative, resolvedCase] of reconstructions) {
      t.candidates.push({
        key: `proper:${nominative}`, lemma: nominative, pos: 'proper', gloss: 'a proper name (not in the dictionary)',
        features: { case: resolvedCase }, morphemes: [{ text: t.text, role: 'stem', gloss: 'unanalysed', start: 0, end: t.text.length }],
        notes: ['read as a name from capitalisation'], source: 'rule', confidence: 0.7,
      });
    }
    t.chosen = t.candidates.length - reconstructions.length;
    t.decided = true;
  }

  // ---- 8. nominative subject vs accusative object for a form where the two are spelled the
  // same (inanimate/neuter nouns): the noun before the nearest verb is read as the subject,
  // the one after as the object — an unmarked-order default, flagged as such.
  for (const t of tokens) {
    if (t.kind !== 'word' || t.decided) continue;
    const c = chosen(t);
    if (!c || (c.pos !== 'noun' && c.pos !== 'proper')) continue;
    const nomIdx = t.candidates.findIndex((x) => x.lemma === c.lemma && x.features.case === 'nom');
    const accIdx = t.candidates.findIndex((x) => x.lemma === c.lemma && x.features.case === 'acc');
    if (nomIdx < 0 || accIdx < 0 || nomIdx === accIdx) continue; // not a nom/acc-syncretic form
    const verb = tokens.slice(0, t.i).reverse().find((x) => x.kind === 'word' && chosen(x)?.pos === 'verb') ?? tokens.slice(t.i + 1).find((x) => x.kind === 'word' && chosen(x)?.pos === 'verb');
    const verbBefore = verb && verb.i < t.i;
    const animate = c.features.animacy === 'anim';
    if (verb === undefined) continue;
    if (!verbBefore) {
      t.chosen = nomIdx;
      t.notes.push(`nominative: ${t.text} comes before the verb ${verb.text} — read as the subject by word order${animate ? '' : ` (${t.text} is inanimate, so nominative and accusative look identical)`}`);
    } else {
      t.chosen = accIdx;
      t.notes.push(`accusative: ${t.text} comes after the verb ${verb.text} — read as the object by word order${animate ? '' : ` (${t.text} is inanimate, so nominative and accusative look identical)`}`);
    }
    t.decided = true;
    t.ambiguous = true;
  }
}
