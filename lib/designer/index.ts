/**
 * The bullet designer's arithmetic: from a photograph with a ruler in it to a bullet's measurements
 *
 * Nothing here touches the DOM. A page collects pixel coordinates - two points on each ruler at a
 * known separation, the base centre and the tip, points along the silhouette's edges - and this
 * turns them into millimetres along the bullet's axis, reads the measurements off the profile, and
 * builds a record in the catalogue's schema. `designer.test.ts` runs a bullet the geometry port
 * drew through it, in pixels, and expects its own dimensions back.
 *
 * What it must not do is invent: a figure the tracing cannot give stays absent, and the record is
 * marked `measured` with the pixel size carried as its uncertainty.
 */

import type { Profile } from '@lib/geom';
import type {
  Bullet,
  OgiveType,
  TipType
} from '@lib/shapes2d';
import {
  arcRadius,
  bulletOuterProfile,
  RT_OVER_R
} from '../shapes2d';

export type Px = [number, number];

/** A ruler: two marked points and the distance between them in millimetres. */
export interface Ruler {
  a: Px;
  b: Px;
  mm: number;
}

export interface Scale {
  /** Millimetres per pixel, the mean over the rulers. */
  mmPerPx: number;
  /** Largest relative disagreement between rulers, as a fraction; zero with one ruler. */
  spread: number;
}

/** Millimetres per pixel from every ruler, averaged, with how far they disagree. */
export function scaleFrom(rulers: Ruler[]): Scale | null {
  const each = rulers
    .filter((r) => r.mm > 0)
    .map((r) => r.mm / Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!each.length) return null;
  const mean = each.reduce((a, v) => a + v, 0) / each.length;
  const spread = each.length > 1 ? Math.max(...each.map((v) => Math.abs(v - mean) / mean)) : 0;
  return { mmPerPx: mean, spread };
}

/** The bullet's axis in the picture: where it starts (the base centre) and its direction. */
export interface Axis {
  origin: Px;
  /** Unit vector from base toward tip. */
  dir: Px;
}

export function axisFrom(base: Px, tip: Px): Axis | null {
  const dx = tip[0] - base[0], dy = tip[1] - base[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  return { origin: base, dir: [dx / len, dy / len] };
}

/**
 * The axis refit from two traced edges: the least-squares line through the midpoints of paired
 * points, which cancels a base or tip clicked a little off centre. Pairs by order along the first
 * edge, nearest by axial position. Falls back to the clicked axis with fewer than three pairs.
 */
export function refitAxis(clicked: Axis, upper: Px[], lower: Px[]): Axis {
  if (upper.length < 3 || lower.length < 3) return clicked;
  const along = (p: Px) => (p[0] - clicked.origin[0]) * clicked.dir[0] + (p[1] - clicked.origin[1]) * clicked.dir[1];
  const mids: Px[] = [];
  for (const p of upper) {
    const zp = along(p);
    let best = lower[0]!;
    for (const q of lower) if (Math.abs(along(q) - zp) < Math.abs(along(best) - zp)) best = q;
    mids.push([(p[0] + best[0]) / 2, (p[1] + best[1]) / 2]);
  }
  const n = mids.length;
  const mx = mids.reduce((a, p) => a + p[0], 0) / n, my = mids.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of mids) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  // Principal direction of the midpoints.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let dir: Px = [Math.cos(theta), Math.sin(theta)];
  if (dir[0] * clicked.dir[0] + dir[1] * clicked.dir[1] < 0) dir = [-dir[0], -dir[1]];
  // The origin: the clicked base projected onto the fitted line.
  const t = (clicked.origin[0] - mx) * dir[0] + (clicked.origin[1] - my) * dir[1];
  return { origin: [mx + dir[0] * t, my + dir[1] * t], dir };
}

/** A traced point as (r, z) in millimetres along the axis; r is the distance from it. */
export function toProfile(points: Px[], axis: Axis, mmPerPx: number): Profile {
  const out: Profile = points.map(([x, y]) => {
    const dx = x - axis.origin[0], dy = y - axis.origin[1];
    const z = (dx * axis.dir[0] + dy * axis.dir[1]) * mmPerPx;
    const r = Math.abs(dx * -axis.dir[1] + dy * axis.dir[0]) * mmPerPx;
    return [r, z];
  });
  out.sort((a, b) => a[1] - b[1]);
  return out;
}

/**
 * Two edges into one profile: every point of both, sorted by z, with the radius the mean of the
 * two edges where both reach - so a slightly off-centre axis cancels rather than doubling.
 */
