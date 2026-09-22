import { useEffect, useState } from 'react';

/**
 * Settings live in localStorage (synchronous, tiny) with a subscription so
 * screens re-render on change. The Claude API key is stored here too, only
 * ever entered by the reader in Settings; it is never bundled, logged or
 * sent anywhere except directly from the browser to Anthropic's API.
 */
export type AssistMode = 'always' | 'tap' | 'unknown' | 'never';
export type ScriptLevel = 'none' | 'some' | 'sound-out' | 'slow' | 'comfortable';
/** How ё is displayed: as the source printed it, always resolved from the dictionary
 * (even when the source prints е), or always folded to е (as most modern editions print). */
export type YoDisplay = 'source' | 'always' | 'never';

export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  fontSize: number; // px
  lineHeight: number;
  russianFont: 'ptserif' | 'system';
  /** combining acute over the stressed vowel, per word */
  stressMarks: AssistMode;
  /** phonetic transcription (translit/IPA) shown under a word */
  translitMode: AssistMode;
  yoDisplay: YoDisplay;
  showMarks: boolean; // learning-state indicators in the reader
  highlightUnknownGraphemes: boolean;
  /** the English chapter parallel pane, collapsed at the end of the chapter; off by default */
  englishParallel: boolean;
  autoKnownAfter: number;
  lookupMarksRecognized: boolean;
  onboarded: boolean;
  scriptLevel: ScriptLevel;
  claudeKey: string;
  claudeModel: string;
  explainLanguage: 'en' | 'ru-simple';
  speechRate: number;
}

export const DEFAULTS: Settings = {
  theme: 'auto',
  fontSize: 22,
  lineHeight: 1.85,
  russianFont: 'ptserif',
  stressMarks: 'unknown',
  translitMode: 'tap',
  yoDisplay: 'source',
  showMarks: false,
  highlightUnknownGraphemes: true,
  englishParallel: false,
  autoKnownAfter: 6,
  lookupMarksRecognized: true,
  onboarded: false,
  scriptLevel: 'none',
  claudeKey: '',
  claudeModel: 'claude-opus-5',
  explainLanguage: 'en',
  speechRate: 0.95,
};

const KEY = 'slovo:settings';
const listeners = new Set<() => void>();
let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: keep in memory */
  }
  applyTheme(next);
  for (const l of listeners) l();
  return next;
}

export function applyTheme(s: Settings = getSettings()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (s.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);
  root.style.setProperty('--reading-font-size', `${s.fontSize}px`);
  root.style.setProperty('--reading-line-height', String(s.lineHeight));
  root.setAttribute('data-ru-font', s.russianFont);
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [s, setS] = useState(getSettings);
  useEffect(() => {
    const fn = () => setS(getSettings());
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [s, setSettings];
}
