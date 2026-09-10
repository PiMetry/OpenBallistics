/** Responsive target diagrams. The viewBox uses millimetres for scoring coordinates. */

import { ringsInward, type TargetFace } from './types';
import type { ScoredShot, Shot } from './score';

export interface TargetDrawingOptions {
  /** Shots to mark on the face. */
  readonly shots?: readonly (Shot | ScoredShot)[];
  /** The bullet diameter, so a shot hole is drawn the size it really is. */
  readonly calibreMm?: number;
  /** Draw the full card, or crop to the scoring rings. Default: the card. */
  readonly extent?: 'card' | 'rings';
  readonly inkColour?: string;
  readonly paperColour?: string;
  readonly shotColour?: string;
}

const round = (value: number): string => {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * How large the drawing is, in millimetres.
 *
 * The two numbers `targetSvg` sizes its viewBox with, given out on their own because a printed
 * sheet has to know them before there is a drawing: whether a face fits the paper at 1:1 decides
 * how it is laid out, and a target printed at any other scale has to say so.
 */
export function targetExtentMm(
  face: TargetFace,
  options: TargetDrawingOptions = {}
): { widthMm: number; heightMm: number } {
  const rings = ringsInward(face);
  const outer = rings[rings.length - 1]!.diameterMm;
  const card = face.cardMm;
  // Without a card in the record there is nothing to draw one from, so the rings are the page.
  if (options.extent === 'rings' || !card) return { widthMm: outer * 1.04, heightMm: outer * 1.04 };
  return { widthMm: card.width, heightMm: card.height };
}

/**
 * Draw the face.
 *
 * The coordinate system is millimetres with the origin at the middle of the face, y up - the same
 * convention `score.ts` uses, so a shot at (12, -4) is drawn where it is scored.
 */
export function targetSvg(face: TargetFace, options: TargetDrawingOptions = {}): string {
  const ink = options.inkColour ?? '#111111';
  const paper = options.paperColour ?? '#ffffff';
  const shotInk = options.shotColour ?? '#b3541e';
  const rings = ringsInward(face);
  const outer = rings[rings.length - 1]!.diameterMm;

  const { widthMm: width, heightMm: height } = targetExtentMm(face, options);
  const lineWidth = face.ringThicknessMm?.[0] ?? Math.max(outer / 1000, 0.1);

  // Millimetres, origin at the centre, y flipped for SVG.
  const x = (mm: number) => round(width / 2 + mm);
  const y = (mm: number) => round(height / 2 - mm);

  const body: string[] = [`<rect width="${round(width)}" height="${round(height)}" fill="${paper}"/>`];

  // The black aiming mark goes down first; the rings are drawn over it.
  if (face.blackMm) {
    body.push(
      `<circle cx="${x(0)}" cy="${y(0)}" r="${round(face.blackMm / 2)}" fill="${ink}"/>`
    );
  }

  if (face.whiteCentreMm) {
    body.push(`<circle cx="${x(0)}" cy="${y(0)}" r="${round(face.whiteCentreMm / 2)}" fill="${paper}"/>`);
  }

  for (const ring of rings) {
    // A ring inside the black has to be drawn in white to be visible at all, which is exactly what
    // a real target does.
    const inBlack = face.blackMm !== undefined && ring.diameterMm <= face.blackMm && ring.diameterMm > (face.whiteCentreMm ?? 0);
    body.push(
      `<circle cx="${x(0)}" cy="${y(0)}" r="${round(ring.diameterMm / 2)}" fill="none" stroke="${inBlack ? paper : ink}" stroke-width="${round(lineWidth)}"/>`
    );
  }

  if (face.innerTenMm && !face.tenIsWhiteDot) {
    const inBlack = face.blackMm !== undefined && face.innerTenMm <= face.blackMm && face.innerTenMm > (face.whiteCentreMm ?? 0);
    body.push(`<circle cx="${x(0)}" cy="${y(0)}" r="${round(face.innerTenMm / 2)}" fill="none" stroke="${inBlack ? paper : ink}" stroke-width="${round(lineWidth)}"/>`);
  }

  // The 10 on an air target is a white dot, not a scoring circle - draw what is really printed.
  if (face.tenIsWhiteDot) {
    const ten = rings[0]!;
    body.push(`<circle cx="${x(0)}" cy="${y(0)}" r="${round(ten.diameterMm / 2)}" fill="${paper}"/>`);
  }

  // Ring numbers, on the horizontal, in the band each belongs to. Only where there is room.
  const numberSize = Math.min(outer / 45, 10);
  if (numberSize >= 1) {
    for (let i = 1; i < rings.length; i += 1) {
      const ring = rings[i]!;
      const inner = rings[i - 1]!;
      if (ring.score < 1 || ring.score > 9) continue;
      const band = (ring.diameterMm - inner.diameterMm) / 2;
      if (band < numberSize * 1.2) continue;
      const at = (ring.diameterMm + inner.diameterMm) / 4;
      const inBlack = face.blackMm !== undefined && ring.diameterMm <= face.blackMm && ring.diameterMm > (face.whiteCentreMm ?? 0);
      for (const [px, py] of [
        [at, 0],
        [-at, 0],
        [0, at],
        [0, -at]
      ] as const) {
        body.push(
          `<text x="${x(px)}" y="${y(py)}" fill="${inBlack ? paper : ink}" font-size="${round(numberSize)}" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif">${ring.score}</text>`
        );
      }
    }
  }

  for (const shot of options.shots ?? []) {
    const r = (options.calibreMm ?? 5) / 2;
    body.push(
      `<circle cx="${x(shot.xMm)}" cy="${y(shot.yMm)}" r="${round(r)}" fill="none" stroke="${shotInk}" stroke-width="${round(Math.max(lineWidth, 0.3))}"/>`
    );
  }

  const title = `${face.name} - ${face.source.body} ${face.source.rulebook} ${face.source.edition}, rule ${face.source.rule}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${round(width)} ${round(height)}" role="img" aria-label="${escape(title)}">`,
    `<title>${escape(title)}</title>`,
    ...body,
    '</svg>'
  ].join('\n');
}