export function mergeEdges(upper: Profile, lower: Profile | null): Profile {
  if (!lower || lower.length < 2) return upper;
  const at = (p: Profile, z: number): number | null => {
    if (z < p[0]![1] || z > p[p.length - 1]![1]) return null;
    for (let i = 0; i < p.length - 1; i++) {
      const [r0, z0] = p[i]!, [r1, z1] = p[i + 1]!;
      if (z <= z1) return z1 - z0 < 1e-12 ? r1 : r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
    }
    return null;
  };
  const zs = [...new Set([...upper.map(([, z]) => z), ...lower.map(([, z]) => z)])].sort((a, b) => a - b);
  const merged: Profile = [];
  for (const z of zs) {
    const a = at(upper, z), b = at(lower, z);
    const r = a !== null && b !== null ? (a + b) / 2 : (a ?? b);
    if (r !== null) merged.push([r, z]);
  }
  return merged;
}

export interface Measurements {
  /** Every figure in millimetres; `null` where the tracing does not give it. */
  length: number;
  diameter: number;
  bearing: number;
  nose: number;
  boatTail: number | null;
  baseDiameter: number | null;
  meplat: number;
  /** The nose arc's radius in calibres, and the ratio a tangent arc of that nose would have to it. */
  ogiveRadiusCalibres: number | null;
  rtOverR: number | null;
  /** One arc fitted to the nose: tangent, secant, or - when that arc is tighter than a tangent
   *  arc of the same nose could be, which no single arc is - a compound nose, called hybrid. */
  ogiveForm: 'tangent' | 'secant' | 'hybrid' | null;
  /** Where the bearing surface starts and ends along the profile, mm from the base. */
  shankStart: number;
  shankEnd: number;
  /** The pixel size in millimetres: the least any figure can be trusted to. */
  uncertainty: number;
}

/**
 * The measurements read off a traced profile (r, z in mm from the base).
 *
 * The diameter is the widest the silhouette gets; the bearing surface is the longest run within a
 * tolerance of it (two pixels, or half a per cent of the diameter, whichever is larger); the boat
 * tail is what lies behind that run, the nose what lies ahead; the meplat is the width at the tip.
 * The nose arc is a least-squares circle (Kasa) through the nose points; a tangent ogive of the
 * same nose length and drop has the radius `(Ln^2 + k^2) / 2k`, and the ratio of that to the fitted
 * radius is `Rt/R` - 1 for a tangent ogive, less for a secant one.
 */
