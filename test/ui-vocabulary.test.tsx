// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { VocabularyScreen } from '../src/ui/Vocabulary';
import { db } from '../src/database/db';

/**
 * Rendered smoke test for the Vocabulary screen against an empty (fake-
 * indexeddb-backed) database: the status counters, the filter row and the
 * empty state all render without throwing, and a known word added directly
 * through the db shows up after the component's onVocabChange refresh.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  if (!('IntersectionObserver' in window)) {
    class FakeIO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
  }
});

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/vocabulary']}>
        <Routes>
          <Route path="/vocabulary" element={<VocabularyScreen />} />
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(async () => {
  act(() => {
    root.unmount();
  });
  container.remove();
  await db.known_words.clear();
});

describe('VocabularyScreen', () => {
  it('renders the empty state against a clean database', async () => {
    await mount();
    expect(container.textContent).toContain('Vocabulary');
    expect(container.textContent).toContain('Nothing here yet.');
  });

  it('lists a known word added directly through the db', async () => {
    const now = Date.now();
    await db.known_words.add({ lexeme_key: 'verb:говорить', status: 'known', encounters: 3, lookups: 1, first_seen: now, last_seen: now, updated_at: now, form_status: {} });
    await mount();
    expect(container.textContent).not.toContain('Nothing here yet.');
    expect(container.textContent).toContain('говорить');
  });
});
