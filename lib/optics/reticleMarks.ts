/**
 * What a reticle is made of, in the only coordinates it can honestly be made of: angles.
 *
 * A reticle is not a picture of a certain size. It is a set of marks at known angular positions,
 * and the size it appears is whatever the eyepiece and the magnification make it. So every
 * coordinate here is in the reticle's own unit - mrad or MOA, whichever `Reticle.unit` says --
 * with **x to the right and y up**, origin at the centre of the cross. Nothing is in pixels or
 * millimetres until `reticleDrawing.ts` puts it on a page.
 *
 * Reticle marks and trajectory holds share angular coordinates, so the renderer can overlay
 * them without a separate unit conversion.
 *
 * **Only generic patterns are generated here.** A crosshair, a duplex, a dot grid, a hash grid --
 * the shapes that are categories rather than products. A named commercial pattern is recorded by
 * its owner as *their* subtensions, in user data, and drawn by the same renderer; see B.3 on why
 * numbers rather than images is the whole design.
 */

/** Positions and lengths are in the reticle's own angular unit. */
export type Mark =
  /** A straight stroke. Horizontal runs along y, vertical along x. */
  | {
      readonly kind: 'line';
      readonly axis: 'horizontal' | 'vertical';
      /** The stroke lies at this offset on the other axis; 0 is the centre line. */
      readonly at: number;
      readonly from: number;
      readonly to: number;
      /** Stroke thickness, in the reticle's unit. A real reticle wire has an angular width. */
      readonly width: number;
    }
  | { readonly kind: 'dot'; readonly x: number; readonly y: number; readonly diameter: number }
  | {
      readonly kind: 'circle';
      readonly x: number;
      readonly y: number;
      readonly diameter: number;
      readonly width: number;
    }
  | {
      readonly kind: 'label';
      readonly x: number;
      readonly y: number;
      readonly text: string;
      /** Cap height, in the reticle's unit. */
      readonly size: number;
    };

export interface PatternOptions {
  /** How far the marks reach from the centre, in the reticle's unit. */
  readonly reach?: number;
  /** Spacing between marks, in the reticle's unit. 1 mrad is the classic dot grid. */
  readonly spacing?: number;
  /** Thickness of the fine centre wires. */
  readonly width?: number;
  /** Label every nth mark; 0 for none. */
  readonly labelEvery?: number;
}

const defaults = {
  reach: 5,
  spacing: 1,
  width: 0.06,
  labelEvery: 2
};

/** A plain cross: two wires, nothing else. The floor every other pattern is built on. */
export function crosshair(options: PatternOptions = {}): Mark[] {
  const { reach, width } = { ...defaults, ...options };
  return [
    { kind: 'line', axis: 'horizontal', at: 0, from: -reach, to: reach, width },
    { kind: 'line', axis: 'vertical', at: 0, from: -reach, to: reach, width }
  ];
}

/**
 * A duplex: fine in the middle, thick towards the edges.
 *
 * The thick outer posts are not decoration - they draw the eye to a centre that would otherwise
 * be lost against a dark background, which is why nearly every hunting reticle is one.
 */
export function duplex(options: PatternOptions = {}): Mark[] {
  const { reach, width } = { ...defaults, ...options };
  const fine = reach * 0.45;
  const heavy = width * 4;
  const posts: Mark[] = [];
  for (const axis of ['horizontal', 'vertical'] as const) {
    posts.push(
      { kind: 'line', axis, at: 0, from: -reach, to: -fine, width: heavy },
      { kind: 'line', axis, at: 0, from: fine, to: reach, width: heavy }
    );
  }
  return [...crosshair(options), ...posts];
}

/**
 * A dot grid: dots at every spacing along both wires.
 *
 * At 1 mrad spacing this is the classic mil-dot arrangement, which is a category of reticle
 * rather than anybody's product - the pattern is a ranging convention, and the arithmetic that
 * uses it is `rangeFromReticle`.
 */
export function dotGrid(options: PatternOptions = {}): Mark[] {
  const { reach, spacing, width, labelEvery } = { ...defaults, ...options };
  const marks: Mark[] = [...crosshair(options)];
  const diameter = width * 3.5;
  for (let n = spacing; n <= reach + 1e-9; n += spacing) {
    for (const [x, y] of [
      [n, 0],
      [-n, 0],
      [0, n],
      [0, -n]
    ] as const) {
      marks.push({ kind: 'dot', x, y, diameter });
    }
    if (labelEvery > 0 && Math.abs(Math.round(n / spacing) % labelEvery) < 1e-9) {
      const label = String(Math.round((n / spacing) * spacing * 10) / 10);
      marks.push({ kind: 'label', x: n, y: -spacing * 0.55, text: label, size: spacing * 0.3 });
      marks.push({ kind: 'label', x: -n, y: -spacing * 0.55, text: label, size: spacing * 0.3 });
    }
  }
  return marks;
}

/**
 * A hash grid: ticks rather than dots, and shorter ones between them.
 *
 * More precise to read than dots, because a tick has an edge and a dot has a middle.
 */
export function hashGrid(options: PatternOptions = {}): Mark[] {
  const { reach, spacing, width, labelEvery } = { ...defaults, ...options };
  const marks: Mark[] = [...crosshair(options)];
  const half = spacing / 2;
  for (let n = half; n <= reach + 1e-9; n += half) {
    const major = Math.abs(n / spacing - Math.round(n / spacing)) < 1e-9;
    const length = major ? spacing * 0.5 : spacing * 0.25;
    // Ticks on the horizontal wire stand vertically, and the other way round.
    marks.push({ kind: 'line', axis: 'vertical', at: n, from: -length / 2, to: length / 2, width });
    marks.push({ kind: 'line', axis: 'vertical', at: -n, from: -length / 2, to: length / 2, width });
    marks.push({ kind: 'line', axis: 'horizontal', at: n, from: -length / 2, to: length / 2, width });
    marks.push({
      kind: 'line',
      axis: 'horizontal',
      at: -n,
      from: -length / 2,
      to: length / 2,
      width
    });
    if (major && labelEvery > 0 && Math.round(n / spacing) % labelEvery === 0) {
      const label = String(Math.round(n / spacing));
      marks.push({ kind: 'label', x: n, y: -spacing * 0.6, text: label, size: spacing * 0.3 });
      marks.push({ kind: 'label', x: -n, y: -spacing * 0.6, text: label, size: spacing * 0.3 });
    }
  }
  return marks;
}

/** The generic patterns, by name, for a designer to start from. */
export const PATTERNS = {
  crosshair,
  duplex,
  dotGrid,
  hashGrid
} as const;

export type PatternName = keyof typeof PATTERNS;

/** The furthest any mark reaches from the centre. What a drawing has to fit. */
export function extentOf(marks: readonly Mark[]): number {
  let extent = 0;
  const note = (value: number) => {
    if (Math.abs(value) > extent) extent = Math.abs(value);
  };
  for (const mark of marks) {
    if (mark.kind === 'line') {
      note(mark.at);
      note(mark.from);
      note(mark.to);
    } else {
      note(mark.x);
      note(mark.y);
    }
  }
  return extent;
}