export function measure(profile: Profile, mmPerPx: number, ogiveStartZ: number | null = null): Measurements | null {
  if (profile.length < 4) return null;
  const zs = profile.map(([, z]) => z);
  const z0 = Math.min(...zs);
  const shifted: Profile = profile.map(([r, z]) => [r, z - z0]);
  const length = Math.max(...shifted.map(([, z]) => z));
  const rMax = Math.max(...shifted.map(([r]) => r));
  const tolerance = Math.max(2 * mmPerPx, 0.005 * rMax);
  const wide = shifted.filter(([r]) => r >= rMax - tolerance);
  let shankStart = Math.min(...wide.map(([, z]) => z));
  let shankEnd = Math.max(...wide.map(([, z]) => z));
  const first = shifted[0]!, last = shifted[shifted.length - 1]!;

  // A tolerance band finds the shank roughly and no better: a tangent ogive leaves the shank so
  // gently that two pixels of drop lie two or three millimetres up the nose. So the ends are
  // refined from the curves either side. The boat tail is a straight taper: a line through its
  // points meets the shank's radius where the taper ends. The nose is an arc: a circle through the
  // points well up the nose meets the shank's radius where the ogive begins - at its own centre
  // for a tangent ogive, behind it for a secant.
  // Two edges merged put near-coincident points at the base, and a line through a cluster points
  // anywhere; the fit is only trusted where the tail's points span most of the taper.
  const tail = shifted.filter(([, z]) => z < shankStart - 1e-9);
  const tailSpan = tail.length ? Math.max(...tail.map(([, z]) => z)) - Math.min(...tail.map(([, z]) => z)) : 0;
  if (tail.length >= 2 && shankStart > 3 * mmPerPx && tailSpan >= 0.5 * shankStart) {
    const line = fitLine(tail);
    if (line && Math.abs(line.slope) > 1e-6) {
      const meet = (rMax - line.intercept) / line.slope;
      if (meet > 0 && meet < shankStart + 1) shankStart = meet;
    }
  }
  // The nose arc nearest the shank decides where the shank ends. Only the rear of the nose is
  // fitted for this: a hybrid ogive is tangent there and secant further forward, and a circle
  // through the whole nose would meet the shank too far forward. Points still within half the
  // band of the shank's radius are left out, or the flat would pull the circle straight.
  const provisionalEnd = shankEnd;
  const provisionalNose = length - provisionalEnd;
  const rear = shifted.filter(([r, z]) => r < rMax - 0.5 * tolerance && z > shankStart && z < provisionalEnd + 0.45 * provisionalNose);
  const rearSpan = rear.length ? Math.max(...rear.map(([, z]) => z)) - Math.min(...rear.map(([, z]) => z)) : 0;
  const rearCircle = rear.length >= 4 && rearSpan >= 0.15 * provisionalNose ? fitCircle(rear) : null;
  if (rearCircle && rearCircle.radius > rMax) {
    const reach = rearCircle.r0 + rearCircle.radius;
    const dz = reach >= rMax ? Math.sqrt(Math.max(0, rearCircle.radius ** 2 - (rMax - rearCircle.r0) ** 2)) : 0;
    const meet = rearCircle.z0 - dz;
    if (meet > shankStart && meet <= provisionalEnd + 1e-9) shankEnd = meet;
  }
  // Where the shank ends is the least certain figure a photograph gives for a tangent or hybrid
  // nose - the first millimetres of such an ogive lie within a pixel of the shank - so a reader
  // who can see the junction (a reflection, a jacket line) may mark it, and the mark wins.
  if (ogiveStartZ !== null) {
    const marked = ogiveStartZ - z0;
    if (marked > shankStart && marked < length) shankEnd = marked;
  }
  // The radius reported is the whole nose's: what a maker's "calibres" figure describes.
  const nosePoints = shifted.filter(([, z]) => z > shankEnd + 1e-9);
  let circle = nosePoints.length >= 4 ? fitCircle(nosePoints) : null;
  if (circle && !(circle.radius > rMax)) circle = null;

  const boatTail = shankStart > 3 * mmPerPx ? shankStart : null;
  const baseDiameter = boatTail !== null ? 2 * first[0] : null;
  const meplat = 2 * last[0];
  const nose = length - shankEnd;

  let ogiveRadiusCalibres: number | null = null, rtOverR: number | null = null, ogiveForm: Measurements['ogiveForm'] = null;
  if (circle && nose > 0) {
    const drop = rMax - last[0];
    const tangent = drop > 0 ? (nose * nose + drop * drop) / (2 * drop) : null;
    ogiveRadiusCalibres = circle.radius / (2 * rMax);
    if (tangent) {
      rtOverR = tangent / circle.radius;
      ogiveForm = rtOverR > 1.03 ? 'hybrid' : rtOverR > 0.93 ? 'tangent' : 'secant';
    }
  }
  return {
    length,
    diameter: 2 * rMax,
    bearing: shankEnd - shankStart,
    nose,
    boatTail,
    baseDiameter,
    meplat,
    ogiveRadiusCalibres,
    rtOverR,
    ogiveForm,
    shankStart,
    shankEnd,
    uncertainty: mmPerPx
  };
}

/** Least-squares line r = slope * z + intercept through (r, z) points. */
export function fitLine(points: Profile): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const mz = points.reduce((a, [, z]) => a + z, 0) / n, mr = points.reduce((a, [r]) => a + r, 0) / n;
  let szz = 0, szr = 0;
  for (const [r, z] of points) {
    szz += (z - mz) ** 2;
    szr += (z - mz) * (r - mr);
  }
  if (szz < 1e-12) return null;
  const slope = szr / szz;
  return { slope, intercept: mr - slope * mz };
}

/** Kasa's algebraic least-squares circle through (r, z) points; `null` when they are collinear. */
export function fitCircle(points: Profile): { r0: number; z0: number; radius: number } | null {
  // Solve for A, B, C in r^2 + z^2 + A r + B z + C = 0 by least squares.
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of points) {
    const z = x * x + y * y;
    sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y; n += 1; sxz += x * z; syz += y * z; sz += z;
  }
  const m = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n]
  ];
  const v = [-sxz, -syz, -sz];
  const solved = solve3(m, v);
  if (!solved) return null;
  const [A, B, C] = solved;
  const r0 = -A / 2, z0 = -B / 2;
  const radiusSquared = r0 * r0 + z0 * z0 - C;
  if (!(radiusSquared > 0)) return null;
  return { r0, z0, radius: Math.sqrt(radiusSquared) };
}

