import { ALWAYS_HARD, ALWAYS_SOFT, CONSONANTS, HARD_SOFT_CONSONANTS, PRE_REFORM, SIGNS, STRESS_MARK, symbolInfo, VOWELS, type Rule, type SymbolInfo } from './inventory';

/**
 * The eleven-stage curriculum (PLAN.md §C). Stages 1–6 introduce all 33
 * modern letters, each exactly once. Stages 7–9 are RULE stages: their
 * `symbols` are the (already-introduced) letters a rule affects, and they
 * carry worked `rules`. Stage 10 covers italic/cursive reading. Stage 11 is
 * the pre-reform letters, recognition only.
 */
export interface Stage {
  id: string;
  title: string;
  subtitle: string;
  symbols: SymbolInfo[];
  intro: string;
  rules?: Rule[];
}

const byLetters = (letters: string): SymbolInfo[] =>
  Array.from(letters)
    .map((c) => symbolInfo(c))
    .filter((s): s is SymbolInfo => !!s);

const R = (title: string, text: string, examples: Rule['examples']): Rule => ({ title, text, examples });

export const STAGES: Stage[] = [
  {
    id: 'latin-lookalikes',
    title: 'Letters that look (and sound) familiar',
    subtitle: 'А К М О Т',
    symbols: byLetters('АКМОТ'),
    intro: 'Five letters that look like Latin ones and sound close to what you would guess: А a, К k, М m, О o, Т t. Start here — you can already sound out a few short words.',
  },
  {
    id: 'false-friends',
    title: 'False friends',
    subtitle: 'В Н Р С У Х Е — familiar shapes, different sounds',
    symbols: byLetters('ВНРСУХЕ'),
    intro: 'These look like Latin letters but say something else: В looks like B but says V; Н looks like H but says N; Р looks like P but says R; С looks like C but says S; У looks like Y but says U; Х looks like X but says "kh"; Е looks like E but says "ye". Learn them as false friends on purpose — the resemblance is what trips people up.',
  },
  {
    id: 'new-shapes',
    title: 'New shapes',
    subtitle: 'Б Г Д З И Й Л П Ф Э',
    symbols: byLetters('БГДЗИЙЛПФЭ'),
    intro: 'Ten letters with no Latin look-alike to lean on — new shapes for new sounds. И is easy to read as a mirrored N; Й is и with a short curved mark (a breve) on top and is always a consonant, the "y" sound.',
  },
  {
    id: 'iotated',
    title: 'Iotated vowels',
    subtitle: 'Ё Ю Я (and Е, already met)',
    symbols: byLetters('ЁЮЯ'),
    intro: 'Е, Ё, Ю and Я are the iotated vowels: at the start of a word, after a vowel, or after ъ/ь they carry a "y" glide (ель = "yel", моя = "moya"); after a consonant they instead soften that consonant and are pronounced without the glide (мял ≈ "myal" said as one soft syllable, not "m-yal"). Ё is always stressed.',
  },
  {
    id: 'hushers',
    title: 'Hushers and affricates',
    subtitle: 'Ж Ч Ш Щ Ц',
    symbols: byLetters('ЖЧШЩЦ'),
    intro: 'Ж and Ш are always hard (even written before и or е); Ч and Щ are always soft; Ц is always hard. Their sounds have no single-letter English equivalent — listen to real words as you meet them.',
  },
  {
    id: 'signs-and-y',
    title: 'Signs and ы',
    subtitle: 'Ь Ъ Ы',
    symbols: byLetters('ЬЪЫ'),
    intro: 'Ь (soft sign) and Ъ (hard sign) are not sounds — they change how the letters around them are read. Ы is a real vowel with no English equivalent; it never starts a native word. This completes all 33 modern letters.',
  },
  {
    id: 'stress-reduction',
    title: 'Stress and vowel reduction',
    subtitle: 'аканье and иканье',
    symbols: byLetters('ОАЕЯ'),
    intro: 'Russian has one stressed syllable per word, and unstressed vowels weaken. о and а merge toward a schwa-like sound away from the stress (аканье); е and я weaken toward [ɪ] (иканье). This is why "хорошо" sounds like "kharasho", not "khorosho".',
    rules: [
      R(
        'аканье: unstressed о and а',
        'The vowel immediately before the stress reduces to [ɐ] (a short, open "uh"); everywhere else unstressed it reduces further to [ə] (a neutral schwa). Only the STRESSED о or а keeps its full [o]/[a] quality.',
        [
          { word: 'молоко', stressIndex: 5, translit: 'malako', ipa: '[məlɐˈko]' },
          { word: 'хорошо', stressIndex: 5, translit: 'kharasho', ipa: '[xərɐˈʂo]' },
        ],
      ),
      R(
        'иканье: unstressed е and я',
        'Unstressed е and я weaken toward [ɪ] (close to a short "i"), and still carry their [j] glide in iotating position.',
        [{ word: 'его', stressIndex: 2, translit: 'yevo', ipa: '[jɪˈvo]' }],
      ),
    ],
  },
  {
    id: 'hard-soft',
    title: 'Hard and soft consonants',
    subtitle: 'palatalisation',
    symbols: HARD_SOFT_CONSONANTS,
    intro: 'Fifteen consonants (б в г д з к л м н п р с т ф х) come in hard and soft versions of the same letter: the letter itself does not change — а following ь, or a following е ё и ю я, makes it soft (the tongue raised toward the palate). Ж Ш Ц are always hard; Ч Щ Й are always soft, whatever follows.',
    rules: [
      R(
        'Palatalisation',
        'A paired consonant is soft when followed by ь, or by one of е ё и ю я; it is hard when followed by а о у ы э, by another consonant, or at the end of a word. Compare мат (hard т) and мать (soft ть).',
        [
          { word: 'мать', stressIndex: 1, translit: 'mat', ipa: '[matʲ]' },
          { word: 'учиться', stressIndex: 2, translit: 'uchitsa', ipa: '[utɕitsə]' },
        ],
      ),
    ],
  },
  {
    id: 'voicing',
    title: 'Voicing: devoicing and assimilation',
    subtitle: 'final devoicing, -ого = -ово, что, -ться',
    symbols: [...byLetters('БПВФГКДТЖШЗС'), ...ALWAYS_HARD.filter((s) => s.symbol === 'Ц'), ...ALWAYS_SOFT.filter((s) => s.symbol === 'Ч')],
    intro: 'Six pairs of consonants (б/п, в/ф, г/к, д/т, ж/ш, з/с) differ only in voicing. A voiced obstruent at the end of a word, or before a voiceless one, devoices; a voiceless one before a voiced one (except в) voices. A handful of grammatical endings and whole words are further fixed exceptions.',
    rules: [
      R(
        'Final devoicing',
        'A voiced consonant at the very end of a word is pronounced voiceless: сад ("garden") is said [sat], the same as сат would be.',
        [{ word: 'сад', stressIndex: 1, translit: 'sat', ipa: '[sat]' }],
      ),
      R(
        'Regressive assimilation',
        'Inside a consonant cluster, an obstruent takes the voicing of the one after it (в does not force voicing onto what precedes it, though в itself can be devoiced).',
        [{ word: 'вход', stressIndex: 2, translit: 'fkhot', ipa: '[fxot]' }],
      ),
      R(
        '-ого / -его → [-əvə]',
        'In the genitive singular ending of adjectives and pronouns spelled -ого or -его, the г is pronounced в, not г.',
        [{ word: 'его', stressIndex: 2, translit: 'yevo', ipa: '[jɪvo]' }],
      ),
      R(
        'что and -ться',
        'что (and чтобы, ничто…) pronounces ч as ш: [ʂto], not [tɕto]. The reflexive endings -ться and -тся are pronounced as one cluster, [tsə].',
        [
          { word: 'что', stressIndex: -1, translit: 'shto', ipa: '[ʂto]' },
          { word: 'учиться', stressIndex: 2, translit: 'uchitsa', ipa: '[utɕitsə]' },
        ],
      ),
    ],
  },
  {
    id: 'cursive',
    title: 'Italic and cursive forms',
    subtitle: 'т д г и п б в з л м — reading the novels’ italics',
    symbols: byLetters('ТДГИПБВЗЛМ'),
    intro: 'Dostoevsky and Tolstoy set emphasis in italics, and italic Cyrillic changes shape more than italic Latin does: т grows a bar and looks like a Latin cursive m; д drops a loop below the line, close to a cursive g (or ∂); г becomes a small raised hook, ᴦ; и becomes a rounded u-like shape; п loses its crossbar and looks like a cursive n. Б, В, З, Л, М keep closer to their upright shapes but gain small connecting loops. The glyph is the same letter — PT Serif’s italic face draws it this way; only the drawing changes, not the alphabet.',
  },
  {
    id: 'pre-reform',
    title: 'Pre-reform letters',
    subtitle: 'ѣ і ѳ ѵ — recognition only',
    symbols: [...PRE_REFORM, STRESS_MARK],
    intro: 'Spelling before the 1918 reform used four extra letters, each folded to a modern one by the tokenizer for lookup: ѣ (yat) sounds like е, і (i desyatirichnoye) like и, ѳ (fita) like ф, and ѵ (izhitsa) like и. Pre-reform texts also wrote a silent ъ after every word ending in a hard consonant. You only need to recognise these, not produce them — old book titles, epigraphs and Wikisource’s Azbuka-era scans use them.',
  },
];

