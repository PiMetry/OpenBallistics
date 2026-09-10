/**
 * The drawing-choosing logic, pinned.
 *
 * These six functions came out of `routes/Cartridge.svelte`, where nothing could reach them to
 * test them: they were local to a component's `<script>`. They are the page's answer to "which
 * picture, at which length, at what size", and getting one of them wrong shows up as the wrong
 * drawing rather than as an error, which is the kind of bug a suite has to catch.
 *
 * Where the shapes come from real records they are read from the dataset in data/cartridges
 * rather than invented here, so a change to what the dataset publishes cannot quietly diverge
 * from what these expect.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultLength, fitScale, hullLengths, panels, resolve, tag, type Hull } from './plates';
import type { Drawing, Entry, Record_ } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
/** `lib/core` is two directories below the repository root. */
const ROOT = join(HERE, '..', '..');
const CARTRIDGES = join(ROOT, 'data', 'cartridges');

function record(family: string, key: string): Record_ {
  return JSON.parse(readFileSync(join(CARTRIDGES, family, `${key}.json`), 'utf8')) as Record_;
}

const plate = (over: Partial<Drawing>): Drawing =>
  ({
    file: 'x.svg',
    svg: [10, 10],
    tight: [8, 8],
    subject: 'cartridge',
    ...over
  }) as Drawing;

describe('tag', () => {
  it('prefers the marking the sheet prints', () => {
    expect(tag({ l: 70, marking: '12/70' })).toBe('12/70');
  });

  it('falls back to the length', () => {
    expect(tag({ l: 70, marking: null })).toBe('70');
  });

  it('is null only when there is neither', () => {
    expect(tag({ marking: null })).toBeNull();
    // 0 is a length, not an absence: `??` on a falsy number is the classic way to lose it.
    expect(tag({ l: 0, marking: null })).toBe('0');
  });
});

describe('hullLengths', () => {
  it('returns null for every metallic cartridge: one length is not a choice', () => {
    // Read from the dataset rather than named here, so this cannot go stale against it.
    const keys = readdirSync(join(CARTRIDGES, 'rimless'))
      .filter((f) => f.endsWith('.json'))
      .slice(0, 25);
    expect(keys.length).toBeGreaterThan(10);
    for (const file of keys) {
      expect(hullLengths(record('rimless', file.slice(0, -5)))).toBeNull();
    }
  });

  it('reads every published length of a shot cartridge', () => {
    const shot = readdirSync(join(CARTRIDGES, 'shotshell')).filter((f) => f.endsWith('.json'));
    const withChoice = shot
      .map((f) => hullLengths(record('shotshell', f.slice(0, -5))))
      .filter((rows): rows is Hull[] => rows !== null);
    expect(withChoice.length).toBeGreaterThan(0);
    for (const rows of withChoice) {
      expect(rows.length).toBeGreaterThan(1);
      for (const row of rows) expect(Number.isFinite(row.l)).toBe(true);
    }
  });

  it('drops rows whose length is not a number, and returns null if too few survive', () => {
    const data = { cartridge: { lengths: [{ l: 70 }, { l: 'x' }] } } as unknown as Record_;
    expect(hullLengths(data)).toBeNull();
  });

  it('returns null when there are no lengths at all', () => {
    expect(hullLengths({} as Record_)).toBeNull();
  });
});

describe('defaultLength', () => {
  const rows: Hull[] = [
    { l: 65, marking: '12/65' },
    { l: 70, marking: '12/70' },
    { l: 89, marking: '12/89' }
  ];

  it('opens at the length the cartridge own drawing is at', () => {
    const entry = {
      key: 'k',
      drawings: [plate({ l: 70, marking: '12/70', main: true }), plate({ l: 89 })]
    } as unknown as Entry;
    expect(defaultLength(rows, entry)).toBe('12/70');
  });

  it('falls back to the longest published length', () => {
    expect(defaultLength(rows, undefined)).toBe('12/89');
  });
});

describe('resolve', () => {
  const drawn = [
    plate({ subject: 'cartridge', l: 65, marking: '12/65' }),
    plate({ subject: 'cartridge', l: 70, marking: '12/70' }),
    plate({ subject: 'chamber', l: 89, marking: '12/89' })
  ];

  it('is null with nothing drawn', () => {
    expect(resolve([], 'cartridge', null, null)).toBeNull();
  });

  it('honours the subject before the length', () => {
    // The asked-for length exists as a cartridge, but a chamber was asked for: subject wins.
    const got = resolve(drawn, 'chamber', '12/70', 70);
    expect(got?.subject).toBe('chamber');
  });

  it('takes the asked-for length when that subject has it', () => {
    expect(resolve(drawn, 'cartridge', '12/70', 70)?.marking).toBe('12/70');
  });

  it('stands in the nearest length where the asked-for one is undrawn', () => {
    expect(resolve(drawn, 'cartridge', '12/89', 89)?.marking).toBe('12/70');
  });
});

describe('panels', () => {
  it('gives one drawing per subject the dataset draws, in a fixed order', () => {
    const drawn = [
      plate({ subject: 'chamber', l: 70, marking: '12/70' }),
      plate({ subject: 'cartridge', l: 70, marking: '12/70' })
    ];
    expect(panels(drawn, '12/70', 70).map((p) => p.subject)).toEqual(['cartridge', 'chamber']);
  });

  it('offers nothing for a subject that is not drawn', () => {
    const drawn = [plate({ subject: 'cartridge', l: 70, marking: '12/70' })];
    expect(panels(drawn, '12/70', 70).map((p) => p.subject)).toEqual(['cartridge']);
  });

  it('is empty with nothing drawn', () => {
    expect(panels([], null, null)).toEqual([]);
  });
});

describe('fitScale', () => {
  const PX = 96 / 25.4;

  it('is life size before the column has been measured', () => {
    expect(fitScale(100, 20, 0, 900, PX)).toBe(PX);
  });

  it('never enlarges: life size is the ceiling', () => {
    expect(fitScale(1, 1, 10_000, 10_000, PX)).toBe(PX);
  });

  it('shrinks to the column when the drawing is too wide for it', () => {
    // A tall drawing in a narrow column: the width bound is what bites.
    expect(fitScale(10, 200, 100, 10_000, PX)).toBeCloseTo(100 / 200, 10);
  });

  it('shrinks to the window when the drawing is too tall for it', () => {
    expect(fitScale(200, 10, 10_000, 100, PX)).toBeCloseTo((100 * 0.62) / 200, 10);
  });
});
