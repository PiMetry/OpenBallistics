/**
 * A reticle on a page, and a trajectory laid over it.
 *
 * Draws the reticle from its dimensions and overlays computed holds to produce a range card.
 *
 * **The one thing that must not be got wrong is the second focal plane.** On an SFP scope the
 * marks are etched on glass behind the zoom, so they stay put on the image while the *image*
 * changes size. Turn the magnification down and each mark covers more angle. A hold of 1.5 mrad
 * therefore does not land on the 1.5 mark - it lands nearer the centre, by the ratio of the
 * magnifications. Drawing the marks where they are and the holds where they fall is the whole
 * point: the picture shows the error rather than hiding it.
 *
 * Output is a standalone SVG string. No DOM, no framework: this must stay usable from a test, a
 * script and a page alike.
 */

import { fromAngularUnit, toAngularUnit } from './angles';
import { extentOf, type Mark } from './reticleMarks';
import { ReticleRefusal, type Reticle } from './reticle';

export interface Hold {
  /** Metres. Used only as the label. */
  readonly rangeM: number;
  /** Elevation the shot needs, radians. Positive means the bullet is low and the hold is up. */
  readonly elevationRad: number;
  /** Windage, radians, positive to the right. */
  readonly windageRad: number;
}

export interface ReticleDrawingOptions {
  /** The drawn square's side, in pixels. */
  readonly sizePx?: number;
  /** How much of the reticle to show, in its own unit, measured from centre. */
  readonly reach?: number;
  /** The magnification in use. Required for an SFP reticle, ignored for FFP. */
  readonly magnification?: number;
  readonly holds?: readonly Hold[];
  readonly inkColour?: string;
  readonly holdColour?: string;
  readonly backgroundColour?: string;
}

const round = (value: number): string => {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Where an angle lands on the glass, in mark coordinates.
 *
 * FFP: the mark that reads 1.5 is at 1.5, always. SFP: the marks were calibrated at the rated
 * magnification, so an angle `A` sits at `A · current / rated`. This is the inverse of
 * `observedSubtension`, and it is the only place the two focal planes differ.
 */
export function markPositionFor(
  reticle: Reticle,
  angleInUnits: number,
  magnification?: number
): number {
  if (reticle.focalPlane === 'FFP') return angleInUnits;
  const rated = reticle.ratedMagnification;
  if (!(rated && rated > 0)) {
    throw new ReticleRefusal(
      `${reticle.name} is second focal plane but has no rated magnification: nothing can be placed on it`
    );
  }
  if (!(magnification && magnification > 0)) {
    throw new ReticleRefusal(
      `${reticle.name} is second focal plane: a hold only lands where the marks say at ${rated}x, so the magnification in use is required`
    );
  }
  return (angleInUnits * magnification) / rated;
}

/** Draw the reticle, and the holds if any were given. */
export function reticleSvg(
  reticle: Reticle,
  marks: readonly Mark[],
  options: ReticleDrawingOptions = {}
): string {
  const size = options.sizePx ?? 480;
  const reach = options.reach ?? Math.max(extentOf(marks), 1) * 1.05;
  const ink = options.inkColour ?? '#111111';
  const holdInk = options.holdColour ?? '#b3541e';
  const background = options.backgroundColour ?? '#f4f4f2';

  // Reticle units to pixels, with y flipped: the model has y up, SVG has y down.
  const k = size / (2 * reach);
  const px = (value: number) => round(size / 2 + value * k);
  const py = (value: number) => round(size / 2 - value * k);
  const len = (value: number) => round(Math.max(value * k, 0.4));

  const body: string[] = [];
  for (const mark of marks) {
    if (mark.kind === 'line') {
      const [x1, y1, x2, y2] =
        mark.axis === 'horizontal'
          ? [px(mark.from), py(mark.at), px(mark.to), py(mark.at)]
          : [px(mark.at), py(mark.from), px(mark.at), py(mark.to)];
      body.push(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="${len(mark.width)}" stroke-linecap="butt"/>`
      );
    } else if (mark.kind === 'dot') {
      body.push(
        `<circle cx="${px(mark.x)}" cy="${py(mark.y)}" r="${len(mark.diameter / 2)}" fill="${ink}"/>`
      );
    } else if (mark.kind === 'circle') {
      body.push(
        `<circle cx="${px(mark.x)}" cy="${py(mark.y)}" r="${len(mark.diameter / 2)}" fill="none" stroke="${ink}" stroke-width="${len(mark.width)}"/>`
      );
    } else {
      body.push(
        `<text x="${px(mark.x)}" y="${py(mark.y)}" fill="${ink}" font-size="${len(mark.size) }" text-anchor="middle" font-family="system-ui, sans-serif">${escape(mark.text)}</text>`
      );
    }
  }

  const overlay: string[] = [];
  for (const hold of options.holds ?? []) {
    // Down on the glass is where a high hold goes: dialling up and holding up are the same sign.
    const up = markPositionFor(
      reticle,
      toAngularUnit(hold.elevationRad, reticle.unit),
      options.magnification
    );
    const right = markPositionFor(
      reticle,
      toAngularUnit(hold.windageRad, reticle.unit),
      options.magnification
    );
    if (Math.abs(up) > reach || Math.abs(right) > reach) continue;
    const x = px(right);
    const y = py(-up);
    const r = len(reach * 0.02);
    overlay.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${holdInk}" stroke-width="${len(reach * 0.006)}"/>`,
      `<text x="${round(Number(x) + Number(r) * 2)}" y="${y}" fill="${holdInk}" font-size="${len(reach * 0.05)}" dominant-baseline="middle" font-family="system-ui, sans-serif">${hold.rangeM}</text>`
    );
  }

  const unit = reticle.unit === 'moa' ? 'MOA' : 'MRAD';
  const plane =
    reticle.focalPlane === 'SFP' && reticle.ratedMagnification
      ? ` SFP, calibrated at ${reticle.ratedMagnification}x`
      : ` ${reticle.focalPlane}`;
  const title = `${reticle.name} - ${unit},${plane}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${escape(title)}">`,
    `<title>${escape(title)}</title>`,
    `<rect width="${size}" height="${size}" fill="${background}"/>`,
    ...body,
    ...overlay,
    '</svg>'
  ].join('\n');
}

/** A hold, in the reticle's unit, for a table beside the picture. */
export function holdIn(reticle: Reticle, hold: Hold): { up: number; right: number } {
  return {
    up: toAngularUnit(hold.elevationRad, reticle.unit),
    right: toAngularUnit(hold.windageRad, reticle.unit)
  };
}

/** The angle a mark position stands for, which is the inverse of `markPositionFor`. */
export function angleAtMark(
  reticle: Reticle,
  markPosition: number,
  magnification?: number
): number {
  if (reticle.focalPlane === 'FFP') return fromAngularUnit(markPosition, reticle.unit);
  const rated = reticle.ratedMagnification;
  if (!(rated && rated > 0)) {
    throw new ReticleRefusal(
      `${reticle.name} is second focal plane but has no rated magnification: its marks stand for nothing definite`
    );
  }
  if (!(magnification && magnification > 0)) {
    throw new ReticleRefusal(
      `${reticle.name} is second focal plane: its marks only stand for their printed values at ${rated}x`
    );
  }
  return fromAngularUnit((markPosition * rated) / magnification, reticle.unit);
}
