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
   * The case outline as published `[radius, z]` points -- the fallback a card draws itself when
   * there is no rendered drawing, and `null` where the sheet dimensions no case at all. See
   * `shape` in `scripts/build-index.mjs` for what the outline does and does not include.
   */
  shape: [number, number][] | null;
  /** From the record's annotations; see `Confidence`. */
  confidence: Confidence;
  /** Total plausibility checks that fired, including known exceptions. */
  checks: number;
  /** Findings on the record that no listed exception explains. */
  warnings: number;
  /** The second verification: the drawn bullet's nose form, confirmed by a person or not. */
  bulletVerified: boolean;
}

export const FAMILY_LABELS: Record<string, string> = {
  rimless: 'Rimless',
  rimmed: 'Rimmed',
  belted: 'Belted',
  pistol: 'Pistol & revolver',
  rimfire: 'Rimfire',
  shotshell: 'Shot cartridge'
};
