/**
 * The module boundaries, enforced.
 *
 * Libraries must be framework-free and acyclic. These tests enforce that boundary.
 *
 * It covers both halves of the migration at once: the modules already moved out to the
 * repository-root `lib/`, and the ones still under the app's `lib/` awaiting their turn. Add each
 * module to `LIBRARY_DIRS` as it lands - the guard should grow with the refactor rather than being
 * switched on at the end, when it would only report a mess.
 *
 * It does not check `lib/i18n.svelte.ts` or `lib/theme.svelte.ts`: those are rune files, coupled
 * to Svelte by design, and are meant to stay in the app layer.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The repository-root `lib/`, where the framework-free modules live. Anything still awaiting its
// turn under the app's own `lib/` is added here as it lands, so the guard grows with the refactor.
const MOVED = resolve(__dirname, '../../../lib');

/** Directories whose contents must be importable without a framework. */
const LIBRARY_DIRS = [
  'core',
  'geom',
  'shapes2d',
  'measure2d',
  'render2d',
  'designer',
  'data',
  'userdata',
  'ballistics',
  'optics',
  'targets',
  'interior',
  'geometry'
].map((name) => resolve(MOVED, name));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name)) out.push(full);
  }
  return out;
}

/** Comments talk about `document` and `<svg>` constantly; only code counts. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const libraryFiles = LIBRARY_DIRS.flatMap((d) => walk(d)).filter((f) => !/\.test\.ts$/.test(f));

/** Repository-relative, so a failure names the file the same way the repository does. */
const REPO = resolve(__dirname, '../../..');
const rel = (f: string) => relative(REPO, f).split('\\').join('/');

describe('library modules stay framework-free', () => {
  it('finds the library files at all', () => {
    // Guards the guard: a walk that silently matches nothing would pass every assertion below.
    expect(libraryFiles.length).toBeGreaterThan(5);
  });

  it.each(libraryFiles.map((f) => [rel(f), f]))('%s does not import Svelte', (_name, file) => {
    const code = stripComments(readFileSync(file, 'utf8'));
    expect(code).not.toMatch(/from\s*['"]svelte(\/|['"])/);
    expect(code).not.toMatch(/from\s*['"][^'"]*\.svelte['"]/);
  });

  it.each(libraryFiles.map((f) => [rel(f), f]))('%s does not use runes', (_name, file) => {
    const code = stripComments(readFileSync(file, 'utf8'));
    // `$state`/`$derived`/`$effect`/`$props` only mean anything to the compiler, so their
    // presence is what makes a file un-liftable into a plain library.
    expect(code).not.toMatch(/\$(state|derived|effect|props|bindable)\b/);
  });

  it.each(libraryFiles.map((f) => [rel(f), f]))('%s does not touch the DOM', (_name, file) => {
    const code = stripComments(readFileSync(file, 'utf8'));
    expect(code).not.toMatch(/\b(document|window|navigator|localStorage)\b/);
  });
});

describe('dependencies run one way', () => {
  // A module may use anything to its left and
  // nothing to its right. Checked here because the one time it was checked by hand instead, the
  // output was not read and a commit claimed an edge was gone when it was not.
  // Two independent chains, in one list: geometry left to right, then the solver and the scope
  // arithmetic that reads it. Listing them together also asserts the chains stay apart - nothing
  // in `render2d` may reach for a trajectory, and `ballistics` may not reach for a turret.
  const ORDER = [
    'geom',
    'shapes2d',
    'measure2d',
    'render2d',
    'ballistics',
    'optics',
    'targets',
    'interior'
  ];

  it.each(ORDER.map((m, i) => [m, i]))('%s imports nothing above it', (module, rank) => {
    const dir = resolve(MOVED, module as string);
    const offenders: string[] = [];
    for (const file of walk(dir)) {
      if (/\.test\.ts$/.test(file)) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const [, dep] of code.matchAll(/from\s*['"]\.\.\/([A-Za-z0-9_]+)\//g)) {
        const at = ORDER.indexOf(dep as string);
        if (at > (rank as number)) offenders.push(`${rel(file)} -> ${dep}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('library modules stay acyclic', () => {
  it('has no import cycles', () => {
    const known = new Set(libraryFiles.map(rel));
    const graph = new Map<string, string[]>();

    for (const file of libraryFiles) {
      const code = stripComments(readFileSync(file, 'utf8'));
      const specs = [...code.matchAll(/from\s*['"](\.[^'"]+)['"]/g)]
        .map((m) => m[1])
        .filter((s): s is string => Boolean(s));
      const deps: string[] = [];
      for (const spec of specs) {
        const base = join(dirname(file), spec);
        for (const cand of [base, `${base}.ts`, join(base, 'index.ts')]) {
          const r = rel(cand);
          if (known.has(r) && extname(r) === '.ts') {
            deps.push(r);
            break;
          }
        }
      }
      graph.set(rel(file), deps);
    }

    const cycles: string[] = [];
    const state = new Map<string, 'open' | 'done'>();
    const stack: string[] = [];
    const visit = (node: string): void => {
      if (state.get(node) === 'done') return;
      if (state.get(node) === 'open') {
        cycles.push([...stack.slice(stack.indexOf(node)), node].join(' -> '));
        return;
      }
      state.set(node, 'open');
      stack.push(node);
      for (const next of graph.get(node) ?? []) visit(next);
      stack.pop();
      state.set(node, 'done');
    };
    for (const node of graph.keys()) visit(node);

    expect(cycles).toEqual([]);
  });
});
