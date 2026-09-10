/**
 * The designer's arithmetic against a bullet whose dimensions are known.
 *
 * The 308 Win's default bullet is drawn by the geometry port, photographed synthetically - its
 * silhouette projected into pixels at a known scale, rotated a little, offset, both edges - and
 * handed to the designer with two rulers and a slightly off-centre axis click. The measurements
 * that come back must be the bullet's own.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type Px,
  applyHomography,
  axisFrom,
  homographyFrom,
  invertHomography,
  measure,
  mergeEdges,
  orderCorners,
  proposeTrace,
  rectificationPlan,
  refitAxis,
  scaleFrom,
  toProfile,
  warpPixels
} from './index';
import { profilesFor } from '@lib/geometry';
import type { CartridgeRecord } from '@lib/shapes2d';

const HERE = dirname(fileURLToPath(import.meta.url));
// Two directories up, not three: `lib/designer` sits directly under the repository root.
// This is `skipIf`-guarded, so a wrong path here does not fail - it quietly skips.
const RECORD = join(HERE, '..', '..', 'data', 'cartridges', 'rimless', '308_win.json');

describe('the designer reads a known bullet back off its picture', () => {
  it.skipIf(!existsSync(RECORD))('recovers the 308 Win default bullet within a pixel', () => {
    const record = JSON.parse(readFileSync(RECORD, 'utf8')) as CartridgeRecord;
    const p = profilesFor(record);
    const bullet = p.bullet!;
    const profile = p.bulletProfile!;

    // The picture: 25 px per mm, the axis 7 degrees off horizontal, the base at (120, 300).
    const pxPerMm = 25;
    const theta = (7 * Math.PI) / 180;
    const base: Px = [120, 300];
    const dir: Px = [Math.cos(theta), Math.sin(theta)];
    const normal: Px = [-dir[1], dir[0]];
    const at = (r: number, z: number): Px => {
      const zz = (z - bullet.baseZ) * pxPerMm, rr = r * pxPerMm;
      return [base[0] + dir[0] * zz + normal[0] * rr, base[1] + dir[1] * zz + normal[1] * rr];
    };
    const upper = profile.map(([r, z]) => at(r, z));
    const lower = profile.map(([r, z]) => at(-r, z));
    const tip = at(0, bullet.tipZ);

    // Two rulers, one of them read a little long, and a base click a pixel off the axis.
    const scale = scaleFrom([
      { a: [10, 500], b: [10 + 30 * pxPerMm, 500], mm: 30 },
      { a: [600, 40], b: [600, 40 + 20 * pxPerMm * 1.004], mm: 20 }
    ])!;
    // The mean of a true ruler and one read 0.4 % long is 0.2 % long.
    expect(Math.abs(scale.mmPerPx * pxPerMm - 1)).toBeLessThan(0.005);
    expect(scale.spread).toBeLessThan(0.01);

    const clicked = axisFrom([base[0] + normal[0] * 1.5, base[1] + normal[1] * 1.5], tip)!;
    const axis = refitAxis(clicked, upper, lower);
    const merged = mergeEdges(toProfile(upper, axis, scale.mmPerPx), toProfile(lower, axis, scale.mmPerPx));
    const m = measure(merged, scale.mmPerPx)!;

    // Two pixels, plus the 0.2 % the deliberately long ruler puts on every length.
    const tolerance = 2 / pxPerMm + 0.003 * bullet.length;
    expect(Math.abs(m.length - bullet.length)).toBeLessThan(tolerance);
    expect(Math.abs(m.diameter - bullet.cylinder.diameter)).toBeLessThan(tolerance);
    expect(Math.abs((m.boatTail ?? 0) - (bullet.base.endZ - bullet.baseZ))).toBeLessThan(tolerance);
    expect(Math.abs((m.baseDiameter ?? 0) - bullet.base.diameter)).toBeLessThan(tolerance);
    expect(Math.abs(m.bearing - (bullet.cylinder.endZ - bullet.cylinder.startZ))).toBeLessThan(tolerance);
    expect(Math.abs(m.nose - (bullet.tipZ - bullet.ogive.startZ))).toBeLessThan(tolerance);
    expect(Math.abs(m.meplat - bullet.tip.meplatDiameter)).toBeLessThan(tolerance);
    expect(m.ogiveForm).toBe('tangent');
    expect(Math.abs((m.ogiveRadiusCalibres ?? 0) - bullet.ogive.radiusCalibres) / bullet.ogive.radiusCalibres).toBeLessThan(0.05);
  });
});

describe('an oblique photograph is straightened', () => {
  it('maps the four clicked corners onto the card', () => {
    const corners: Px[] = [[120, 80], [560, 110], [540, 400], [100, 370]];
    const plan = rectificationPlan(corners, 85.6, 53.98, 800, 600);
    expect(plan).not.toBeNull();
    const { homography, ruler } = plan!;
    const tl = applyHomography(homography, corners[0]!);
    const tr = applyHomography(homography, corners[1]!);
    const br = applyHomography(homography, corners[2]!);
    const bl = applyHomography(homography, corners[3]!);
    // Axis-aligned: the top edge level, the left edge upright, the sides in the card's ratio.
    expect(Math.abs(tl[1] - tr[1])).toBeLessThan(1e-6);
    expect(Math.abs(tl[0] - bl[0])).toBeLessThan(1e-6);
    const w = tr[0] - tl[0], h = bl[1] - tl[1];
    expect(w / h).toBeCloseTo(85.6 / 53.98, 6);
    expect(Math.abs(br[0] - tr[0])).toBeLessThan(1e-6);
    expect(ruler.mm).toBe(85.6);
    expect(Math.hypot(ruler.b[0] - ruler.a[0], ruler.b[1] - ruler.a[1])).toBeCloseTo(w, 6);
  });

  it('reads the four corners in whatever order they were clicked', () => {
    // The same card, clicked clockwise from the top left, anticlockwise, from another corner,
    // and in the order that makes a bowtie of the four. All four are the one quadrilateral.
    const tl: Px = [120, 80], tr: Px = [560, 110], br: Px = [540, 400], bl: Px = [100, 370];
    const plan = rectificationPlan([tl, tr, br, bl], 85.6, 53.98, 800, 600)!;
    for (const order of [[tl, bl, br, tr], [bl, tl, tr, br], [tl, tr, bl, br], [br, tl, bl, tr]]) {
      const other = rectificationPlan(order as Px[], 85.6, 53.98, 800, 600);
      expect(other).not.toBeNull();
      expect(other!.box).toEqual(plan.box);
      expect(other!.ruler.mm).toBe(plan.ruler.mm);
      other!.homography.forEach((v, i) => expect(v).toBeCloseTo(plan.homography[i]!, 9));
    }
  });

  it('rectifies a card stood on its short side without squashing it', () => {
    // The same card, upright in the picture: the tall pair of sides is the 85.6 mm one, and the
    // scale must be read from that, not from whichever number was typed in the width box.
    const corners: Px[] = [[200, 100], [420, 90], [430, 440], [190, 430]];
    const plan = rectificationPlan(corners, 85.6, 53.98, 800, 600)!;
    const tl = applyHomography(plan.homography, corners[0]!);
    const tr = applyHomography(plan.homography, corners[1]!);
    const bl = applyHomography(plan.homography, corners[3]!);
    const w = tr[0] - tl[0], h = bl[1] - tl[1];
    expect(w / h).toBeCloseTo(53.98 / 85.6, 6);
    expect(plan.ruler.mm).toBe(53.98);
  });

  it('refuses four points that enclose nothing', () => {
    expect(rectificationPlan([[0, 0], [10, 10], [20, 20], [30, 30]], 85.6, 53.98, 800, 600)).toBeNull();
    expect(rectificationPlan([[5, 5], [5, 5], [5, 5], [5, 5]], 85.6, 53.98, 800, 600)).toBeNull();
    expect(orderCorners([[0, 0], [1, 1], [2, 2]])).toBeNull();
  });

  it('inverts', () => {
    const h = homographyFrom([[0, 0], [10, 1], [11, 12], [-1, 9]], [[0, 0], [10, 0], [10, 10], [0, 10]])!;
    const inv = invertHomography(h)!;
    const p: Px = [3.3, 4.4];
    const back = applyHomography(inv, applyHomography(h, p));
    expect(back[0]).toBeCloseTo(p[0], 9);
    expect(back[1]).toBeCloseTo(p[1], 9);
  });

  it('warps a picture so a skewed card comes out square', () => {
    // A white picture with a dark parallelogram; after warping, the parallelogram is a rectangle.
    const W = 200, H = 150;
    const src = new Uint8ClampedArray(W * H * 4).fill(255);
    const inside = (x: number, y: number) => {
      const u = x - 0.3 * y;
      return u >= 40 && u <= 140 && y >= 40 && y <= 100;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) { const o = (y * W + x) * 4; src[o] = src[o + 1] = src[o + 2] = 30; }
    const corners: Px[] = [[40 + 12, 40], [140 + 12, 40], [140 + 30, 100], [40 + 30, 100]];
    const plan = rectificationPlan(corners, 100, 60, W, H)!;
    const out = warpPixels(src, W, H, plan.homography, plan.box[2], plan.box[3]);
    const dark = (x: number, y: number) => out[(Math.round(y) * plan.box[2] + Math.round(x)) * 4 + 3]! > 0 && out[(Math.round(y) * plan.box[2] + Math.round(x)) * 4]! < 128;
    const [ax, ay] = plan.ruler.a, [bx] = plan.ruler.b;
    const mid = ay + 30 * ((bx - ax) / 100);
    // Just inside the card's straightened edges is dark; just outside the left edge is not.
    expect(dark(ax + 3, mid)).toBe(true);
    expect(dark(bx - 3, mid)).toBe(true);
    expect(dark(ax - 4, mid)).toBe(false);
  });
});

describe('a trace is proposed from the picture', () => {
  it('finds the edges of a dark bullet on a light ground', () => {
    const W = 400, H = 200;
    const src = new Uint8ClampedArray(W * H * 4).fill(240);
    // A shank of radius 30 from x=50 to x=250 and a cone to a point at x=350, axis at y=100;
    // and a "ruler": a black bar well below the bullet, which must not be traced.
    const radiusAt = (x: number) => (x < 50 || x > 350 ? -1 : x <= 250 ? 30 : 30 * (350 - x) / 100);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = radiusAt(x);
        const isBullet = r >= 0 && Math.abs(y - 100) <= r;
        const isRuler = y >= 170 && y <= 180;
        if (isBullet || isRuler) { const o = (y * W + x) * 4; src[o] = src[o + 1] = src[o + 2] = isBullet ? 80 : 0; }
      }
    }
    const axis = axisFrom([50, 100], [350, 100])!;
    const { upper, lower } = proposeTrace(src, W, H, axis, 300, 40);
    expect(upper.length).toBeGreaterThan(30);
    expect(lower.length).toBeGreaterThan(30);
    for (const [x, y] of [...upper, ...lower]) {
      const expected = radiusAt(x);
      expect(Math.abs(Math.abs(y - 100) - expected), `at (${x.toFixed(1)}, ${y.toFixed(1)}), expected radius ${expected.toFixed(1)}`).toBeLessThan(2.5);
    }
  });
});
