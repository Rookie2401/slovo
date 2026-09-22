/**
 * Shared helpers for the corpus pipeline (fetch-corpus / build-corpus /
 * align-english). Node-only, no framework imports, so it can be run with
 * plain `node` as well as `vite-node`.
 *
 * lib.ru pages are windows-1251 HTML with famously loose markup (unclosed
 * <p>, ad-hoc <xxx7> tags, <dd> used as a paragraph marker rather than a
 * real definition-list description). A real HTML parser (jsdom) re-nests
 * this in surprising ways — in particular an unclosed <dd> swallows the
 * following <h4> as a child instead of being auto-closed by it — so instead
 * of building a DOM we scan the raw markup for two marker tokens, `<h4>…
 * </h4>` (headings) and `<dd>` (paragraph start, closed implicitly by the
 * next marker), in document order, and read the inline content between
 * markers with a small hand-rolled inline-HTML-to-text reader
 * (`htmlFragmentToText`) that understands just the handful of inline tags
 * lib.ru actually uses (<i>, <b>, <sup>, entities). This is both far faster
 * than instantiating jsdom per paragraph (needed — some novels run to tens
 * of thousands of paragraphs) and immune to the parser-renesting problem.
 */

import { JSDOM } from 'jsdom';

export const LIBRU_ORIGIN = 'http://az.lib.ru';
export const WIKISOURCE_API = 'https://ru.wikisource.org/w/api.php';
export const GUTENBERG_BASE = 'https://www.gutenberg.org/cache/epub';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function decodeWin1251(buf) {
  return new TextDecoder('windows-1251').decode(buf);
}

// --------------------------------------------------------------- entities

const ENTITY_MAP = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  laquo: '«',
  raquo: '»',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  deg: '°',
  sect: '§',
  prime: '′',
  Prime: '″',
  copy: '©',
  reg: '®',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  shy: '­',
  middot: '·',
  bull: '•',
  times: '×',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  euml: 'ë',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  ccedil: 'ç',
  ouml: 'ö',
  uuml: 'ü',
  auml: 'ä',
  szlig: 'ß',
};

/** Decode the small set of HTML entities lib.ru pages actually use (numeric refs handled generically). */
export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(\w+);/g, (m, name) => (Object.prototype.hasOwnProperty.call(ENTITY_MAP, name) ? ENTITY_MAP[name] : m));
}

// ---------------------------------------------------------- whitespace / offsets

/**
 * Collapse runs of whitespace (incl. NBSP) to a single space, trim the
 * ends, and remap an accompanying list of {start,end,...} ranges (offsets
 * into the ORIGINAL string) to offsets into the collapsed string. Ranges
 * that collapse to zero width are dropped.
 */
export function collapseWhitespace(text, ranges = []) {
  let out = '';
  const map = new Array(text.length + 1);
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    map[i] = out.length;
    const ch = text[i];
    const isSpace = ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === ' ' || ch === '­';
    if (isSpace) {
      if (!lastWasSpace) out += ' ';
      lastWasSpace = true;
    } else {
      out += ch;
      lastWasSpace = false;
    }
  }
  map[text.length] = out.length;
  const leadTrim = out.length - out.trimStart().length;
  const trimmed = out.trim();
  const newRanges = ranges
    .map((r) => ({ ...r, start: Math.max(0, Math.min(trimmed.length, map[r.start] - leadTrim)), end: Math.max(0, Math.min(trimmed.length, map[r.end] - leadTrim)) }))
    .filter((r) => r.end > r.start);
  return { text: trimmed, ranges: newRanges };
}

// -------------------------------------------------------- inline HTML reader

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
const BLOCK_BREAK_TAGS = new Set(['br', 'p', 'div', 'dd', 'li']);

/**
 * Read the inline content of an HTML fragment (lib.ru paragraph body):
 * decodes entities, drops the content of <sup> (footnote call numbers —
 * apparatus, not text), and records <i>/<b> as emphasis ranges. Any other
 * tag is ignored structurally but its text content still flows through.
 * Offsets in the returned ranges are into the RAW (uncollapsed) text —
 * pass both through `collapseWhitespace` before use.
 */
