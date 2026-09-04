/**
 * Which of a cartridge's drawings to show, and what to call it.
 *
 * A cartridge is not one picture. It is drawn along three axes -- of itself or of the chamber it
 * is fired in, rendered or dimensioned, and at each published hull length where it has several --
 * and both the grid and the cartridge page have to pick one from that list and say which they
 * picked. The picking is here rather than in either of them so that the two agree: a reader who
 * sets the grid to dimensioned drawings and opens a card should land on a dimensioned drawing.
 */

import { t } from './i18n.svelte';
import type { Drawing, DrawingStyle, DrawingSubject, Entry } from './types';

export const SUBJECTS: DrawingSubject[] = ['cartridge', 'chamber'];
export const STYLES: DrawingStyle[] = ['visual', 'technical'];

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
 * Every drawing this cartridge has.
 *
 * The index carries the list only where there is more than one; where there is not, the
 * cartridge's own `<key>.svg` is the list, so that everything downstream has one thing to reason
 * about instead of two.
 */
export function plates(entry: Entry | undefined): Drawing[] {
  if (entry?.drawings?.length) return entry.drawings;
  if (entry?.svg) {
    return [
      { file: `${entry.key}.svg`, svg: entry.svg, subject: 'cartridge', style: 'visual', main: true }
    ];
  }
  return [];
}

/** The kinds actually drawn, in a fixed order: what a toggle may offer, and nothing more. */
export function offered<T extends DrawingSubject | DrawingStyle>(
  all: T[],
  drawn: Drawing[],
  axis: 'subject' | 'style'
): T[] {
  return all.filter((value) => drawn.some((plate) => plate[axis] === value));
}

/**
 * The drawing the list shows for this cartridge: `<key>.svg`, or whichever drawing stands at the
 * same length. The build flags it rather than the page working it out -- `<key>.svg` is not always
 * the drawing that ends up at its own length, because a drawing filed in the directory at the same
 * length takes its place.
 */
export function main(entry: Entry | undefined): Drawing | null {
  return plates(entry).find((plate) => plate.main) ?? null;
}

/**
 * The one drawing a card shows, in the style the grid is set to.
 *
 * The card's job is a picture of the cartridge, so the subject is never in question here -- a
 * chamber on a card would be a picture of a barrel under the name of a round. What can be in
 * question is the style, and the length: the technical drawing wanted is the one at the length the
 * card already shows, so that switching the grid to dimensioned drawings changes what is drawn and
 * not which member of a gauge is drawn.
 *
 * Falls back to the cartridge's own drawing where nothing has been dimensioned, which is what a
 * card showed before there was anything to choose between.
 */
export function card(entry: Entry, style: DrawingStyle): Drawing | null {
  const own = main(entry);
  if (style === 'visual') return own;
  const drawn = plates(entry).filter(
    (plate) => plate.subject === 'cartridge' && plate.style === style
  );
  if (!drawn.length) return own;
  const at = drawn.find((plate) => plate.l === own?.l);
  return at ?? drawn[0] ?? own;
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
