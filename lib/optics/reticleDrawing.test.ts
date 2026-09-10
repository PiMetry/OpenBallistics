/**
 * The reticle drawing, and the one thing in it that can be silently wrong.
 *
 * Most of this is geometry that either works or is obviously broken. The part worth real tests is
 * `markPositionFor`: on a second-focal-plane scope a hold does *not* land on the mark that reads
 * its value unless the magnification is the rated one, and every way of getting that wrong
 * produces a picture that looks perfectly reasonable.
 */

import { describe, expect, it } from 'vitest';
import { fromAngularUnit } from './angles';
import { ReticleRefusal, type Reticle } from './reticle';
import { crosshair, dotGrid, duplex, extentOf, hashGrid, PATTERNS } from './reticleMarks';
import { angleAtMark, markPositionFor, reticleSvg } from './reticleDrawing';

const ffp: Reticle = { id: 'r1', name: 'FFP mil', focalPlane: 'FFP', unit: 'mrad' };
const sfp: Reticle = {
  id: 'r2',
  name: 'SFP mil',
  focalPlane: 'SFP',
  ratedMagnification: 20,
  unit: 'mrad'
};

describe('the generic patterns', () => {
  it('all draw something, and reach as far as they were asked to', () => {
    for (const make of Object.values(PATTERNS)) {
      const marks = make({ reach: 5 });
      expect(marks.length).toBeGreaterThan(1);
      expect(extentOf(marks)).toBeCloseTo(5, 6);
    }
  });

  it('gives a crosshair exactly two wires', () => {
    expect(crosshair()).toHaveLength(2);
  });

  it('makes a duplex heavier outside than in', () => {
    const marks = duplex({ reach: 6, width: 0.05 });
    const widths = marks.flatMap((m) => (m.kind === 'line' ? [m.width] : []));
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
    // Four posts and two fine wires.
    expect(widths).toHaveLength(6);
  });

  it('puts dot-grid dots on the wires at the spacing asked for', () => {
    const dots = dotGrid({ reach: 4, spacing: 1 }).filter((m) => m.kind === 'dot');
    // Four arms, four dots each.
    expect(dots).toHaveLength(16);
    for (const dot of dots) {
      if (dot.kind !== 'dot') continue;
      // Every dot is on one of the two wires, a whole number of mils out.
      const onWire = dot.x === 0 || dot.y === 0;
      const distance = Math.max(Math.abs(dot.x), Math.abs(dot.y));
      expect(onWire).toBe(true);
      expect(distance % 1).toBeCloseTo(0, 9);
    }
  });

  it('gives a hash grid a short tick between every pair of long ones', () => {
    const ticks = hashGrid({ reach: 2, spacing: 1 }).filter((m) => m.kind === 'line' && m.at !== 0);
    const lengths = ticks.map((m) => (m.kind === 'line' ? m.to - m.from : 0));
    expect(new Set(lengths.map((l) => Math.round(l * 100)))).toHaveProperty('size', 2);
  });

  it('labels the grid so it can be read, and can be told not to', () => {
    expect(dotGrid({ reach: 4, labelEvery: 2 }).some((m) => m.kind === 'label')).toBe(true);
    expect(dotGrid({ reach: 4, labelEvery: 0 }).some((m) => m.kind === 'label')).toBe(false);
  });
});

describe('where a hold lands on the glass', () => {
  it('is the mark that reads its value, on a first-focal-plane reticle, at any power', () => {
    expect(markPositionFor(ffp, 1.5, 6)).toBe(1.5);
    expect(markPositionFor(ffp, 1.5, 25)).toBe(1.5);
  });

  it('is nearer the centre on an SFP reticle turned down', () => {
    // 20x rated, used at 10x: each mark now covers 2 mils, so a 1.5 mil hold falls at 0.75.
    expect(markPositionFor(sfp, 1.5, 10)).toBeCloseTo(0.75, 9);
    expect(markPositionFor(sfp, 1.5, 20)).toBeCloseTo(1.5, 9);
    expect(markPositionFor(sfp, 1.5, 40)).toBeCloseTo(3, 9);
  });

  it('refuses to place anything on an SFP reticle without the magnification', () => {
    expect(() => markPositionFor(sfp, 1.5)).toThrow(ReticleRefusal);
    expect(() => markPositionFor(sfp, 1.5)).toThrow(/magnification in use is required/);
  });

  it('inverts: the angle a mark stands for undoes where an angle lands', () => {
    for (const mag of [10, 20, 35]) {
      const at = markPositionFor(sfp, 2.4, mag);
      expect(angleAtMark(sfp, at, mag)).toBeCloseTo(fromAngularUnit(2.4, 'mrad'), 12);
    }
    expect(angleAtMark(ffp, 2.4)).toBeCloseTo(fromAngularUnit(2.4, 'mrad'), 12);
  });
});

describe('the drawing', () => {
  const marks = dotGrid({ reach: 5, spacing: 1 });

  it('is a standalone SVG that says what it is', () => {
    const svg = reticleSvg(ffp, marks);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('<title>FFP mil - MRAD, FFP</title>');
  });

  it('says on its face that an SFP reticle is only calibrated at one power', () => {
    expect(reticleSvg(sfp, marks, { magnification: 20 })).toContain('calibrated at 20x');
  });

  it('puts the centre of the cross in the centre of the page', () => {
    const svg = reticleSvg(ffp, crosshair({ reach: 5 }), { sizePx: 400, reach: 5 });
    // The horizontal wire spans the width at mid-height. The vertical runs bottom to top, because
    // the model has y up and the page has y down - which is exactly the flip worth pinning.
    expect(svg).toContain('x1="0" y1="200" x2="400" y2="200"');
    expect(svg).toContain('x1="200" y1="400" x2="200" y2="0"');
  });

  it('puts a hold below the centre, because a drop is held high', () => {
    const svg = reticleSvg(ffp, marks, {
      sizePx: 400,
      reach: 5,
      holds: [{ rangeM: 300, elevationRad: fromAngularUnit(2, 'mrad'), windageRad: 0 }]
    });
    // 2 mils of 5 is two fifths of the half-page: 200 + 80 = 280, below centre.
    expect(svg).toContain('cx="200" cy="280"');
    expect(svg).toContain('>300<');
  });

  it('puts the same hold in a different place on an SFP reticle at half power', () => {
    const hold = { rangeM: 300, elevationRad: fromAngularUnit(2, 'mrad'), windageRad: 0 };
    const rated = reticleSvg(sfp, marks, { sizePx: 400, reach: 5, magnification: 20, holds: [hold] });
    const half = reticleSvg(sfp, marks, { sizePx: 400, reach: 5, magnification: 10, holds: [hold] });
    // At rated power it lands on the 2 mil mark; at half power the marks cover twice the angle,
    // so it lands at 1 - half as far down the page. This is the silent error, made visible.
    expect(rated).toContain('cy="280"');
    expect(half).toContain('cy="240"');
  });

  it('leaves out a hold that falls off the glass rather than drawing it on the edge', () => {
    const svg = reticleSvg(ffp, marks, {
      reach: 5,
      holds: [{ rangeM: 1200, elevationRad: fromAngularUnit(12, 'mrad'), windageRad: 0 }]
    });
    expect(svg).not.toContain('>1200<');
  });

  it('escapes a name that would otherwise break the markup', () => {
    const nasty: Reticle = { ...ffp, name: 'a <b> & c' };
    expect(reticleSvg(nasty, marks)).toContain('a &lt;b&gt; &amp; c');
  });
});
