# Слово — build plan (V0)

**Слово** is a local-first Russian literary reader: the works of Dostoevsky and Tolstoy in the
original, every word tappable, with a linguistic apparatus underneath and a reading ladder that
starts with Tolstoy's own graded readers. Sibling of Sefer (Hebrew), Biblia (Scripture) and
पाठ (Hindi) — same stack, same visual language, same principles. Reference implementation to
port from: `C:\Users\CJWal\dev\hindi-reader` (read it, do not modify it).

## Principles (from the learner's master spec — non-negotiable)

1. **Russian stays primary.** English is the last layer of progressive disclosure (tap → More →
   Deeper), off by default. The English chapter parallel is a separate, collapsed pane.
2. **The source text is immutable.** Tokens are offsets; `surface_original` is the exact slice.
   The only accepted cleanup at import is typographic (lib.ru's `--` → `—` is NOT applied; it is
   tokenised as punctuation and rendered as a dash by CSS). Stress marks present in a source
   (Wikisource Azbuka editions) are kept in `surface_original`, stripped in `surface_normalized`.
3. **Deterministic before statistical before generative.** Dictionary forms → closed-class tables
   → rule guesses (key prefixed `?`, confidence ≤ 0.65, the UI says "guess") → the language model
   only phrases/translates/explains the deterministic result (user-entered API key; never handle it).
4. **Every annotation has provenance + confidence.** Regeneration supersedes, never deletes;
   user corrections are re-applied on every version and never regenerated over.
5. **Stress shown only when certain**: from the source text, or from the dictionary form hit.
   A guessed form shows no stress and says why. Pronunciation carries a confidence.
6. **Flag, never hide.** Agreement mismatches, unresolved forms, alignment doubts, ambiguity ties
   are shown as such.
7. **Encounters** are counted when the learner scrolls past a paragraph; lookups per tap; LingQ-style
   status flow (new → seen → recognizing → known → mastered; `autoKnownAfter` unaided encounters;
   "mark the rest of this chapter as known").
8. **Constructions are tracked separately from vocabulary** (aspect, impersonal, motion…).
9. **Never say 100 %** — coverage figures come from a script and are quoted exactly.

## Stack

Vite 8 + React 19 + TS 6 + Dexie 4 (IndexedDB) + HashRouter + vite-plugin-pwa + vitest.
Paper `#f7f2e8`, madder accent `#7a3b2e`, EB Garamond (apparatus; has Cyrillic), **PT Serif**
for the Russian text (vendor woff2 from `node_modules/@fontsource/pt-serif/files`, cyrillic +
latin, 400/700 normal+italic), Noto Sans (cyrillic) for alphabet-drill glyphs. All fonts vendored
into `src/assets/fonts/`, never loaded from the network.

## Contract files (written first; change only by agreement)

- `src/database/types.ts` — persistent model, `Pos`, `MorphFeatures`, `ConstructionType`, names index, parallel text.
- `src/tokenizer/cyrillic.ts` — `tokenize`, `sentenceRanges`, `normalize`, `looseKey`, `sourceStressIndex`, `lettersOf`.
- `src/dictionary/types.ts` — shipped shard formats (`DictManifest`, `FormShard`, `LexShard`, `DictLexeme`, `Paradigm`, `FeatureCode`).
- `src/morphology/candidate.ts`, `src/morphology/sentence.ts` — `Candidate`, `AnalyzedToken`, `FoundConstruction`, `ClauseInfo`, `SentenceAnalysis`.
- `data/corpus-manifest.json` — the reading ladder (works, sources, English parallels).

## Work packages and ownership

Each package owns the paths listed and **must not edit files outside them**. If you need
something from another package, code against the contract and leave a `TODO(integration): …`
comment plus a line in your final report. Every package ships vitest tests for its own code and
must pass `npx vitest run <its test files>`; do not run the whole suite (other packages may be
mid-flight). Write patch scripts with the Write tool, never bash heredocs / `node -e` (they mangle
`\b` and Cyrillic regex — see the Biblia post-mortems). Node only (no Python on this machine).