export const STAGE_BY_ID: Map<string, Stage> = new Map(STAGES.map((s) => [s.id, s]));

/** Which stage introduces a symbol (stages 1–6 only; later stages reuse letters already introduced). */
export function stageOf(symbol: string): Stage | undefined {
  const info = symbolInfo(symbol);
  if (!info) return undefined;
  return STAGES.slice(0, 6).find((s) => s.symbols.some((x) => x.symbol === info.symbol)) ?? STAGES.find((s) => s.symbols.some((x) => x.symbol === info.symbol));
}

/** Level → letters assumed known (mirrors database/settings.ts ScriptLevel). */
export function symbolsForLevel(level: 'none' | 'some' | 'sound-out' | 'slow' | 'comfortable'): string[] {
  const upTo = (ids: string[]) => STAGES.filter((s) => ids.includes(s.id)).flatMap((s) => s.symbols.map((x) => x.symbol));
  switch (level) {
    case 'none':
      return [];
    case 'some':
      return upTo(['latin-lookalikes']);
    case 'sound-out':
      return upTo(['latin-lookalikes', 'false-friends', 'new-shapes', 'iotated', 'hushers', 'signs-and-y']);
    case 'slow':
      return upTo(STAGES.map((s) => s.id).filter((id) => id !== 'cursive' && id !== 'pre-reform'));
    case 'comfortable':
      return upTo(STAGES.map((s) => s.id));
  }
}

export { VOWELS, CONSONANTS, SIGNS };
