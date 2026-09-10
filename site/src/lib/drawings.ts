/**
 * The app's view of a cartridge's drawings.
 *
 * The picking is `@lib/core/drawings`, framework-free and re-exported here so existing importers
 * keep working. What stays are the two things that cannot move: the labels, which need the
 * reader's language, and the remembered style, which needs the browser's storage.
 */

import { t } from './i18n.svelte';
import { STYLES } from '@lib/core/drawings';
import type { DrawingStyle, DrawingSubject } from '@lib/core';

export function subjectLabel(subject: DrawingSubject): string {
  return t(`subject.${subject}`);
}

export function styleLabel(style: DrawingStyle): string {
  return t(`style.${style}`);
}

/** What each style is, for a hover on a control that has room for one word. */
export function styleNote(style: DrawingStyle): string {
  return t(`style.${style}Note`);
}

/**
 * Which style the reader last looked at, kept per browser and shared by the grid and the
 * cartridge page.
 *
 * A reader working from dimensioned drawings is doing that across the dataset and should not have
 * to say so on every page. Where a cartridge has not been drawn that way the page falls back to
 * what it has, and the stored preference is left alone for the next cartridge that can honour it.
 *
 * Wrapped, because a browser set to block site data throws on the first access rather than
 * returning nothing.
 */
const STYLE_KEY = 'drawing-style';

export function storedStyle(): DrawingStyle {
  try {
    const held = localStorage.getItem(STYLE_KEY);
    return STYLES.includes(held as DrawingStyle) ? (held as DrawingStyle) : 'visual';
  } catch {
    return 'visual';
  }
}

export function rememberStyle(style: DrawingStyle): void {
  try {
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    // Storage may be unavailable; the choice still applies for this visit.
  }
}
