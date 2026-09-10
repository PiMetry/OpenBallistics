/** Compare calculated geometry with the fixed half-profile records in fixtures/profiles/. */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type CartridgeRecord } from '../shapes2d';
import { profilesFor } from './index';
import { caseInnerProfile, revolvedVolume } from '../measure2d/interior';
import type { Profile } from '../geom/profile';
import { adaptShotshell, hullOuterProfile, type ShotshellRecord } from '../shapes2d/shotshell';
import { CARTRIDGES, PROFILES } from '../testing/fixtures';

const TOLERANCE = 1e-5;

interface Fixture {
  key: string;
  mouthZ: number;
  case: Profile;
  bullet: Profile | null;
  exposed: Profile | null;
  seating?: number;
  chamber: Profile | null;
  chamberMouthZ?: number;
  /** A shot cartridge's fixture: the hull at its usual length. */
  length?: number;
  interior?: Profile | null;
  floorZ?: number;
  capacityMm3?: number;
  /** The references' figure the interior was corrected to, where the record has one. */
  publishedCapacityMm3?: number;
}

function fixtures(): { family: string; key: string; fixture: Fixture; record: CartridgeRecord }[] {
  if (!existsSync(PROFILES)) return [];
  const out = [];
  for (const family of readdirSync(PROFILES)) {
    for (const file of readdirSync(join(PROFILES, family))) {
      if (!file.endsWith('.json')) continue;
      const key = file.slice(0, -5);
      const fixture = JSON.parse(readFileSync(join(PROFILES, family, file), 'utf8')) as Fixture;
      const record = JSON.parse(readFileSync(join(CARTRIDGES, family, file), 'utf8')) as CartridgeRecord;
      out.push({ family, key, fixture, record });
    }
  }
  return out;
}

function expectProfile(actual: Profile | null, expected: Profile | null, what: string) {
  if (expected === null) {
    expect(actual, `${what}: fixture has no profile`).toBeNull();
    return;
  }
  expect(actual, `${what}: fixture has a profile`).not.toBeNull();
  const got = actual as Profile;
  expect(got.length, `${what}: point count`).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const [r, z] = expected[i]!;
    const [gr, gz] = got[i]!;
    const dr = Math.abs(gr - r);
    const dz = Math.abs(gz - z);
    if (dr > TOLERANCE || dz > TOLERANCE) {
      throw new Error(`${what}: point ${i} is (${gr}, ${gz}), fixture has (${r}, ${z})`);
    }
  }
}

const all = fixtures();

describe('the geometry port reproduces the renderer', () => {
  it('has fixtures to check against', () => {
    expect(all.length).toBeGreaterThan(400);
  });

  for (const { family, key, fixture, record } of all) {
    it(`${family}/${key}`, () => {
      if (family === 'shotshell') {
        // The unfired hull at the length the adapter picks, as `hull_outer_profile` draws it.
        const hull = adaptShotshell(record as unknown as ShotshellRecord);
        expect(hull.mouth.z).toBeCloseTo(fixture.mouthZ, 6);
        expect(hull.hull.length).toBeCloseTo(fixture.length as number, 6);
        expectProfile(hullOuterProfile(hull.hull), fixture.case, 'hull');
        return;
      }
      const profiles = profilesFor(record);
      expect(profiles.case.mouth.z).toBeCloseTo(fixture.mouthZ, 6);
      expectProfile(profiles.outline, fixture.case, 'case');
      expectProfile(profiles.bulletProfile, fixture.bullet, 'bullet');
      expectProfile(profiles.exposed, fixture.exposed, 'exposed bullet');
      if (fixture.seating != null && profiles.bullet) {
        expect(profiles.bullet.seatingDepth).toBeCloseTo(fixture.seating, 6);
      }
      expectProfile(profiles.chamberProfile, fixture.chamber, 'chamber');
      if (fixture.interior !== undefined) {
        let inner: Profile | null = null;
        try {
          inner = caseInnerProfile(profiles.case);
        } catch {
          inner = null;
        }
        expectProfile(inner, fixture.interior, 'interior');
        if (inner && fixture.capacityMm3 != null) {
          expect(profiles.case.cavityFloorZ).toBeCloseTo(fixture.floorZ as number, 6);
          expect(revolvedVolume(inner)).toBeCloseTo(fixture.capacityMm3, 3);
          if (fixture.publishedCapacityMm3 != null) {
            expect(profiles.case.publishedCapacityMm3).toBeCloseTo(fixture.publishedCapacityMm3, 3);
          }
        }
      }
    });
  }
});
