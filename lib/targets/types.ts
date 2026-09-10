/**
 * A target face contains ring diameters in millimetres and its rulebook citation.
 * The governing body, rulebook, edition and rule number distinguish dimensions that
 * may change between editions. Dimensions remain in their published units.
 * Scoring applies the target's gauge convention to these diameters; see `score.ts`.
 */

export interface FaceSource {
  /** The body whose rules these are: 'ISSF', 'DSB', 'NRA'. */
  readonly body: string;
  /** The document, as it names itself. */
  readonly rulebook: string;
  /** Which edition. Not optional: this is the field that makes the citation worth having. */
  readonly edition: string;
  /** The rule number the table is printed under. */
  readonly rule: string;
  readonly url?: string;
  /** When the figures were read from that document. */
  readonly retrieved: string;
  /**
   * How the figures got out of the document, because it changes how much to trust them.
   *
   * `text-layer` means the PDF carried real text and the numbers were extracted, where a
   * transposed digit is not a plausible failure. `read-from-scan` means the document is an image
   * and the numbers were read by eye - sound, but a weaker claim, and a reader is entitled to know
   * which they are looking at. Absent means text-layer, which is the stronger case.
   */
  readonly transcription?: 'text-layer' | 'read-from-scan';
  readonly effectiveFrom?: string;
}

export interface Ring {
  /** What a shot in this ring scores. */
  readonly score: number;
  /** The ring's diameter in millimetres. */
  readonly diameterMm: number;
}

export interface TargetFace {
  readonly id: string;
  readonly name: string;
  /** The distance the face is meant for, metres. */
  readonly distanceM: number;
  /** Rings, outermost first is not assumed - they are sorted on use. */
  readonly rings: readonly Ring[];
  /**
   * The inner ten, where the body defines one: a sub-ring used only to break ties.
   *
   * Absent where the rules define it by gauge rather than by diameter, as the 10 m air rifle does
   * - and absent is how that is said, rather than by inventing a diameter for it.
   */
  readonly innerTenMm?: number;
  /** The black aiming mark's diameter, and which rings it covers. */
  readonly blackMm?: number;
  /** White centre within a black aiming annulus, as on BDS ZF and handgun targets. */
  readonly whiteCentreMm?: number;
  /**
   * The printed card, millimetres. What a sheet of paper has to be to hold the face.
   *
   * **Optional, because not every rulebook says.** ISSF and DSB both give a minimum visible card;
   * the NRA smallbore rules give ring diameters and no card at all. Inventing one to fill the
   * field would be a fabricated figure of exactly the kind this dataset refuses, so it is absent
   * and the drawing falls back to the scoring rings.
   */
  readonly cardMm?: { readonly width: number; readonly height: number };
  /** Printed ring line thickness, millimetres. Two numbers where the rules give a range. */
  readonly ringThicknessMm?: readonly [number, number];
  /** The 10 ring is a white dot on some air targets rather than a scoring circle. */
  readonly tenIsWhiteDot?: boolean;
  readonly source: FaceSource;
  /** Discipline rules checked separately from the drawing's dimensional source. */
  readonly ruleSources?: readonly FaceSource[];
  /** Muzzleloader and ordnance disciplines score the hole centre instead of its edge. */
  readonly scoringMethod?: 'centre';
  /** A face may be used at several distances without changing its physical dimensions. */
  readonly distancesM?: readonly number[];
  readonly note?: string;
}

/** Rings from the middle out, which is the order scoring wants. */
export function ringsInward(face: TargetFace): Ring[] {
  return [...face.rings].sort((a, b) => a.diameterMm - b.diameterMm);
}

/** The face's outermost scoring diameter - how much paper the scoring area needs. */
export function outerDiameterMm(face: TargetFace): number {
  return Math.max(...face.rings.map((ring) => ring.diameterMm));
}
