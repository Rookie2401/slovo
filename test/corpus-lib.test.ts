import { describe, expect, it } from 'vitest';
import {
  collapseWhitespace,
  htmlFragmentToText,
  parseLibruWork,
  parseWikisourceReader,
  wordCount,
} from '../scripts/corpus-lib.mjs';

// ----------------------------------------------------- collapseWhitespace

describe('collapseWhitespace', () => {
  it('collapses runs of whitespace/nbsp to a single space and trims', () => {
    const { text } = collapseWhitespace('   Привет,   мир!\n\n  ');
    expect(text).toBe('Привет, мир!');
  });

  it('remaps emphasis ranges through the collapse', () => {
    const raw = '  один   два  три  ';
    const ranges = [{ start: raw.indexOf('два'), end: raw.indexOf('два') + 3, kind: 'em' as const }];
    const { text, ranges: out } = collapseWhitespace(raw, ranges);
    expect(text).toBe('один два три');
    expect(text.slice(out[0]!.start, out[0]!.end)).toBe('два');
  });

  it('drops a range that collapses to zero width', () => {
    const raw = 'аб';
    const { ranges } = collapseWhitespace(raw, [{ start: 1, end: 1, kind: 'em' as const }]);
    expect(ranges).toEqual([]);
  });
});

// ----------------------------------------------------- htmlFragmentToText

describe('htmlFragmentToText', () => {
  it('strips tags, decodes entities, keeps &mdash; and numeric refs', () => {
    const { text } = htmlFragmentToText('Он сказал: &laquo;&#233;t&#233;&raquo; &mdash; и ушёл.');
    expect(text).toBe('Он сказал: «été» — и ушёл.');
  });

  it('records <i> and <b> as emphasis ranges', () => {
    const { text, ranges } = htmlFragmentToText('обычный <i>курсив</i> и <b>жирный</b> текст');
    expect(text).toBe('обычный курсив и жирный текст');
    const em = ranges.find((r) => r.kind === 'em')!;
    expect(text.slice(em.start, em.end)).toBe('курсив');
    const strong = ranges.find((r) => r.kind === 'strong')!;
    expect(text.slice(strong.start, strong.end)).toBe('жирный');
  });

  it('drops the content of <sup> (footnote call numbers)', () => {
    const { text } = htmlFragmentToText('Ich danke, <sup>1</sup> сказала она');
    expect(text).toBe('Ich danke,  сказала она');
    expect(text).not.toContain('1');
  });
});

// -------------------------------------------------------------- lib.ru

/** A minimal lib.ru page shaped like the real templates seen in this corpus. */
function libruPage(bodyHtml: string): string {
  return `<html><body><center><h2>Lib.ru</h2></center>
<!--Section Begins--><br>
<dd>&nbsp;&nbsp; <b>Автор Авторов</b>
<h4><div align="center" ><p ><b>Заглавие</b></p></div></h4>
${bodyHtml}
<!--Section Ends-->
</body></html>`;
}

