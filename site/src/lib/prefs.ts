/**
 * UI preferences stored in `localStorage`.
 *
 * **Records** - a
 * rifle, a designed cartridge, a reticle a user measured off their own scope - go in IndexedDB:
 * they travel in the export, they can grow, and a schema change once someone has data is a
 * migration. **Preferences** are the settings that make a page come back the way it was left, and
 * they belong here: short, per-browser, and deliberately *not* in the export, because a
 * preference is about this device rather than about the user's data.
 *
 * The pattern is the one `theme.svelte.ts` already uses and is not an accident: every read and
 * every write is wrapped, because a browser set to block site data **throws on first access**
 * rather than returning nothing. A preference that cannot be stored is not an error - the choice
 * simply applies for this visit.
 */

const PREFIX = 'ob.';

/** Read a preference, or the fallback if there is none, it is unreadable, or it is not allowed. */
export function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Read a numeric preference within bounds. Anything outside them is treated as absent. */
export function readNumberPref(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = localStorage.getItem(PREFIX + key);
    if (stored === null || stored.trim() === '') return fallback;
    const value = Number(stored);
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Store a preference. Failure is silent by design: see the note above. */
export function writePref(key: string, value: string | number): void {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // Storage may be unavailable; the choice still applies for this visit.
  }
}

/** Forget a preference, so the page returns to its default next time. */
export function clearPref(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // As above.
  }
}
