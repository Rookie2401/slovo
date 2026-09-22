// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Onboarding } from '../src/ui/Onboarding';
import { getSettings, setSettings } from '../src/database/settings';
import { db } from '../src/database/db';

/**
 * Rendered smoke test for the onboarding flow (level pick -> diagnostic ->
 * finish -> navigate home), without @testing-library (not installed in this
 * package): plain react-dom, driven by dispatched click events. Navigation
 * is exercised by letting Onboarding's own useNavigate() call fire inside a
 * single mounted <MemoryRouter><Routes>…</Routes></MemoryRouter> tree — the
 * router is mounted once per test and never remounted to force a route.
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

beforeEach(async () => {
  setSettings({ onboarded: false, scriptLevel: 'none' });
  await db.alphabet_progress.clear();
});

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Routes>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/" element={<div data-testid="home-marker">home</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

function click(el: Element | null) {
  if (!el) throw new Error('element not found');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function findButtonByText(text: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) ?? null;
}

/** fake-indexeddb resolves its requests on real timer ticks, not just microtasks, so awaiting a
 * fire-and-forget async handler (e.g. an onClick calling `void finish(...)`) needs polling rather
 * than a fixed number of Promise.resolve() flushes. */
async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('Onboarding', () => {
  it('shows the level question first', () => {
    mount();
    expect(container.textContent).toContain('How well can you read Cyrillic?');
    expect(findButtonByText('I know some letters')).toBeTruthy();
  });

  it('choosing "I cannot read it yet" and continuing marks onboarding done and navigates home', async () => {
    mount();
    click(findButtonByText('I cannot read it yet'));
    const continueBtn = findButtonByText('Continue');
    expect(continueBtn?.hasAttribute('disabled')).toBe(false);
    act(() => {
      continueBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await waitFor(() => getSettings().onboarded);
    expect(getSettings().scriptLevel).toBe('none');
    expect(container.textContent).toContain('home');
  });

  it('choosing "I know some letters" shows the diagnostic step, and finishing records the checked letters as introduced', async () => {
    mount();
    click(findButtonByText('I know some letters'));
    click(findButtonByText('Continue'));
    expect(container.textContent).toContain('Which of these letters can you already read?');
    const letterBtn = Array.from(container.querySelectorAll('button.glyph'))[0] as HTMLButtonElement | undefined;
    expect(letterBtn).toBeTruthy();
    click(letterBtn!);
    const startBtn = findButtonByText('Start reading');
    act(() => {
      startBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await waitFor(() => getSettings().onboarded);
    expect(getSettings().scriptLevel).toBe('some');
    const introduced = await db.alphabet_progress.filter((p) => p.introduced).count();
    expect(introduced).toBeGreaterThan(0);
  });
});