export function htmlFragmentToText(fragment) {
  let text = '';
  const ranges = [];
  const stack = [];
  let skipDepth = 0;
  let last = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(fragment))) {
    const chunk = fragment.slice(last, m.index);
    if (skipDepth === 0 && chunk) text += decodeEntities(chunk);
    last = TAG_RE.lastIndex;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'sup') {
      if (!closing) skipDepth++;
      else if (skipDepth > 0) skipDepth--;
      continue;
    }
    if (skipDepth > 0) continue;
    if (tag === 'i' || tag === 'em') {
      if (!closing) stack.push({ kind: 'em', start: text.length });
      else {
        const idx = findLast(stack, 'em');
        if (idx !== -1) {
          const s = stack.splice(idx, 1)[0];
          if (text.length > s.start) ranges.push({ start: s.start, end: text.length, kind: 'em' });
        }
      }
    } else if (tag === 'b' || tag === 'strong') {
      if (!closing) stack.push({ kind: 'strong', start: text.length });
      else {
        const idx = findLast(stack, 'strong');
        if (idx !== -1) {
          const s = stack.splice(idx, 1)[0];
          if (text.length > s.start) ranges.push({ start: s.start, end: text.length, kind: 'strong' });
        }
      }
    } else if (BLOCK_BREAK_TAGS.has(tag)) {
      text += ' ';
    }
  }
  const tail = fragment.slice(last);
  if (skipDepth === 0 && tail) text += decodeEntities(tail);
  // close any tags left open at fragment end (malformed source)
  for (const s of stack) if (text.length > s.start) ranges.push({ start: s.start, end: text.length, kind: s.kind });
  return { text, ranges };
}

function findLast(stack, kind) {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === kind) return i;
  return -1;
}

/** Plain text of an inline fragment (tags stripped, entities decoded, whitespace collapsed). */
export function fragmentText(fragment) {
  const { text } = htmlFragmentToText(fragment);
  return collapseWhitespace(text).text;
}

// ------------------------------------------------------------------ lib.ru

const SECTION_BEGIN = '<!--Section Begins-->';
const SECTION_END = '<!--Section Ends-->';
/** Present near the end of every lib.ru page, right after the site chrome that follows the text — a reliable universal "definitely past the content" cut point for pages that lack Section Begins/Ends comments (an older template lib.ru also serves). */
const FOOTER_MARKER = '<!-- sape.ru request:';

/**
 * A handful of pages embed an HTML <table> for genuinely tabular apparatus
 * (e.g. War and Peace: Pierre's French-alphabet-as-numbers cipher table for
 * "666"). A table cell's own `<div align="center"><p>d</p></div>` is
 * indistinguishable from a real heading by our marker rules (a single
 * letter matches the roman-numeral pattern), so tables are dropped whole
 * before marker-matching runs — they are not narrative paragraphs anyway.
 */
function stripTables(html) {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, ' ');
}

export function extractLibruBody(html) {
  const footerIdx = html.indexOf(FOOTER_MARKER);
  const trimmed = footerIdx !== -1 ? html.slice(0, footerIdx) : html;
  const b = trimmed.indexOf(SECTION_BEGIN);
  const e = trimmed.indexOf(SECTION_END);
  if (b !== -1 && e !== -1 && e > b) return stripTables(trimmed.slice(b + SECTION_BEGIN.length, e));
  const divIdx = trimmed.indexOf('<div align=justify>');
  if (divIdx !== -1) return stripTables(trimmed.slice(divIdx));
  return stripTables(trimmed);
}

/** Scholarly apparatus that some lib.ru academic editions append after the real text ends. */
const APPARATUS_HEADING_RE = /^(сноски|примечания|комментари|варианты|печатные варианты|из черновых редакций|из ранних редакций|другие редакции|другие варианты|указатель|дополнени)/i;

/**
 * Some editions (Война и мир) append a textual-variants apparatus with no
 * apparatus-vocabulary heading at all — it reuses ordinary-looking "ТОМ
 * ПЕРВЫЙ" / "ТОМ ВТОРОЙ" labels (a different naming scheme than the main
 * text's own "ТОМ I" volumes) and only reveals itself deep inside, as a run
 * of entries like "Стр. 3, строка 6." followed by the variant reading. Once
 * such a line is found, everything from the nearest PRECEDING heading
 * marker onward is apparatus — that heading is where the run actually
 * starts (its own intro prose, e.g. "Разночтения между текстом…", precedes
 * the first "Стр." line but is already part of the same apparatus).
 */
