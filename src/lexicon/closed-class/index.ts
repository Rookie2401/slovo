/**
 * Aggregates every closed-class table into one lookup, tried after the
 * dictionary and before rule generation (see morphology/analyze.ts).
 */
import type { Candidate } from '../../morphology/candidate';
import { conjunctionCandidates } from './conjunctions';
import { numeralCandidates } from './numerals';
import { particleCandidates } from './particles';
import { predicativeCandidates } from './predicatives';
import { prepositionCandidates } from './prepositions';
import { pronounCandidates } from './pronouns';
import { beCandidates } from './verbs';
import { gazetteerCandidates } from './names';

export { prepositionEntry, PREPOSITIONS } from './prepositions';
export { pronounCandidates, isPronounForm } from './pronouns';
export { numeralCandidates } from './numerals';
export { conjunctionCandidates } from './conjunctions';
export { particleCandidates } from './particles';
export { predicativeCandidates } from './predicatives';
export { beCandidates } from './verbs';
export { gazetteerCandidates } from './names';

export function closedClassCandidates(key: string, surface: string): Candidate[] {
  return [
    ...gazetteerCandidates(key),
    ...pronounCandidates(key),
    ...numeralCandidates(key),
    ...prepositionCandidates(key, surface),
    ...conjunctionCandidates(key),
    ...particleCandidates(key),
    ...predicativeCandidates(key),
    ...beCandidates(key),
  ];
}
