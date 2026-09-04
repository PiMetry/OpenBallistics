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

export function confidenceLabel(confidence: Confidence): string {
  return confidence === 'implausible' ? t('list.plausibility') : t(`verify.${confidence}`);
}

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
 * `file` is its path under `outlines/<family>/`. `svg` is its extent in millimetres,
 * `[width, height]`, the same as `Entry.svg` -- real millimetres, not the units it was drawn in:
 * the renderer draws the cartridge at 1:1 and the chamber and both dimensioned drawings at 4:1,
 * and `unitsPerMm` in the build is where that is undone. Everything on this site is laid out in
 * millimetres and at one millimetres-per-pixel, so a value here that was not one would put a
 * chamber beside its cartridge at four times the size of the round that goes in it.
 *
 * `l` and `marking` are set only on a shot cartridge, where the gauge names a family and the hull
 * length names a member of it -- a 12 gauge is drawn at each of nine, from 12/35 to 12/89.
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
 * drawing of each and the nose form of the bullet are four different things to proofread, done at
 * different times and often by different people. Reporting one word for all five is how a page
 * claims more than anybody actually checked.
 */
export const FACETS = [
  'cartridge',
  'chamber',
  'cartridgeDrawing',
  'chamberDrawing',
  'bullet'
] as const;
export type Facet = (typeof FACETS)[number];

/**
 * What a facet is called, in the reader's language.
 *
 * A function rather than the map it used to be, because the answer now depends on something that
 * changes while the page is open. The keys never do: they are the dataset's own names and the
 * words the issue forms are keyed by.
 */
export function facetLabel(facet: Facet): string {
  return t(`facet.${facet}`);
}

/** What each facet means, for the reader who wants to know what a person actually proofread. */
export function facetNote(facet: Facet): string {
  return t(`facetNote.${facet}`);
}

/**
 * What is confirmed about one record.
 *
 * **A facet that does not apply is absent, not false.** A record dimensioning no bullet has no
 * bullet to confirm, and a chamber nobody has drawn has no drawing to check; counting those as
 * unverified would leave a fully checked record reading as unfinished for ever. So the keys
 * present are the questions that can be asked of this record, and their values are the answers.
 */
export type Verified = Partial<Record<Facet, boolean>>;

/**
 * How many people have read one facet, and which way they found it.
 *
 * **A score, not a count** (decided 2026-09-04). A facet used to be settled by three people
 * filing an issue about it, and an issue that said the record was wrong counted exactly as much as
 * one that said it was right. Now a reading is an approval or a rejection, and what settles a
 * facet is approvals *less* rejections reaching `VERIFY_THRESHOLD`: a reader who finds a fault
 * does not merely fail to confirm it, they cost it an approval, and a fourth reader has to agree
 * before the site marks it.
 *
 * The tally is not the verdict. Whether a facet is settled travels in the record itself, written
 * upstream from the votes; this is the arithmetic behind that, and it is absent for every facet
 * nobody has voted on -- which is all of them until the first vote lands. See `verifications` in
 * `scripts/build-index.mjs` for why the two come from different places.
 */
export interface Tally {
  approve: number;
  reject: number;
}
export type Votes = Partial<Record<Facet, Tally>>;

/** Approvals less rejections: what has to reach `VERIFY_THRESHOLD` for a facet to be marked. */
export function net(tally: Tally | undefined): number {
  return tally ? tally.approve - tally.reject : 0;
}

/**
 * How many readers in agreement settle a facet.
 *
 * Three, as it has been since the site had a vote at all; the change is what a disagreeing reader
 * now does to the arithmetic. Stated here as well as in `promote-verifications.mjs` because the
 * page says "2 of 3" while the vote is still short, and a page that names a different number from
 * the one the promotion actually uses would be lying quietly.
 */
export const VERIFY_THRESHOLD = 3;

/**
 * Where one facet stands, in a word.
 *
 * `disputed` is the state the count could not express: somebody has read this and found it wrong,
 * which is not the same as nobody having read it. It is worth its own word on the page because it
 * is the one state that asks the reader for something -- another reading.
 */
export type FacetState = 'verified' | 'disputed' | 'reading' | 'unread';

export function facetState(settled: boolean, tally?: Tally): FacetState {
  if (settled) return 'verified';
  if (tally && tally.reject > 0) return 'disputed';
  return net(tally) > 0 ? 'reading' : 'unread';
}

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

export function verificationLabel(state: VerificationState): string {
  return t(`verify.${state}`);
}

/**
 * The facets spelled out, for the hover of a badge that can only afford a number.
 *
 * Only the facets that apply are named, so a shot cartridge does not read as owing a bullet
 * verification it can never have.
 */
export function verificationSummary(verified: Verified, votes: Votes = {}): string {
  return FACETS.filter((facet) => facet in verified)
    .map((facet) => `${facetLabel(facet)} ${facetSummary(verified[facet] === true, votes[facet])}`)
    .join(' · ');
}

/**
 * One facet in a few words: the verdict where there is one, and otherwise how the vote stands.
 *
 * "Unverified" was the only thing the page could say about anything unsettled, which flattened a
 * facet two readers have approved, one a reader has rejected, and one nobody has opened into the
 * same word. Each of those asks the reader for something different.
 */
export function facetSummary(settled: boolean, tally?: Tally): string {
  switch (facetState(settled, tally)) {
    case 'verified':
      return tally ? `verified, ${tally.approve} for and ${tally.reject} against` : 'verified';
    case 'disputed':
      return `disputed, ${tally!.approve} for and ${tally!.reject} against`;
    case 'reading':
      return `${net(tally)} of ${VERIFY_THRESHOLD} agreed`;
    default:
      return 'unverified';
  }
}

/**
 * One number for how far a record has been checked, which is what the list sorts on.
 *
 * A confirmed facet is worth `+1` and one nobody has opened `-1`, so a record ranks by how much of
 * it somebody has actually read rather than by how much of it exists. An unexplained plausibility
 * finding is `-2`: a figure that fails a rule with nothing to account for it is worse than a
 * figure nobody has looked at, because the site has positive reason to doubt it. A finding the
 * dataset explains costs nothing -- that is what explaining it was for.
 *
 * Between those two ends sits the vote (2026-09-04). A facet two readers have approved is not yet
 * verified but is further along than one nobody has touched, and it earns the fraction of the way
 * it has come. A facet somebody has rejected goes the other way, below silence and no lower than
 * an unexplained finding: a reader saying a figure is wrong is the same weight of doubt as a rule
 * saying so.
 *
 * Facets that do not apply score nothing either way, so a shot cartridge with no bullet is not
 * punished for having no bullet.
 */
export function verificationScore(entry: Entry): number {
  const votes = entry.votes ?? {};
  const points = (facet: Facet): number => {
    if (entry.verified[facet]) return 1;
    const score = net(votes[facet]);
    if (score >= VERIFY_THRESHOLD) return 1;
    if (score > 0) return score / VERIFY_THRESHOLD - 1;
    return Math.max(-2, -1 + score / VERIFY_THRESHOLD);
  };
  const facets = FACETS.filter((facet) => facet in entry.verified);
  return facets.reduce((sum, facet) => sum + points(facet), 0) - 2 * entry.warnings;
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
  /**
   * How the vote stands on each facet anybody has voted on; see `Votes`.
   *
   * Absent where nobody has, which is the whole dataset until the first vote lands -- a tally of
   * two zeros on five facets of 526 records would be 91 KB of nothing in an index every visitor
   * downloads.
   */
  votes?: Votes;
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
