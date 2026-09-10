/** Draw a catalogued bullet from its record. */

import {
  arcRadius,
  BOAT_TAIL_ANGLE_DEG,
  BOAT_TAIL_LENGTH_CALIBRES,
  bulletOuterProfile,
  HOLLOW_BASE_DEPTH_CALIBRES,
  HOLLOW_POINT_DEPTH_CALIBRES,
  JACKET_THICKNESS_CALIBRES,
  MEPLAT_TOOLING_MM,
  RT_OVER_R,
  SHANK_FRACTION,
  surfaceMaterial,
  type BaseType,
  type Bullet,
  type BulletCategory,
  type JacketType,
  type Material,
  type OgiveType,
  type TipType
} from '../shapes2d/bullet';
import { compose, composeLive, type LiveOptions } from './drawing';
import { EPSILON, type Point, type Profile } from '../geom/profile';
import {
  clipPathDef,
  fullSectionPath,
  insetStrokePath,
  num,
  OUTLINE_STROKE_MM,
  viewportFor,
  type Frame
} from '../geom/svg';
import { darken, MATERIAL_HEX_OF } from './render';
import { annotate, dimension, PAGE_MARGIN_MM, pageMargins, type Dimension } from './technical';

/** What `bullet_from_record` reads of a record: the stated figures, never the derived block. */
export interface BulletRecordLike {
  key: string;
  manufacturer: string;
  name: string;
  diameter: number;
  length?: number | null;
  bearing?: number | null;
  nose?: number | null;
  base_to_ogive?: number | null;
  meplat?: number | null;
  base: { type: string; length?: number | null; angle?: number | null; diameter?: number | null };
  ogive: { form: string; radius_calibres?: number | null; rt_over_r?: number | null };
  tip: { type: string; cavity_depth?: number | null };
  construction?: { jacket?: string; core?: string; jacket_material?: string; core_material?: string };
  cannelure?: { from_base: number; width?: number | null } | null;
}

/** `build.DEFAULT_LENGTH_CALIBRES`: a record with no length at all is drawn this long. */
const DEFAULT_LENGTH_CALIBRES = 4.0;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const degrees = (rad: number): number => (rad * 180) / Math.PI;

/** `bullet_from_record`: the model for a record, and the fields that had to be assumed. */
export function bulletFromRecord(record: BulletRecordLike): { bullet: Bullet; assumed: string[] } {
  const assumed: string[] = [];
  const d = record.diameter;
  let length = record.length ?? null;
  if (length == null) {
    length = DEFAULT_LENGTH_CALIBRES * d;
    assumed.push('length');
  }

  const baseType = record.base.type as BaseType;
  const boatTail = baseType === 'boat_tail' || baseType === 'rebated_boat_tail';
  let bt = 0, angle: number | null = null, baseDiameter = d;
  if (boatTail) {
    bt = record.base.length ?? NaN;
    if (record.base.length == null) {
      bt = BOAT_TAIL_LENGTH_CALIBRES * d;
      assumed.push('base.length');
    }
    angle = record.base.angle ?? null;
    if (record.base.diameter == null) {
      if (angle == null) {
        angle = BOAT_TAIL_ANGLE_DEG;
        assumed.push('base.angle');
      }
      baseDiameter = d - 2 * bt * Math.tan(radians(angle));
      assumed.push('base.diameter');
    } else {
      baseDiameter = record.base.diameter;
      if (angle == null) angle = degrees(Math.atan((d - baseDiameter) / (2 * bt)));
    }
  }

  const form = record.ogive.form as OgiveType;
  const category: BulletCategory = form === 'secant' || form === 'hybrid' ? 'rifle_vld' : 'rifle_spitzer';
  let bearing = record.bearing ?? null, nose = record.nose ?? null;
  if (bearing == null && nose == null) {
    const shankEnd = SHANK_FRACTION[category] * length;
    bearing = Math.max(shankEnd - bt, 0);
    nose = length - bt - bearing;
    assumed.push('bearing', 'nose');
  } else if (bearing == null) {
    bearing = length - bt - (nose as number);
    assumed.push('bearing');
  } else if (nose == null) {
    nose = length - bt - bearing;
    assumed.push('nose');
  }
  if ((bearing as number) <= 0 || (nose as number) <= 0) {
    throw new Error(`${record.key}: the lengths leave no room for a shank or a nose`);
  }

  const tipType = record.tip.type as TipType;
  let meplat = record.meplat ?? null;
  if (meplat == null) {
    if (tipType === 'sharp') meplat = 0;
    else {
      meplat = MEPLAT_TOOLING_MM;
      assumed.push('meplat');
    }
  }
  let cavity = 0;
  if (tipType === 'hollow_point') {
    cavity = record.tip.cavity_depth || HOLLOW_POINT_DEPTH_CALIBRES * d;
    if (record.tip.cavity_depth == null) assumed.push('tip.cavity_depth');
  }

  let radiusCalibres: number;
  if (record.ogive.radius_calibres != null) {
    radiusCalibres = record.ogive.radius_calibres;
  } else {
    const tangent = arcRadius('tangent', d, meplat, nose as number);
    const ratio = record.ogive.rt_over_r || RT_OVER_R[form] || 1.0;
    radiusCalibres = tangent / ratio / d;
    assumed.push('ogive.radius_calibres');
  }

  const construction = record.construction ?? {};
  assumed.push('construction.jacket_thickness');

  const shankStart = bt;
  const shankEnd = bt + (bearing as number);
  const bullet: Bullet = {
    category,
    base: {
      baseType,
      diameter: baseDiameter,
      startZ: 0,
      endZ: shankStart,
      boatTailAngle: boatTail ? angle : null,
      hollowDepth: baseType === 'hollow_base' ? HOLLOW_BASE_DEPTH_CALIBRES * d : null
    },
    cylinder: {
      diameter: d,
      startZ: shankStart,
      endZ: shankEnd,
      cannelureZ: record.cannelure ? record.cannelure.from_base : null,
      cannelureDepth: 0,
      heeled: false
    },
    ogive: { ogiveType: form, radiusCalibres, startZ: shankEnd, endZ: length, startDiameter: d, endDiameter: meplat },
    tip: { tipType, startZ: length, endZ: length, meplatDiameter: meplat, cavityDepth: cavity },
    construction: {
      jacket: (construction.jacket ?? 'fmj') as JacketType,
      jacketMaterial: (construction.jacket_material ?? 'GILDING_METAL') as Material,
      coreMaterial: (construction.core_material ?? 'LEAD') as Material
    },
    jacketThickness: JACKET_THICKNESS_CALIBRES * d,
    seatingDepth: shankEnd,
    baseZ: 0,
    tipZ: length,
    length
  };
  return { bullet, assumed };
}