function solve3(m: number[][], v: number[]): [number, number, number] | null {
  const a = m.map((row, i) => [...row, v[i]!]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const f = a[row]![col]! / a[col]![col]!;
      for (let k = col; k < 4; k++) a[row]![k]! -= f * a[col]![k]!;
    }
  }
  return [a[0]![3]! / a[0]![0]!, a[1]![3]! / a[1]![1]!, a[2]![3]! / a[2]![2]!];
}

/** The catalogue record a measurement becomes, in the schema used by `data/bullets/*.json`. */
export function recordFrom(
  m: Measurements,
  identity: { manufacturer: string; line?: string; model: string; name: string; calibre: string; massGrains: number | null },
  photo: string
): Record<string, unknown> {
  const round = (v: number, places = 2) => Number(v.toFixed(places));
  const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const fields = ['diameter', 'length', 'bearing', 'nose', 'meplat', 'base.type', 'ogive.form'];
  const record: Record<string, unknown> = {
    key: `${slug(identity.manufacturer)}_${slug(identity.model)}`,
    manufacturer: identity.manufacturer,
    ...(identity.line ? { line: identity.line } : {}),
    model: identity.model,
    name: identity.name,
    calibre: identity.calibre,
    diameter: round(m.diameter),
    ...(identity.massGrains ? { mass: round(identity.massGrains * 0.06479891, 3) } : {}),
    length: round(m.length),
    bearing: round(m.bearing),
    nose: round(m.nose),
    meplat: round(m.meplat),
    base: m.boatTail !== null ? { type: 'boat_tail', length: round(m.boatTail), diameter: round(m.baseDiameter as number) } : { type: 'flat' },
    ogive: {
      form: m.ogiveForm ?? 'tangent',
      ...(m.ogiveRadiusCalibres !== null ? { radius_calibres: round(m.ogiveRadiusCalibres, 3) } : {}),
      ...(m.rtOverR !== null ? { rt_over_r: round(m.rtOverR, 3) } : {})
    },
    tip: { type: m.meplat > 0.3 ? 'open_meplat' : 'sharp' },
    sources: [
      {
        fields: [...fields, ...(m.boatTail !== null ? ['base.length', 'base.diameter'] : []), ...(m.ogiveRadiusCalibres !== null ? ['ogive.radius_calibres'] : [])],
        publisher: 'Measured from a photograph with the OpenBallistics designer',
        url: photo,
        retrieved: new Date().toISOString().slice(0, 10),
        kind: 'measured',
        note: `Pixel size ${m.uncertainty.toFixed(3)} mm; every figure is uncertain by about that. Mass ${identity.massGrains ?? 'not'} entered by hand.`
      }
    ]
  };
  return record;
}

// ---- A bullet from its figures ---------------------------------------------------------------

/** What the designer's form asks for: the catalogue's figures, in millimetres and calibres. */
export interface Inputs {
  diameter: number;
  length: number;
  /** Boat-tail length; zero for a flat base. */
  boatTail: number;
  baseDiameter: number;
  bearing: number;
  meplat: number;
  ogiveForm: OgiveType;
  /** The nose arc's radius in calibres; ignored for a tangent ogive, whose radius the nose fixes. */
  radiusCalibres: number;
  tipType: TipType;
  /** Hollow-point depth, mm; only read for that tip. */
  cavityDepth: number;
  jacket: 'fmj' | 'unjacketed' | 'plated';
}

export interface Built {
  bullet: Bullet;
  profile: Profile;
  /** The radius the nose was drawn with, in calibres. */
  radiusCalibres: number;
  /** Where the input asked for a form the figures cannot make, and what was drawn instead. */
  notes: string[];
}

/** The bearing surface's end: the nose is what is left of the length. */
export function noseOf(i: Inputs): number {
  return i.length - i.boatTail - i.bearing;
}

/**
 * The bullet the inputs describe, drawn by the same geometry the catalogue is drawn with. The
 * geometry requires that a tangent or
 * secant arc needs a nose at least as long as its radial drop, or the arc would turn back on
 * itself, and such a nose is drawn elliptical instead and said to be; a secant arc must reach
 * across its own chord and be no tighter than the tangent arc. Nothing is clamped silently.
 */
