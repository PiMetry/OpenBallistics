/**
 * The preference store, and the failure it exists to survive.
 *
 * Preferences use `localStorage` and records use IndexedDB. The part
 * worth testing is not the reading and writing - it is that **a browser set to block site data
 * throws on first access**, and a page that did not expect that is a blank page rather than a page
 * with default settings. Node has no `localStorage` at all, which makes that the default path here
 * exactly as the missing IndexedDB makes the in-memory store the default path for records.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPref, readNumberPref, readPref, writePref } from './prefs';

afterEach(() => vi.unstubAllGlobals());

/** A localStorage that behaves. */
function working() {
  const held = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => held.set(k, v),
    removeItem: (k: string) => held.delete(k)
  });
  return held;
}

/** ...and one that throws on every access, as a blocked browser does. */
function blocked() {
  const boom = () => {
    throw new Error('The operation is insecure.');
  };
  vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
}

describe('with no localStorage at all', () => {
  it('falls back rather than throwing', () => {
    expect(readPref('pattern', ['a', 'b'] as const, 'a')).toBe('a');
    expect(readNumberPref('tolerance', 4, 0, 100)).toBe(4);
    expect(() => writePref('pattern', 'b')).not.toThrow();
    expect(() => clearPref('pattern')).not.toThrow();
  });
});

describe('with a localStorage that throws on every access', () => {
  it('still answers with the default, because a blocked browser is not an error', () => {
    blocked();
    expect(readPref('pattern', ['a', 'b'] as const, 'a')).toBe('a');
    expect(readNumberPref('tolerance', 4, 0, 100)).toBe(4);
    expect(() => writePref('pattern', 'b')).not.toThrow();
  });
});

describe('with a working localStorage', () => {
  it('uses the default for missing or blank numbers, while preserving an explicit zero', () => {
    working();
    expect(readNumberPref('tolerance', 4, 0, 100)).toBe(4);
    for (const blank of ['', '   ']) {
      writePref('tolerance', blank);
      expect(readNumberPref('tolerance', 4, 0, 100)).toBe(4);
    }
    writePref('tolerance', 0);
    expect(readNumberPref('tolerance', 4, 0, 100)).toBe(0);
    clearPref('tolerance');
    expect(readNumberPref('tolerance', 4, 0, 100)).toBe(4);
  });

  it('round-trips a choice', () => {
    working();
    writePref('pattern', 'b');
    expect(readPref('pattern', ['a', 'b'] as const, 'a')).toBe('b');
  });

  it('namespaces its keys, so it cannot collide with the site’s existing three', () => {
    const held = working();
    writePref('pattern', 'b');
    // theme, lang and style are stored unprefixed by their own modules.
    expect([...held.keys()]).toEqual(['ob.pattern']);
  });

  it('refuses a stored value that is no longer one of the choices', () => {
    working();
    writePref('pattern', 'c');
    // A build that drops an option must not restore it from an old browser's memory.
    expect(readPref('pattern', ['a', 'b'] as const, 'a')).toBe('a');
  });

  it('refuses a number outside its bounds, and anything that is not one', () => {
    working();
    writePref('tolerance', 400);
    expect(readNumberPref('tolerance', 4, 0, 100)).toBe(4);
    writePref('tolerance', 'nonsense');
    expect(readNumberPref('tolerance', 4, 0, 100)).toBe(4);
    writePref('tolerance', 8);
    expect(readNumberPref('tolerance', 4, 0, 100)).toBe(8);
  });

  it('forgets a choice on request', () => {
    working();
    writePref('pattern', 'b');
    clearPref('pattern');
    expect(readPref('pattern', ['a', 'b'] as const, 'a')).toBe('a');
  });
});
