import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { looseKey as tsLooseKey, normalize as tsNormalize, tokenize } from '../src/tokenizer/cyrillic';
import type { DictLexeme } from '../src/dictionary/types';
import {
  looseKey,
  normalize,
  extractWordSurfaces,
  splitAccent,
  withAcute,
  parseTsv,
  splitAlternatives,
  splitSenses,
  classifyOther,
  makeIdAssigner,
  lookupRank,
  parseRu50k,
  shardLetter,
  foldedPrefix,
  lemmaOfLexemeId,
  groupAndSplit,
  resolveShardName,
  applyOverrides,
} from '../scripts/dict-lib.mjs';
import { splitAccent as tsSplitAccent, withAcute as tsWithAcute } from '../src/dictionary/accent';

const FIXTURES = [
  'В начале июля, в чрезвычайно жаркое время, под вечер, один молодой человек вышел из своей каморки.',
  'Кто-то что-то сказал по-моему из-за угла в Санкт-Петербурге.',
  '-- Раскольников, студент, -- поспешил он. Гм... да... всё -- игрушки!',
  'Eh bien, mon prince. Genes et Lucques — 1805 год.',
  'Он был должен кругом хозяйке и боялся с нею встретиться. Пуга́ло стоя́ло в саду́, а ёж и объ­явле́ние — рядом.',
  'Съешь ещё этих мягких французских булок, да выпей же чаю; тётя приѣхала изъ Москвы.',
];

describe('dict-lib mirrors the TS tokenizer', () => {
  it('looseKey matches src/tokenizer/cyrillic.ts looseKey on every word token of every fixture', () => {
    for (const text of FIXTURES) {
      for (const tok of tokenize(text)) {
        if (tok.kind !== 'word') continue;
        expect(looseKey(tok.text)).toBe(tsLooseKey(tok.text));
      }
    }
  });

  it('normalize matches the TS normalize()', () => {
    for (const text of FIXTURES) {
      expect(normalize(text)).toBe(tsNormalize(text));
    }
  });

  it('extractWordSurfaces produces exactly the word-token texts tokenize() would (same segmentation, incl. hyphens)', () => {
    for (const text of FIXTURES) {
      const expected = tokenize(text)
        .filter((t) => t.kind === 'word')
        .map((t) => t.text);
      expect(extractWordSurfaces(text)).toEqual(expected);
    }
  });

  it('looseKey folds ё, pre-reform letters and drops a bare final hard sign, like the TS version', () => {
    for (const w of ['ёж', 'объявле́ние', 'тётя', 'пришёл', 'приѣхала', 'мѣсто', 'ѳома', 'обѣдъ', 'съ', 'домъ']) {
      expect(looseKey(w)).toBe(tsLooseKey(w));
    }
  });
});

describe('accent helpers mirror src/dictionary/accent.ts', () => {
  const words = ["челове'к", "сказа'ть", 'тот', "лю'ди", "люде'й", "то'т, того'".split(', ')[0]!, 'как'];
  it('splitAccent matches the TS implementation', () => {
    for (const w of words) expect(splitAccent(w)).toEqual(tsSplitAccent(w));
  });
  it('withAcute matches the TS implementation', () => {
    for (const w of words) {
      const { plain, stress } = splitAccent(w);
      expect(withAcute(plain, stress)).toBe(tsWithAcute(plain, stress));
    }
  });
  it('splitAccent: apostrophe after the stressed vowel', () => {
    expect(splitAccent("челове'к")).toEqual({ plain: 'человек', stress: 5 });
  });
  it('splitAccent: no mark -> stress -1', () => {
    expect(splitAccent('кот')).toEqual({ plain: 'кот', stress: -1 });
  });
  it('withAcute places a combining acute right after the stressed vowel', () => {
    expect(withAcute('человек', 5)).toBe('челове́к');
  });
});

describe('parseTsv', () => {
  it('parses a tab-separated fixture with a header row', () => {
    const text = 'bare\taccented\ttranslations_en\ngod\tго\'д\tyear\ncat\tко\'т\tcat; tomcat';
    const { header, rows } = parseTsv(text);
    expect(header).toEqual(['bare', 'accented', 'translations_en']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ bare: 'god', accented: "го'д", translations_en: 'year' });
  });

  it('pads missing trailing columns with empty string', () => {
    const text = 'a\tb\tc\nx\ty';
    const { rows } = parseTsv(text);
    expect(rows[0]).toEqual({ a: 'x', b: 'y', c: '' });
  });
});