describe('parseLibruWork — chapters, parts and footnotes', () => {
  it('skips the crown title/byline/genre tag and splits on Часть/roman-numeral headings', () => {
    const html = libruPage(`
<h4><div align="center" ><p ><b>Часть первая</b></p></div></h4>
<h4><div align="center" ><p ><b>I</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Первый абзац первой главы.
<dd>&nbsp;&nbsp;&nbsp;Второй абзац.
<h4><div align="center" ><p ><b>II</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Глава вторая начинается тут.
<h4><div align="center" ><p ><b>Часть вторая</b></p></div></h4>
<h4><div align="center" ><p ><b>I</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Снова первая глава, но уже второй части.
`);
    const { chapters, warnings } = parseLibruWork(html, { fallbackTitle: 'Заглавие' });
    expect(warnings).toEqual([]);
    expect(chapters).toHaveLength(3);
    expect(chapters[0]).toMatchObject({ title: 'I', part: 'Часть первая' });
    expect(chapters[0]!.paragraphs.map((p: { text: string }) => p.text)).toEqual(['Первый абзац первой главы.', 'Второй абзац.']);
    expect(chapters[1]).toMatchObject({ title: 'II', part: 'Часть первая' });
    expect(chapters[2]).toMatchObject({ title: 'I', part: 'Часть вторая' });
  });

  it('drops a subtitle/genre-tag div between the crown title and the first real heading (Crime and Punishment shape)', () => {
    const html = libruPage(`
<div align="center" ><p ><i>Роман в шести частях с эпилогом</i></p></div>
<h4><div align="center" ><p ><b>Часть первая</b></p></div></h4>
<h4><div align="center" ><p ><b>I</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Первый абзац.
`);
    const { chapters } = parseLibruWork(html, { fallbackTitle: 'X' });
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ title: 'I', part: 'Часть первая' });
    const allText = chapters.flatMap((c: { paragraphs: Array<{ text: string }> }) => c.paragraphs.map((p) => p.text)).join(' ');
    expect(allText).not.toContain('шести частях');
  });

  it('creates an implicit single chapter for a work with no headings', () => {
    const html = libruPage(`
<dd>&nbsp;&nbsp;&nbsp;Короткий рассказ без глав.
<dd>&nbsp;&nbsp;&nbsp;Второй и последний абзац.
`);
    const { chapters } = parseLibruWork(html, { fallbackTitle: 'Короткий рассказ' });
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toBe('Короткий рассказ');
    expect(chapters[0]!.part).toBeUndefined();
    expect(chapters[0]!.paragraphs).toHaveLength(2);
  });

  it('turns a footnote definition into a kind:"note" paragraph right after its reference, and drops the inline call number', () => {
    const html = libruPage(`
<h4><div align="center" ><p ><b>I</b></p></div></h4>
<dd>&nbsp;&nbsp; -- Ich danke, <sup>1</sup> -- сказала она и села.
<dd>&nbsp;&nbsp;
<dd>&nbsp;&nbsp; <sup>1</sup> <i>Благодарю (нем.).</i>
<dd>&nbsp;&nbsp;Обычный абзац после сноски.
`);
    const { chapters } = parseLibruWork(html, { fallbackTitle: 'X' });
    const paras = chapters[0]!.paragraphs;
    expect(paras[0]).toMatchObject({ kind: 'text' });
    expect(paras[0]!.text).not.toContain('1'); // call number dropped from running text
    expect(paras[0]!.text).toContain('Ich danke');
    expect(paras[1]).toMatchObject({ kind: 'note', text: 'Благодарю (нем.).' });
    expect(paras[2]).toMatchObject({ kind: 'text', text: 'Обычный абзац после сноски.' });
  });

  it('stops at trailing scholarly apparatus (Примечания/Сноски/Варианты) and never emits it as a chapter', () => {
    const html = libruPage(`
<h4><div align="center" ><p ><b>I</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Настоящий текст произведения.
<h4><div align="center" ><p ><b>Примечания</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;1. Пояснение редактора, не являющееся текстом произведения.
`);
    const { chapters, warnings } = parseLibruWork(html, { fallbackTitle: 'X' });
    expect(chapters).toHaveLength(1);
    expect(chapters.some((c: { title: string }) => /примечани/i.test(c.title))).toBe(false);
    const allText = chapters.flatMap((c: { paragraphs: Array<{ text: string }> }) => c.paragraphs.map((p) => p.text)).join(' ');
    expect(allText).not.toContain('Пояснение редактора');
    expect(warnings.some((w: string) => w.includes('apparatus'))).toBe(true);
  });

  it('drops a textual-variants apparatus with no apparatus-vocabulary heading, once a "Стр. N, строка N." line is found (Война и мир shape)', () => {
    const html = libruPage(`
<h4><div align="center" ><p ><b>Часть первая</b></p></div></h4>
<h4><div align="center" ><p ><b>I</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Настоящий текст первой главы романа.
<h4><div align="center" ><p ><b>II</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Настоящий текст второй главы романа.
<h4><div align="center" ><p ><b>ТОМ ПЕРВЫЙ</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Разночтения между текстом романа, напечатанного в собрании сочинений, и рукописными редакциями.
<dd>&nbsp;&nbsp;&nbsp;Стр. 3, строка 6. Вместо: она сказала — она произнесла.
<dd>&nbsp;&nbsp;&nbsp;Стр. 4, строка 1. Вместо: он ответил — он сказал.
`);
    const { chapters, warnings } = parseLibruWork(html, { fallbackTitle: 'X' });
    expect(chapters).toHaveLength(2);
    expect(chapters.map((c: { title: string }) => c.title)).toEqual(['I', 'II']);
    const allText = chapters.flatMap((c: { paragraphs: Array<{ text: string }> }) => c.paragraphs.map((p) => p.text)).join(' ');
    expect(allText).not.toContain('Разночтения');
    expect(allText).not.toContain('Стр.');
    expect(warnings.some((w: string) => w.includes('apparatus'))).toBe(true);
  });

  it('records emphasis ranges and preserves lib.ru -- dashes and quotes verbatim', () => {
    const html = libruPage(`
<h4><div align="center" ><p ><b>I</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;-- Кто здесь? -- спросил он, читая <i>"Записки"</i> у окна.
`);
    const { chapters } = parseLibruWork(html, { fallbackTitle: 'X' });
    const p = chapters[0]!.paragraphs[0]!;
    expect(p.text).toBe('-- Кто здесь? -- спросил он, читая "Записки" у окна.');
    expect(p.emphasis).toBeDefined();
    const [em] = p.emphasis!;
    expect(p.text.slice(em!.start, em!.end)).toBe('"Записки"');
  });

  it('joins a часть + separate глава container into one `part` string (Подросток-style triple nesting)', () => {
    const html = libruPage(`
<h4><div align="center" ><p ><b>* ЧАСТЬ ПЕРВАЯ *</b></p></div></h4>
<h4><div align="center" ><p ><b>Глава первая</b></p></div></h4>
<h4><div align="center" ><p ><b>I.</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Текст первой главы.
<h4><div align="center" ><p ><b>Глава вторая</b></p></div></h4>
<h4><div align="center" ><p ><b>I.</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Текст, начинающий вторую главу.
`);
    const { chapters } = parseLibruWork(html, { fallbackTitle: 'X' });
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.part).toBe('* ЧАСТЬ ПЕРВАЯ * — Глава первая');
    expect(chapters[1]!.part).toBe('* ЧАСТЬ ПЕРВАЯ * — Глава вторая');
  });

  it('treats a right-aligned dated <div> as a heading (epistolary novels), each letter its own chapter', () => {
    const html = libruPage(`
<div align="right" ><p >Апреля 8.</p></div>
<dd>&nbsp;&nbsp;&nbsp;Бесценная моя Варвара Алексеевна!
<div align="right" ><p >Макаром Девушкиным.</p></div>
<div align="right" ><p >Апреля 9.</p></div>
<dd>&nbsp;&nbsp;&nbsp;Ответное письмо.
`);
    const { chapters } = parseLibruWork(html, { fallbackTitle: 'X' });
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe('Апреля 8.');
    // the signature line is kept as ordinary text, not mistaken for a heading
    expect(chapters[0]!.paragraphs.map((p: { text: string }) => p.text)).toContain('Макаром Девушкиным.');
    expect(chapters[1]!.title).toBe('Апреля 9.');
  });

  it('does not misread a table cell (e.g. a cipher table) as a chapter heading', () => {
    const html = libruPage(`
<h4><div align="center" ><p ><b>I</b></p></div></h4>
<dd>&nbsp;&nbsp;&nbsp;Перед таблицей.
<table><tr><td><div align="center"><p>d</p></div></td><td><div align="center"><p>4</p></div></td></tr></table>
<dd>&nbsp;&nbsp;&nbsp;После таблицы.
`);
    const { chapters } = parseLibruWork(html, { fallbackTitle: 'X' });
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.paragraphs.map((p: { text: string }) => p.text)).toEqual(['Перед таблицей.', 'После таблицы.']);
  });
});