const VARIANT_LINE_RE = /^Стр\.\s*\d+,\s*строк[аи]/;

function findVariantApparatusStart(body, markers) {
  let firstVariantIdx = -1;
  for (let k = 0; k < markers.length; k++) {
    const mk = markers[k];
    if (mk.isH4) continue;
    const nextIdx = k + 1 < markers.length ? markers[k + 1].index : body.length;
    const raw = paragraphRaw(body, mk, nextIdx);
    if (/^(?:\s|&nbsp;)*<sup>/i.test(raw)) continue; // footnote definition, not a variant-list line
    const text = collapseWhitespace(htmlFragmentToText(raw).text).text;
    if (VARIANT_LINE_RE.test(text)) {
      firstVariantIdx = k;
      break;
    }
  }
  if (firstVariantIdx === -1) return -1;
  for (let k = firstVariantIdx; k >= 0; k--) {
    if (markers[k].isH4) return k;
  }
  return firstVariantIdx; // no heading precedes it at all — cut right at the variant line itself
}

// lib.ru serves (at least) four page templates for a heading: the common
// one wraps it in `<h4><div align="center">…<b>…</b>…</div></h4>`; an older
// one (Записки из подполья, Подросток) uses `<ul><a name=N></a><h2>…</h2>
// </ul>`; a third (Бесы) uses a bare `<div align="center">…</div>` with no
// heading tag at all; a fourth marks an epistolary novel's letters with the
// date right-aligned (`<div align="right">Апреля 8.</div>`, Бедные люди).
// A bare div is indistinguishable by markup alone from a centered/right
// *non*-heading div (an epigraph, a "----------" scene-break, a letter's
// signature line) — so it is only accepted as a heading when its text
// looks heading-ish (HEADINGISH_RE); otherwise it is kept as an ordinary
// paragraph (selfContained: true tells the main pass to read `raw` itself
// as the paragraph body, not the gap after it — unlike `<dd>`, a div's
// content is between ITS OWN open/close tags).
const MARKER_RE = /<h4>[\s\S]*?<\/h4>|<h2[^>]*>[\s\S]*?<\/h2>|<div\s+align\s*=\s*"?(center|right|justify|left)"?[^>]*>[\s\S]*?<\/div>|<dd>/gi;

// NOTE: `\b` (word boundary) is an ASCII-\w notion in a non-`u` JS regex —
// Cyrillic letters are never \w, so a Cyrillic word is never adjacent to a
// "word" character on either side and `\b` silently NEVER matches right
// after one (`/часть\b/i.test('часть первая')` is false!). Every boundary
// below after a Cyrillic alternative uses an explicit negative lookahead
// for "another letter follows" instead.
const CYR_LETTER_LOOKAHEAD = '(?![а-яёА-ЯЁa-zA-Z])';