describe('splitAlternatives / splitSenses', () => {
  it('splits comma-separated paradigm alternatives', () => {
    expect(splitAlternatives("то'т, того'")).toEqual(["то'т", "того'"]);
  });
  it('splits senses on ";" and keeps commas inside a sense', () => {
    expect(splitSenses('person, people; man')).toEqual(['person, people', 'man']);
  });
  it('handles empty cells', () => {
    expect(splitAlternatives('')).toEqual([]);
    expect(splitSenses('')).toEqual([]);
  });
});

describe('classifyOther', () => {
  it('classifies closed-class words from the tables', () => {
    expect(classifyOther('в')).toMatchObject({ pos: 'preposition' });
    expect(classifyOther('чтобы')).toMatchObject({ pos: 'conjunction' });
    expect(classifyOther('надо')).toMatchObject({ pos: 'predicative' });
    expect(classifyOther('два')).toMatchObject({ pos: 'numeral' });
    expect(classifyOther('не')).toMatchObject({ pos: 'particle' });
    expect(classifyOther('не').guessed).toBeUndefined();
  });

  it('keeps the personal/interrogative pronoun nominative lemmas as pronoun', () => {
    for (const w of ['я', 'ты', 'он', 'она', 'оно', 'мы', 'вы', 'они', 'себя', 'кто', 'что']) {
      expect(classifyOther(w)).toMatchObject({ pos: 'pronoun' });
    }
  });

  it('skips inflected case-form rows of the personal pronouns', () => {
    for (const w of ['меня', 'ему', 'её', 'нас', 'вам', 'их']) {
      expect(classifyOther(w)).toEqual({ skip: true });
    }
  });

  it('falls back to adverb for -о/-е/-и/-ски endings, else particle, and marks both as guessed', () => {
    expect(classifyOther('быстро')).toMatchObject({ pos: 'adverb', guessed: true });
    expect(classifyOther('дружески')).toMatchObject({ pos: 'adverb', guessed: true });
    expect(classifyOther('вдруг')).toMatchObject({ pos: 'particle', guessed: true, note: 'pos guessed' });
  });
});

describe('makeIdAssigner', () => {
  it('assigns pos:lemma ids and suffixes homographs #2, #3…', () => {
    const assign = makeIdAssigner();
    expect(assign('noun', 'замок')).toBe('noun:замок');
    expect(assign('noun', 'банка')).toBe('noun:банка');
    expect(assign('noun', 'замок')).toBe('noun:замок#2');
    expect(assign('noun', 'замок')).toBe('noun:замок#3');
  });
});

describe('lookupRank / parseRu50k', () => {
  const rankMap = parseRu50k('я 100\nне 90\nчто 80\nёж 5');
  it('ranks are the line number', () => {
    expect(lookupRank(rankMap, 'я')).toBe(1);
    expect(lookupRank(rankMap, 'не')).toBe(2);
    expect(lookupRank(rankMap, 'что')).toBe(3);
  });
  it('retries with ё->е when the exact lemma is missing', () => {
    const map = parseRu50k('ежик 7\nдругое 8');
    expect(lookupRank(map, 'ёжик')).toBe(1);
  });
  it('returns undefined for an unranked lemma', () => {
    expect(lookupRank(rankMap, 'вообщенеслово')).toBeUndefined();
  });
});

