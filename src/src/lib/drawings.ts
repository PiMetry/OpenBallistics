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
      {
        file: `${entry.key}.svg`,
        svg: entry.sheet ?? entry.svg,
        tight: entry.svg,
        subject: 'cartridge',
        main: true
      }
    ];
  }
  return [];
}

/** The subjects actually drawn, in a fixed order: what a toggle may offer, and nothing more. */
export function offered(all: DrawingSubject[], drawn: Drawing[]): DrawingSubject[] {
  return all.filter((value) => drawn.some((plate) => plate.subject === value));
}

/**
 * Which face of a drawing to ask the file for.
 *
 * One file carries four (2026-09-05; see `Drawing`): the fragment picks the style and whether the
 * dimensions are drawn over it. The dimensioned outline is the file's default face and needs no
 * fragment, which keeps a plain link to the file meaning what it always did.
 */
export function face(style: DrawingStyle, dimensions: boolean): string {
  if (style === 'visual') return dimensions ? '#visual-dims' : '#visual';
  return dimensions ? '' : '#plain';
}

/** The extent a face is shown at: the whole page with dimensions, the object alone without. */
export function extent(plate: Drawing, dimensions: boolean): [number, number] {
  return dimensions ? plate.svg : plate.tight;
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
 * The one drawing a card shows: the cartridge's own, at its own length.
 *
 * The card's job is a picture of the cartridge, so the subject is never in question here -- a
 * chamber on a card would be a picture of a barrel under the name of a round. The style is not a
 * question of which drawing either, since one file carries both; the grid picks the face.
 */
export function card(entry: Entry): Drawing | null {
  return main(entry);
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