export function buildBullet(i: Inputs): Built | null {
  const notes: string[] = [];
  const nose = noseOf(i);
  if (!(i.diameter > 0) || !(i.length > 0) || nose <= 0 || i.bearing < 0 || i.boatTail < 0) return null;
  const meplat = i.tipType === 'sharp' ? 0 : i.meplat;
  const drop = (i.diameter - meplat) / 2;
  let form: OgiveType = i.ogiveForm;
  if ((form === 'tangent' || form === 'secant' || form === 'hybrid') && nose <= drop) {
    notes.push('nose-too-short');
    form = 'elliptical';
  }
  let radiusMm: number;
  if (form === 'tangent') {
    radiusMm = arcRadius('tangent', i.diameter, meplat, nose);
  } else if (form === 'secant' || form === 'hybrid') {
    radiusMm = i.radiusCalibres > 0 ? i.radiusCalibres * i.diameter : arcRadius(form, i.diameter, meplat, nose);
    const tangent = arcRadius('tangent', i.diameter, meplat, nose);
    if (radiusMm < tangent) {
      notes.push('radius-below-tangent');
      radiusMm = tangent;
    }
  } else {
    radiusMm = arcRadius('tangent', i.diameter, meplat, nose);
  }
  const boatTail = i.boatTail > 0;
  const baseDiameter = boatTail ? Math.min(i.baseDiameter, i.diameter) : i.diameter;
  const bullet: Bullet = {
    category: 'rifle_spitzer',
    base: {
      baseType: boatTail ? 'boat_tail' : 'flat',
      diameter: baseDiameter,
      startZ: 0,
      endZ: i.boatTail,
      boatTailAngle: boatTail ? (Math.atan((i.diameter - baseDiameter) / 2 / i.boatTail) * 180) / Math.PI : null,
      hollowDepth: null
    },
    cylinder: { diameter: i.diameter, startZ: i.boatTail, endZ: i.boatTail + i.bearing, cannelureZ: null, cannelureDepth: 0, heeled: false },
    ogive: { ogiveType: form, radiusCalibres: radiusMm / i.diameter, startZ: i.boatTail + i.bearing, endZ: i.length, startDiameter: i.diameter, endDiameter: meplat },
    // A hollow point's cavity and a polymer tip's insert are both drawn back from the tip by this.
    tip: { tipType: i.tipType, startZ: i.length, endZ: i.length, meplatDiameter: meplat, cavityDepth: i.tipType === 'hollow_point' || i.tipType === 'polymer' ? Math.min(i.cavityDepth, nose) : 0 },
    construction:
      i.jacket === 'unjacketed'
        ? { jacket: 'unjacketed', jacketMaterial: 'LEAD', coreMaterial: 'LEAD' }
        : i.jacket === 'plated'
          ? { jacket: 'plated', jacketMaterial: 'COPPER', coreMaterial: 'LEAD' }
          : { jacket: 'fmj', jacketMaterial: 'GILDING_METAL', coreMaterial: 'LEAD' },
    jacketThickness: 0.055 * i.diameter,
    seatingDepth: i.boatTail + i.bearing,
    baseZ: 0,
    tipZ: i.length,
    length: i.length
  };
  try {
    return { bullet, profile: bulletOuterProfile(bullet), radiusCalibres: radiusMm / i.diameter, notes };
  } catch {
    return null;
  }
}

/** The renderer's default ratio of tangent to actual radius for a form, as a starting radius. */
export function defaultRadiusCalibres(i: Inputs): number {
  const nose = noseOf(i);
  const tangent = arcRadius('tangent', i.diameter, i.meplat, Math.max(nose, 0.01)) / i.diameter;
  const ratio = RT_OVER_R[i.ogiveForm] ?? 1;
  return tangent / ratio;
}

/** Inputs from a traced measurement, for the "take these" button. */
export function inputsFrom(m: Measurements, current: Inputs): Inputs {
  const r2 = (v: number) => Number(v.toFixed(2));
  return {
    ...current,
    diameter: r2(m.diameter),
    length: r2(m.length),
    boatTail: m.boatTail !== null ? r2(m.boatTail) : 0,
    baseDiameter: m.baseDiameter !== null ? r2(m.baseDiameter) : r2(m.diameter),
    bearing: r2(m.bearing),
    meplat: r2(m.meplat),
    ogiveForm: m.ogiveForm === 'hybrid' ? 'hybrid' : m.ogiveForm === 'secant' ? 'secant' : 'tangent',
    radiusCalibres: m.ogiveRadiusCalibres !== null ? r2(m.ogiveRadiusCalibres) : current.radiusCalibres
  };
}

