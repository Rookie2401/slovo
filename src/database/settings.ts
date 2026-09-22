import { useEffect, useState } from 'react';

/**
 * Settings live in localStorage (synchronous, tiny) with a subscription so
 * screens re-render on change. The Claude API key is stored here too, only
 * ever entered by the reader in Settings; it is never bundled or logged.
 */
export type TranslitMode = 'always' | 'tap' | 'unknown' | 'never';
export type ScriptLevel = 'none' | 'some' | 'sound-out' | 'slow' | 'comfortable';

export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  fontSize: number; // px
  lineHeight: number;
  hindiFont: 'tiro' | 'noto' | 'system';
  translit: TranslitMode;
  translitStyle: 'iast' | 'practical';
  showMarks: boolean; // learning-state indicators in the reader
  highlightUnknownGraphemes: boolean;
  englishAssist: 'off' | 'tap' | 'always';
  autoKnownAfter: number;
  lookupMarksRecognized: boolean;
  onboarded: boolean;
  scriptLevel: ScriptLevel;
  claudeKey: string;
  claudeModel: string;
  explainLanguage: 'en' | 'hi-simple';
  speechRate: number;
}

export const DEFAULTS: Settings = {
  theme: 'auto',
  fontSize: 24,
  lineHeight: 1.95,
  hindiFont: 'tiro',
  translit: 'tap',
  translitStyle: 'iast',
  showMarks: false,
  highlightUnknownGraphemes: true,
  englishAssist: 'tap',
  autoKnownAfter: 6,
  lookupMarksRecognized: true,
  onboarded: false,
  scriptLevel: 'none',
  claudeKey: '',
  claudeModel: 'claude-opus-5',
  explainLanguage: 'en',
  speechRate: 0.9,
};

const KEY = 'paath:settings';
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
  root.setAttribute('data-hindi-font', s.hindiFont);
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