// Deliberately no bare-Arabic-numeral case ("^\d+$") — lib.ru's scanned
// editions litter the source with bare page-number lines ("196", "298")
// that would otherwise be misread as chapter headings.
const DATE_HEADING_RE = /^(январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*\.?\s+\d+/i;
// The глава/часть/… branch requires the WHOLE (trimmed) text to be just the
// keyword plus at most one more word ("Глава первая", "От автора") — not
// merely to START with it, since глава/часть/книга are also ordinary nouns
// ("глава администрации" = "the head of the administration") that can
// legitimately start a real sentence of running prose.
const HEADINGISH_RE = new RegExp(`^(глава|часть|книга|том|эпилог|пролог|приложение|введение|заключение|послесловие|от автора)(\\s+[а-яё]+)?\\.?\\s*$|^[ivxlcdm]+\\.?(\\s|$)|${DATE_HEADING_RE.source}`, 'i');

/** A "big" division (часть/книга/том) vs. a finer one (глава N) — both become `part`, joined, see combinePart(). */
const BIG_PART_RE = new RegExp(`^\\*?\\s*(часть|книга|том)${CYR_LETTER_LOOKAHEAD}`, 'i');

function markerHeadingTitle(raw) {
  // a bare <div> heading sometimes packs a descriptive subtitle after a
  // <br> ("Глава первая<br>Вместо введения: …") — only the part before the
  // first <br> is used as the heading text; the rest is front-matter noise.
  const cut = raw.search(/<br\s*\/?>/i);
  return fragmentText(cut === -1 ? raw : raw.slice(0, cut));
}

function findMarkers(body) {
  const markers = [];
  let m;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(body))) {
    const isTagHeading = /^<(h4|h2)/i.test(m[0]);
    const isDiv = /^<div/i.test(m[0]);
    if (isDiv) {
      const title = markerHeadingTitle(m[0]);
      const isHeading = Boolean(title) && HEADINGISH_RE.test(title);
      markers.push({ index: m.index, end: m.index + m[0].length, raw: m[0], isH4: isHeading, headingTitle: isHeading ? title : undefined, selfContained: true, isTagHeading: false });
      continue;
    }
    markers.push({ index: m.index, end: m.index + m[0].length, raw: m[0], isH4: isTagHeading, isTagHeading });
  }
  return markers;
}

function segmentText(body, marker, nextIndex) {
  return body.slice(marker.end, nextIndex);
}

/** Raw inline HTML of a non-heading marker's own paragraph content: the div's own contents (selfContained) or the gap up to the next marker (`<dd>`). */
function paragraphRaw(body, marker, nextIndex) {
  return marker.selfContained ? marker.raw : segmentText(body, marker, nextIndex);
}

/**
 * A fourth template (e.g. Кроткая) marks headings with no markup at all —
 * a bare `<dd>ГЛАВА ПЕРВАЯ</dd>` line, indistinguishable from an ordinary
 * paragraph except that it's short and heading-vocabulary text. Reclassify
 * such `<dd>` markers as headings in place (mutates `markers`) so the main
 * pass treats them identically to a real `<h4>`/`<h2>`/centered `<div>`.
 * `viaDD` records that this heading had no special markup — the "skip the
 * very first heading as the repeated crown title" rule below only applies
 * to markup-based headings, since a dd-heading template never separately
 * marks up a crown title in the first place (there's nothing to skip).
 */
function reclassifyHeadingLikeParagraphs(body, markers) {
  for (let k = 0; k < markers.length; k++) {
    const mk = markers[k];
    if (mk.isH4 || mk.selfContained) continue; // divs are already classified in findMarkers
    const segEnd = k + 1 < markers.length ? markers[k + 1].index : body.length;
    const raw = segmentText(body, mk, segEnd);
    if (/^(?:\s|&nbsp;)*<sup>/i.test(raw)) continue; // footnote definition, never a heading
    const text = collapseWhitespace(htmlFragmentToText(raw).text).text;
    if (text && text.length <= 40 && HEADINGISH_RE.test(text)) {
      mk.isH4 = true;
      mk.headingTitle = text;
      mk.viaDD = true;
    }
  }
}

/**
 * Parse a lib.ru work page into { title, chapters, warnings }. `chapters`
 * matches the corpus JSON shape: { title, part?, paragraphs: [{kind,text,emphasis?}] }.
 * Footnote handling: a call marker `<sup>N</sup>` inline in running text is
 * dropped (typographic apparatus, not text); a paragraph whose content
 * (after the lib.ru `&nbsp;&nbsp;&nbsp;` indent) IS a `<sup>N</sup>…`
 * definition becomes a `kind:'note'` paragraph, which — because lib.ru
 * always places it immediately after the paragraph containing the call —
 * already satisfies "note directly after the paragraph it belongs to".
 */
