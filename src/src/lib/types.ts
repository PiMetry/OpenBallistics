/** The shape of a record in `public/cartridges/`, and of the index built from those records. */

import { t } from './i18n.svelte';

export type Angle = { degrees: number; minutes?: number; seconds?: number };
export type Value = number | string | Angle | null;

/** One group of fields, as the tables group them: "Lengths", "Case Head", "Grooves". */
export type Group = Record<string, Value>;

/**
 * A group that repeats: a shot cartridge publishes one row per hull length, and its chamber one
 * row per chamber length, each row a small record of its own (`l`, `tol`, `marking`; `L`, `M`,
 * the pressures). Rendered as a table with one row per entry rather than as fields.
 */
export type GroupList = Group[];

export interface Record_ {
  key: string;
  name: string;
  family: string;
  country?: string | null;
  alternativeNames?: string[];
  pressureMethod?: string | null;
  published?: string | null;
  revised?: string | null;
  cartridge: Record<string, Group | GroupList>;
  chamber: Record<string, Group | GroupList>;
  /** Not CIP's: what this dataset added, under its own key so the standard can be taken without it. */
  annotations?: {
    category?: string;
    primerType?: string;
    defaultBulletShape?: string;
    defaultBullet?: {
      category: string;
      ogive: string;
      base: string;
      tip: string;
      /** Whether a person has proofread the nose form. */
      verified?: boolean;
    };
    implausible?: Finding[];
    confidence?: Confidence;
    /**
     * The verifications that had nowhere else to live; see `Facet`. The cartridge's numbers are
     * `confidence` and the bullet is `defaultBullet.verified`, and neither is restated here.
     */
    verified?: {
      chamber?: boolean;
      cartridgeDrawing?: boolean;
      chamberDrawing?: boolean;
    };
  };
}

/** One plausibility rule that fired on a record; `known` ones are real exceptions, explained. */
export interface Finding {
  rule: string;
  kind: 'strict' | 'exceptional' | 'approximate' | 'missing';
  fields: string[];
  values: Record<string, number>;
  message: string;
  known?: boolean;
  why?: string;
}

/**
 * How far a record can be trusted, in one word. `verified`: a person proofread it.
 * `implausible`: a plausibility rule fires that nothing explains. `unverified`: nothing found
 * wrong, nobody has confirmed it. The word names the record's status, never how it was produced.
 */
export type Confidence = 'verified' | 'unverified' | 'implausible';


/** What a drawing is a drawing of: the cartridge, or the chamber it is fired in. */
export type DrawingSubject = 'cartridge' | 'chamber';

/**
 * How a drawing is shown. `visual` is the rendered object, `technical` the outlined one: the same
 * geometry answering what the thing looks like or what its numbers are. A face of the one file,
 * not a file (2026-09-05); either can carry the dimensions, see `Drawing`.
 */
export type DrawingStyle = 'visual' | 'technical';

/**
 * One drawing shipped for a cartridge, and what it is a drawing of.
 *
 * `file` is its path under `outlines/<family>/`. One file carries four faces (2026-09-05): the
 * coloured rendering and the dimensioned outline, each with or without the dimensions, chosen by
 * the fragment the page appends -- `#visual`, `#visual-dims`, `#plain`, or none for the
 * dimensioned outline. So a drawing has no style of its own any more; the page has.
 *
 * Two extents, both in real millimetres, read off the file by the build: `svg` is the whole page,
 * which the faces with dimensions show, and `tight` is the object alone, which the faces without
 * them crop to. The page lays everything out in millimetres and at one millimetres-per-pixel, and
 * needs the right box for the face it is showing or a card is padded with a dimension margin it
 * is not drawing.
 *
 * `l` and `marking` are set only on a shot cartridge, where the gauge names a family and the hull
 * length names a member of it -- a 12 gauge is drawn at each of nine, from 12/35 to 12/89.
 */
export interface Drawing {
  file: string;
  svg: [number, number];
  tight: [number, number];
  subject: DrawingSubject;
  l?: number;
  marking?: string | null;
  /**
   * The picture a card in the list shows for this cartridge -- `svg`, or whichever drawing stands
   * at the same length. Exactly one drawing carries it, and it is where the cartridge page opens,
   * so that clicking a card does not change the picture that was clicked.
   */
  main?: true;
}

/** One row of the index shipped with the app; see `scripts/build-index.mjs`. */
export interface Entry {
  key: string;
  name: string;
  family: string;
  /**
   * Where the sheet says the cartridge comes from, as ISO codes -- two of them for the six
   * cartridges two countries standardised together, and none for the 17 that name no origin. See
   * `countriesOf` in `scripts/build-index.mjs` for what is normalised on the way in.
   */
  countries: string[];
  alt: string[];
  L3: number | null;
  L6: number | null;
  G1: number | null;
  /**
   * The size in millimetres of the rendered drawing shipped for this cartridge, `[width, height]`,
   * or `null` where none was rendered. Knowing the extent without loading the file is what lets a
   * grid of them share one scale.
   */
  svg: [number, number] | null;
  /**
   * The whole page of the cartridge's own drawing, in millimetres, where `svg` is the object
   * alone: the faces with dimensions show the page. See `Drawing`.
   */
  sheet?: [number, number];
  /**
   * Every drawing shipped for this cartridge, where there is more than the one -- of the cartridge
   * or of its chamber, visual or technical, and at each published hull length where it has
   * several. This is what the cartridge page's toggles switch between; a toggle appears only for
   * an axis this list actually varies along.
   *
   * Absent wherever `svg` says it all, which is most of the dataset. The drawing named in `svg`
   * appears here too, under its own file name, which is how the page opens on the same picture
   * the card in the list showed.
   */
  drawings?: Drawing[];
  /**
   * The case outline as published `[radius, z]` points -- the fallback a card draws itself when
   * there is no rendered drawing, and `null` where the sheet dimensions no case at all. See
   * `shape` in `scripts/build-index.mjs` for what the outline does and does not include.
   */
  shape: [number, number][] | null;
  /** Total plausibility checks that fired, including known exceptions. */
  checks: number;
  /** Findings on the record that no listed exception explains. */
  warnings: number;
}

/**
 * The countries the dataset names, spelled out.
 *
 * Only these: it is a table for the twenty codes in this dataset and not a copy of ISO 3166, and
 * anything not here falls back to its code rather than being guessed at. `SU` and `CS` are the
 * states the sheets were published by and are named as such -- a 7,62 x 39 is a Soviet standard,
 * and calling it Russian would be saying something its sheet does not.
 */
export const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Austria',
  BE: 'Belgium',
  CA: 'Canada',
  CH: 'Switzerland',
  CS: 'Czechoslovakia',
  CZ: 'Czechia',
  DE: 'Germany',
  FI: 'Finland',
  FR: 'France',
  GB: 'United Kingdom',
  IL: 'Israel',
  IT: 'Italy',
  JP: 'Japan',
  NO: 'Norway',
  PT: 'Portugal',
  RU: 'Russia',
  SE: 'Sweden',
  SU: 'Soviet Union',
  TR: 'Türkiye',
  US: 'United States'
};

const FAMILIES = ['rimless', 'rimmed', 'belted', 'pistol', 'rimfire', 'shotshell'];

/**
 * What a case family is called, in the reader's language.
 *
 * A family the dataset grows and this list has not heard of is shown by its own name rather than
 * hidden or guessed at, which is what the old map did by falling through.
 */
export function familyLabel(family: string): string {
  return FAMILIES.includes(family) ? t(`family.${family}`) : family;
}
