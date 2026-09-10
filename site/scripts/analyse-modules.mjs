/**
 * Inventory the app's modules and their import graph to guide module boundaries.
 *
 * For every file under `src/` it records what it exports, what it imports, and three facts that
 * decide where the file is allowed to live:
 *
 *   - `usesSvelte`  imports from 'svelte' or a `.svelte` file
 *   - `usesRunes`   uses $state/$derived/$effect/$props - framework-coupled by language, not by
 *                   import, which is why a `.svelte.ts` file cannot move into a plain library
 *   - `usesDom`     touches document/window/navigator
 *
 * A file with none of the three is a candidate for a framework-free library. A file with any of
 * them either stays in the UI layer or has that part lifted out of it first.
 *
 * It also finds import cycles. Boundaries cannot be drawn across a cycle, so these have to be
 * known before the module list is agreed, not discovered halfway through moving files.
 *
 * Usage:
 *   node scripts/analyse-modules.mjs            # summary to stdout
 *   node scripts/analyse-modules.mjs --json out.json
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Both halves of the migration. `site/src` is the app and the modules still awaiting their turn;
// the repository-root `lib/` is where they land. Scanning only the first would make the inventory
// quietly shrink as the refactor progressed, which is the opposite of what it is for.
//
// Resolved from this file rather than the working directory: keyed off `cwd`, running it from the
// repository root reported zero files and zero cycles instead of failing, which is worse than not
// having the tool.
const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(SCRIPTS, '..');
const APP = resolve(SITE, 'src');
const LIB = resolve(SITE, '..', 'lib');
const ROOT = resolve(SITE, '..');

/** Every source file under src/, project-relative, posix-style. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|svelte|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split('\\').join('/');

// Bounded [\s\S] rather than [^\n]: a multi-line `import {` ... `} from '...'` is the normal
// shape in the routes, and missing those silently under-counts the whole graph.
const IMPORT = /(?:^|\n)\s*(?:import|export)\b[\s\S]{0,600}?from\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
const EXPORT_NAMED = /(?:^|\n)export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g;
const EXPORT_LIST = /(?:^|\n)export\s*\{([^}]*)\}/g;

/** Comments mention `document` and `<svg>` constantly; flagging on them mis-classifies a file. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function analyseFile(full) {
  const text = readFileSync(full, 'utf8');
  const code = stripComments(text);
  const imports = new Set();
  for (const re of [IMPORT, BARE_IMPORT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) imports.add(m[1]);
  }
  const exports = new Set();
  EXPORT_NAMED.lastIndex = 0;
  let m;
  while ((m = EXPORT_NAMED.exec(text))) exports.add(m[1]);
  EXPORT_LIST.lastIndex = 0;
  while ((m = EXPORT_LIST.exec(text))) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Za-z0-9_$]+$/.test(name)) exports.add(name);
    }
  }
  const local = [...imports].filter((s) => s.startsWith('.'));
  return {
    file: rel(full),
    ext: extname(full),
    lines: text.split('\n').length,
    exports: [...exports].sort(),
    imports: [...imports].sort(),
    localImports: local,
    usesSvelte: /from\s*['"]svelte(\/|['"])/.test(code) || local.some((i) => i.endsWith('.svelte')),
    usesRunes: /\$(state|derived|effect|props|bindable)\b/.test(code),
    usesDom: /\b(document|window|navigator|localStorage)\b/.test(code),
    isTest: /\.test\.[tj]s$/.test(rel(full)),
  };
}

/** Resolve a relative specifier to a file we know about. */
function resolveLocal(fromFile, spec, known) {
  const base = join(ROOT, dirname(fromFile), spec).split('\\').join('/');
  const candidates = [base, `${base}.ts`, `${base}.js`, `${base}.svelte`, `${base}/index.ts`];
  for (const c of candidates) {
    const r = relative(ROOT, c).split('\\').join('/');
    if (known.has(r)) return r;
  }
  return null;
}

function findCycles(graph) {
  const cycles = [];
  const state = new Map();
  const stack = [];
  function visit(node) {
    if (state.get(node) === 'done') return;
    if (state.get(node) === 'open') {
      cycles.push([...stack.slice(stack.indexOf(node)), node]);
      return;
    }
    state.set(node, 'open');
    stack.push(node);
    for (const next of graph.get(node) ?? []) visit(next);
    stack.pop();
    state.set(node, 'done');
  }
  for (const node of graph.keys()) visit(node);
  return cycles;
}

const roots = [APP, LIB].filter((d) => existsSync(d));
const files = roots.flatMap((d) => walk(d)).map(analyseFile);
const known = new Set(files.map((f) => f.file));
const graph = new Map();
for (const f of files) {
  graph.set(
    f.file,
    f.localImports.map((s) => resolveLocal(f.file, s, known)).filter(Boolean),
  );
}

const cycles = findCycles(graph);
const pure = files.filter((f) => !f.isTest && !f.usesSvelte && !f.usesRunes && !f.usesDom);
const coupled = files.filter((f) => !f.isTest && (f.usesSvelte || f.usesRunes || f.usesDom));

// inbound edge count: what a module move would break
const inbound = new Map(files.map((f) => [f.file, 0]));
for (const [, deps] of graph) for (const d of deps) inbound.set(d, (inbound.get(d) ?? 0) + 1);

const report = {
  generated: new Date().toISOString().slice(0, 10),
  totals: {
    files: files.length,
    lines: files.reduce((a, f) => a + f.lines, 0),
    frameworkFree: pure.length,
    frameworkCoupled: coupled.length,
    cycles: cycles.length,
  },
  cycles: cycles.map((c) => c.join(' -> ')),
  files: files
    .map((f) => ({ ...f, inbound: inbound.get(f.file) ?? 0 }))
    .sort((a, b) => b.lines - a.lines),
};

const jsonAt = process.argv.indexOf('--json');
if (jsonAt > -1 && process.argv[jsonAt + 1]) {
  writeFileSync(process.argv[jsonAt + 1], JSON.stringify(report, null, 1));
}

const t = report.totals;
console.log(`files ${t.files}, lines ${t.lines}`);
console.log(`framework-free (movable to a library): ${t.frameworkFree}`);
console.log(`framework-coupled (stays in UI, or must be split): ${t.frameworkCoupled}`);
console.log(`import cycles: ${t.cycles}`);
for (const c of report.cycles) console.log(`   cycle: ${c}`);

console.log('\nframework-coupled files outside components/ and routes/ (the ones that matter):');
for (const f of coupled) {
  // Paths are repository-relative, so these prefixes carry the app directory too.
  if (/^site\/src\/(components|routes)\//.test(f.file) || f.file === 'site/src/App.svelte') continue;
  const why = [f.usesSvelte && 'svelte', f.usesRunes && 'runes', f.usesDom && 'dom'].filter(Boolean);
  console.log(`   ${f.file.padEnd(34)} ${String(f.lines).padStart(5)} lines  [${why.join(', ')}]`);
}

console.log('\nlargest framework-free files (library candidates), with inbound edges:');
for (const f of pure.sort((a, b) => b.lines - a.lines).slice(0, 20)) {
  console.log(`   ${f.file.padEnd(34)} ${String(f.lines).padStart(5)} lines  <-${inbound.get(f.file)}`);
}
