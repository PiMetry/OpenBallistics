/**
 * Personal record types shared by browser storage, exports and solvers.
 * They have no framework dependency; the IndexedDB adapter lives in the app.
 * Figures record their provenance through `Source`. Catalogue references can retain
 * snapshots so renamed or removed records do not erase a user's gun configuration.
 */

/** The format string every export carries, so a file can be recognised without parsing it fully. */
export const USER_DATA_FORMAT = 'openballistics-user-data';

/** Bumped whenever a shape here changes. Import migrates older, refuses newer. */
export const USER_DATA_VERSION = 1;

/**
 * Provenance of a personal figure.
 * `published` is excluded because a personal measurement does not become published
 * reference data by being saved.
 */
export type SourceKind = 'measured' | 'estimated' | 'imported';

export interface Source {
  kind: SourceKind;
  /** ISO date. When the measurement was taken, not when the record was saved. */
  date: string;
  by?: string;
  note?: string;
}

/** A number that knows where it came from. */
export interface Sourced<T> {
  value: T;
  unit: string;
  source: Source;
}

/**
 * A reference into the catalogue, with enough of the record kept to survive its removal.
 *
 * The reference wins while it resolves. The snapshot is a safety net, not a copy of the dataset:
 * only what a solver or a drawing needs.
 */
export interface CartridgeRef {
  key: string;
  snapshot?: {
    name: string;
    family: string;
    /** ISO date the snapshot was taken. */
    capturedAt: string;
    fields: Record<string, number>;
  };
}

export type TwistHand = 'right' | 'left';

export interface Barrel {
  lengthMm: number;
  /** One turn in this many millimetres. */
  twistMm?: number;
  /** Spin drift is signed by this, so it is not decoration. */
  twistHand?: TwistHand;
  landDiaMm?: number;
  grooveDiaMm?: number;
  grooves?: number;
  grooveWidthMm?: number;
}

export type ClickUnit = 'mrad' | 'moa';

export interface Scope {
  name?: string;
  clickUnit: ClickUnit;
  /** 0.1 for a mrad turret, 0.25 for a quarter-MOA one. */
  clickValue: number;
  heightOverBoreMm: number;
  zeroDistanceM: number;
  /** A zero is only meaningful with the conditions it was set in. */
  zeroConditions?: { temperatureC?: number; pressureHpa?: number; altitudeM?: number };
}

/** General gun record. The `rifles` collection name remains backup-compatible. */
export type GunKind = 'rifle' | 'pistol' | 'revolver' | 'shotgun' | 'airgun' | 'other';
export interface Gun {
  id: string;
  name: string;
  kind?: GunKind;
  notes?: string;
  cartridge: CartridgeRef;
  barrel: Barrel;
  scope?: Scope;
  muzzleVelocity?: Sourced<number>;
  /** ISO timestamps, so a re-import can tell an edited rifle from a second one. */
  created: string;
  updated: string;
}

/** The whole of what a user has, and what an export file contains. */
/**
 * The stored form of a cartridge designed by the user.
 * This module owns the export schema; `lib/designer` builds records in that schema.
 * `origin` excludes `published` because saving a design does not add it to the catalogue.
 */
export interface StoredCartridge {
  id: string;
  /** The key the user files it under. Their own; not checked against the dataset. */
  key: string;
  name: string;
  family: string;
  /**
   * The figures, by path (`cartridge.lengths.L3`). `null` means the source does not give it;
   * a path that is absent means nobody has entered it. Those are different.
   */
  fields: Record<string, unknown>;
  /** The dataset's annotation block, carried through - `primerType` is needed to draw at all. */
  annotations?: unknown;
  source?: { publisher?: string; url?: string; retrieved?: string };
  notes?: string;
  /** Never `published`: see above. */
  origin: SourceKind;
  created: string;
  updated: string;
}

/**
 * A reticle recorded by the user for their own scope.
 * Saving it creates a personal record, not a catalogue entry.
 * Marks use the `lib/optics` shape but remain unknown here to avoid a module dependency.
 */
export interface StoredReticle {
  id: string;
  name: string;
  focalPlane: 'FFP' | 'SFP';
  /** Required for SFP and meaningless for FFP; without it an SFP reticle cannot be used at all. */
  ratedMagnification?: number;
  unit: 'moa' | 'mrad';
  /** The geometry: `Mark[]` from `lib/optics/reticleMarks`. */
  marks: unknown[];
  /** What the user based it on: a maker and a model, or a generic pattern name. */
  notes?: string;
  origin: SourceKind;
  created: string;
  updated: string;
}

/**
 * A target face designed by the user.
 * Catalogue faces cite a governing body, rulebook, edition and rule number.
 * Personal faces have no `source` field, keeping them distinct from rulebook entries.
 */
export interface StoredTargetFace {
  id: string;
  name: string;
  /** The distance it is meant for, metres. */
  distanceM: number;
  /** Diameters in millimetres, outermost first or not: the reader sorts them. */
  rings: { score: number; diameterMm: number }[];
  innerTenMm?: number;
  blackMm?: number;
  whiteCentreMm?: number;
  tenIsWhiteDot?: boolean;
  scoringMethod?: 'centre';
  cardMm: { width: number; height: number };
  notes?: string;
  origin: SourceKind;
  created: string;
  updated: string;
}

export interface UserData {
  format: typeof USER_DATA_FORMAT;
  version: number;
  /** ISO timestamp of the export itself. */
  exported: string;
  app?: { name?: string; commit?: string };
  rifles: Gun[];
  cartridges: StoredCartridge[];
  reticles: StoredReticle[];
  targetFaces: StoredTargetFace[];
  loads: unknown[];
  sessions: unknown[];
  settings: Record<string, unknown>;
}

export function emptyUserData(now = new Date().toISOString()): UserData {
  return {
    format: USER_DATA_FORMAT,
    version: USER_DATA_VERSION,
    exported: now,
    rifles: [],
    cartridges: [],
    reticles: [],
    targetFaces: [],
    loads: [],
    sessions: [],
    settings: {}
  };
}
