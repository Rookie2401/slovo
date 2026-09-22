import { describe, expect, it } from 'vitest';
import { isPreReform, lettersOf, looseKey, normalize, sentenceRanges, sourceStressIndex, syllableCount, tokenize } from '../src/tokenizer/cyrillic';

describe('tokenize', () => {
  it('splits words, punctuation, numbers and Latin', () => {
    const t = tokenize('В начале июля, в чрезвычайно жаркое время, под вечер, один молодой человек вышел из своей каморки.');
    const words = t.filter((x) => x.kind === 'word').map((x) => x.text);
    expect(words.slice(0, 4)).toEqual(['В', 'начале', 'июля', 'в']);
    expect(t.filter((x) => x.kind === 'punct').map((x) => x.text)).toEqual([',', ',', ',', '.']);
    expect(t[t.length - 1]).toMatchObject({ kind: 'punct', text: '.' });
  });

  it('keeps hyphenated words as one token with parts', () => {
    const t = tokenize('Кто-то что-то сказал по-моему из-за угла в Санкт-Петербурге.');
    const words = t.filter((x) => x.kind === 'word');
    expect(words.map((x) => x.text)).toEqual(['Кто-то', 'что-то', 'сказал', 'по-моему', 'из-за', 'угла', 'в', 'Санкт-Петербурге']);
    expect(words[0]!.parts).toEqual(['Кто', 'то']);
    expect(words[2]!.parts).toBeUndefined();
  });

  it('treats lib.ru double hyphens and spaced dashes as punctuation', () => {
    const t = tokenize('-- Раскольников, студент, -- поспешил он. Гм... да... всё -- игрушки!');
    expect(t[0]).toMatchObject({ kind: 'punct', text: '--' });
    expect(t.filter((x) => x.kind === 'punct').map((x) => x.text)).toContain('...');
    expect(t.find((x) => x.text === 'всё')).toBeDefined();
  });

  it('keeps French as latin tokens and digits as numbers', () => {
    const t = tokenize('Eh bien, mon prince. Genes et Lucques — 1805 год.');
    expect(t.filter((x) => x.kind === 'latin').map((x) => x.text)).toEqual(['Eh', 'bien', 'mon', 'prince', 'Genes', 'et', 'Lucques']);
    expect(t.find((x) => x.kind === 'number')?.text).toBe('1805');
    expect(t.find((x) => x.text === '—')?.kind).toBe('punct');
  });

  it('offsets reproduce the source', () => {
    const src = 'Он был должен кругом хозяйке и боялся с нею встретиться.';
    for (const tok of tokenize(src)) expect(src.slice(tok.start, tok.end)).toBe(tok.text);
  });

  it('keeps lib.ru-style Latin accented vowels and precomposed ѐ inside a word, as source stress', () => {
    const t = tokenize('Чтò же, бòльшая часть, voilà — гдѐ он?');
    const words = t.filter((x) => x.kind === 'word').map((x) => x.text);
    expect(words).toEqual(['Чтò', 'же', 'бòльшая', 'часть', 'гдѐ', 'он']);
    expect(t.find((x) => x.kind === 'latin')?.text).toBe('voilà');
    expect(normalize('Чтò')).toBe('Что');
    expect(sourceStressIndex('Чтò')).toBe(2);
    expect(normalize('бòльшая')).toBe('большая');
    expect(sourceStressIndex('бòльшая')).toBe(1);
    expect(normalize('гдѐ')).toBe('где');
    expect(sourceStressIndex('гдѐ')).toBe(2);
    expect(looseKey('Чтò')).toBe('что');
  });

  it('keeps combining stress marks inside a word token', () => {
    const src = 'Фили́пок пошёл в шко́лу.';
    const words = tokenize(src).filter((x) => x.kind === 'word');
    expect(words.map((x) => x.text)).toEqual(['Фили́пок', 'пошёл', 'в', 'шко́лу']);
    expect(sourceStressIndex(words[0]!.text)).toBe(3);
    expect(normalize(words[0]!.text)).toBe('Филипок');
    expect(sourceStressIndex('пошёл')).toBe(-1);
  });
});

describe('keys', () => {
  it('folds ё, case and pre-reform letters', () => {
    expect(looseKey('Всё')).toBe('все');
    expect(looseKey('ещё')).toBe('еще');
    expect(looseKey('міръ')).toBe('мир');
    expect(looseKey('вѣра')).toBe('вера');
    expect(looseKey('Ѳедоръ')).toBe('федор');
    expect(looseKey('объ')).toBe('об');
    expect(looseKey('семья')).toBe('семья');
    expect(looseKey('подъезд')).toBe('подъезд');
  });
  it('detects pre-reform spelling', () => {
    expect(isPreReform('міръ')).toBe(true);
    expect(isPreReform('мир')).toBe(false);
    expect(isPreReform('подъезд')).toBe(false);
  });
  it('letters and syllables', () => {
    expect(lettersOf('Кто-то').map((l) => l.lower)).toEqual(['к', 'т', 'о', 'т', 'о']);
    expect(syllableCount('преступление')).toBe(5);
    expect(syllableCount('в')).toBe(0);
  });
});

describe('sentenceRanges', () => {
  it('splits at terminal punctuation before a capital', () => {
    const t = tokenize('Он вышел. Было жарко! Куда идти? Никуда...');
    const r = sentenceRanges(t);
    expect(r.length).toBe(4);
    expect(t.slice(r[0]![0], r[0]![1]).map((x) => x.text).join(' ')).toBe('Он вышел .');
  });
  it('does not split an ellipsis followed by lower case, and handles closing quotes', () => {
    const t = tokenize('"Гм... да... всё в руках человека", -- подумал он. Ну зачем?');
    const r = sentenceRanges(t);
    expect(r.length).toBe(2);
    expect(t.slice(r[1]![0], r[1]![1]).map((x) => x.text)).toEqual(['Ну', 'зачем', '?']);
  });
  it('splits before a dialogue dash', () => {
    const t = tokenize('-- Это вы? -- спросил он. -- Да.');
    const r = sentenceRanges(t);
    expect(r.length).toBe(3);
  });
});
