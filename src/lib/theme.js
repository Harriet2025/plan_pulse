// Light / dark / system theme. The colours themselves are CSS variables in src/index.css, picked by
// <html data-theme="light|dark">. index.html runs the same logic before the page draws, so the right theme shows
// from the first frame (keep the two in step: the storage key and the meta colours).
import { useEffect, useState } from 'react';

const KEY = 'auragoal.theme';
export const THEME_CHOICES = ['light', 'dark', 'system'];
const META = { light: '#F5F7FA', dark: '#17191E' };   // the browser / phone status bar colour

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
const listeners = new Set();

/** What the person chose: light, dark or system (the default). */
export function getThemeChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return THEME_CHOICES.includes(v) ? v : 'system';
  } catch { return 'system'; }
}

/** The theme actually shown for a choice. */
export const resolveTheme = (choice) => (choice === 'system' ? (media()?.matches ? 'dark' : 'light') : choice);

function apply(choice) {
  const theme = resolveTheme(choice);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[theme]);
  listeners.forEach((fn) => fn());
}

/** Switches at once, everywhere, and remembers the choice on this device. */
export function setThemeChoice(choice) {
  if (!THEME_CHOICES.includes(choice)) return;
  try { localStorage.setItem(KEY, choice); } catch { /* private mode: it still applies for this visit */ }
  apply(choice);
}

// "System" follows the device as it changes (say, at sunset), and another open tab's choice is picked up here
if (typeof window !== 'undefined') {
  media()?.addEventListener?.('change', () => { if (getThemeChoice() === 'system') apply('system'); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(getThemeChoice()); });
}

/** { choice, theme, setChoice, toggle }: toggle flips between light and dark. */
export function useTheme() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  const choice = getThemeChoice();
  const theme = resolveTheme(choice);
  return { choice, theme, setChoice: setThemeChoice, toggle: () => setThemeChoice(theme === 'dark' ? 'light' : 'dark') };
}
