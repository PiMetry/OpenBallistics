/** Combine the visual face, outline and dimensions into one drawing. */

import { exposedProfile, type Bullet } from '../shapes2d/bullet';
import { caseOuterProfile, type MetallicCase } from '../shapes2d/case';
import { chamberBoreProfile, type Chamber } from '../shapes2d/chamber';
import type { Profile } from '../geom/profile';
import {
  clipPathDef,
  fmt,
  OUTLINE_STROKE_MM,
  viewportFor,
  type Frame,
  type Viewport
} from '../geom/svg';
import {
  metallicParts,
  outlineParts,
  STEEL_HEX,
  steelBoundary,
  steelSectionPath
} from './render';
import { hullOuterProfile, isShotshell, shotshellMaterialBoundaries, shotshellParts, type ShotshellCase } from '../shapes2d/shotshell';
import {
  annotate,
  ANNOTATIONS_CLASS,
  bulletDimensions,
  chamberAngles,
  chamberCallouts,
  chamberDimensions,
  INK_SYMBOL,
  metallicAngles,
  metallicCallouts,
  metallicDimensions,
  PAGE_MARGIN_MM,
  pageMargins,
  shotshellDimensions,
  type AngleMark,
  type Callout,
  type ChamberRecordFacts,
  type Dimension
} from './technical';

/** The faces, by fragment: whether each is framed tight to the object rather than to the page. */
const FACES: [string, boolean][] = [
  ['visual', true],
  ['visual-dims', false],
  ['visual-dims-dark', false],
  ['plain', true],
  ['technical', false]
];

const TIGHT_MARGIN_MM = 0.4;
const INK_SYMBOL_DARK = '#9fc4ee';

/** The switching stylesheet, as the file carries it. */
const STYLE =
  '<style>' +
  '.visual{display:none}' +
  '#visual:target~.visual,#visual-dims:target~.visual,#visual-dims-dark:target~.visual' +
  '{display:inline}' +
  '#visual:target~.technical,#visual-dims:target~.technical,#visual-dims-dark:target~.technical,' +
  '#visual:target~.dimensions,#plain:target~.dimensions{display:none}' +
  `#visual-dims-dark:target~.dimensions [fill="${INK_SYMBOL}"]{fill:${INK_SYMBOL_DARK}}` +
  `#visual-dims-dark:target~.dimensions [stroke="${INK_SYMBOL}"]{stroke:${INK_SYMBOL_DARK}}` +
  '</style>';

/** The steel's colour components, for its darker outline. */
const STEEL_RGB: [number, number, number] = [0.545, 0.553, 0.557];
function darkenRgb([r, g, b]: [number, number, number]): string {
  const hex = (v: number) => Math.trunc(v * 255 * 0.55).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** `tight_box`: the object's own box on the page in user units, `[x, y, width, height]`. */
function tightBox(profiles: Profile[], view: Viewport): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const profile of profiles) {
    for (const [r, z] of profile) {
      for (const sign of [1, -1]) {
        const [x, y] = view.xy(sign * r, z);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = view.length(TIGHT_MARGIN_MM);
  return [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad];
}

/** `compose`: the file - root in millimetres, the switch, the views, then the three layers. */
export function compose(
  view: Viewport,
  title: string,
  drawn: Profile[],
  layers: { defs: string; visual: string[]; technical: string[]; dimensions: string }
): string {
  const [x0, y0, w, h] = tightBox(drawn, view);
  const full = `0 0 ${fmt(view.width)} ${fmt(view.height)}`;
  const tight = `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}`;
  const views = FACES.map(([face, isTight]) => `<view id="${face}" viewBox="${isTight ? tight : full}"/>`).join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(view.width / view.scale)}" height="${fmt(view.height / view.scale)}" viewBox="${full}">`,
    `<title>${escapeXml(title)}</title>`,
    STYLE,
    views,
    '<defs>',
    layers.defs,
    '</defs>',
    '<g class="visual">',
    ...layers.visual,
    '</g>',
    '<g class="technical">',
    ...layers.technical,
    '</g>',
    layers.dimensions,
    '</svg>'
  ].join('');
}