/** The catalogue record the inputs become, in the catalogue schema, every figure `measured` or `quoted`. */
export function recordFromInputs(
  i: Inputs,
  built: Built,
  identity: { manufacturer: string; line?: string; model: string; name: string; calibre: string; massGrains: number | null },
  source: { publisher: string; url: string; kind: 'published' | 'measured' | 'quoted'; note: string }
): Record<string, unknown> {
  const r2 = (v: number, p = 2) => Number(v.toFixed(p));
  const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const nose = noseOf(i);
  const fields = ['diameter', 'length', 'bearing', 'nose', 'meplat', 'base.type', 'ogive.form', 'tip.type'];
  if (i.boatTail > 0) fields.push('base.length', 'base.diameter');
  if (built.bullet.ogive.ogiveType !== 'tangent') fields.push('ogive.radius_calibres');
  return {
    key: `${slug(identity.manufacturer || 'bullet')}_${slug(identity.model || 'x')}`,
    manufacturer: identity.manufacturer,
    ...(identity.line ? { line: identity.line } : {}),
    model: identity.model,
    name: identity.name,
    calibre: identity.calibre,
    diameter: r2(i.diameter),
    ...(identity.massGrains ? { mass: r2(identity.massGrains * 0.06479891, 3) } : {}),
    length: r2(i.length),
    bearing: r2(i.bearing),
    nose: r2(nose),
    meplat: r2(i.meplat),
    base: i.boatTail > 0 ? { type: 'boat_tail', length: r2(i.boatTail), diameter: r2(Math.min(i.baseDiameter, i.diameter)) } : { type: 'flat' },
    ogive: {
      form: built.bullet.ogive.ogiveType,
      ...(built.bullet.ogive.ogiveType !== 'tangent' ? { radius_calibres: r2(built.radiusCalibres, 3) } : {})
    },
    tip: { type: i.tipType, ...(i.tipType === 'hollow_point' && i.cavityDepth > 0 ? { cavity_depth: r2(i.cavityDepth) } : {}) },
    construction: {
      jacket: i.jacket,
      core: 'solid_lead',
      jacket_material: i.jacket === 'plated' ? 'COPPER' : i.jacket === 'unjacketed' ? 'LEAD' : 'GILDING_METAL',
      core_material: 'LEAD'
    },
    sources: [{ fields, publisher: source.publisher, url: source.url, retrieved: new Date().toISOString().slice(0, 10), kind: source.kind, note: source.note }]
  };
}

// ---- An oblique photograph: the homography that straightens it ----------------------------------

/** A 3x3 homography, row-major, mapping picture pixels to rectified pixels. */
export type Homography = [number, number, number, number, number, number, number, number, number];

/** Solve `A x = b` for a small dense system by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = m[row]![col]! / m[col]![col]!;
      for (let k = col; k <= n; k++) m[row]![k]! -= f * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * The homography taking four picture points to four rectified points (the direct linear
 * transform, eight unknowns with the last entry 1). `null` when the points are degenerate.
 */
export function homographyFrom(from: Px[], to: Px[]): Homography | null {
  if (from.length !== 4 || to.length !== 4) return null;
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i]!, [u, v] = to[i]!;
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }
  const h = solve(rows, rhs);
  if (!h) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography(h: Homography, p: Px): Px {
  const w = h[6] * p[0] + h[7] * p[1] + h[8];
  return [(h[0] * p[0] + h[1] * p[1] + h[2]) / w, (h[3] * p[0] + h[4] * p[1] + h[5]) / w];
}

export function invertHomography(h: Homography): Homography | null {
  const [a, b, c, d, e, f, g, i, j] = h;
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  if (Math.abs(det) < 1e-18) return null;
  const inv: Homography = [
    (e * j - f * i) / det, (c * i - b * j) / det, (b * f - c * e) / det,
    (f * g - d * j) / det, (a * j - c * g) / det, (c * d - a * f) / det,
    (d * i - e * g) / det, (b * g - a * i) / det, (a * e - b * d) / det
  ];
  return inv;
}

/** Where the four corners of a `w` by `h` picture land under `H`, as a box `[x, y, w, h]`. */
export function warpedBounds(h: Homography, width: number, height: number): [number, number, number, number] {
  const corners: Px[] = [[0, 0], [width, 0], [width, height], [0, height]].map((p) => applyHomography(h, p as Px));
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0];
}