export function parseLibruWork(html, opts = {}) {
  const warnings = [];
  const body = extractLibruBody(html);
  const markers = findMarkers(body);
  reclassifyHeadingLikeParagraphs(body, markers);
  const hasAnyH4 = markers.some((mk) => mk.isH4);
  const chapters = [];
  // Two levels of container heading are attested (часть/книга/том, and a
  // finer глава N under it, see e.g. Подросток) — `Chapter.part` is a single
  // string, so both are joined "outer — inner" when both are present.
  let currentBigPart;
  let currentSubPart;
  const combinedPart = () => [currentBigPart, currentSubPart].filter(Boolean).join(' — ') || undefined;
  let currentChapter = null;
  let apparatusChars = 0;

  const ensureChapter = () => {
    if (!currentChapter) {
      currentChapter = { title: opts.fallbackTitle ?? '', part: combinedPart(), paragraphs: [] };
      chapters.push(currentChapter);
    }
    return currentChapter;
  };

  // Some editions (e.g. Бесы) print a front-matter table of contents —
  // heading-like <h4>/dd lines listing chapter titles — before the real
  // text starts. Rather than try to parse a TOC, when the work is divided
  // into часть/книга/том, everything before the FIRST such division
  // (crown title, byline, genre tag, TOC) is dropped uniformly; only that
  // first big-part heading marker itself starts real processing.
  const firstBigPartIdx = markers.findIndex((mk) => mk.isH4 && BIG_PART_RE.test(mk.headingTitle ?? fragmentText(mk.raw)));
  const variantApparatusIdx = findVariantApparatusStart(body, markers);
  let i = 0;
  // Everything up to the first "real" heading action (creating a chapter,
  // or establishing a часть/глава container) is front matter — byline,
  // crown title, genre tag, an epigraph div — and is dropped, however many
  // such elements there are (not just the one crown heading). `inFrontMatter`
  // only flips false right when that first real action happens, below.
  // sawFirstTagHeading additionally gates the crown-title skip, which only
  // makes sense for a literal `<h4>`/`<h2>` heading — those templates repeat
  // the work's title as the very first one. A div- or dd-based heading
  // (isTagHeading false) never marks up a separate crown title in the
  // templates seen, so its very first heading IS real content.
  //
  // If the crown title is the ONLY heading in the whole document, there is
  // nothing later to end front matter at, so this unbounded drop would
  // swallow the entire story — in that case front matter is just the crown
  // heading itself (every single-chapter work actually seen in this corpus
  // marks up at least a second heading, a genre tag, even with no further
  // chapter division; a bare crown-only page falls back to the simple rule).
  const totalHeadings = markers.reduce((n, mk) => n + (mk.isH4 ? 1 : 0), 0);
  let inFrontMatter = true;
  let sawFirstTagHeading = false;
  if (firstBigPartIdx > 0) {
    i = firstBigPartIdx;
    inFrontMatter = false;
    sawFirstTagHeading = true;
  }
  while (i < markers.length) {
    if (variantApparatusIdx !== -1 && i === variantApparatusIdx) {
      apparatusChars = body.length - markers[i].index;
      break; // a "Стр. N, строка N." variant-readings run starts here (or its enclosing heading) — not narrative text
    }
    const mk = markers[i];
    const segEnd = i + 1 < markers.length ? markers[i + 1].index : body.length;
    if (mk.isH4) {
      const title = mk.headingTitle ?? fragmentText(mk.raw);
      if (APPARATUS_HEADING_RE.test(title)) {
        apparatusChars = body.length - mk.index;
        break; // scholarly apparatus (variant readings / footnote index) — stop, not narrative text
      }
      if (mk.isTagHeading && !sawFirstTagHeading) {
        sawFirstTagHeading = true; // the work's own crown title, repeated on every page — not a chapter
        if (totalHeadings <= 1) inFrontMatter = false; // nothing later to anchor on — content starts right after the crown
        i++;
        continue;
      }
      inFrontMatter = false; // a real heading action follows: chapter, or часть/глава container
      // Look ahead through following markers: does real (non-empty) paragraph
      // content precede the next heading? If so this h4 is a chapter; if we
      // hit another h4 first, this one is a part/book/volume container.
      let j = i + 1;
      let hasContentAhead = false;
      while (j < markers.length) {
        const nj = markers[j];
        if (nj.isH4) break;
        const njEnd = j + 1 < markers.length ? markers[j + 1].index : body.length;
        const text = fragmentText(paragraphRaw(body, nj, njEnd));
        if (text) {
          hasContentAhead = true;
          break;
        }
        j++;
      }
      if (hasContentAhead) {
        currentChapter = { title, part: combinedPart(), paragraphs: [] };
        chapters.push(currentChapter);
      } else if (BIG_PART_RE.test(title)) {
        currentBigPart = title;
        currentSubPart = undefined; // a new часть/книга starts its own глава numbering
      } else {
        currentSubPart = title;
      }
      i++;
      continue;
    }
    // <dd> or non-heading <div> paragraph marker
    if (inFrontMatter && hasAnyH4) {
      i++; // front matter before the first heading (byline, title, genre tag, epigraph) — not narrative text
      continue;
    }
    const raw = paragraphRaw(body, mk, segEnd);
    const isNote = /^(?:\s|&nbsp;)*<sup>/i.test(raw);
    const { text: rawText, ranges: rawRanges } = htmlFragmentToText(raw);
    const { text, ranges } = collapseWhitespace(rawText, rawRanges);
    if (!text) {
      i++;
      continue;
    }
    const ch = ensureChapter();
    const para = { kind: isNote ? 'note' : 'text', text };
    if (ranges.length) para.emphasis = ranges;
    ch.paragraphs.push(para);
    i++;
  }

  if (apparatusChars > 0) warnings.push(`dropped ${apparatusChars} characters of trailing scholarly apparatus (variant readings / footnote index)`);
  if (chapters.length === 0) warnings.push('no chapters parsed — check Section Begins/Ends markers and <h4>/<dd> structure');
  return { chapters, warnings };
}