interface DrawingOptions {
  scale?: number;
  frame?: Frame;
  /** The case outline, where the caller has it; computed from the case otherwise. */
  profile?: Profile;
  /** Room for the values table, for the technical drawing that carries one. */
  showTable?: boolean;
}

/** What a cartridge's drawing is made of, before it is composed: the live views draw from it. */
interface DrawingParts {
  view: Viewport;
  profile: Profile;
  exposed: Profile | null;
  drawn: Profile[];
  dimensions: Dimension[];
  angles: AngleMark[];
  callouts: Callout[];
}

/** The dimensions, angles and callouts of a subject, and the viewport grown for them. */
function drawingParts(
  subject: MetallicCase | ShotshellCase,
  bullet: Bullet | null,
  options: DrawingOptions = {}
): DrawingParts {
  const scale = options.scale ?? 4.0;
  const frame = options.frame ?? 'upright';
  let profile: Profile;
  let exposed: Profile | null = null;
  let dimensions: Dimension[];
  let angles: AngleMark[] = [];
  let callouts: Callout[] = [];
  if (isShotshell(subject)) {
    profile = options.profile ?? hullOuterProfile(subject.hull);
    dimensions = shotshellDimensions(subject);
  } else {
    profile = options.profile ?? caseOuterProfile(subject);
    dimensions = metallicDimensions(subject);
    if (bullet) {
      exposed = exposedProfile(bullet, subject.mouth.z);
      dimensions = dimensions.concat(bulletDimensions(subject, bullet, exposed !== null));
    }
    angles = metallicAngles(subject);
    callouts = metallicCallouts(subject);
  }
  const drawn = exposed ? [profile, exposed] : [profile];
  const view = viewportFor(drawn, {
    scale,
    marginMm: PAGE_MARGIN_MM,
    frame,
    ...pageMargins(dimensions, angles, callouts, drawn, options.showTable ?? false, frame)
  });
  return { view, profile, exposed, drawn, dimensions, angles, callouts };
}

/** `render_drawing_svg`: the cartridge, in one file with its faces. */
export function renderDrawingSvg(subject: MetallicCase | ShotshellCase, bullet: Bullet | null, options: DrawingOptions = {}): string {
  const parts = drawingParts(subject, bullet, options);
  const { view, profile, exposed, drawn, dimensions, angles, callouts } = parts;
  let visualDefs: string, visual: string[], boundaries: number[] = [];
  if (isShotshell(subject)) {
    [visualDefs, visual] = shotshellParts(subject, view, 'v-');
    boundaries = shotshellMaterialBoundaries(subject);
  } else {
    [visualDefs, visual] = metallicParts(subject, bullet, exposed, profile, view, 'v-');
  }
  const [outlineDefs, outline] = outlineParts(subject, profile, exposed, view, 't-', boundaries);
  const [dims] = annotate(dimensions, angles, callouts, profile.concat(exposed ?? []), view);
  return compose(view, subject.name, drawn, { defs: visualDefs + outlineDefs, visual, technical: outline, dimensions: dims });
}

/**
 * `render_technical_svg`: the outlined drawing with its dimensions and, when asked, the values
 * table - the file with the `#plain` switch, which is the one face the merged drawing does not
 * carry.
 */
