import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computeCoverage } from '../scripts/coverage.mjs';

function makeCorpus(dir: string, files: Record<string, unknown>) {
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), JSON.stringify(content), 'utf8');
}

describe('computeCoverage', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('computes overall and per-work coverage as covered word tokens / all word tokens', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'slovo-coverage-'));
    makeCorpus(dir, {
      'index.json': { works: ['a', 'b'] },
      'a.json': { slug: 'a', chapters: [{ paragraphs: [{ text: 'кот и пёс.' }] }] }, // 3 word tokens: кот, и, пёс
      'b.json': { slug: 'b', chapters: [{ paragraphs: [{ text: 'дом.' }] }] }, // 1 word token: дом
      'a.en.json': { chapters: [{ paragraphs: ['ignored, not russian corpus'] }] }, // must be skipped
      'a.cast.json': { characters: [] }, // must be skipped
    });

    const known = new Set(['кот', 'дом']);
    const result = computeCoverage({ corpusDir: dir, hasKey: (k: string) => known.has(k) });

    expect(result.totalTokens).toBe(4); // кот, и, пёс, дом
    expect(result.coveredTokens).toBe(2); // кот, дом
    expect(result.overall).toBeCloseTo(0.5);
    expect(result.byWork.a).toBeCloseTo(1 / 3);
    expect(result.byWork.b).toBeCloseTo(1);
  });

  it('ranks unknown keys by descending frequency, capped at 300', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'slovo-coverage-'));
    makeCorpus(dir, {
      'index.json': {},
      'a.json': { slug: 'a', chapters: [{ paragraphs: [{ text: 'ежик ежик ежик лужа лужа трава' }] }] },
    });
    const result = computeCoverage({ corpusDir: dir, hasKey: () => false });
    expect(result.unknownTop300[0]).toEqual(['ежик', 3]);
    expect(result.unknownTop300[1]).toEqual(['лужа', 2]);
    expect(result.unknownTop300[2]).toEqual(['трава', 1]);
  });

  it('returns 0 coverage (not NaN) for an empty corpus directory', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'slovo-coverage-'));
    makeCorpus(dir, { 'index.json': {} });
    const result = computeCoverage({ corpusDir: dir, hasKey: () => true });
    expect(result.overall).toBe(0);
    expect(result.totalTokens).toBe(0);
    expect(Number.isNaN(result.overall)).toBe(false);
  });
});
