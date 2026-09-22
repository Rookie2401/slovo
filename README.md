# Слово (V0)

A local-first Russian literary reader — Dostoevsky and Tolstoy in the original, with a
linguistic apparatus underneath, and a reading ladder that starts with Tolstoy's own graded
readers for children and ends with *Братья Карамазовы* and *Война и мир*.

Everything runs in the browser (Vite + React + TypeScript + Dexie/IndexedDB, installable PWA).
No text, analysis or progress leaves the device. Sibling of Sefer (Hebrew), Biblia (Scripture)
and पाठ (Hindi) — same stack, same visual language, same principles (see `docs/PLAN.md` and
`docs/ARCHITECTURE.md`).

## Run

```bash
npm install
npm run dev          # http://localhost:5188 (Desktop launch.json entry `slovo-dev`)
npm test             # vitest — persistence, import, and reader smoke tests
npm run typecheck
npm run build        # dist/ — static, relative base, works from any host or file:// URL
npm run corpus:fetch && npm run corpus:build   # data/corpus-manifest.json → public/corpus/*.json
npm run dict:build    # data/dict/*.csv (OpenRussian) + ru_50k.txt → public/dict/{manifest,forms,lex}
```

## Reading ladder

Home lists the bundled library in six levels — from Tolstoy's *Первая русская книга для чтения*
through the great novels — with "Add to my shelf" fetching a work on demand (with progress and
resume) from `public/corpus/`. Your own imports (EPUB / HTML / TXT / JSON) sit alongside them.
Chapters marked with an English parallel show a collapsed pane at the end of the chapter
(Settings → English parallel pane); it is off by default, because Russian stays primary.

## Reading

Every word is tappable. The word panel has three levels of disclosure (surface + gloss + status
→ morphology + construction + alternatives → full paradigm + frequency + provenance). Stress
marks (a combining acute) are shown only when they are certain — printed in the source or hit
exactly in the dictionary — never on a rule guess. Decodability tints letters you have not met
yet in the alphabet curriculum (Settings → tint unknown letters). The sentence panel gives a
deterministic clause sketch (subject / object / experiencer / possessor, aspect choice, word
order, agreement) plus an optional Claude-phrased translation, using your own API key (Settings
→ Language model) — the model only explains the deterministic analysis; it never decides
morphology, aspect or stress.

## Import

Home → *Import a book* accepts **EPUB**, **HTML/XHTML**, **TXT** and a **JSON corpus**
(`{ title, chapters: [{ title, part?, paragraphs: [string | {kind, text, emphasis}] }] }`).
**DRM is never bypassed.** An `.acsm` file, an Adobe `rights.xml`, or an `encryption.xml` that
covers anything other than obfuscated fonts is refused with an explanation.

## Sources & licences

* Dictionary: **OpenRussian**, CC BY-SA 4.0.
* Frequency list: **hermitdave/FrequencyWords**, CC BY-SA 4.0.
* Russian texts: **lib.ru** and **ru.wikisource.org** (public domain).
* English parallels: **Project Gutenberg** (public domain in the US).
* Fonts: **PT Serif** (OFL), **EB Garamond** (OFL), **Noto Sans** (OFL).

## Architecture

`docs/ARCHITECTURE.md` and `docs/PLAN.md` are the source of truth. In short: the source text is
immutable (tokens are offsets); readings come from the dictionary form index, then closed-class
tables, then rule generation (participles, gerunds, comparatives — confidence ≤ 0.85), then
ending-pattern guesses (key prefixed `?`, confidence ≤ 0.55, shown as a guess, never stressed).
Every stored analysis carries provenance, a confidence and a review status; regeneration
supersedes rows, never deletes them, and user corrections are re-applied on every version.
