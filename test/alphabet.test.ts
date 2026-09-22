import { describe, expect, it } from 'vitest';
import { ALL_LETTERS, ALL_SYMBOLS, CONSONANTS, PRE_REFORM, symbolInfo, VOWELS } from '../src/alphabet/inventory';
import { STAGES, stageOf, symbolsForLevel } from '../src/alphabet/curriculum';
import { decodability } from '../src/alphabet/decodability';
import { contrast, CONTRAST_PAIRS, soundToSymbol, symbolToSound, syllable, word as wordDrill } from '../src/alphabet/drills';

describe('alphabet inventory', () => {
  it('has exactly the 33 modern letters', () => {
    expect(ALL_LETTERS.length).toBe(33);
    expect(VOWELS.length).toBe(10);
    expect(CONSONANTS.length).toBe(21);
  });
  it('has the four pre-reform letters as a recognition-only group', () => {
    expect(PRE_REFORM.length).toBe(4);
    expect(PRE_REFORM.every((s) => s.preReform)).toBe(true);
    expect(PRE_REFORM.map((s) => s.symbol).sort()).toEqual(['І', 'Ѣ', 'Ѳ', 'Ѵ'].sort());
  });
  it('the stress mark is included as a sign', () => {
    const mark = ALL_SYMBOLS.find((s) => s.name.includes('ударения'));
    expect(mark).toBeDefined();
    expect(mark!.kind).toBe('sign');
  });
  it('symbolInfo looks up by upper or lower case', () => {
    expect(symbolInfo('б')?.symbol).toBe('Б');
    expect(symbolInfo('Б')?.symbol).toBe('Б');
  });
  it('voiced/voiceless pairs are mutual', () => {
    const b = symbolInfo('Б')!;
    const p = symbolInfo('П')!;
    expect(b.voicedPartner).toBe('П');
    expect(p.voicedPartner).toBe('Б');
    expect(b.voiced).toBe(true);
    expect(p.voiced).toBe(false);
  });
  it('ж ш ц are always hard; ч щ й are always soft', () => {
    for (const s of ['Ж', 'Ш', 'Ц']) expect(symbolInfo(s)!.hardness).toBe('always-hard');
    for (const s of ['Ч', 'Щ', 'Й']) expect(symbolInfo(s)!.hardness).toBe('always-soft');
  });
  it('every letter carries a cursive description', () => {
    for (const s of ALL_LETTERS) {
      expect(s.cursive).toBeTruthy();
      expect(s.cursiveNote).toBeTruthy();
    }
  });
});

describe('curriculum stages', () => {
  it('stages 1–6 cover all 33 letters exactly once', () => {
    const first6 = STAGES.slice(0, 6).flatMap((s) => s.symbols.map((x) => x.symbol));
    expect(new Set(first6).size).toBe(33);
    expect(first6.length).toBe(33);
    for (const l of ALL_LETTERS) expect(first6).toContain(l.symbol);
  });
  it('has exactly eleven stages', () => {
    expect(STAGES.length).toBe(11);
  });
  it('stages 7–9 are rule stages with worked examples', () => {
    const [stress, hardSoft, voicing] = [STAGES[6]!, STAGES[7]!, STAGES[8]!];
    for (const st of [stress, hardSoft, voicing]) {
      expect(st.rules && st.rules.length).toBeGreaterThan(0);
      for (const r of st.rules!) {
        expect(r.title).toBeTruthy();
        expect(r.text).toBeTruthy();
        expect(r.examples.length).toBeGreaterThan(0);
        for (const ex of r.examples) {
          expect(ex.word).toBeTruthy();
          expect(typeof ex.stressIndex).toBe('number');
          expect(ex.translit).toBeTruthy();
          expect(ex.ipa).toBeTruthy();
        }
      }
    }
  });
  it('stage 10 covers the cursive-critical letters', () => {
    const cursive = STAGES.find((s) => s.id === 'cursive')!;
    for (const l of 'ТДГИПБВЗЛМ') expect(cursive.symbols.map((s) => s.symbol)).toContain(l);
  });
  it('stage 11 is the pre-reform recognition-only group', () => {
    const last = STAGES[STAGES.length - 1]!;
    expect(last.symbols.filter((s) => s.preReform).length).toBe(4);
  });
  it('stageOf finds the introducing stage', () => {
    expect(stageOf('А')?.id).toBe('latin-lookalikes');
    expect(stageOf('Щ')?.id).toBe('hushers');
  });
  it('symbolsForLevel is monotonic and comfortable = every stage-1..6 letter plus rule/cursive/pre-reform letters', () => {
    expect(symbolsForLevel('none')).toEqual([]);
    expect(symbolsForLevel('some').length).toBeGreaterThan(0);
    expect(symbolsForLevel('sound-out').length).toBe(33);
    expect(symbolsForLevel('comfortable').length).toBeGreaterThanOrEqual(symbolsForLevel('slow').length);
  });
});

describe('decodability', () => {
  it('fully decodable when every letter is known', () => {
    const known = new Set(['М', 'О', 'Л', 'К']);
    expect(decodability('молоко', known).category).toBe('fully');
  });
  it('not-yet when several letters are unknown', () => {
    const d = decodability('щука', new Set(['А']));
    expect(d.category).toBe('not-yet');
    expect(d.unknown).toContain('Щ');
  });
  it('nearly decodable with exactly one unknown letter', () => {
    const d = decodability('щука', new Set(['У', 'К', 'А']));
    expect(d.category).toBe('nearly');
    expect(d.unknown).toEqual(['Щ']);
  });
  it('nearly decodable with exactly one unknown letter in a longer word', () => {
    const d = decodability('хорошо', new Set(['О', 'Р', 'Ш']));
    expect(d.category).toBe('nearly');
    expect(d.unknown).toEqual(['Х']);
  });
});

describe('drills', () => {
  it('symbol_to_sound and sound_to_symbol generate a correct answer with distractors', () => {
    const rnd = () => 0.5;
    const s2s = symbolToSound('Б', [], rnd)!;
    expect(s2s.answer).toBe('b');
    expect(s2s.options).toContain('b');
    expect(s2s.options.length).toBeGreaterThanOrEqual(3);
    const sn = soundToSymbol('Б', [], rnd)!;
    expect(sn.answer).toBe('Б');
    expect(sn.options.length).toBeGreaterThanOrEqual(3);
  });
  it('contrast pairs are all real, distinct letters', () => {
    for (const [a, b] of CONTRAST_PAIRS) {
      expect(symbolInfo(a)).toBeDefined();
      expect(symbolInfo(b)).toBeDefined();
      expect(a).not.toBe(b);
    }
    const c = contrast('Ь', 'Ъ', 'soft vs hard sign', () => 0.9)!;
    expect(['Ь', 'Ъ']).toContain(c.answer);
  });
  it('syllable drill builds a consonant+vowel form and its pronunciation', () => {
    const known = new Set(['А', 'О', 'У', 'Ы']);
    const sy = syllable('М', known, () => 0.1)!;
    expect(sy).not.toBeNull();
    expect(sy.options).toContain(sy.answer);
  });
  it('word drill uses real pronunciation, not raw spelling, when the stress is known', () => {
    const d = wordDrill('хорошо', ['молоко', 'вход', 'сад'], () => 0.2, 5)!;
    expect(d.answer).toBe('kharasho');
    expect(d.options).toContain('kharasho');
  });
  it('word drill falls back to unreduced spelling when the stress is not known', () => {
    const d = wordDrill('хорошо', ['молоко', 'вход', 'сад'], () => 0.2)!;
    expect(d.answer).toBe('khorosho');
  });
});
