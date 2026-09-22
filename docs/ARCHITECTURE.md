# Architecture

Слово reads Dostoevsky and Tolstoy in the original with a linguistic apparatus underneath.
The texts are public domain, so — unlike Sefer — the whole library ships with the app and the
dictionary can be cut to exactly the forms the library uses.

## Principles

1. The original text is authoritative. Tokens store `surface_original` and offsets into the
   paragraph; `surface_normalized` (NFC, stress marks removed) and `key` (lower case, ё→е,
   pre-reform letters folded) exist only for analysis and lookup. Stress marks printed in the
   source (Wikisource Azbuka editions) are kept and surfaced as `source_stress`.
2. Deterministic before statistical before generative. A word's readings come from the
   dictionary form index (exact hit, confidence 1, stress known), then closed-class tables
   (pronouns, numerals, prepositions), then rule generation from a known lexeme (participles,
   gerunds, comparatives, prefixed verbs — `rule`, ≤ 0.85), then ending-pattern guesses whose
   key starts with `?` and whose confidence is ≤ 0.55 — the UI says so and shows no stress.
   The language model can only phrase, translate and explain the deterministic result.
3. Every stored analysis carries `analysis_version`, `engine_version`, `analysis_source`,
   `confidence`, `review_status`, `created_at`. Regeneration marks old rows `superseded`.
   User corrections live in `user_corrections` and are re-applied on top of every version.
4. Reading first. Russian stays primary; stress marks, letter tints and transliteration are
   scaffolding that shrinks as the learner progresses; English is the last layer and off by default.

## Pipeline

```
build time
  data/corpus-manifest.json → scripts/fetch-corpus (lib.ru win-1251 / Wikisource) → data/ru/ (cache)
      → scripts/build-corpus → public/corpus/<slug>.json (+ .en.json via align-english, + .cast.json) + index.json
  data/dict/*.csv (OpenRussian) + ru_50k.txt → scripts/build-dictionary
      → public/dict/manifest.json, forms/<shard>.json (corpus forms only), lex/<shard>.json (paradigms)
      → scripts/coverage → src/data/coverage.json (quoted exactly in Settings / README)

runtime
  Home ladder → import/library.addLibraryWork(slug) → ImportedBook → import/store (Book → Chapter → Paragraph → Sentence → Token)
  reader opens a chapter
      → database/analysis.ensureChapterAnalysis
          → dictionary.preloadForms(chapter keys)          (form shards, cached)
          → syntax.analyzeSentence(tokens, ctx) per sentence
              1. morphology/analyze.analyzeWord   (dictionary → closed class → rule generation → guess)
              2. syntax/context.applyContext      (preposition → case, agreement, всё/все, names, decided flags)
              3. constructions/*                  (aspect, motion, impersonal, reflexive, negation, numerals, phrases, names)
              4. syntax/clause                    (predicate / subject / object / experiencer / possessor; agreement ⚠; word order)
              5. syntax/dependencies              (readable sketch)
          → persist token_analyses (rank 0–2), constructions, dependencies, analysis_versions
          → apply user_corrections
```

## Dictionary delivery

A chapter's forms span nearly every letter, so letter-sharded lookups would pull ~40 MB of
form shards and hundreds of lexeme shards before the first tap. The build therefore also
writes one **per-work bundle** (`public/dict/works/<slug>.json`: the work's form index +
core lexeme entries without paradigms, 1–7 MB, fetched once, runtime-cached by the service
worker). `preloadWork(slug)` is the reader's fast path; the letter shards remain for the
on-demand paradigm view (`lexeme(id)`, longest-prefix shard resolution) and for user imports
(`preloadForms`). Stem/ending/postfix segmentation is one shared per-form rule
(`src/dictionary/segment.ts`: stem = common prefix of the surface base and the lemma base,
floored at two letters; suppletive forms left whole) used by both the runtime `candidatesFor`
and the engine bridge, so the chips a learner sees are exactly what the engine computed.
Data errors in the dump are corrected at build time from `data/curated/dict-overrides.json`.

## Measuring

* `scripts/engine-coverage.mts` — word by word, no sentence context: dictionary / closed-class /
  rule / guess shares per work.
* `scripts/sentence-coverage.mts` — the full sentence analysis with the cast index, i.e. what the
  reader shows; writes `src/data/engine-coverage.json` (quoted in Settings and the README).
* `scripts/probe-engine.mts <slug> <chapter> <paragraph>` and `scripts/probe-word.mts <word>` —
  print the engine's picks on real text with the real shards (`npx vite-node …`).

## Linguistic model

* **Nouns** — six cases + second locative / partitive / vocative; three genders; animacy decides
  the accusative; paradigms from the dictionary (accented). Suppletive plurals (человек/люди) are
  segmented as stem '' + note.
* **Adjectives** — long forms in four gender/number columns × six cases, short forms, comparative,
  superlative; agreement target found to the right (or left after a copula).
* **Pronouns** — hand-written closed-class tables (personal with н-forms after prepositions,
  possessive, demonstrative, interrogative/relative, reflexive себя/свой, negative, indefinite -то/-нибудь/-либо/кое-).
* **Verbs** — aspect (with partner), present/future, past (gender/number), imperative, infinitive from
  the dictionary; participles (four) and gerunds (two) generated by rule from the paradigm stems;
  -ся postfix segmented; motion verbs classed uni/multi; impersonal 3sg-n uses.
* **Constructions** — aspect choice explained per finite verb; dative-experiencer impersonals
  (мне холодно, ему пришлось, нельзя/надо/можно); у + gen "have"; negation + genitive; numeral
  government; prepositional phrases with the governed case; participle/gerund clauses; бы
  conditional; чтобы purpose; comparatives; **names** (given + patronymic + surname, diminutives
  resolved through the per-book cast index, register explained).
* **Pronunciation** — stress-aware: vowel reduction, final devoicing, assimilation,
  palatalisation, -ого → -ово, что → што; confidence 1 only when the stress is certain.

## Alphabet system

Eleven stages: Latin look-alikes → false friends → new shapes → iotated vowels → hushers →
signs and ы → stress & reduction → hard/soft → voicing rules → italic/cursive forms (т m, д g,
г ᴦ, и u, п n…) → pre-reform letters (recognition). Seven skills + cursive per letter with light
spaced repetition; decodability tints unknown letters in the reader; example words and sentences
come from the learner's own shelf.

## Database (Dexie, `slovo`)

books, chapters, paragraphs, sentences, tokens, lexemes, token_analyses, constructions,
construction_members, dependencies, translations, explanations, characters, parallel_texts,
word_encounters, known_words, learning_state, alphabet_symbols, alphabet_progress,
reading_progress, user_corrections, analysis_versions, analysis_sources, settings.

## Known limits (V0)

* Syntax is a shallow deterministic sketch (clauses split, not attached; coordination not modelled).
* The form index covers the bundled library; a user-imported text meets the dictionary only where
  its forms coincide with the library's, otherwise rule generation and guesses.
* English parallels are aligned per chapter, never per sentence; doubtful chapters are flagged.
* Coverage figures are produced by `scripts/coverage.mjs` and quoted exactly — never "100 %".