### A. Corpus — `scripts/fetch-corpus.mjs`, `scripts/build-corpus.mjs`, `scripts/align-english.mjs`, `scripts/corpus-lib.mjs`, `src/import/library.ts`, `data/cast/*.json`, `test/corpus-*.test.ts`
Inputs: `data/corpus-manifest.json`. lib.ru pages are windows-1251 HTML (`<dd>&nbsp;&nbsp; paragraph`, chapter numbers as `<b>I</b>` lines, part titles in `<h4><div align="center">`, `<i>` emphasis, footnotes in `<sup>`/`[n]` — check each work); Wikisource pages via `action=parse&prop=text` (HTML; strip the header/navboxes; keep combining stress marks; the four readers are collections of tales — each tale = one chapter).
Output `public/corpus/<slug>.json`: `{ slug, title, author, year, level, source: {name,url,license:'public domain'}, chapters: [{ title, part?, source_ref, paragraphs: [{ kind, text, emphasis? }] }], word_count }` and `public/corpus/index.json` (manifest with word counts, chapter counts, byte sizes, `has_english`). Raw downloads cached in `data/ru/` (git-ignored) so rebuilds are offline. Chapter titles are the printed heading ("I", "Глава первая", tale title); `part` = the enclosing part/book/volume heading. Paragraph text keeps the source's `--` dashes and `"` quotes exactly. Footnotes → `kind:'note'` paragraphs after the paragraph they belong to.
English: parse the Gutenberg text (strip header/footer), split by the same part/chapter structure, write `public/corpus/<slug>.en.json` `{ slug, translator, source, chapters: [{ index, paragraphs: string[], alignment_confidence, note? }] }`; when counts differ, align what matches, mark the rest `alignment_confidence ≤ 0.5` with a note, and print a report. Never fabricate alignment.
`src/import/library.ts`: `libraryIndex()`, `addLibraryWork(slug, onProgress)` → fetches the JSON, builds an `ImportedBook` (source_format 'library', slug/level/year/has_english) and stores it through `storeBook`; `addParallel(bookId, slug)` fills `parallel_texts`; `seedCast(bookId, slug)` fills `characters` from `data/cast/<slug>.json` copied to `public/corpus/<slug>.cast.json` at build. Cast lists: hand-written for the great novels (Crime and Punishment, Karamazov, Idiot, Demons, Anna Karenina, War and Peace main families) — canonical name, given/patronymic/surname, diminutives and nicknames as they appear in the text (verify each form actually occurs in the fetched text; drop the ones that don't; note confidence).
Tests: parser fixtures (small lib.ru and Wikisource HTML snippets), chapter splitting, footnotes, stress marks preserved, English splitter, alignment report.

### B. Dictionary — `scripts/build-dictionary.mjs`, `scripts/dict-lib.mjs`, `scripts/coverage.mjs`, `src/dictionary/*` (except types.ts), `src/data/coverage.json`, `test/dictionary*.test.ts`
Inputs: `data/dict/{nouns,verbs,adjectives,others}.csv` (tab-separated, header row; apostrophe after the stressed vowel; comma-separated alternatives inside a cell; `translations_en` uses `;` between senses and `,` inside a sense), `data/dict/ru_50k.txt` (`word count`, rank = line number), `public/corpus/*.json` (built by A; if absent, build the form index for ALL dictionary forms behind a `--all-forms` flag and say so).
Build: lexemes with id `pos:lemma` (ё kept; homographs `#2`), `acc`, gloss = first sense, `senses`, gender/animacy/aspect/partner (resolve partner to an id when the partner lemma exists), indeclinable, reflexive (-ся/-сь), rank (match on the lemma; also try ё→е), paradigms (accented strings as in the dump; `sg_only`/`pl_only`). Feature codes per `src/dictionary/types.ts`. `others.csv` has no POS: classify with a closed-class table you write in `scripts/dict-lib.mjs` (prepositions, conjunctions, particles, personal/interrogative pronouns and their case forms as listed, numerals, predicatives like надо/нельзя/можно/жаль) and default the rest to `adverb` when ending in -о/-е/-и/-ски, else `particle` with a `note: 'pos guessed'` — record how many were guessed in the manifest.
Form index = every paradigm cell (split alternatives) of every lexeme, keyed by `looseKey(form)`, **restricted to keys that occur in the corpus** (tokenize `public/corpus/*.json` with the shared tokenizer — import it via vite-node: `npx vite-node scripts/build-dictionary.mjs`, or duplicate `looseKey` in `dict-lib.mjs` with a test asserting it matches `src/tokenizer/cyrillic.ts`). Stress index per reading. Readings for a key are sorted by lexeme rank (unranked last).
Shards: as documented in `types.ts`; keep each file ≤ ~300 KB; write `public/dict/manifest.json` with coverage (`scripts/coverage.mjs` = tokens whose key has ≥ 1 reading / all word tokens, per work and overall; also print the top 300 unknown keys to `data/build/unknown-forms.txt` for the morphology package).
Runtime (`src/dictionary/index.ts`): `loadManifest()`, `preloadForms(keys: Iterable<string>)` (fetches the needed form shards once; memoised with rejection-clearing like Biblia's `memoAsync` — copy `C:\Users\CJWal\dev\biblia-v0\src\data\asyncCache.ts`), `readingsFor(key): FormReading[]` (sync, [] when the shard isn't loaded — callers preload per chapter), `lexeme(id): Promise<DictLexeme|undefined>`, `lexemeSync(id)`, `decodeFeatureCode` (`features.ts`), `splitAccent`/`withAcute` (`accent.ts`), `candidatesFor(key, surface): Candidate[]` (turns readings into `Candidate`s with morpheme segmentation: stem = longest common prefix of the paradigm cells, ending = the rest; `-ся/-сь` as `postfix`; confidence 1; source 'dictionary'; `lemmaAccented` via `withAcute`). Base URL relative (`./dict/…`) so the built app runs from any sub-path.
Tests: CSV parsing on fixture rows, feature codes round-trip, accent helpers, shard naming, coverage arithmetic, `candidatesFor` segmentation (говорить/говорю/говорил; человек/люди — suppletive: stem = '' with note), fake-fetch runtime loader with rejection retry.

### C. Alphabet + pronunciation — `src/alphabet/*`, `src/pronunciation/*`, `src/curriculum/{corpus,frequency}.ts`, `src/ui/Alphabet.tsx`, `src/reader/LetterDetail.tsx`, `test/alphabet*.test.ts`, `test/pronunciation*.test.ts`
Port `alphabet/{mastery,drills,decodability}.ts` from the Hindi reader (7 skills + `cursive`), replace inventory + curriculum with Cyrillic: stages — (1) letters that look and sound like Latin А К М О Т; (2) false friends В Н Р С У Х Е; (3) new shapes Б Г Д З И Й Л П Ф Э; (4) iotated vowels and Ё Ю Я; (5) hushers and affricates Ж Ч Ш Щ Ц; (6) signs and Ы: Ь Ъ Ы; (7) stress and vowel reduction (аканье/иканье); (8) hard/soft consonants and palatalisation; (9) voicing: final devoicing and assimilation, -ого = -ово, что/-ться/-чн-; (10) italic and cursive forms (т→*m*, д→*g*/*∂*, г→*ᴦ*, и→*u*, п→*n*, б, в, з, л, м) — essential for reading italics in the novels; (11) pre-reform letters ѣ і ѳ ѵ ъ (recognition only). Each symbol: name, sound (IPA), example words from the corpus (via `curriculum/corpus.ts` `exampleWords`/`exampleSentences` reading Dexie), confusables, cursive glyph string.
`pronunciation/`: `pronounce(form, stressIndex | -1)` → `{ translit, ipa, confidence, notes }` with: vowel reduction by position relative to stress (о→[ɐ]/[ə], е/я→[ɪ]), final devoicing, regressive voicing assimilation, palatalisation before soft vowels/ь, -ого/-его → [-əvə], что → [ʂto], -тся/-ться → [tsə], г in бог/лёгкий, ч in что/конечно; confidence 1 when stress is known and no exceptional rule fired, 0.7 when stress unknown (say "stress unknown — reduction not applied"), lower for exceptional spellings. Letter-by-letter transliteration separately (`translit`), for the alphabet stages.
`curriculum/frequency.ts` port: letters, forms, keys, lemma counts per book, first chapter of each.
Tests: every stage covers all 33 letters exactly once across stages 1–6; `pronounce` on молоко́ / хорошо́ / что / его́ / сад / вход / учи́ться / Достое́вский; decodability.

### D. Morphology + syntax + constructions — `src/morphology/*` (except candidate.ts / sentence.ts), `src/syntax/*`, `src/constructions/*`, `src/lexicon/closed-class/*`, `test/morphology*.test.ts`, `test/syntax*.test.ts`, `test/constructions*.test.ts`
`morphology/analyze.ts`: `analyzeWord(surface, key, ctx: { readings: (key)=>FormReading[]; lexeme: (id)=>DictLexeme|undefined })` → `Candidate[]` — dictionary candidates first (via B's `candidatesFor`; use the injected accessors so tests run with an in-memory fixture, never fetch), then closed-class tables (`lexicon/closed-class/pronouns.ts` full paradigms for personal/possessive/demonstrative/interrogative/relative/negative/indefinite pronouns incl. н- forms after prepositions, `numerals.ts` (один–тысяча, ordinals, collective), `prepositions.ts` with governed cases, `conjunctions.ts`, `particles.ts`), then rule guesses (`guess.ts`): participles/gerunds generated from a known verb's paradigm (act. pres. from pl3 stem + -ущ/-ющ/-ащ/-ящ; act. past from past stem + -вш/-ш; pass. past -нн/-т/-енн; pass. pres. -ем/-им; gerunds -я/-а/-в/-вши/-ши; declined like adjectives; source 'rule', confidence 0.85 when the verb is known), adverbs in -о from known adjectives, comparatives -ее/-ей/-е, superlatives -ейш/-айш, prefixed verbs (strip по-/при-/у-/вы-/за-/на-/от-/под-/пере-/про-/с-/в-/до-/раз-/из-/о-/об- to a known verb; guess, 0.6), diminutives (-очк/-ечк/-еньк/-ик/-чик/-ушк), pre-reform spellings (looseKey already folds; note it), unknown → ending-pattern guess (`?pos:lemma`, ≤ 0.55) with morphemes stem/ending and a plain note "not in the dictionary — pattern guess". `ENGINE_RULES_VERSION` exported; bump on rule changes.
`syntax/context.ts` `applyContext(tokens)`: preposition → governed case reranking (в/на + acc vs prep: motion verb present → acc, else prep; с + gen/inst by meaning; по + dat; о + prep; у/для/без/из/от/до + gen; к + dat; за/под + acc/inst…); всё vs все, ещё/еще, что (conj vs pronoun), как; adjective–noun agreement picks the noun's case; nominative subject vs accusative object for ambiguous forms (animate/inanimate; word order); negation + genitive; numerals govern gen sg (2–4) / gen pl (5+); capitalised non-initial word with no reading → `proper` (0.7); names index hook (`ctx.character(form)`) → proper with the character's canonical name. Mark `decided`. Never override a `decided` token.
`constructions/`: `aspect.ts` (per finite verb: aspect + why — perfective = single completed/result, imperfective = process/repeated/general fact/negated past; contrast with the partner from the dictionary), `motion.ts` (идти/ходить, ехать/ездить…, prefixed motion verbs), `impersonal.ts` (dative experiencer + predicative/3sg-n verb: мне холодно, ему пришлось, нельзя, надо, можно, нравится; у + gen 'have'), `reflexive.ts` (-ся: reflexive proper / reciprocal / passive / intransitive / impersonal), `negation.ts` (не + gen, ни…ни, никто/ничего double negation), `numeral.ts`, `phrases.ts` (prepositional phrases, participle and gerund clauses, бы conditional, чтобы purpose, comparatives), `names.ts` (name + patronymic + surname sequences, diminutive → canonical via the characters index; explain register: full name+patronymic = respectful, diminutive = intimate).
`syntax/clause.ts`: split at conjunctions/relatives/dashes/semicolons; per clause: predicate, nominative subject, accusative object, dative experiencer, у-possessor; agreement expected vs actual (person/number in present-future, gender/number in past) with mismatches flagged ⚠; word-order note when the object precedes the subject or the verb is fronted. `syntax/dependencies.ts` readable sketch. `syntax/index.ts` `analyzeSentence(input, ctx)` orchestrates exactly as the Hindi one did.
Tests: fixture dictionary (in-test `DictLexeme`s for ~40 words); each rule with a positive and a negative case; the first paragraph of Crime and Punishment (В начале июля…) analysed end-to-end with expected picks for каждый word token that the fixture knows.

### E. UI + persistence — `src/ui/*` (except Alphabet.tsx), `src/reader/*` (except LetterDetail.tsx), `src/database/{db,analysis,settings}.ts`, `src/import/*` (except library.ts), `src/vocabulary/*`, `src/curriculum/chapterPrep.ts`, `src/ai/*`, `src/audio/*`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `index.html`, `vite.config.ts`, `public/*.svg|png`, `src/assets/fonts/*`, `README.md`, `NOTICE.md`, `test/persistence*.test.ts`, `test/import*.test.ts`, `test/ui*.test.tsx`
Port the Hindi reader's UI to Russian against the contract: Dexie schema (tables in `types.ts` incl. `characters`, `parallel_texts`; DB name `slovo`), `analysis.ts` (`ensureChapterAnalysis` must `preloadForms` for the chapter's keys, then call `analyzeSentence` with the dictionary accessors and `character()` lookup; corrections re-applied; version tags), settings (`stressMarks: 'always'|'tap'|'unknown'|'never'`, `translitMode`, `englishParallel: boolean` default false, `lookupMarksRecognized`, `autoKnownAfter`, `yoDisplay`), Home = the ladder (six levels, works with word counts, "Add to my shelf" fetch-on-demand with progress, resume), Reader (Prose with tappable words, stress marks per setting rendered as combining acute over `surface_normalized` when the chosen candidate has `features.stress ≥ 0` — never on guesses; unknown-letter tints per decodability; encounters on scroll; chapter nav; English parallel pane collapsed at the bottom of each chapter — paragraphs only, never interleaved), WordPanel (level 1: surface with stress, pronunciation + confidence, gloss, lemma with stress, pos + features in plain English ("genitive singular — because of у"), status control; level 2: morpheme chips, notes, aspect partner, ambiguity alternatives, "guess" badge, Correct form; level 3: full paradigm table with stress from B's `lexeme()`, senses, frequency rank, concordance in this book, encounter history), SentencePanel (clause sketch, constructions, aspect note, word-order note, Claude explanation with the user's key), Names screen per book (cast + detected), Vocabulary, Chapter prep (new words / constructions / names before a chapter), Import (EPUB/HTML/TXT/JSON, DRM refused), Settings (sources & licences: OpenRussian CC BY-SA 4.0, hermitdave FrequencyWords CC BY-SA 4.0, lib.ru, Wikisource, Project Gutenberg), Onboarding (script level + stress/translit modes), UpdateToast. Fonts: vendor PT Serif cyrillic+latin (400/700, normal+italic) and EB Garamond cyrillic 400/600 + italic; `--font-text: 'PT Serif'`. PWA manifest name "Слово", lang ru; workbox `globIgnores` the corpus and dict shards (fetched on demand, runtime-cached with a versioned cache name — copy Biblia's `dataVersion`/`cleanupCaches` pattern). Routes: `#/`, `#/read/:bookId/:chapterIndex`, `#/word/:key`, `#/names/:bookId`, `#/alphabet`, `#/vocabulary`, `#/import`, `#/settings`.
Tests: persistence (fake-indexeddb), import of a small Russian text, a rendered Reader smoke test (jsdom, `matchMedia`/`IntersectionObserver` stubs; navigation through a `useNavigate` bridge, never by remounting `MemoryRouter`).

## Status (2026-09-22, end of V0 build)

Done and verified in the browser (dev server and the production build): onboarding → ladder in
curated order → add a work (progress, resume) → chapter prep → reader with tappable words →
three-level word card (stress, gloss, chips, aspect partner, pronunciation with the rule that
fired, paradigm table with stress, frequency rank, encounters, provenance) → sentence panel
(aspect per verb with partner, agreement, -ся reading flagged uncertain, prepositional phrases,
word order) → Names screen (curated casts, forms verified against the text) → English parallel
(collapsed, off by default) → Alphabet (11 stages) → Settings with sources and exact coverage.
Coverage figures live in `src/data/engine-coverage.json` (see ARCHITECTURE → Measuring).

Integration fixes worth knowing: optional corpus files must be probed by content type (the dev
server and the PWA navigate fallback answer 404s with `index.html`, status 200); frequency
tables upsert inside one transaction with an in-flight memo (a plain `put` on the unique `key`
index crashed the Home screen after a large add); `addParallel` is idempotent; heading
paragraphs that repeat the chapter title are not shown twice; lib.ru prints Tolstoy's чтò with a
Latin ò (tokenizer maps it to о + grave and counts it as a source stress); War and Peace's
lib.ru edition appends 74k words of textual-variant apparatus (stripped at build).

Known limits carried into V1: clauses are split, not attached, and NP-internal «и» can still
split a clause; War and Peace's bundle is 6.9 MB (per-chapter bundles would fix it); a few
dictionary gaps remain (казать, счастие/годы case forms); service-worker registration could not
be exercised in the desktop browser pane this session — check the installed app on a phone.

## Integration (top level, after A–E)
`npx tsc -b` clean → `npm test` → `npm run corpus:fetch && npm run corpus:build && npm run dict:build` → coverage figures into README/Settings → `npm run build` → verify in the browser (Home ladder, add "Первая русская книга для чтения", read, tap words, stress, paradigm, names, English pane, alphabet stage) → Desktop launch.json entries `slovo-dev` (5188) / `slovo-preview` (4188) → commit → GitHub Pages `Rookie2401/slovo` (orphan `gh-pages` = dist; corpus is public domain so the full library may be published).
