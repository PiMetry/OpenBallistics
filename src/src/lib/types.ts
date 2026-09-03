/** The shape of a record in `public/cartridges/`, and of the index built from those records. */

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
  /** Not CIP's: what this dataset added. See cartridges/README.md. */
  annotations?: {
    category?: string;
    primerType?: string;
    defaultBulletShape?: string;
    defaultBullet?: {
      category: string;
      ogive: string;
      base: string;
      tip: string;
      /** Whether a person has held the nose form against the drawing. */
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
 * How far a record can be trusted, in one word. `verified`: a person read it against the sheet.
 * `implausible`: a plausibility rule fires that nothing explains. `unverified`: nothing found
 * wrong, nobody has confirmed it. The word names the record's status, never how it was produced.
 */
export type Confidence = 'verified' | 'unverified' | 'implausible';

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  verified: 'Verified',
  unverified: 'Unverified',
  implausible: 'Check'
};

/** What a drawing is a drawing of: the cartridge, or the chamber it is fired in. */
export type DrawingSubject = 'cartridge' | 'chamber';

/**
 * How it is drawn. `visual` is the rendered object, which every drawing shipped so far is -- the
 * renderer titles them `<name> - visual`. `technical` is the dimensioned drawing: the same
 * geometry answering what the numbers are rather than what the thing looks like.
 */
export type DrawingStyle = 'visual' | 'technical';

/**
 * One drawing shipped for a cartridge, and what it is a drawing of.
 *
 * `file` is its path under `outlines/<family>/`; `svg` is its extent in millimetres,
 * `[width, height]`, the same as `Entry.svg`. `l` and `marking` are set only on a shot cartridge,
 * where the gauge names a family and the hull length names a member of it -- a 12 gauge is drawn
 * at each of nine, from 12/35 to 12/89.
 */
export interface Drawing {
  file: string;
  svg: [number, number];
  subject: DrawingSubject;
  style: DrawingStyle;
  l?: number;
  marking?: string | null;
  /**
   * The picture a card in the list shows for this cartridge -- `svg`, or whichever drawing stands
   * at the same length. Exactly one drawing carries it, and it is where the cartridge page opens,
   * so that clicking a card does not change the picture that was clicked.
   */
  main?: true;
}

/**
 * The five things a person can confirm about a record, in the order the site shows them.
 *
 * A record is not verified or unverified as a whole: the cartridge's numbers, the chamber's, the
 * drawing of each and the nose form of the bullet are four different readings against the source,
 * done at different times and often by different people. Reporting one word for all five is how a
 * page claims more than anybody actually checked.
 */
export const FACETS = [
  'cartridge',
  'chamber',
  'cartridgeDrawing',
  'chamberDrawing',
  'bullet'
] as const;
export type Facet = (typeof FACETS)[number];

export const FACET_LABELS: Record<Facet, string> = {
  cartridge: 'Cartridge',
  chamber: 'Chamber',
  cartridgeDrawing: 'Cartridge drawing',
  chamberDrawing: 'Chamber drawing',
  bullet: 'Bullet'
};

/** What each facet means, for the reader who wants to know what was actually held against what. */
export const FACET_NOTES: Record<Facet, string> = {
  cartridge: "The cartridge's published dimensions, read against the sheet by a person",
  chamber: "The chamber's published dimensions, read against the sheet by a person",
  cartridgeDrawing: 'The drawing of the cartridge, held against the sheet by a person',
  chamberDrawing: 'The drawing of the chamber, held against the sheet by a person',
  bullet: "The drawn bullet's nose form, held against the sheet's drawing by a person"
};

/**
 * What is confirmed about one record.
 *
 * **A facet that does not apply is absent, not false.** A record dimensioning no bullet has no
 * bullet to confirm, and a chamber nobody has drawn has no drawing to check; counting those as
 * unverified would leave a fully checked record reading as unfinished for ever. So the keys
 * present are the questions that can be asked of this record, and their values are the answers.
 */
export type Verified = Partial<Record<Facet, boolean>>;

/** How many of a record's applicable verifications are confirmed, out of how many there are. */
export function tally(verified: Verified): { done: number; total: number } {
  const answers = Object.values(verified);
  return { done: answers.filter(Boolean).length, total: answers.length };
}

/** Where a record stands: everything confirmed, some of it, or none of it. */
export type VerificationState = 'full' | 'partial' | 'none';

export function verificationState(verified: Verified): VerificationState {
  const { done, total } = tally(verified);
  if (total && done === total) return 'full';
  return done ? 'partial' : 'none';
}

export const VERIFICATION_LABELS: Record<VerificationState, string> = {
  full: 'Fully verified',
  partial: 'Partly verified',
  none: 'Unverified'
};

/**
 * The facets spelled out, for the hover of a badge that can only afford a number.
 *
 * Only the facets that apply are named, so a shot cartridge does not read as owing a bullet
 * verification it can never have.
 */
export function verificationSummary(verified: Verified): string {
  return FACETS.filter((facet) => facet in verified)
    .map((facet) => `${FACET_LABELS[facet]} ${verified[facet] ? 'verified' : 'unverified'}`)
    .join(' · ');
}

/**
 * One number for how far a record has been checked, which is what the list sorts on.
 *
 * Each confirmed facet is worth `+1` and each one still outstanding `-1`, so a record ranks by how
 * much of it somebody has actually read rather than by how much of it exists. An unexplained
 * plausibility finding is `-2`: a figure that fails a rule with nothing to account for it is worse
 * than a figure nobody has looked at, because the site has positive reason to doubt it. A finding
 * the dataset explains costs nothing -- that is what explaining it was for.
 *
 * Facets that do not apply score nothing either way, so a shot cartridge with no bullet is not
 * punished for having no bullet.
 */
export function verificationScore(entry: Entry): number {
  const { done, total } = tally(entry.verified);
  return done - (total - done) - 2 * entry.warnings;
}

/** One row of the index shipped with the app; see `scripts/build-index.mjs`. */
export interface Entry {
  key: string;
  name: string;
  family: string;
  country: string | null;
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
  /**
   * What a person has confirmed about this record, facet by facet, and only for the facets that
   * apply to it. See `Verified`; the list filters and sorts on this and the cartridge page names
   * each one.
   */
  verified: Verified;
  /** Total plausibility checks that fired, including known exceptions. */
  checks: number;
  /** Findings on the record that no listed exception explains. */
  warnings: number;
}

export const FAMILY_LABELS: Record<string, string> = {
  rimless: 'Rimless',
  rimmed: 'Rimmed',
  belted: 'Belted',
  pistol: 'Pistol & revolver',
  rimfire: 'Rimfire',
  shotshell: 'Shot cartridge'
};