describe('shard naming', () => {
  it('shardLetter folds ё and pre-reform letters, non-letters -> "_"', () => {
    expect(shardLetter('ё')).toBe('е');
    expect(shardLetter('Ё')).toBe('е');
    expect(shardLetter('ѣ')).toBe('е');
    expect(shardLetter('1')).toBe('_');
    expect(shardLetter('')).toBe('_');
  });

  it('foldedPrefix folds each letter of a prefix', () => {
    expect(foldedPrefix('ёжик', 2)).toBe('еж');
    expect(foldedPrefix('пере', 4)).toBe('пере');
  });

  it('lemmaOfLexemeId strips the pos prefix and a homograph suffix', () => {
    expect(lemmaOfLexemeId('noun:замок')).toBe('замок');
    expect(lemmaOfLexemeId('noun:замок#2')).toBe('замок');
    expect(lemmaOfLexemeId('verb:говорить')).toBe('говорить');
  });

  it('groupAndSplit keeps shards under the byte budget by splitting on longer folded prefixes, and resolveShardName finds the same shard from a key', () => {
    // 200 keys all sharing the 4-letter prefix "пере" (so the single-letter
    // group is forced to split), but diverging within the next two letters
    // (enough distinct combinations that a depth-6 fold can actually separate
    // them) — a fat payload keeps each letter-group over the tiny test budget.
    const letters = 'абвгдежзиклмнопрстуфхцчшщ'.split('');
    const entries: Array<[string, unknown]> = [];
    for (let i = 0; i < 200; i++) {
      const c1 = letters[i % letters.length]!;
      const c2 = letters[Math.floor(i / letters.length) % letters.length]!;
      const key = `пере${c1}${c2}ключить${i}`;
      entries.push([key, { pad: 'x'.repeat(400) }]);
    }
    const shards = groupAndSplit(
      entries,
      (key) => shardLetter(key[0] ?? '_'),
      (key, depth) => foldedPrefix(key, depth),
      4000, // tiny budget on purpose, to force splitting in a fast test
    );
    for (const [, group] of shards) {
      const size = group.reduce((n: number, [k, v]: [string, unknown]) => n + Buffer.byteLength(k, 'utf8') + Buffer.byteLength(JSON.stringify(v), 'utf8') + 4, 2);
      expect(size).toBeLessThanOrEqual(4000);
    }
    const known: Record<string, string> = {};
    for (const name of shards.keys()) known[name] = `${name}.json`;
    for (const [key] of entries) {
      const resolved = resolveShardName(key, known);
      expect(resolved).toBeDefined();
      const group = shards.get(resolved!)!;
      expect(group.some(([k]: [string, unknown]) => k === key)).toBe(true);
    }
  });

  it('resolveShardName falls back to the bare first letter when nothing more specific was written', () => {
    expect(resolveShardName('привет', { п: 'п.json' })).toBe('п');
  });

  it('groupAndSplit sizes by real UTF-8 bytes, not JS string .length (regression: Cyrillic is 2 bytes/char in UTF-8 — a .length-based estimate under-counts by ~2x and silently ships oversized shards)', () => {
    const filler = 'привет'.repeat(30); // length 180 (UTF-16 code units); UTF-8 encoding is 2x that
    const entries: Array<[string, unknown]> = [
      ['ав', filler], // same first letter 'а' as the next entry, different second letter
      ['аг', filler],
    ];
    // By .length: 2 * (2 + 182 + 4) + 2 = 378 (fits under 500 -> old code would NOT split).
    // By real UTF-8 bytes: 2 * (4 + 362 + 4) + 2 = 742 (over 500 -> must split).
    const budget = 500;
    const shards = groupAndSplit(entries, (key) => shardLetter(key[0] ?? '_'), (key, depth) => foldedPrefix(key, depth), budget);
    // Byte-accurate sizing forces a split into the two depth-2 shards ("ав" / "аг");
    // a .length-based bug would have left both entries in one "а" shard (size 1).
    expect(shards.size).toBe(2);
    expect(new Set(shards.keys())).toEqual(new Set(['ав', 'аг']));
  });
});