// ------------------------------------------------------------ Wikisource

describe('parseWikisourceReader', () => {
  it('splits a reader page into one chapter per <h2> tale, keeping combining stress marks', () => {
    const html = `<div class="ws-noexport">chrome, not story</div>
<h2>МУРАВЕЙ И ГОЛУБКА (Басня)</h2>
<p>Мурaве́й спусти́лся к ручью́: захоте́л напи́ться.</p>
<h2>СЛЕПОЙ И ГЛУХОЙ (Быль)</h2>
<p>Слепой и глухой пошли в чужое поле.</p>`;
    const { chapters, warnings } = parseWikisourceReader(html);
    expect(warnings).toEqual([]);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe('МУРАВЕЙ И ГОЛУБКА (Басня)');
    expect(chapters[0]!.paragraphs[0]!.text).toContain('́'); // combining acute preserved
  });

  it('stops at trailing apparatus (Примечания)', () => {
    const html = `<h2>СКАЗКА</h2><p>Текст сказки.</p><h2>Примечания</h2><p>Комментарий редактора.</p>`;
    const { chapters } = parseWikisourceReader(html);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toBe('СКАЗКА');
  });

  it('reads a title from <div class="div-center"> when no heading tag is used (scanned-page template)', () => {
    const html = `<p>вводный текст перед первым разделом, отбрасывается</p>
<div class="div-center">ВОЛЬГА-БОГАТЫРЬ</div>
<div class="poem"><p>Стихи сказки.</p></div>`;
    const { chapters } = parseWikisourceReader(html);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toBe('ВОЛЬГА-БОГАТЫРЬ');
    expect(chapters[0]!.paragraphs[0]!.text).toBe('Стихи сказки.');
  });
});

// -------------------------------------------------------------- wordCount

describe('wordCount', () => {
  it('counts Cyrillic word runs, joining single hyphens into one word', () => {
    const chapters = [{ paragraphs: [{ text: 'Кто-то сказал что-то, а он — нет.' }] }];
    // Кто-то, сказал, что-то, а, он, нет = 6
    expect(wordCount(chapters)).toBe(6);
  });
});