export function renderTechnicalSvg(subject: MetallicCase | ShotshellCase, bullet: Bullet | null, options: DrawingOptions = {}): string {
  const parts = drawingParts(subject, bullet, options);
  const { view, profile, exposed, dimensions, angles, callouts } = parts;
  const boundaries = isShotshell(subject) ? shotshellMaterialBoundaries(subject) : [];
  const [defs, outline] = outlineParts(subject, profile, exposed, view, '', boundaries);
  const [dims] = annotate(dimensions, angles, callouts, profile.concat(exposed ?? []), view, options.showTable ?? false);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" id="plain" width="${fmt(view.width)}" height="${fmt(view.height)}" viewBox="0 0 ${fmt(view.width)} ${fmt(view.height)}">`,
    `<title>${escapeXml(`${subject.name} - technical`)}</title>`,
    `<style>svg:target .${ANNOTATIONS_CLASS}{display:none}</style>`,
    '<defs>',
    defs,
    '</defs>',
    ...outline,
    dims,
    '</svg>'
  ].join('');
}

// ---- The live forms ------------------------------------------------------------------------------

export interface LiveOptions {
  /** The coloured face, or the outline. */
  style?: 'visual' | 'technical';
  /** The dimension layer over it; without it the drawing is framed to the object. */
  dimensions?: boolean;
  /** Size the root in CSS pixels at this many per millimetre; in user units otherwise. */
  pixelsPerMm?: number | null;
  /** A class on the root, for the page's stylesheet: `technical` gets its line-art treatment. */
  className?: string;
  scale?: number;
  frame?: Frame;
  profile?: Profile;
  /**
   * The namespace for this drawing's clip-path ids.
   *
   * A page holds several of these at once - a card, the seating panel, the chamber - and they
   * are separate `<svg>` roots but one document, where an id is global. Two roots that share an
   * id both resolve `url(#id)` to whichever came first, so a drawing gets clipped by another
   * drawing's contour, in another drawing's coordinates, and vanishes. Whoever renders more than
   * one live drawing into a page passes a prefix of its own.
   */
  idPrefix?: string;
}

/** One face on one root: the page's box with the dimensions, the object's own without. */
export function composeLive(
  view: Viewport,
  title: string,
  drawn: Profile[],
  defs: string,
  layers: string[],
  options: LiveOptions
): { markup: string; widthMm: number; heightMm: number } {
  const box: [number, number, number, number] = options.dimensions ? [0, 0, view.width, view.height] : tightBox(drawn, view);
  const widthMm = box[2] / view.scale, heightMm = box[3] / view.scale;
  const ppm = options.pixelsPerMm;
  const size = ppm
    ? `width="${(widthMm * ppm).toFixed(2)}" height="${(heightMm * ppm).toFixed(2)}"`
    : `width="${fmt(box[2])}" height="${fmt(box[3])}"`;
  const cls = options.className ? ` class="${options.className}"` : '';
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg"${cls} ${size} viewBox="${fmt(box[0])} ${fmt(box[1])} ${fmt(box[2])} ${fmt(box[3])}">` +
    `<title>${escapeXml(title)}</title><defs>${defs}</defs>${layers.join('')}</svg>`;
  return { markup, widthMm, heightMm };
}

/** A cartridge for a live view: the face asked for, the dimensions or not, sized for the page. */
export function liveDrawing(
  subject: MetallicCase | ShotshellCase,
  bullet: Bullet | null,
  options: LiveOptions = {}
): { markup: string; widthMm: number; heightMm: number } {
  const scale = options.scale ?? 4.0;
  const frame = options.frame ?? 'landscape';
  const ids = options.idPrefix ?? 'live-';
  const parts = drawingParts(subject, bullet, { scale, frame, profile: options.profile });
  const { view, profile, exposed, drawn } = parts;
  let defs: string, visual: string[], boundaries: number[] = [];
  if (isShotshell(subject)) {
    [defs, visual] = shotshellParts(subject, view, ids);
    boundaries = shotshellMaterialBoundaries(subject);
  } else {
    [defs, visual] = metallicParts(subject, bullet, exposed, profile, view, ids);
  }
  let layers: string[];
  if (options.style === 'technical') {
    const [outlineDefs, outline] = outlineParts(subject, profile, exposed, view, ids, boundaries);
    defs = outlineDefs;
    layers = outline;
  } else {
    layers = [...visual];
  }
  if (options.dimensions) {
    layers.push(annotate(parts.dimensions, parts.angles, parts.callouts, profile.concat(exposed ?? []), view)[0]);
  }
  return composeLive(view, subject.name, drawn, defs, layers, options);
}