describe('applyOverrides (data/curated/dict-overrides.json)', () => {
  function fixture() {
    const prisluga: DictLexeme = { id: 'noun:прислуга', lemma: 'прислуга', acc: 'прислуга', pos: 'noun', gender: 'm', gloss: 'servants (collectively)', senses: ['servants (collectively)'] };
    const kak: DictLexeme = { id: 'adjective:как', lemma: 'как', acc: 'как', pos: 'adjective', gloss: 'how', senses: ['how'] };
    const kot: DictLexeme = { id: 'noun:кот', lemma: 'кот', acc: 'ко́т', pos: 'noun', gender: 'm', gloss: 'cat', senses: ['cat'] };
    const lexemes = [prisluga, kak, kot];
    const lexemeById = new Map([
      ['noun:прислуга', prisluga],
      ['adjective:как', kak],
      ['noun:кот', kot],
    ]);
    const idsByPosLemma = new Map([
      ['noun:прислуга', ['noun:прислуга']],
      ['adjective:как', ['adjective:как']],
      ['noun:кот', ['noun:кот']],
    ]);
    return { prisluga, kak, kot, lexemes, lexemeById, idsByPosLemma };
  }

  it('patches a field on the matching lexeme and changes the BUILT entry in place', () => {
    const { prisluga, lexemes, lexemeById, idsByPosLemma } = fixture();
    const applied = applyOverrides({
      lexemes,
      lexemeById,
      idsByPosLemma,
      overrides: { 'noun:прислуга': { gender: 'f', why: 'feminine noun, -а, refers to the servants collectively' } },
    });
    expect(applied).toBe(1);
    expect(prisluga.gender).toBe('f'); // the same object in `lexemes`/`lexemeById` was mutated
    expect(lexemeById.get('noun:прислуга')!.gender).toBe('f');
  });

  it('drop:true removes the lexeme from lexemes[], lexemeById, and idsByPosLemma, leaving other lexemes untouched', () => {
    const { kak, kot, lexemes, lexemeById, idsByPosLemma } = fixture();
    const applied = applyOverrides({
      lexemes,
      lexemeById,
      idsByPosLemma,
      overrides: { 'adjective:как': { drop: true, why: 'conjunction/adverb, not an adjective' } },
    });
    expect(applied).toBe(1);
    expect(lexemes).not.toContain(kak);
    expect(lexemeById.has('adjective:как')).toBe(false);
    expect(idsByPosLemma.get('adjective:как')).toEqual([]);
    // untouched
    expect(lexemes).toContain(kot);
    expect(lexemeById.get('noun:кот')).toBe(kot);
  });

  it('an override for an unknown id is reported via onUnknownId, not counted, and does not throw', () => {
    const { lexemes, lexemeById, idsByPosLemma } = fixture();
    const reported: Array<[string, string]> = [];
    const applied = applyOverrides({
      lexemes,
      lexemeById,
      idsByPosLemma,
      overrides: { 'noun:несуществующее': { gender: 'f', why: 'stale override' } },
      onUnknownId: (id: string, patch: { why: string }) => reported.push([id, patch.why]),
    });
    expect(applied).toBe(0);
    expect(reported).toEqual([['noun:несуществующее', 'stale override']]);
  });

  it('the checked-in data/curated/dict-overrides.json applies end-to-end (прислуга -> feminine, как/наверху/замужем dropped)', () => {
    const overrides = JSON.parse(readFileSync(new URL('../data/curated/dict-overrides.json', import.meta.url), 'utf8'));
    const prisluga: DictLexeme = { id: 'noun:прислуга', lemma: 'прислуга', acc: 'прислуга', pos: 'noun', gender: 'm', gloss: 'servants', senses: ['servants'] };
    const kak: DictLexeme = { id: 'adjective:как', lemma: 'как', acc: 'как', pos: 'adjective', gloss: 'how', senses: ['how'] };
    const naverhu: DictLexeme = { id: 'adjective:наверху', lemma: 'наверху', acc: 'наверху', pos: 'adjective', gloss: 'upstairs', senses: ['upstairs'] };
    const zamuzhem: DictLexeme = { id: 'adjective:замужем', lemma: 'замужем', acc: 'замужем', pos: 'adjective', gloss: 'married', senses: ['married'] };
    const lexemes: DictLexeme[] = [prisluga, kak, naverhu, zamuzhem];
    const lexemeById = new Map<string, DictLexeme>(lexemes.map((l) => [l.id, l]));
    const idsByPosLemma = new Map<string, string[]>(lexemes.map((l) => [`${l.pos}:${l.lemma}`, [l.id]]));

    const applied = applyOverrides({ lexemes, lexemeById, idsByPosLemma, overrides });

    expect(applied).toBe(4);
    expect(prisluga.gender).toBe('f');
    expect(lexemes).toEqual([prisluga]); // как, наверху, замужем all dropped
  });
});
