/** Build cartridge and chamber profiles from database records. Reference profiles live in fixtures/profiles/. */

import { adaptMetallic, caseOuterProfile, type CartridgeRecord, type MetallicCase } from '../shapes2d/case';
import { checkSeating, defaultBullet, exposedProfile, bulletOuterProfile, type Bullet } from '../shapes2d/bullet';
import { adaptChamber, chamberBoreProfile, type Chamber } from '../shapes2d/chamber';
import type { Profile } from '../geom/profile';

export interface Profiles {
  key: string;
  case: MetallicCase;
  /** The case as manufactured, head face to mouth. */
  outline: Profile;
  /** The seated default bullet, or `null` where the record gives none that fits. */
  bullet: Bullet | null;
  bulletProfile: Profile | null;
  /** The part of the bullet forward of the mouth, or `null` where none stands proud. */
  exposed: Profile | null;
  chamber: Chamber | null;
  chamberProfile: Profile | null;
}

/**
 * The default bullet for a record, as `interface/build._build_metallic` builds it: seated by its
 * category, or at `seatingDepth` when given, and checked against the case interior.
 */
export function bulletFor(record: CartridgeRecord, c: MetallicCase, seatingDepth?: number | null): Bullet {
  const overall = record.cartridge.lengths?.L6;
  if (overall == null) throw new Error(`${record.key}: L6 is not published, and it is needed for the seated projectile`);
  const bullet = defaultBullet(c, {
    overallLength: overall,
    freeBoreEndZ: record.cartridge.projectile?.L3PlusG ?? null,
    shape: record.annotations?.defaultBulletShape ?? null,
    seatingDepth: seatingDepth ?? null
  });
  checkSeating(c, bullet);
  return bullet;
}

/** Everything a drawing of the record needs, with each part checked independently. */
export function profilesFor(record: CartridgeRecord, seatingDepth?: number | null): Profiles {
  const c = adaptMetallic(record);
  const outline = caseOuterProfile(c);
  let bullet: Bullet | null = null;
  try {
    bullet = bulletFor(record, c, seatingDepth);
  } catch {
    bullet = null;
  }
  let chamber: Chamber | null = null;
  try {
    chamber = adaptChamber(record, c);
  } catch {
    chamber = null;
  }
  return {
    key: record.key,
    case: c,
    outline,
    bullet,
    bulletProfile: bullet ? bulletOuterProfile(bullet) : null,
    exposed: bullet ? exposedProfile(bullet, c.mouth.z) : null,
    chamber,
    chamberProfile: chamber ? chamberBoreProfile(chamber) : null
  };
}
