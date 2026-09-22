# Notice

Слово bundles and depends on third-party data and fonts under the following licences.

## Dictionary

**OpenRussian** — CC BY-SA 4.0. https://en.openrussian.org/
Used to build `public/dict/*` (form and lexeme shards) via `scripts/build-dictionary.mjs`.

**hermitdave/FrequencyWords** — CC BY-SA 4.0. https://github.com/hermitdave/FrequencyWords
Used for lemma frequency ranks (`data/dict/ru_50k.txt`).

## Texts

Russian source texts are drawn from **lib.ru** (https://lib.ru) and **ru.wikisource.org**, both
public domain (Dostoevsky d. 1881, Tolstoy d. 1910). English parallel translations are drawn
from **Project Gutenberg** (https://www.gutenberg.org), public domain in the United States;
translator credits are recorded per work in `data/corpus-manifest.json` and shown in Settings /
the reader's English parallel pane.

## Fonts

* **PT Serif** — SIL Open Font License 1.1. ParaType.
* **EB Garamond** — SIL Open Font License 1.1. Georg Duffner / Octavio Pardo.
* **Noto Sans** — SIL Open Font License 1.1. Google.

Font files are vendored as static `.woff2` assets under `src/assets/fonts/`; no font is loaded
from the network at runtime.

## Code

The application code (this repository) is original to this project, ported from and structured
after the sibling readers पाठ (Hindi), Sefer (Hebrew) and Biblia (Scripture) in the same author's
`dev/` workspace. The optional language-model layer (`src/ai/claude.ts`) calls the Anthropic API
directly from the browser using a key the reader supplies in Settings; the key is never bundled,
logged, or sent anywhere but Anthropic.