/**
 * Four clicked points as a quadrilateral, top left first and then clockwise. A reader clicks the
 * corners of a card in whatever order they catch their eye, so the order is read back out of the
 * points: sorted around their own centre, wound clockwise, and started at the corner nearest the
 * top left. `null` when the four do not enclose an area, which is what three points in a line or
 * two clicks on the same spot come to.
 *
 * On a card turned well off square, which corner counts as the top left is a matter of taste, and
 * the choice only turns the rectified picture by a quarter: `rectificationPlan` reads the card's
 * millimetres off the sides it measures, so the scale is right either way.
 */
export function orderCorners(corners: Px[]): [Px, Px, Px, Px] | null {
  if (corners.length !== 4) return null;
  const cx = corners.reduce((s, p) => s + p[0], 0) / 4;
  const cy = corners.reduce((s, p) => s + p[1], 0) / 4;
  // y grows downwards in a picture, so an ascending angle about the centre runs clockwise.
  const ring = [...corners].sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = ring[i]!, b = ring[(i + 1) % 4]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (!Number.isFinite(area) || Math.abs(area) < 1e-6) return null;
  if (area < 0) ring.reverse();
  let first = 0;
  for (let i = 1; i < 4; i++) if (ring[i]![0] + ring[i]![1] < ring[first]![0] + ring[first]![1]) first = i;
  return [ring[first]!, ring[(first + 1) % 4]!, ring[(first + 2) % 4]!, ring[(first + 3) % 4]!];
}

/**
 * The plan for straightening a picture around a card of known size whose four corners were
 * clicked, in any order: the homography, and the rectified picture's box. The card comes out
 * axis-aligned at the picture's own pixel density, capped so the result stays under `maxSide`
 * pixels on its longer side, and its top edge is the ruler the scale then reads.
 *
 * Which of the card's two sides lies across the picture is read from the quadrilateral, not
 * assumed: a card stood on its short side is rectified standing, rather than being squashed into
 * a landscape rectangle and taking every later measurement with it.
 */
export function rectificationPlan(
  corners: Px[],
  cardWidthMm: number,
  cardHeightMm: number,
  width: number,
  height: number,
  maxSide = 4096
): { homography: Homography; box: [number, number, number, number]; ruler: Ruler } | null {
  if (!(cardWidthMm > 0) || !(cardHeightMm > 0)) return null;
  const quad = orderCorners(corners);
  if (!quad) return null;
  const side = (a: Px, b: Px) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const acrossPx = (side(quad[0], quad[1]) + side(quad[3], quad[2])) / 2;
  const downPx = (side(quad[0], quad[3]) + side(quad[1], quad[2])) / 2;
  const turned = acrossPx >= downPx !== cardWidthMm >= cardHeightMm;
  const across = turned ? cardHeightMm : cardWidthMm;
  const down = turned ? cardWidthMm : cardHeightMm;
  const pxPerMm = acrossPx / across;
  if (!(pxPerMm > 0)) return null;
  const target = (k: number): Px[] => [[0, 0], [across * k, 0], [across * k, down * k], [0, down * k]];
  let k = pxPerMm;
  let h = homographyFrom(quad, target(k));
  if (!h) return null;
  let box = warpedBounds(h, width, height);
  const longest = Math.max(box[2], box[3]);
  if (longest > maxSide) {
    k *= maxSide / longest;
    h = homographyFrom(quad, target(k));
    if (!h) return null;
    box = warpedBounds(h, width, height);
  }
  // Shift so the rectified picture starts at the origin.
  const shift: Homography = [1, 0, -box[0], 0, 1, -box[1], 0, 0, 1];
  const shifted = composeHomography(shift, h);
  return {
    homography: shifted,
    box: [0, 0, Math.ceil(box[2]), Math.ceil(box[3])],
    ruler: { a: applyHomography(shifted, quad[0]), b: applyHomography(shifted, quad[1]), mm: across }
  };
}

export function composeHomography(a: Homography, b: Homography): Homography {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!);
    }
  }
  return out as Homography;
}

/**
 * Resample a picture through the inverse of a homography, bilinear, into a box `outW` by `outH`.
 * Pixels that land outside the source are left transparent.
 */