// --------------------------------------------------------------- Wikisource

/**
 * Parse a Wikisource "reader" page (a collection of short tales, each an
 * <h2> heading followed by one or more <p> paragraphs) into chapters, one
 * per tale. Combining stress marks (U+0301/U+0300), present in some Azbuka
 * editions, are kept verbatim — jsdom does not touch text content.
 */
export function parseWikisourceReader(html) {
  const dom = new JSDOM(`<!doctype html><div id="root">${html}</div>`);
  const root = dom.window.document.getElementById('root');
  // strip navboxes / header-footer chrome that carry no story text
  for (const sel of ['.ws-noexport', '#headertemplate', '#ws-footer', 'table']) {
    for (const el of Array.from(root.querySelectorAll(sel))) el.remove();
  }
  const chapters = [];
  let current = null;
  // document order, any nesting depth (tale bodies are often wrapped in a
  // <div class="poem">); a page scanned from a printed edition (e.g. the
  // Third Reader) titles a tale with <div class="div-center">TITLE</div>
  // instead of an <h#>.
  for (const el of Array.from(root.querySelectorAll('h1, h2, h3, h4, div.div-center, p'))) {
    const isHeading = /^H[1-4]$/.test(el.tagName) || (el.tagName === 'DIV' && el.classList.contains('div-center'));
    if (isHeading) {
      const title = el.textContent.replace(/\s+/g, ' ').trim();
      if (!title) continue;
      if (APPARATUS_HEADING_RE.test(title)) break; // editorial apparatus (Примечания…) — not narrative text
      current = { title, paragraphs: [] };
      chapters.push(current);
      continue;
    }
    if (!current) continue; // front-matter (title block) before the first tale
    const text = el.textContent.replace(/[\t ]/g, ' ').replace(/ {2,}/g, ' ').trim();
    if (text) current.paragraphs.push({ kind: 'text', text });
  }
  const warnings = [];
  if (chapters.length === 0) warnings.push('no <h2..h4> tale headings found');
  return { chapters, warnings };
}

/** A single narrative work on Wikisource (e.g. Кавказский пленник): one <h2>-per-chapter page. */
export function parseWikisourceTale(html, fallbackTitle) {
  const { chapters, warnings } = parseWikisourceReader(html);
  if (chapters.length > 0) return { chapters, warnings };
  // no headings at all: whole page is one chapter
  const dom = new JSDOM(`<!doctype html><div id="root">${html}</div>`);
  const root = dom.window.document.getElementById('root');
  for (const sel of ['.ws-noexport', '#headertemplate', '#ws-footer', 'table']) {
    for (const el of Array.from(root.querySelectorAll(sel))) el.remove();
  }
  const paragraphs = [];
  for (const p of Array.from(root.querySelectorAll('p'))) {
    const text = p.textContent.replace(/[\t ]/g, ' ').replace(/ {2,}/g, ' ').trim();
    if (text) paragraphs.push({ kind: 'text', text });
  }
  return { chapters: paragraphs.length ? [{ title: fallbackTitle, paragraphs }] : [], warnings: ['no headings — whole page treated as one chapter'] };
}

