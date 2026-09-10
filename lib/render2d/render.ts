/** Render profiles with shared viewport, colour and layout rules. */


import { darken, MATERIAL_HEX, surfaceMaterial, type Bullet, type Material } from '../shapes2d/bullet';
import type { MetallicCase } from '../shapes2d/case';
import { EPSILON, type Point, type Profile } from '../geom/profile';
import {
  ANNOTATION_STROKE_MM,
  OUTLINE_STROKE_MM,
  Viewport,
  bulletOutlinePath,
  clipPathDef,
  fmt,
  fullSectionPath,
  insetStrokePath,
  num,
  pathOf,
  sectionLines,
  svgHeader,
  viewportFor,
  type Frame
} from '../geom/svg';

// The colour helpers moved to live with the material they describe, so that a shape drawing its
// own section does not have to depend on the drawing layer. Still offered here, because callers
// have always taken them from the renderer.
export { MATERIAL_HEX_OF, darken } from '../shapes2d/bullet';


/** Build the coloured material layer for a metallic cartridge. */

export function metallicParts(
  c: MetallicCase,
  bullet: Bullet | null,
  exposed: Profile | null,
  profile: Profile,
  view: Viewport,
  prefix = ''
): [string, string[]] {
  const contour = fullSectionPath(profile, view);
  const clipId = `${prefix}contour-${c.key}`;
  const caseMaterial: Material = 'BRASS';
  let bulletParts: string[] = [];
  let bulletDefs = '';
  if (exposed && bullet) {
    const bulletClip = `${prefix}bullet-${c.key}`;
    const bulletContour = fullSectionPath(exposed, view);
    const surface = surfaceMaterial(bullet);
    bulletDefs = clipPathDef(bulletContour, bulletClip);
    bulletParts = [
      `<g clip-path="url(#${bulletClip})">`,
      `<path d="${bulletContour}" fill="${MATERIAL_HEX[surface]}" stroke="none"/>`,
      `<path d="${bulletOutlinePath(exposed, view, OUTLINE_STROKE_MM)}" fill="none" stroke="${darken(surface)}" stroke-width="${num(view.length(OUTLINE_STROKE_MM))}"/>`,
      '</g>'
    ];
  }
  const parts = [
    ...bulletParts,
    `<g clip-path="url(#${clipId})">`,
    `<path d="${contour}" fill="${MATERIAL_HEX[caseMaterial]}" stroke="none"/>`,
    sectionLines(profile, view, darken(caseMaterial)),
    `<path d="${insetStrokePath(profile, view, OUTLINE_STROKE_MM)}" fill="none" stroke="${darken(caseMaterial)}" stroke-width="${num(view.length(OUTLINE_STROKE_MM))}"/>`,
    '',
    '</g>'
  ];
  return [clipPathDef(contour, clipId) + bulletDefs, parts];
}

/** The outlined section, with section lines under the contour. */
export function outlineParts(
  c: { key: string },
  profile: Profile,
  exposed: Profile | null,
  view: Viewport,
  prefix = '',
  materialBoundaries: number[] = []
): [string, string[]] {
  const contour = fullSectionPath(profile, view);
  const strokeMm = OUTLINE_STROKE_MM;
  const outline = insetStrokePath(profile, view, strokeMm);
  const clipId = `${prefix}contour-${c.key}`;
  let bulletDefs = '';
  let bulletParts: string[] = [];
  if (exposed) {
    const bulletClip = `${prefix}bullet-${c.key}`;
    bulletDefs = clipPathDef(fullSectionPath(exposed, view), bulletClip);
    bulletParts = [
      `<g clip-path="url(#${bulletClip})">`,
      `<path d="${bulletOutlinePath(exposed, view, strokeMm)}" fill="none" stroke="#111" stroke-width="${num(view.length(strokeMm))}"/>`,
      '</g>'
    ];
  }
  const parts = [
    `<g clip-path="url(#${clipId})">`,
    sectionLines(profile, view, '#777', materialBoundaries),
    '',
    '</g>',
    `<g clip-path="url(#${clipId})">`,
    `<path d="${outline}" fill="none" stroke="#111" stroke-width="${num(view.length(strokeMm))}"/>`,
    '</g>',
    ...bulletParts
  ];
  return [clipPathDef(contour, clipId) + bulletDefs, parts];
}


export function renderVisualSvg(
  c: MetallicCase,
  profile: Profile,
  bullet: Bullet | null,
  exposed: Profile | null,
  options: { scale?: number; frame?: Frame } = {}
): string {
  const view = viewportFor(exposed ? [profile, exposed] : [profile], { scale: options.scale ?? 4.0, frame: options.frame ?? 'upright' });
  const [defs, parts] = metallicParts(c, bullet, exposed, profile, view);
  return [svgHeader(view, `${c.name} - visual`), '<defs>', defs, '</defs>', ...parts, '</svg>'].join('');
}

// ---- The cartridge cutaway ----------------------------------

/** What a settled charge is drawn in: not a material of the model, a colour for a volume. */
const POWDER_FILL = '#4b4640';

