/** Resolve chamber dimensions and construct the chamber bore profile. */

import { MissingDimensionError, type CartridgeRecord, type MetallicCase } from './case';
import { applyFillet, lineTo, radians, toDegrees, type Profile } from '../geom/profile';

type HeadspaceDatum = 'shoulder' | 'mouth' | 'rim' | 'belt';

export interface Chamber {
  key: string;
  datum: HeadspaceDatum;
  recessDiameter: number;
  recessDepth: number;
  bodyDiameterBase: number;
  bodyDiameterForward: number;
  bodyEndZ: number;
  bodyDiameterMid: number | null;
  bodyMidZ: number | null;
  neckDiameterBase: number | null;
  neckStartZ: number | null;
  neckDiameterMouth: number;
  mouthZ: number;
  coneAngle: number | null;
  coneApexZ: number | null;
  coneFilletBody: number;
  coneFilletNeck: number;
  beltDiameter: number | null;
  throat: {
    diameter: number;
    freeBoreLength: number;
    leadeAngle: number;
    landDiameter: number;
    grooveDiameter: number | null;
  } | null;
  /** `L3 + G`: where the free bore ends and the leade begins. */
  freeBoreEndZ: number;
}

/** How much barrel to draw forward of the leade, in mm. Not a CIP dimension. */
export const BORE_STUB_MM = 10.0;

function headspaceDatum(c: MetallicCase): HeadspaceDatum {
  if (c.belt) return 'belt';
  if (c.rim.rimType === 'rimmed' || c.rim.rimType === 'semi_rimmed' || c.rim.rimType === 'rimfire') return 'rim';
  if (c.shoulder) return 'shoulder';
  return 'mouth';
}

function require(value: number | null | undefined, key: string, field: string, neededFor: string): number {
  if (value == null) throw new MissingDimensionError(key, field, neededFor);
  return value;
}

/** `chamber.adapt_chamber`, with the model's validators as thrown errors. */
export function adaptChamber(record: CartridgeRecord, c: MetallicCase): Chamber {
  const key = record.key;
  const chamber = record.chamber ?? {};
  const lengths = chamber.lengths ?? {};
  const powder = chamber.powderChamber ?? {};
  const breech = chamber.breech ?? {};
  const collar = chamber.collar ?? {};

  const mouthZ = require(lengths.L3, key, 'chamber.lengths.L3', 'the chamber mouth');
  const recessDiameter = require(breech.R1, key, 'chamber.breech.R1', 'the breech counterbore');
  const recessDepth = powder.E != null ? powder.E : breech.R;
  if (recessDepth == null) {
    throw new MissingDimensionError(key, 'chamber.powderChamber.E or chamber.breech.R', 'the breech counterbore depth');
  }

  const hasNeck = lengths.L1 != null && lengths.L2 != null && collar.H1 != null;
  const bodyEndZ = hasNeck ? (lengths.L1 as number) : mouthZ;
  const bodyForward = hasNeck ? powder.P2 : collar.H2;

  const cone = hasNeck ? chamber.junctionCone ?? null : null;
  let coneAngle = cone && cone.alpha != null ? toDegrees(cone.alpha) : null;
  if (coneAngle != null && !(coneAngle > 0 && coneAngle < 180)) coneAngle = null;

  const throat = throatOf(record);

  const out: Chamber = {
    key,
    datum: headspaceDatum(c),
    recessDiameter,
    recessDepth,
    bodyDiameterBase: require(powder.P1, key, 'chamber.powderChamber.P1', 'the body'),
    bodyDiameterForward: require(bodyForward, key, 'chamber.powderChamber.P2', "the body's forward end"),
    bodyEndZ,
    bodyDiameterMid: powder.P0 ?? null,
    bodyMidZ: lengths.L0 ?? null,
    neckDiameterBase: hasNeck ? (collar.H1 as number) : null,
    neckStartZ: hasNeck ? (lengths.L2 as number) : null,
    neckDiameterMouth: require(collar.H2, key, 'chamber.collar.H2', 'the neck'),
    mouthZ,
    coneAngle,
    coneApexZ: cone ? cone.S ?? null : null,
    coneFilletBody: cone ? cone.r1Max ?? 0 : 0,
    coneFilletNeck: cone ? cone.r2 ?? 0 : 0,
    beltDiameter: breech.R3 ?? null,
    throat,
    freeBoreEndZ: throat ? mouthZ + throat.freeBoreLength : mouthZ
  };

  // Reject chamber dimensions that cannot form the required geometry.
  const positive: [string, number | null][] = [
    ['recess_diameter', out.recessDiameter], ['recess_depth', out.recessDepth],
    ['body_diameter_base', out.bodyDiameterBase], ['body_diameter_forward', out.bodyDiameterForward],
    ['body_end_z', out.bodyEndZ], ['neck_diameter_mouth', out.neckDiameterMouth], ['mouth_z', out.mouthZ]
  ];
  for (const [name, value] of positive) {
    if (!(value != null && value > 0)) throw new Error(`${key}: chamber ${name} must be positive`);
  }
  if (out.recessDepth >= out.bodyEndZ) throw new Error(`${key}: the breech recess reaches past the body's forward end`);
  if ((out.bodyMidZ == null) !== (out.bodyDiameterMid == null)) throw new Error(`${key}: a double taper needs P0 and L0`);
  if (out.bodyMidZ != null && !(out.recessDepth < out.bodyMidZ && out.bodyMidZ < out.bodyEndZ)) {
    throw new Error(`${key}: the taper break is not inside the body`);
  }
  if (out.neckStartZ != null) {
    if (!(out.bodyEndZ <= out.neckStartZ && out.neckStartZ <= out.mouthZ)) {
      throw new Error(`${key}: the junction cone is not between the body and the mouth`);
    }
  } else if (out.bodyEndZ !== out.mouthZ) {
    throw new Error(`${key}: a chamber with no neck must have its body end at the mouth`);
  }
  if (out.coneApexZ != null && !(out.coneApexZ > 0)) throw new Error(`${key}: cone apex must be positive`);
  return out;
}

