// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { importText, headingKind } from '../src/import/text';
import { importJson } from '../src/import/json';
import { ImportRefused } from '../src/import/types';
import { db } from '../src/database/db';
import { storeBook, deleteBook } from '../src/import/store';

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('import/text', () => {
  it('splits chapters on a "Глава I" heading and joins wrapped lines into one paragraph', () => {
    const book = importText('Глава I\n\nВ начале июля, в чрезвычайно\nжаркое время, под вечер, один\nмолодой человек вышел из своей каморки.\n\nГлава II\n\nОн был должен кругом.', { title: 'Т' });
    expect(book.chapters.length).toBe(2);
    expect(book.chapters[0]!.title).toBe('Глава I');
    expect(book.chapters[0]!.paragraphs[0]!.text).toContain('молодой человек вышел из своей каморки.');
    expect(book.chapters[1]!.title).toBe('Глава II');
  });

  it('headingKind recognizes a bare Roman numeral only between blank lines', () => {
    expect(headingKind('I', true, true)).toBe(true);
    expect(headingKind('I', false, true)).toBe(false);
    expect(headingKind('Глава первая', false, false)).toBe(true);
  });

  it('refuses text with no Cyrillic content', () => {
    expect(() => importText('Hello, world. No Russian here.')).toThrow(ImportRefused);
  });
});

describe('import/json', () => {
  it('parses a corpus with string and object paragraphs, including the "letter" kind', () => {
    const book = importJson({
      title: 'Бедные люди',
      author: 'Фёдор Достоевский',
      chapters: [{ title: 'Апреля 8-го', part: 'Часть первая', paragraphs: ['Бесценная моя Варвара Алексеевна!', { kind: 'letter', text: 'Пишу вам письмо.' }] }],
    });
    expect(book.title).toBe('Бедные люди');
    expect(book.chapters[0]!.part).toBe('Часть первая');
    expect(book.chapters[0]!.paragraphs[1]!.kind).toBe('letter');
  });

  it('refuses a corpus with no paragraphs', () => {
    expect(() => importJson({ title: 'Т', chapters: [{ title: 'I', paragraphs: [] }] })).toThrow(ImportRefused);
  });

  it('refuses malformed JSON text', () => {
    expect(() => importJson('{not valid json')).toThrow(ImportRefused);
  });
});

describe('import/store', () => {
  it('tokenizes and persists a book, keeping an Azbuka-style stress mark as source_stress and stripping it from surface_normalized/key', async () => {
    const book = importJson({ title: 'Т', chapters: [{ title: 'I', paragraphs: [{ kind: 'text', text: 'Молоко́ стоя́ло на столе́.' }] }] });
    const r = await storeBook(book);
    const tokens = await db.tokens.where('chapter_id').equals(r.chapterIds[0]!).toArray();
    const milk = tokens.find((t) => t.key === 'молоко');
    expect(milk).toBeTruthy();
    expect(milk!.surface_normalized).toBe('Молоко');
    expect(milk!.surface_original).toBe('Молоко́');
    expect(milk!.source_stress).toBe(5); // 0-indexed М(0)о(1)л(2)о(3)к(4)о(5) — stress falls on the final о
    expect(r.tokenCount).toBeGreaterThan(0);
  });

  it('refuses a duplicate import of the same normalized text', async () => {
    const book = importJson({ title: 'Т', chapters: [{ title: 'I', paragraphs: ['Однажды в студёную зимнюю пору.'] }] });
    await storeBook(book);
    await expect(storeBook(book)).rejects.toThrow(ImportRefused);
  });

  it('deleteBook removes its books/chapters/paragraphs/sentences/tokens', async () => {
    const book = importJson({ title: 'Т', chapters: [{ title: 'I', paragraphs: ['Однажды в студёную зимнюю пору я из лесу вышел.'] }] });
    const r = await storeBook(book);
    await deleteBook(r.bookId);
    expect(await db.books.get(r.bookId)).toBeUndefined();
    expect((await db.tokens.where('book_id').equals(r.bookId).toArray()).length).toBe(0);
  });
});