/**
 * The round in section: the brass as a wall around its powder space, the whole bullet where it
 * sits, and the charge under it. Not one of the renderer's faces - the renderer draws the
 * outside of a cartridge - but built from the same profiles it dumped, so the outline, the
 * interior and the bullet are the tested ones.
 */
/**
 * The cutaway for the seating panel: the brass in section, the charge under the bullet.
 *
 * The default prefix is this surface's own and deliberately not `live-`, which
 * `drawing.ts` gives the card drawings: a page shows both at once, an id is global to the
 * document, and two `<svg>` roots sharing one both resolve `url(#id)` to whichever the document
 * met first - so the loser is clipped by the winner's contour, drawn in the winner's
 * coordinates, and disappears.
 */
export function sectionParts(
  c: MetallicCase,
  outline: Profile,
  inner: Profile | null,
  bullet: Bullet | null,
  bulletProfile: Profile | null,
  view: Viewport,
  powderLevelZ: number | null,
  prefix = 'seat-'
): [string, string[]] {
  const brass: Material = 'BRASS';
  const clipId = `${prefix}contour-${c.key}`;
  const contour = fullSectionPath(outline, view);
  const stroke = num(view.length(OUTLINE_STROKE_MM));
  const parts: string[] = [`<g clip-path="url(#${clipId})">`];

  if (inner) {
    // One wall each side: the outside up to the mouth, the interior back down to the floor, the
    // solid head across the axis. Two polygons rather than one with a hole, so no fill rule is
    // relied on.
    const floorZ = inner[0]![1];
    const wallPoints: Point[] = [[0, 0], ...outline, ...[...inner].reverse(), [0, floorZ]];
    for (const sign of [1, -1]) {
      parts.push(`<path d="${pathOf(wallPoints.map(([r, z]): Point => [sign * r, z]), view, true)}" fill="${MATERIAL_HEX[brass]}" stroke="none"/>`);
    }
    if (powderLevelZ != null && powderLevelZ > floorZ + EPSILON) {
      const column = between(inner, floorZ, Math.min(powderLevelZ, inner[inner.length - 1]![1]));
      parts.push(`<path d="${fullSectionPath(column, view)}" fill="${POWDER_FILL}" stroke="none"/>`);
    }
  } else {
    parts.push(`<path d="${contour}" fill="${MATERIAL_HEX[brass]}" stroke="none"/>`);
  }
  parts.push('</g>');

  if (bullet && bulletProfile) {
    const surface = surfaceMaterial(bullet);
    parts.push(
      `<path d="${fullSectionPath(bulletProfile, view)}" fill="${MATERIAL_HEX[surface]}" stroke="none"/>`,
      `<path d="${insetStrokePath(bulletProfile, view, OUTLINE_STROKE_MM)}" fill="none" stroke="${darken(surface)}" stroke-width="${stroke}"/>`
    );
  }

  parts.push(`<g clip-path="url(#${clipId})">`);
  if (inner) {
    // The interior's own edge, so the wall reads as a wall.
    for (const sign of [1, -1]) {
      parts.push(`<path d="${pathOf(inner.map(([r, z]): Point => [sign * r, z]), view, false)}" fill="none" stroke="${darken(brass)}" stroke-width="${num(view.length(OUTLINE_STROKE_MM * 0.6))}"/>`);
    }
  }
  parts.push(
    `<path d="${insetStrokePath(outline, view, OUTLINE_STROKE_MM)}" fill="none" stroke="${darken(brass)}" stroke-width="${stroke}"/>`,
    '</g>'
  );
  return [clipPathDef(contour, clipId), parts];
}

/** The part of a monotonic profile between two axial positions, both ends interpolated. */
function between(profile: Profile, z0: number, z1: number): Profile {
  const radiusAt = (z: number): number => {
    if (z <= profile[0]![1]) return profile[0]![0];
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, za] = profile[i]!, [r1, zb] = profile[i + 1]!;
      if (z <= zb) return zb - za < EPSILON ? r1 : r0 + ((r1 - r0) * (z - za)) / (zb - za);
    }
    return profile[profile.length - 1]![0];
  };
  const out: Profile = [[radiusAt(z0), z0]];
  for (const [r, z] of profile) if (z > z0 + EPSILON && z < z1 - EPSILON) out.push([r, z]);
  out.push([radiusAt(z1), z1]);
  return out;
}

// ---- The chamber in steel ----------------------------------------------------

/** How much steel to draw around the bore, mm. Not a C.I.P. dimension; nothing is measured on it. */
const BARREL_WALL_MM = 3.0;
export const STEEL_HEX = '#8b8d8e';
const STEEL_RGB: [number, number, number] = [0.545, 0.553, 0.557];