// -------------------------------------------------------------------- misc

const WORD_RE = /[Ѐ-ӿԀ-ԯ]+(?:[-‑][Ѐ-ӿԀ-ԯ]+)*/g;

/** Word count matching the tokenizer's definition of a word (Cyrillic runs, single hyphens join). */
export function wordCount(chapters) {
  let n = 0;
  for (const ch of chapters) for (const p of ch.paragraphs) n += (p.text.match(WORD_RE) ?? []).length;
  return n;
}

export function slugFile(slug, ext) {
  return `${slug}.${ext}`;
}

// ------------------------------------------------------- English alignment

const GUTENBERG_START_RE = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
const GUTENBERG_END_RE = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;

/** Strip the Project Gutenberg boilerplate header/footer, keeping just the book text. */
export function stripGutenbergHeaderFooter(raw) {
  let text = raw;
  const s = text.match(GUTENBERG_START_RE);
  if (s) text = text.slice(s.index + s[0].length);
  const e = text.match(GUTENBERG_END_RE);
  if (e) text = text.slice(0, e.index);
  return text;
}

// "PART I", "BOOK ONE: 1805" (War and Peace spells out the number and adds a
// year range) — anchored at the start only, not required to consume the
// whole line, since the "BOOK ONE: <years>" form has more after the number.
export const EN_PART_RE = /^(PART|BOOK|VOLUME)\s+\S|^EPILOGUE\.?$|^PROLOGUE\.?$/i;
export const EN_CHAPTER_RE = /^(CHAPTER\s+)?[IVXLCDM]+\.?$/i;
// Childhood (tr. C. J. Hogarth) titles each chapter on one line, roman
// numeral + descriptive title: "I -- THE TUTOR, KARL IVANITCH". Unlike the
// other headings this one is allowed to run long, since the title itself
// can be several words.
export const EN_CHAPTER_TITLED_RE = /^[IVXLCDM]+\s+--\s+\S/i;
// An epistolary novel's letters (e.g. Poor Folk) are headed by their date
// alone on a line ("April 8th", "June 1st.") instead of a chapter number.
export const EN_DATE_HEADING_RE = /^[A-Z][a-z]+\.?\s+\d{1,2}(st|nd|rd|th)?\.?,?$/;

const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
/** Roman numeral -> integer, or null if not a valid roman numeral. */
export function romanToInt(s) {
  const str = s.replace(/[.\s]/g, '').toLowerCase();
  if (!/^[ivxlcdm]+$/.test(str)) return null;
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const cur = ROMAN_VALUES[str[i]];
    const next = ROMAN_VALUES[str[i + 1]];
    if (next && cur < next) total -= cur;
    else total += cur;
  }
  return total;
}

/**
 * Split a Gutenberg book's body text into {part, title, paragraphs[]}
 * chapters, keyed on PART/BOOK/EPILOGUE headings and CHAPTER/roman-numeral
 * or letter-date headings, each alone on its own line. Front matter
 * (title page, translator's preface, table of contents) before the first
 * such heading is dropped. When the text has no PART headings, a second
 * bundled work's own "CHAPTER I." restart (Gutenberg sometimes ships
 * several short works in one .txt) is detected — a chapter number no
 * higher than one already seen — and everything from there on is dropped,
 * keeping only the first work.
 */