/** The chamber's section for a live view, in steel or outlined, with its dimensions or not. */
export function liveChamberDrawing(
  chamber: Chamber,
  name: string,
  facts: ChamberRecordFacts | null,
  options: LiveOptions = {}
): { markup: string; widthMm: number; heightMm: number } {
  const scale = options.scale ?? 4.0;
  const frame = options.frame ?? 'landscape';
  const bore = chamberBoreProfile(chamber);
  const steel = steelBoundary(bore);
  const dimensions = chamberDimensions(chamber, facts);
  const angles = chamberAngles(chamber);
  const callouts = chamberCallouts(chamber);
  const view = viewportFor([steel], {
    scale,
    marginMm: PAGE_MARGIN_MM,
    frame,
    ...pageMargins(dimensions, angles, callouts, [steel], false, frame)
  });
  const section = steelSectionPath(bore, steel, view);
  const stroke = view.length(OUTLINE_STROKE_MM);
  const clip = `${options.idPrefix ?? 'live-'}steel-${chamber.key}`;
  const layers =
    options.style === 'technical'
      ? [`<g clip-path="url(#${clip})">`, `<path d="${section}" fill="none" stroke="#111" stroke-width="${(stroke * 2).toFixed(4)}"/>`, '</g>']
      : [
          `<g clip-path="url(#${clip})">`,
          `<path d="${section}" fill="${STEEL_HEX}" stroke="none"/>`,
          `<path d="${section}" fill="none" stroke="${darkenRgb(STEEL_RGB)}" stroke-width="${(stroke * 2).toFixed(4)}"/>`,
          '</g>'
        ];
  if (options.dimensions) layers.push(annotate(dimensions, angles, callouts, steel, view)[0]);
  return composeLive(view, `${name} - chamber`, [steel], clipPathDef(section, clip), layers, options);
}

/** `render_chamber_drawing_svg`: the chamber's section, in one file with its faces. */
export function renderChamberDrawingSvg(
  chamber: Chamber,
  name: string,
  facts: ChamberRecordFacts | null,
  options: { scale?: number; frame?: Frame } = {}
): string {
  const bore = chamberBoreProfile(chamber);
  const steel = steelBoundary(bore);
  const dimensions = chamberDimensions(chamber, facts);
  const angles = chamberAngles(chamber);
  const callouts = chamberCallouts(chamber);
  const frame = options.frame ?? 'upright';
  const view = viewportFor([steel], {
    scale: options.scale ?? 4.0,
    marginMm: PAGE_MARGIN_MM,
    frame,
    ...pageMargins(dimensions, angles, callouts, [steel], false, frame)
  });
  const section = steelSectionPath(bore, steel, view);
  const stroke = view.length(OUTLINE_STROKE_MM);
  const visualClip = `v-steel-${chamber.key}`;
  const outlineClip = `t-steel-${chamber.key}`;
  const visual = [
    `<g clip-path="url(#${visualClip})">`,
    `<path d="${section}" fill="${STEEL_HEX}" stroke="none"/>`,
    `<path d="${section}" fill="none" stroke="${darkenRgb(STEEL_RGB)}" stroke-width="${(stroke * 2).toFixed(4)}"/>`,
    '</g>'
  ];
  const outline = [
    `<g clip-path="url(#${outlineClip})">`,
    `<path d="${section}" fill="none" stroke="#111" stroke-width="${(stroke * 2).toFixed(4)}"/>`,
    '</g>'
  ];
  const [dims] = annotate(dimensions, angles, callouts, steel, view);
  return compose(view, `${name} - chamber`, [steel], {
    defs: clipPathDef(section, visualClip) + clipPathDef(section, outlineClip),
    visual,
    technical: outline,
    dimensions: dims
  });
}