/** `bullet_dimensions`: the catalogue's columns, each at its place on the model. */
function bulletDrawingDimensions(record: { base_to_ogive?: number | null }, bullet: Bullet): Dimension[] {
  const { base, cylinder: shank, ogive, tip } = bullet;
  const dims: Dimension[] = [
    dimension('L', bullet.length, { zFrom: base.startZ, zTo: tip.endZ }),
    dimension('D', shank.diameter, { radius: shank.diameter / 2, zFrom: (shank.startZ + shank.endZ) / 2 }),
    dimension('Lb', shank.endZ - shank.startZ, { zFrom: shank.startZ, zTo: shank.endZ }),
    dimension('Ln', ogive.endZ - ogive.startZ, { zFrom: ogive.startZ, zTo: tip.endZ })
  ];
  if (base.baseType === 'boat_tail' || base.baseType === 'rebated_boat_tail') {
    dims.push(dimension('Lbt', base.endZ - base.startZ, { zFrom: base.startZ, zTo: base.endZ }));
    dims.push(dimension('Db', base.diameter, { radius: base.diameter / 2, below: true }));
  }
  if (record.base_to_ogive != null) {
    dims.push(dimension('Lbo', record.base_to_ogive, { zFrom: base.startZ, zTo: base.startZ + record.base_to_ogive, side: -1 }));
  }
  if (tip.meplatDiameter > 0) {
    dims.push(dimension('Dm', tip.meplatDiameter, { radius: tip.meplatDiameter / 2, zFrom: tip.endZ }));
  }
  return dims;
}

/** The bullet's two faces and its dimension layer on one viewport. */
function bulletLayers(record: { key: string; base_to_ogive?: number | null }, bullet: Bullet, scale: number, frame: Frame, showDimensions = true) {
  const profile = bulletOuterProfile(bullet);
  const dimensions = showDimensions ? bulletDrawingDimensions(record, bullet) : [];
  const view = viewportFor([profile], {
    scale,
    marginMm: PAGE_MARGIN_MM,
    frame,
    ...pageMargins(dimensions, [], [], [profile], false, frame)
  });
  const contour = fullSectionPath(profile, view);
  const stroke = num(view.length(OUTLINE_STROKE_MM));
  const surface = surfaceMaterial(bullet);
  const visualClip = `v-bullet-${record.key}`;
  const outlineClip = `t-bullet-${record.key}`;
  const visual = [
    `<g clip-path="url(#${visualClip})">`,
    `<path d="${contour}" fill="${MATERIAL_HEX_OF(surface)}" stroke="none"/>`,
    `<path d="${insetStrokePath(profile, view, OUTLINE_STROKE_MM)}" fill="none" stroke="${darken(surface)}" stroke-width="${stroke}"/>`,
    '</g>'
  ];
  const outline = [
    `<g clip-path="url(#${outlineClip})">`,
    `<path d="${insetStrokePath(profile, view, OUTLINE_STROKE_MM)}" fill="none" stroke="#111" stroke-width="${stroke}"/>`,
    '</g>'
  ];
  const defs = clipPathDef(contour, visualClip) + clipPathDef(contour, outlineClip);
  const [dims] = annotate(dimensions, [], [], profile, view);
  return { profile, view, visual, outline, defs, dims };
}

