// Light or dark, and the app colour (blue, pink, purple, …). The colours themselves are CSS variables in
// src/index.css (blue) and src/accents.css (the others, made by scripts/make-accents.mjs), picked by
// <html data-theme="light|dark" data-accent="…">. The colour also swaps the app icon (browser tab, desktop app and
// phone home screen) and the install file that points at it. index.html runs the same logic before the page draws,
// so the right look shows from the first frame (keep the two in step: the storage keys and the file names).
import { useEffect, useState } from 'react';

const KEY = 'auragoal.theme';
const ACCENT_KEY = 'auragoal.accent';
export const THEME_CHOICES = ['light', 'dark'];

/** The colours to pick from. `light` / `dark` are the main shade in each theme (for the swatches). */
export const ACCENTS = [
  { id: 'blue', name: 'Blue', light: '#356ACB', dark: '#477BDB' },
  { id: 'pink', name: 'Pink', light: '#D5296E', dark: '#E26798' },
  { id: 'purple', name: 'Purple', light: '#7045D3', dark: '#9C7FE1' },
  { id: 'teal', name: 'Teal', light: '#0F7D8A', dark: '#17BCCF' },
  { id: 'green', name: 'Green', light: '#268245', dark: '#34B25E' },
  { id: 'orange', name: 'Orange', light: '#C14E0C', dark: '#F16A1D' },
  { id: 'brown', name: 'Brown', light: '#9D6540', dark: '#BF8762' },
  { id: 'graphite', name: 'Graphite', light: '#687384', dark: '#8893A2' },
];
const ACCENT_IDS = ACCENTS.map((a) => a.id);

const listeners = new Set();
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: it still applies for this visit */ } };

/** light or dark. Before anyone picks, it starts from the device's setting once. */
export function getThemeChoice() {
  const v = read(KEY);
  if (THEME_CHOICES.includes(v)) return v;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export const getAccent = () => { const v = read(ACCENT_KEY); return ACCENT_IDS.includes(v) ? v : 'blue'; };

const iconBase = (accent) => (accent === 'blue' ? '/icons' : `/icons/${accent}`);
const setHref = (sel, href) => { const el = document.querySelector(sel); if (el && el.getAttribute('href') !== href) el.setAttribute('href', href); };

function apply() {
  const theme = getThemeChoice(), accent = getAccent(), root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  // The browser / phone status bar matches the page background
  const bg = getComputedStyle(root).getPropertyValue('--ivory').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', `rgb(${bg.split(/\s+/).join(',')})`);
  const base = iconBase(accent);
  setHref('link[rel="icon"]', `${base}/favicon-32.png`);
  setHref('link[rel="apple-touch-icon"]', `${base}/apple-touch-icon.png`);
  setHref('link[rel="manifest"]', accent === 'blue' ? '/manifest.webmanifest' : `/manifest-${accent}.webmanifest`);
  listeners.forEach((fn) => fn());
}

/** Switches at once, everywhere, and remembers the choice on this device. */
export function setThemeChoice(choice) {
  if (!THEME_CHOICES.includes(choice)) return;
  write(KEY, choice);
  apply();
}
export function setAccent(id) {
  if (!ACCENT_IDS.includes(id)) return;
  write(ACCENT_KEY, id);
  apply();
}

if (typeof window !== 'undefined') {
  // Someone who had "System" before keeps what it showed them, now as a fixed choice
  if (read(KEY) === 'system') write(KEY, getThemeChoice());
  apply();
  // Another open tab's choice is picked up here
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === ACCENT_KEY) apply(); });
}

/** { choice, theme, accent, setChoice, setAccent, toggle }: toggle flips between light and dark. */
export function useTheme() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  const theme = getThemeChoice();
  return { choice: theme, theme, accent: getAccent(), setChoice: setThemeChoice, setAccent, toggle: () => setThemeChoice(theme === 'dark' ? 'light' : 'dark') };
}