function darkenRgb([r, g, b]: [number, number, number]): string {
  const hex = (v: number) => Math.trunc(v * 255 * 0.55).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** The steel's outer edge: a straight wall outside the widest point of the bore, the bore's length. */
export function steelBoundary(bore: Profile): Profile {
  const outer = Math.max(...bore.map(([r]) => r)) + BARREL_WALL_MM;
  return [[outer, bore[0]![1]], [outer, bore[bore.length - 1]![1]]];
}

/** Two closed walls, one each side of the bore; the void between them is the published chamber. */
export function steelSectionPath(bore: Profile, steel: Profile, view: Viewport): string {
  const outer = steel[0]![0];
  const commands: string[] = [];
  for (const sign of [1, -1]) {
    const points: Point[] = [
      ...bore.map(([r, z]): Point => [sign * r, z]),
      [sign * outer, bore[bore.length - 1]![1]],
      [sign * outer, bore[0]![1]]
    ];
    points.forEach(([r, z], index) => {
      const [x, y] = view.xy(r, z);
      commands.push(`${index === 0 ? 'M' : 'L'}${fmt(x)},${fmt(y)}`);
    });
    commands.push('Z');
  }
  return commands.join(' ');
}

/** `_steel_parts`: the filled, outlined section, clipped to itself; carries its own defs. */
function steelParts(bore: Profile, steel: Profile, view: Viewport, key: string): string[] {
  const section = steelSectionPath(bore, steel, view);
  const clipId = `steel-${key}`;
  const stroke = view.length(OUTLINE_STROKE_MM);
  return [
    '<defs>',
    clipPathDef(section, clipId),
    '</defs>',
    `<g clip-path="url(#${clipId})">`,
    `<path d="${section}" fill="${STEEL_HEX}" stroke="none"/>`,
    `<path d="${section}" fill="none" stroke="${darkenRgb(STEEL_RGB)}" stroke-width="${(stroke * 2).toFixed(4)}"/>`,
    '</g>'
  ];
}

/** `render_chamber_visual_svg`: the chamber's section in steel, no dimensions. */
export function renderChamberVisualSvg(key: string, name: string, bore: Profile, options: { scale?: number; frame?: Frame } = {}): string {
  const steel = steelBoundary(bore);
  const view = viewportFor([steel], { scale: options.scale ?? 4.0, frame: options.frame ?? 'upright' });
  return [svgHeader(view, `${name} - chamber`), ...steelParts(bore, steel, view, key), '</svg>'].join('');
}

/**
 * The round seated in its chamber, both from the breech face, for the live view: the steel, the
 * whole exposed bullet, the case over it, and a mark at the estimated contact with the lands.
 */
export function fitParts(
  c: MetallicCase,
  outline: Profile,
  bullet: Bullet | null,
  exposed: Profile | null,
  bore: Profile,
  view: Viewport,
  contact: { bulletZ: number; chamberZ: number; radius: number } | null
): string[] {
  const steel = steelBoundary(bore);
  const stroke = view.length(OUTLINE_STROKE_MM);
  const caseContour = fullSectionPath(outline, view);
  const caseClip = `fit-case-${c.key}`;
  const parts: string[] = [...steelParts(bore, steel, view, c.key), '<defs>', clipPathDef(caseContour, caseClip)];
  const bulletParts: string[] = [];
  if (exposed && bullet) {
    const bulletClip = `fit-bullet-${c.key}`;
    const bulletContour = fullSectionPath(exposed, view);
    const surface = surfaceMaterial(bullet);
    parts.push(clipPathDef(bulletContour, bulletClip));
    bulletParts.push(
      `<g clip-path="url(#${bulletClip})">`,
      `<path d="${bulletContour}" fill="${MATERIAL_HEX[surface]}" stroke="none"/>`,
      `<path d="${bulletOutlinePath(exposed, view, OUTLINE_STROKE_MM)}" fill="none" stroke="${darken(surface)}" stroke-width="${stroke.toFixed(4)}"/>`,
      '</g>'
    );
  }
  parts.push('</defs>', ...bulletParts,
    `<g clip-path="url(#${caseClip})">`,
    `<path d="${caseContour}" fill="${MATERIAL_HEX.BRASS}" stroke="none"/>`,
    `<path d="${insetStrokePath(outline, view, OUTLINE_STROKE_MM)}" fill="none" stroke="${darken('BRASS')}" stroke-width="${stroke.toFixed(4)}"/>`,
    '</g>'
  );
  if (contact) {
    // The estimated meeting: a mark on the ogive where it will touch, a mark on the leade where it
    // will be touched, and the jump between them, on both sides of the axis.
    const thin = (view.length(ANNOTATION_STROKE_MM) * 1.5).toFixed(4);
    for (const sign of [1, -1]) {
      const [x1, y1] = view.xy(sign * contact.radius, contact.bulletZ);
      const [x2, y2] = view.xy(sign * contact.radius, contact.chamberZ);
      parts.push(
        `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="#b3541e" stroke-width="${thin}" stroke-dasharray="${view.length(0.6).toFixed(3)},${view.length(0.4).toFixed(3)}"/>`,
        `<circle cx="${fmt(x1)}" cy="${fmt(y1)}" r="${view.length(0.25).toFixed(3)}" fill="#b3541e"/>`,
        `<circle cx="${fmt(x2)}" cy="${fmt(y2)}" r="${view.length(0.25).toFixed(3)}" fill="none" stroke="#b3541e" stroke-width="${thin}"/>`
      );
    }
  }
  return parts;
}