/** `render_bullet_drawing_svg`: the bullet in one file with four faces. */
export function renderBulletDrawingSvg(
  record: { key: string; manufacturer: string; name: string; base_to_ogive?: number | null },
  bullet: Bullet,
  options: { scale?: number; frame?: Frame } = {}
): string {
  const { profile, view, visual, outline, defs, dims } = bulletLayers(record, bullet, options.scale ?? 4.0, options.frame ?? 'upright');
  return compose(view, `${record.manufacturer} ${record.name}`, [profile], { defs, visual, technical: outline, dimensions: dims });
}

/**
 * The silhouette's radius at one station, interpolated along the segment that spans it. A profile
 * runs base to tip, so the first point at or past `z` and the one before it bracket it.
 */
function silhouetteRadiusAt(profile: Profile, z: number): number {
  let previous = profile[0]!;
  for (const point of profile) {
    if (point[1] >= z - EPSILON) {
      const span = point[1] - previous[1];
      if (span <= EPSILON) return point[0];
      return previous[0] + ((z - previous[1]) / span) * (point[0] - previous[0]);
    }
    previous = point;
  }
  return profile[profile.length - 1]![0];
}

/**
 * A polymer tip's insert: the nose forward of `from`, cut off square at the station its rear face
 * sits on. That face has to meet the silhouette where it is, which on an ogive is far narrower
 * than the shank behind it; taking the widest radius back down the bullet instead sends the insert
 * out through the nose. Half a profile, on the axis, like every other.
 */
export function polymerInsertProfile(profile: Profile, from: number): Profile {
  const forward = profile.filter(([, z]) => z > from + EPSILON);
  if (forward.length === 0) return [];
  return [[silhouetteRadiusAt(profile, from), from], ...forward];
}

/**
 * The tip's form, which the silhouette alone does not show: the designer's addition to the
 * catalogue drawing. A hollow point's cavity as a cut into the nose, and a polymer tip as the
 * insert it is, back from the tip by the length given; a flat or open meplat is the flat itself.
 */
function tipMarks(bullet: Bullet, profile: Profile, view: { xy(r: number, z: number): [number, number]; length(mm: number): number }, outline: boolean): string {
  const tip = bullet.tip;
  if (!(tip.cavityDepth > 0) || (tip.tipType !== 'hollow_point' && tip.tipType !== 'polymer')) return '';
  const from = tip.endZ - tip.cavityDepth;
  const stroke = num(view.length(OUTLINE_STROKE_MM));
  const dash = outline ? ` stroke-dasharray="${view.length(0.6).toFixed(3)},${view.length(0.4).toFixed(3)}"` : '';
  const pathOf = (points: Point[]): string =>
    points.map(([r, z], i) => { const [x, y] = view.xy(r, z); return `${i ? 'L' : 'M'}${x.toFixed(4)},${y.toFixed(4)}`; }).join(' ') + ' Z';
  if (tip.tipType === 'polymer') {
    const insert = polymerInsertProfile(profile, from);
    if (insert.length < 2) return '';
    const closed: Point[] = [...insert, ...[...insert].reverse().map(([r, z]): Point => [-r, z])];
    return `<path d="${pathOf(closed)}" fill="${outline ? 'none' : MATERIAL_HEX_OF('POLYMER_RED')}" stroke="${outline ? '#111' : darken('POLYMER_RED')}" stroke-width="${stroke}"${dash}/>`;
  }
  const rm = tip.meplatDiameter / 2;
  const cavity: Point[] = [[rm, tip.endZ], [0, from], [-rm, tip.endZ]];
  return `<path d="${pathOf(cavity)}" fill="${outline ? 'none' : '#2b2b2b'}" stroke="${outline ? '#111' : '#1a1a1a'}" stroke-width="${num(view.length(OUTLINE_STROKE_MM * 0.7))}"${dash}/>`;
}

/** The bullet for a live view: the catalogue's drawing, one face, with or without its dimensions. */
export function liveBulletDrawing(
  record: { key: string; manufacturer: string; name: string; base_to_ogive?: number | null },
  bullet: Bullet,
  options: LiveOptions & { scale?: number; frame?: Frame; extras?: boolean } = {}
): { markup: string; widthMm: number; heightMm: number } {
  const scale = options.scale ?? 4.0;
  const frame = options.frame ?? 'landscape';
  const { profile, view, visual, outline, defs, dims } = bulletLayers(record, bullet, scale, frame, options.dimensions ?? false);
  const technical = options.style === 'technical';
  const layers = [...(technical ? outline : visual)];
  if (options.extras) layers.push(tipMarks(bullet, profile, view, technical));
  if (options.dimensions) layers.push(dims);
  return composeLive(view, `${record.manufacturer} ${record.name}`, [profile], defs, layers, options);
}
