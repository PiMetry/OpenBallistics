/**
 * Light or dark, chosen by the reader and kept per browser.
 *
 * `app.css` defines the palette light-first and redefines it for `[data-theme='dark']` and for
 * the system preference where nothing is stamped on the root, so the toggle only has to stamp the
 * root: an explicit choice wins in both directions, and with none stored the system decides.
 *
 * A module rather than state in `App` (2026-09-05) because the drawings need to know: the
 * rendered face with dimensions is drawn in a navy for paper, and on a dark page it asks for the
 * file's dark face (see `face` in `drawings.ts`) rather than a filter, which would turn the brass
 * blue.
 */

export type Theme = 'light' | 'dark';
const KEY = 'theme';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let current = $state<Theme>(storedTheme() ?? systemTheme());

export function theme(): Theme {
  return current;
}

export function isDark(): boolean {
  return current === 'dark';
}

export function toggleTheme(): void {
  current = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // Storage may be unavailable; the choice still applies for this visit.
  }
}