export function warpPixels(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  homography: Homography,
  outW: number,
  outH: number
): Uint8ClampedArray {
  const inv = invertHomography(homography);
  const out = new Uint8ClampedArray(outW * outH * 4);
  if (!inv) return out;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = inv[6] * x + inv[7] * y + inv[8];
      const sx = (inv[0] * x + inv[1] * y + inv[2]) / w;
      const sy = (inv[3] * x + inv[4] * y + inv[5]) / w;
      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) continue;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
      const fx = sx - x0, fy = sy - y0;
      const o = (y * outW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = src[(y0 * width + x0) * 4 + c]!, p10 = src[(y0 * width + x1) * 4 + c]!;
        const p01 = src[(y1 * width + x0) * 4 + c]!, p11 = src[(y1 * width + x1) * 4 + c]!;
        out[o + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
      }
    }
  }
  return out;
}

// ---- A proposed trace: the silhouette's edges found along the axis -------------------------------

function luminanceAt(src: Uint8ClampedArray, width: number, height: number, x: number, y: number): number {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) return NaN;
  const o = (yi * width + xi) * 4;
  return 0.299 * src[o]! + 0.587 * src[o + 1]! + 0.114 * src[o + 2]!;
}

/** The strongest luminance edge along a ray, as a distance from its start, or `null`. */
function edgeAlong(
  src: Uint8ClampedArray, width: number, height: number,
  from: Px, direction: Px, maxDistance: number, minDistance: number
): { at: number; strength: number } | null {
  const lum: number[] = [];
  for (let d = 0; d <= maxDistance; d++) {
    const v = luminanceAt(src, width, height, from[0] + direction[0] * d, from[1] + direction[1] * d);
    if (Number.isNaN(v)) break;
    lum.push(v);
  }
  if (lum.length < 5) return null;
  // Smoothed, then the gradient across two pixels.
  const smooth = lum.map((_, i) => (lum[Math.max(0, i - 1)]! + lum[i]! + lum[Math.min(lum.length - 1, i + 1)]!) / 3);
  // The innermost edge among the strong ones, not the strongest: a ruler's black marks beyond
  // the bullet make a stronger edge than brass against paper, and the silhouette is the first.
  const gradients: number[] = [];
  let strongest = 0;
  for (let i = Math.max(1, minDistance); i < smooth.length - 1; i++) {
    const g = Math.abs(smooth[i + 1]! - smooth[i - 1]!);
    gradients[i] = g;
    if (g > strongest) strongest = g;
  }
  if (strongest <= 0) return null;
  for (let i = Math.max(1, minDistance); i < smooth.length - 1; i++) {
    if (gradients[i]! >= 0.5 * strongest) return { at: i, strength: gradients[i]! };
  }
  return null;
}

/**
 * Edges found along the axis on both sides: a proposed trace, to be corrected by hand. Rays leave
 * the axis at `stations` points between base and tip, and on each the strongest edge is taken;
 * a first pass over the middle of the bullet fixes the radius the shank is at, and every station
 * then looks no further than a little beyond it - which is what keeps a ruler lying beside the
 * bullet from being traced as its edge.
 */
export function proposeTrace(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  axis: Axis,
  lengthPx: number,
  stations = 48
): { upper: Px[]; lower: Px[] } {
  const n: Px = [-axis.dir[1], axis.dir[0]];
  const at = (t: number): Px => [axis.origin[0] + axis.dir[0] * t, axis.origin[1] + axis.dir[1] * t];
  const reach = Math.max(8, lengthPx * 0.6);
  // First pass: the shank's radius, from the middle third.
  const middle: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t = lengthPx * (0.35 + (0.3 * i) / 11);
    for (const side of [1, -1] as const) {
      const edge = edgeAlong(src, width, height, at(t), [n[0] * side, n[1] * side], reach, 2);
      if (edge) middle.push(edge.at);
    }
  }
  if (!middle.length) return { upper: [], lower: [] };
  middle.sort((a, b) => a - b);
  const radius = middle[Math.floor(middle.length / 2)]!;
  const limit = radius * 1.2 + 3;
  const upper: Px[] = [], lower: Px[] = [];
  for (let i = 0; i < stations; i++) {
    const t = lengthPx * (0.015 + (0.97 * i) / (stations - 1));
    const p = at(t);
    for (const side of [1, -1] as const) {
      const edge = edgeAlong(src, width, height, p, [n[0] * side, n[1] * side], limit, 1);
      if (!edge || edge.strength < 8) continue;
      const point: Px = [p[0] + n[0] * side * edge.at, p[1] + n[1] * side * edge.at];
      (side > 0 ? upper : lower).push(point);
    }
  }
  return { upper, lower };
}

// The cartridge designer's model. Separate from everything above: that is the bullet
// designer, which starts from a photograph; a cartridge starts from a published sheet.
export * from './cartridge';