function throatOf(record: CartridgeRecord): Chamber['throat'] {
  const rifling = record.chamber?.rifling ?? {};
  const barrel = record.chamber?.barrel ?? {};
  if (rifling.G1 == null || rifling.G == null || barrel.F == null || rifling.alpha1 == null) return null;
  const leadeAngle = toDegrees(rifling.alpha1) as number;
  const throat = {
    diameter: rifling.G1,
    freeBoreLength: rifling.G,
    leadeAngle,
    landDiameter: barrel.F,
    grooveDiameter: barrel.Z ?? null
  };
  if (!(throat.diameter > 0 && throat.freeBoreLength >= 0 && leadeAngle > 0 && leadeAngle <= 180 && throat.landDiameter > 0)) {
    throw new Error(`${record.key}: the throat's figures are out of range`);
  }
  if (throat.diameter < throat.landDiameter) {
    throw new Error(`${record.key}: a throat of ${throat.diameter} mm is narrower than the ${throat.landDiameter} mm bore`);
  }
  return throat;
}

/** `chamber.leade_run`: the axial length of the leade cone, zero for a 180 degree step. */
export function leadeRun(chamber: Chamber): number {
  const throat = chamber.throat;
  if (!throat) return 0;
  const drop = (throat.diameter - throat.landDiameter) / 2;
  const halfAngle = radians(throat.leadeAngle / 2);
  if (drop <= 0 || halfAngle >= Math.PI / 2 - 1e-12) return 0;
  return drop / Math.tan(halfAngle);
}

/** `chamber_bore_profile`: the bore surface from the breech face to the end of the barrel stub. */
export function chamberBoreProfile(chamber: Chamber): Profile {
  let points: Profile = [];
  lineTo(points, chamber.recessDiameter / 2, 0);
  lineTo(points, chamber.recessDiameter / 2, chamber.recessDepth);
  lineTo(points, chamber.bodyDiameterBase / 2, chamber.recessDepth);
  if (chamber.bodyMidZ != null && chamber.bodyDiameterMid != null) {
    lineTo(points, chamber.bodyDiameterMid / 2, chamber.bodyMidZ);
  }
  lineTo(points, chamber.bodyDiameterForward / 2, chamber.bodyEndZ);
  const bodyCorner = points.length - 1;

  if (chamber.neckStartZ != null && chamber.neckDiameterBase != null) {
    lineTo(points, chamber.neckDiameterBase / 2, chamber.neckStartZ);
    const neckCorner = points.length - 1;
    lineTo(points, chamber.neckDiameterMouth / 2, chamber.mouthZ);
    points = applyFillet(points, neckCorner, chamber.coneFilletNeck);
    points = applyFillet(points, bodyCorner, chamber.coneFilletBody);
  } else {
    lineTo(points, chamber.neckDiameterMouth / 2, chamber.mouthZ);
  }

  const throat = chamber.throat;
  if (throat) {
    lineTo(points, throat.diameter / 2, chamber.mouthZ);
    lineTo(points, throat.diameter / 2, chamber.freeBoreEndZ);
    const leadeEndZ = chamber.freeBoreEndZ + leadeRun(chamber);
    lineTo(points, throat.landDiameter / 2, leadeEndZ);
    lineTo(points, throat.landDiameter / 2, leadeEndZ + BORE_STUB_MM);
  }
  return points;
}
