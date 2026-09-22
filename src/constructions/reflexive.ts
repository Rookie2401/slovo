/**
 * -ся readings: reflexive proper (self-directed), reciprocal (друг друга),
 * passive (agent in the instrumental), impersonal, or a lexicalised
 * intransitive/"middle" verb where -ся no longer means literal reflexivity
 * (отправиться "to set off", нравиться "to please/be pleasing to"). A small
 * table covers the common lexicalised cases the reading ladder actually
 * uses; anything else gets the general explanation listing the possible
 * readings, which a learner can pick from using the sentence.
 */
import type { AnalyzedToken, FoundConstruction } from '../morphology/sentence';
import { chosen } from '../morphology/sentence';

const LEXICALISED: Record<string, string> = {
  отправиться: 'a "middle" use: the base verb отправить means "to dispatch/send off"; отправиться "to set off" is not literally "to send oneself" — treat it as its own verb meaning "to set out/head off".',
  отправляться: 'a "middle" use: not literally "to send oneself" — отправляться means "to set out/head off, be about to leave".',
  нравиться: 'a fixed impersonal-style verb: нравиться "to please/be pleasing to" — the person who likes something is the dative (мне нравится), not the subject.',
  казаться: 'a fixed use: казаться "to seem" — the -ся does not add reflexive meaning here.',
  бояться: 'a fixed use: бояться "to be afraid (of)" is inherently reflexive-marked; there is no non-ся *боять.',
  смеяться: 'a fixed use: смеяться "to laugh" is inherently reflexive-marked; there is no non-ся *смеять with the same meaning.',
  улыбаться: 'a fixed use: улыбаться "to smile" is inherently reflexive-marked.',
  учиться: 'a "middle" use: учиться "to study, be a student" — related to учить "to teach (someone)"; the -ся shifts the verb to something the subject does to/for themself.',
};

function findNearby(tokens: AnalyzedToken[], i: number, offsets: number[], pred: (t: AnalyzedToken) => boolean): AnalyzedToken | undefined {
  for (const o of offsets) {
    const t = tokens[i + o];
    if (t && t.kind === 'word' && pred(t)) return t;
  }
  return undefined;
}

export function findReflexiveConstructions(tokens: AnalyzedToken[]): FoundConstruction[] {
  const out: FoundConstruction[] = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const c = chosen(t);
    if (!c || c.pos !== 'verb' || !c.features.reflexive) continue;

    const special = LEXICALISED[c.lemma];
    // reciprocal marker "друг друга" right after the verb
    const reciprocal = findNearby(tokens, t.i, [1, 2], (x) => x.text.toLowerCase() === 'друга') && findNearby(tokens, t.i, [1], (x) => x.text.toLowerCase() === 'друг');
    // an instrumental agent nearby suggests a passive reading (строится рабочими)
    const instAgent = tokens.slice(t.i + 1, t.i + 4).find((x) => x.kind === 'word' && chosen(x)?.features.case === 'inst' && (chosen(x)?.pos === 'noun' || chosen(x)?.pos === 'proper'));

    let explanation: string;
    let pattern: string;
    if (special) {
      pattern = `reflexive:lexicalised:${c.lemma}`;
      explanation = `-ся on ${c.lemma}: ${special}`;
    } else if (reciprocal) {
      pattern = 'reflexive:reciprocal';
      explanation = `-ся + друг друга: a reciprocal reading — "(to) each other", not literally reflexive.`;
    } else if (instAgent) {
      pattern = 'reflexive:passive';
      explanation = `-ся with an instrumental agent (${instAgent.text}): a passive reading — "is/was …ed by ${instAgent.text}", the subject undergoes the action rather than performing it.`;
    } else if (c.features.tense === 'past' || c.features.verb_form === 'present-future') {
      pattern = 'reflexive:proper-or-intransitive';
      explanation = `-ся on ${c.lemma}: most often reflexive proper ("does X to oneself") or the plain intransitive/"middle" use of an otherwise transitive verb ("X happens", with no one doing it to anyone). Decide from the sentence: is there an object elsewhere, or does the subject act on itself?`;
    } else {
      pattern = 'reflexive:general';
      explanation = `-ся on ${c.lemma}: reflexive ("oneself"), reciprocal ("each other"), passive (with an agent in the instrumental), impersonal, or simply intransitive, depending on the sentence.`;
    }
    out.push({
      type: 'reflexive',
      pattern,
      label: `-ся: ${c.lemma}`,
      gloss: c.gloss,
      explanation,
      tokens: [t.i],
      roles: { [t.i]: 'reflexive verb' },
      features: { reflexive: true, aspect: c.features.aspect },
      confidence: special ? 0.85 : reciprocal || instAgent ? 0.8 : 0.55,
      source: 'syntax_engine',
      head: t.i,
      uncertain: special || reciprocal || instAgent ? undefined : 'the exact -ся reading is picked from a set of plausible ones; correct it if it is wrong',
    });
  }
  return out;
}
