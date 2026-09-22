import { describe, expect, it } from 'vitest';
import { pronounce, transliterate } from '../src/pronunciation';

describe('transliterate (letter-by-letter, no context)', () => {
  it('maps every letter with the fixed scientific-ish table', () => {
    expect(transliterate('живёт')).toBe('zhivyot');
    expect(transliterate('щука')).toBe('shchuka');
    expect(transliterate('цель')).toBe("tsel'");
    expect(transliterate('объект')).toBe('ob"ekt'); // letter-by-letter, no iotation context applied
    expect(transliterate('мой')).toBe('moy');
  });
  it('capitalises the first letter of a multi-char cluster for an upper-case source letter', () => {
    expect(transliterate('Щука')).toBe('Shchuka');
    expect(transliterate('Хорошо')).toBe('Khorosho');
  });
});

describe('pronounce — vowel reduction (аканье / иканье)', () => {
  it('молоко: о before the stress → [ɐ], other unstressed о → [ə]', () => {
    // м-о-л-о-к-о, indices 0..5; final о (index 5) carries the stress
    const p = pronounce('молоко', 5);
    expect(p.ipa).toBe('[məlɐko]');
    expect(p.translit).toBe('malako');
    expect(p.confidence).toBe(1);
    expect(p.notes).toContain('о unstressed → [ə]');
    expect(p.notes).toContain('о before the stress → [ɐ]');
  });

  it('хорошо: both unstressed о reduce, the stressed final о keeps full quality', () => {
    const p = pronounce('хорошо', 5);
    expect(p.ipa).toBe('[xərɐʂo]');
    expect(p.translit).toBe('kharasho');
    expect(p.notes).toContain('о before the stress → [ɐ]');
  });

  it('его: unstressed е → [ɪ] with its [j] glide word-initially', () => {
    const p = pronounce('его', 2);
    expect(p.translit).toBe('yevo');
    expect(p.ipa).toBe('[jɪvo]');
    expect(p.notes).toContain('е unstressed → [ɪ]');
  });
});

describe('pronounce — что and -ться (fixed exceptions)', () => {
  it('что is pronounced [ʂto], not [tɕto]', () => {
    const p = pronounce('что', 2);
    expect(p.ipa).toBe('[ʂto]');
    expect(p.translit).toBe('shto');
    expect(p.confidence).toBeLessThan(1);
    expect(p.notes.some((n) => /ч is realised as ш/.test(n))).toBe(true);
  });

  it('учиться: -ться is pronounced as one cluster, [tsə]', () => {
    const p = pronounce('учиться', 2);
    expect(p.ipa).toContain('tsə');
    expect(p.ipa).toBe('[utɕitsə]');
    expect(p.notes.some((n) => n.includes('[tsə]'))).toBe(true);
  });
});

describe('pronounce — final devoicing and regressive assimilation', () => {
  it('сад: final д devoices to [t]', () => {
    const p = pronounce('сад', 1);
    expect(p.ipa).toBe('[sat]');
    expect(p.translit).toBe('sat');
    expect(p.notes.some((n) => /final .* devoiced/.test(n) && n.includes('[t]'))).toBe(true);
  });

  it('вход: в assimilates (devoices) before voiceless х, final д devoices too', () => {
    const p = pronounce('вход', 2);
    expect(p.ipa).toBe('[fxot]');
    expect(p.translit).toBe('fkhot');
    expect(p.notes.some((n) => n.includes('[f]'))).toBe(true);
  });
});

describe('pronounce — genitive -ого/-его → [-əvə]', () => {
  it('Достоевский: iotation after a vowel, both о-reduction tiers, в devoiced before voiceless с', () => {
    const p = pronounce('Достоевский', 5);
    expect(p.ipa).toBe('[dəstɐjefskʲij]');
    expect(p.translit).toBe('dastayefskiy');
    expect(p.notes).toContain('о unstressed → [ə]');
    expect(p.notes).toContain('о before the stress → [ɐ]');
    expect(p.confidence).toBe(1);
  });
});

describe('pronounce — unknown stress', () => {
  it('drops confidence to 0.7 and says so, without applying reduction', () => {
    const p = pronounce('молоко', -1);
    expect(p.confidence).toBe(0.7);
    expect(p.notes[0]).toMatch(/stress unknown/);
    // no vowel is treated as stressed or reduced when the stress is unknown
    expect(p.notes.some((n) => n.includes('[ɐ]') || n.includes('[ə]'))).toBe(false);
  });
});

describe('pronounce is pure and deterministic', () => {
  it('same input always gives the same output', () => {
    const a = pronounce('хорошо', 5);
    const b = pronounce('хорошо', 5);
    expect(a).toEqual(b);
  });
});