export function splitEnglishChapters(text) {
  const lines = text.split(/\r?\n/);
  const hasParts = lines.some((l) => EN_PART_RE.test(l.trim()));
  const chapters = [];
  let currentPart;
  let current = null;
  let buf = [];
  let started = false;

  const flushParagraph = () => {
    if (buf.length && current) {
      const p = buf.join(' ').replace(/\s+/g, ' ').trim();
      if (p) current.paragraphs.push(p);
    }
    buf = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (EN_PART_RE.test(line)) {
      flushParagraph();
      currentPart = line;
      started = true;
      continue;
    }
    if ((line.length <= 20 && EN_CHAPTER_RE.test(line)) || (line.length <= 20 && EN_DATE_HEADING_RE.test(line)) || (line.length <= 80 && EN_CHAPTER_TITLED_RE.test(line))) {
      // bare/short roman-numeral, "CHAPTER <roman>", a letter's date line, or "I -- TITLE"
      flushParagraph();
      current = { part: hasParts ? currentPart : undefined, title: line, paragraphs: [] };
      chapters.push(current);
      started = true;
      continue;
    }
    if (!started) continue; // front matter: title page, translator's preface, table of contents
    if (line === '') {
      flushParagraph();
      continue;
    }
    if (!current) continue; // text between a PART heading and its first CHAPTER heading (rare) — ignored
    buf.push(line);
  }
  flushParagraph();
  const nonEmpty = chapters.filter((c) => c.paragraphs.length > 0);
  if (!hasParts) {
    let maxSeen = 0;
    for (let k = 0; k < nonEmpty.length; k++) {
      const n = romanToInt(nonEmpty[k].title.replace(/^CHAPTER\s+/i, ''));
      if (n === null) continue;
      if (k > 0 && n <= maxSeen && maxSeen >= 2) return nonEmpty.slice(0, k);
      maxSeen = Math.max(maxSeen, n);
    }
  }
  return nonEmpty;
}

/** Group a flat chapter list into runs by `part` (undefined counts as its own run). */
export function groupByPart(chapters) {
  const groups = [];
  for (const ch of chapters) {
    const last = groups[groups.length - 1];
    if (last && last.part === ch.part) last.items.push(ch);
    else groups.push({ part: ch.part, items: [ch] });
  }
  return groups;
}

/**
 * Align a book's Russian chapters (each `{part?, ...}`, in reading order)
 * against its split English chapters. Matches per `part` run when both
 * sides have more than one run and the run counts agree (confidence 1 for
 * every chapter); otherwise aligns the whole flat sequence position-wise.
 * Within a run, a length mismatch aligns the common prefix at confidence 1
 * and marks the remainder 0.5 (paired, but position-only) or 0 (no English
 * chapter left to pair with) — alignment is reported, never fabricated.
 * Returns `{ chapters, notes }`, `chapters[i]` corresponding to
 * `ruChapters[i]`.
 */
export function alignWork(ruChapters, enChapters) {
  const result = new Array(ruChapters.length);
  const ruGroups = groupByPart(ruChapters.map((c, i) => ({ ...c, _ruIndex: i })));
  const enGroups = groupByPart(enChapters);
  const partsUsable = ruGroups.length === enGroups.length && ruGroups.length > 1;
  const notes = [];

  function alignPair(ruItems, enItems, partNote) {
    const n = Math.min(ruItems.length, enItems.length);
    for (let k = 0; k < n; k++) {
      const ru = ruItems[k];
      result[ru._ruIndex] = { index: ru._ruIndex, paragraphs: enItems[k].paragraphs, alignment_confidence: 1 };
    }
    if (ruItems.length !== enItems.length) {
      const note = `${partNote}Russian has ${ruItems.length} chapter(s), English has ${enItems.length} — aligned the first ${n}, ${Math.max(0, ruItems.length - n)} left without a confident match.`;
      notes.push(note);
      for (let k = n; k < ruItems.length; k++) {
        const ru = ruItems[k];
        const maybeEn = enItems[k]; // may be undefined
        result[ru._ruIndex] = maybeEn
          ? { index: ru._ruIndex, paragraphs: maybeEn.paragraphs, alignment_confidence: 0.5, alignment_note: note }
          : { index: ru._ruIndex, paragraphs: [], alignment_confidence: 0, alignment_note: 'no corresponding English chapter found' };
      }
    }
  }

  if (partsUsable) {
    for (let g = 0; g < ruGroups.length; g++) alignPair(ruGroups[g].items, enGroups[g].items, `[part ${g + 1}] `);
  } else {
    alignPair(
      ruChapters.map((c, i) => ({ ...c, _ruIndex: i })),
      enChapters,
      '',
    );
  }
  return { chapters: result, notes };
}
